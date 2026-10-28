"use strict";
const fs = require("node:fs"),
  http = require("node:http"),
  net = require("node:net"),
  { spawn } = require("node:child_process"),
  WebSocket = require("ws");
const { TF, normalize, stamp, compose, SUPPORTED } = require("./ros");
async function serve(config, file) {
  let socket,
    tunnel,
    closed = false,
    last = Date.now(),
    error = "",
    seq = 0,
    fixed = "map",
    rosTime = null;
  const tf = new TF(),
    layers = new Map();
  const subscriptions = new Map();
  let topics = [];
  function send(m) {
    if (socket?.readyState !== WebSocket.OPEN)
      throw Error("Bridge is not connected");
    socket.send(JSON.stringify(m));
  }
  function stop() {
    if (closed) return;
    closed = true;
    clearInterval(expiry);
    socket?.terminate();
    tunnel?.kill();
    server.close();
    try {
      fs.unlinkSync(file);
    } catch (_) {}
  }
  const expiry = setInterval(() => {
    if (Date.now() - last > 30000) stop();
  }, 1000);
  expiry.unref();
  function subscribe(topic, type, options = {}) {
    if (
      !["/tf", "/tf_static", "/clock"].includes(topic) &&
      !SUPPORTED.includes(String(type).replace("/msg/", "/"))
    )
      throw Error("Unsupported display type");
    if (
      !/^\/[A-Za-z0-9_/]{1,255}$/.test(topic) ||
      (subscriptions.size >= 24 && !subscriptions.has(topic))
    )
      throw Error("Invalid topic or subscription limit");
    const m = {
      op: "subscribe",
      id: topic,
      topic,
      type,
      throttle_rate: 200,
      queue_length: 1,
      compression: "none",
    };
    if (config.ros === 2 && config.qos === true)
      m.qos = options.qos || {
        reliability: "best_effort",
        durability: topic === "/tf_static" ? "transient_local" : "volatile",
        history: "keep_last",
        depth: 1,
      };
    send(m);
    subscriptions.set(topic, type);
  }
  function requestTopics() {
    send({
      op: "call_service",
      id: "rviz-topics",
      service: "/rosapi/topics",
      args: {},
    });
  }
  const server = http.createServer(async (req, res) => {
    if (
      req.method !== "POST" ||
      req.url !== "/" ||
      req.headers.authorization !== "Bearer " + config.token
    ) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Forbidden" }));
    }
    let b = "";
    try {
      for await (const chunk of req) {
        b += chunk;
        if (b.length > 16384) throw Error("Request exceeds budget");
      }
      const a = JSON.parse(b);
      last = Date.now();
      let value;
      if (a.action === "close") {
        value = { closed: true };
        setTimeout(stop, 10);
      } else if (a.action === "subscribe") {
        subscribe(a.topic, a.type);
        value = { subscribed: a.topic };
      } else if (a.action === "unsubscribe") {
        if (["/tf", "/tf_static", "/clock"].includes(a.topic))
          throw Error("Reserved subscription");
        send({ op: "unsubscribe", id: a.topic, topic: a.topic });
        subscriptions.delete(a.topic);
        layers.delete(a.topic);
        value = { unsubscribed: a.topic };
      } else if (a.action === "topics") {
        requestTopics();
        value = { requested: true };
      } else if (a.action === "poll") {
        if (typeof a.fixed === "string" && a.fixed.length <= 128)
          fixed = a.fixed.replace(/^\//, "");
        const items = [];
        for (const [topic, entry] of layers) {
          const value = { ...entry.value };
          if (value.kind === "markers")
            value.markers = value.markers.map((m) => {
              try {
                return {
                  ...m,
                  transform: compose(
                    tf.lookup(fixed, m.frame, m.time || rosTime || 0),
                    { p: m.p, q: m.q },
                  ),
                };
              } catch (e) {
                return { ...m, error: e.message };
              }
            });
          let problem = entry.error || "";
          try {
            if (
              !problem &&
              value.kind !== "image" &&
              value.kind !== "markers"
            ) {
              value.transform = tf.lookup(
                fixed,
                value.frame,
                value.time || rosTime || 0,
              );
              if (value.kind === "map")
                value.transform = compose(value.transform, {
                  p: value.p,
                  q: value.q,
                });
            }
          } catch (e) {
            problem = e.message;
          }
          items.push({
            topic,
            sequence: entry.seq,
            value,
            error: problem,
            received: entry.received,
          });
        }
        const frames = tf
          .frames()
          .slice(0, 128)
          .map((frame) => {
            try {
              return {
                frame,
                transform: tf.lookup(fixed, frame, rosTime || 0),
              };
            } catch (_) {
              return { frame, error: "Missing or stale TF" };
            }
          });
        value = {
          connected: socket?.readyState === WebSocket.OPEN,
          error,
          fixed,
          topics,
          frames,
          layers: items,
          sequence: seq,
          rosTime,
          transport: "bounded-poll",
          maxPoints: 3000,
        };
      } else throw Error("Unknown action");
      const output = JSON.stringify(value);
      if (Buffer.byteLength(output) > 900 * 1024)
        throw Error("Preview exceeds total response budget; remove layers");
      res.setHeader("Content-Type", "application/json");
      res.end(output);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  let endpoint = config.endpoint;
  if (config.ssh) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(config.ssh.alias) ||
      !Number.isInteger(config.ssh.port) ||
      config.ssh.port < 1 ||
      config.ssh.port > 65535
    )
      throw Error("Invalid SSH alias/remote port");
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, "127.0.0.1", r));
    const localPort = probe.address().port;
    await new Promise((r) => probe.close(r));
    tunnel = spawn(
      "ssh",
      [
        ...(config.ssh.configFile ? ["-F", config.ssh.configFile] : []),
        "-N",
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "ServerAliveInterval=10",
        "-o",
        "ServerAliveCountMax=2",
        "-L",
        `127.0.0.1:${localPort}:127.0.0.1:${config.ssh.port}`,
        config.ssh.alias,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    tunnel.on("error", () => {
      error =
        "SSH could not start; configure OpenSSH and key authentication in the Aide backend environment";
      socket?.terminate();
    });
    tunnel.on("exit", () => {
      if (!closed) {
        error = "SSH tunnel closed; verify key, known_hosts and remote bridge";
        socket?.terminate();
      }
    });
    endpoint = `ws://127.0.0.1:${localPort}`;
    for (let i = 0; i < 40; i++) {
      const ready = await new Promise((r) => {
        const s = net.connect(localPort, "127.0.0.1", () => {
          s.destroy();
          r(true);
        });
        s.on("error", () => r(false));
        s.setTimeout(150, () => {
          s.destroy();
          r(false);
        });
      });
      if (ready) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  socket = new WebSocket(endpoint, {
    maxPayload: 8 * 1048576,
    handshakeTimeout: 8000,
    followRedirects: false,
    perMessageDeflate: false,
    ...(config.ssh
      ? { headers: { Host: "127.0.0.1:" + config.ssh.port } }
      : {}),
  });
  socket.on("open", () => {
    error = "";
    for (const [topic, type] of [
      ["/tf", "tf2_msgs/TFMessage"],
      ["/tf_static", "tf2_msgs/TFMessage"],
      ["/clock", "rosgraph_msgs/Clock"],
    ])
      subscribe(topic, config.ros === 2 ? type.replace("/", "/msg/") : type);
    requestTopics();
  });
  socket.on("error", () => {
    error =
      "ROS bridge connection failed; check endpoint / bridge / SSH diagnostics";
  });
  socket.on("close", () => {
    if (!closed && !error)
      error = "ROS bridge disconnected. Reconnect explicitly.";
    layers.clear();
    tf.edges.clear();
  });
  socket.on("message", (bytes) => {
    try {
      const m = JSON.parse(bytes.toString());
      if (m.op === "service_response" && m.id === "rviz-topics") {
        if (m.result === false) throw Error("rosapi/topics unavailable");
        const t = m.values?.topics || [],
          types = m.values?.types || [];
        topics = t
          .slice(0, 2048)
          .map((topic, i) => ({ topic, type: types[i] || "" }));
        return;
      }
      if (m.op === "status" && m.level === "error") {
        error = String(m.msg || "ROS bridge error").slice(0, 400);
        return;
      }
      if (m.op !== "publish" || !subscriptions.has(m.topic)) return;
      if (m.topic === "/tf" || m.topic === "/tf_static") {
        tf.update(m.msg, m.topic === "/tf_static");
        return;
      }
      if (m.topic === "/clock") {
        rosTime = stamp(m.msg.clock);
        tf.setClock(rosTime);
        return;
      }
      const old = layers.get(m.topic);
      if (old && Date.now() - old.received < 180) return;
      let value,
        problem = "";
      try {
        value = normalize(subscriptions.get(m.topic), m.msg);
        if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024)
          throw Error(
            "Layer preview exceeds 512 KiB; reduce publisher data or layer density",
          );
      } catch (e) {
        problem = e.message;
        value = {};
      }
      layers.set(m.topic, {
        value,
        error: problem,
        seq: ++seq,
        received: Date.now(),
      });
    } catch (e) {
      error = String(e.message).slice(0, 400);
    }
  });
  fs.writeFileSync(
    file,
    JSON.stringify({
      port,
      token: config.token,
      scope: config.scope,
      created: Date.now(),
    }),
    { mode: 0o600 },
  );
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return { stop, port };
}
if (require.main === module) {
  const file = process.argv[2];
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  serve(config, file).catch(() => {
    try {
      fs.unlinkSync(file);
    } catch (_) {}
    process.exit(1);
  });
}
module.exports = { serve };
