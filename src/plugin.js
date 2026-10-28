"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  http = require("node:http"),
  { spawn } = require("node:child_process");
const ROOT = path.join(os.homedir(), ".cache", "aide-rviz");
function sessionFile(id) {
  if (!/^[a-f0-9]{48}$/.test(id || "")) throw Error("Invalid session");
  return path.join(ROOT, id + ".json");
}
async function sources(api) {
  if (!api.sources) throw Error("Host source API is required");
  return api.sources({ operation: "sources" });
}
async function scope(api) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(await sources(api)))
    .digest("hex");
}
function rpc(s, a) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: s.port,
        path: "/",
        method: "POST",
        headers: {
          Authorization: "Bearer " + s.token,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => {
          b += c;
          if (b.length > 1048576)
            req.destroy(Error("Response budget exceeded"));
        });
        res.on("end", () => {
          try {
            const v = JSON.parse(b);
            res.statusCode === 200 ? resolve(v) : reject(Error(v.error));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.setTimeout(5000, () => req.destroy(Error("Session timeout")));
    req.on("error", reject);
    req.end(JSON.stringify(a));
  });
}
async function io(a, api, settings = {}) {
  if (a.action === "sources") return sources(api);
  if (["browse", "read"].includes(a.action)) {
    if (
      typeof a.path !== "string" ||
      a.path.length > 1024 ||
      a.path.startsWith("/") ||
      a.path.split(/[\\/]/).includes("..")
    )
      throw Error("Invalid project path");
    if (a.action === "browse")
      return api.sources({
        operation: "browse",
        source: a.source,
        path: a.path,
      });
    const staged = await api.sources({
      operation: "stage",
      source: a.source,
      path: a.path,
      slot: "path",
      maxBytes: 2 * 1048576,
      maxFiles: 1,
      maxDepth: 1,
    });
    const stat = fs.statSync(staged.path);
    if (!stat.isFile() || stat.size > 2 * 1048576)
      throw Error("File budget exceeded");
    return {
      path: a.path,
      data: fs.readFileSync(staged.path).toString("base64"),
    };
  }
  if (a.action === "save") {
    const config = a.config;
    if (
      !config ||
      config.version !== 1 ||
      !Array.isArray(config.layers) ||
      config.layers.length > 20
    )
      throw Error("Invalid display config");
    // Only display preferences are written. Never serialize connection or SSH credentials.
    const safe = {
      version: 1,
      fixed: String(config.fixed || "map").slice(0, 128),
      layers: config.layers.map((l) => ({
        topic: String(l.topic).slice(0, 256),
        type: String(l.type).slice(0, 256),
      })),
    };
    return api.proposeWrite(
      ".aide/rviz/session.json",
      JSON.stringify(safe, null, 2) + "\n",
    );
  }
  if (a.action === "open") {
    if (a.confirm !== true)
      throw Error("Connect requires explicit confirmation");
    if (![1, 2].includes(a.ros)) throw Error("Choose ROS 1 or ROS 2");
    if (!a.ssh) {
      const u = new URL(a.endpoint);
      if (
        !["ws:", "wss:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.hash ||
        String(a.endpoint).length > 1024
      )
        throw Error("Use a ws/wss endpoint without embedded credentials");
    }
    if (
      a.ssh &&
      (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(a.ssh.alias || "") ||
        !Number.isInteger(a.ssh.port) ||
        a.ssh.port < 1 ||
        a.ssh.port > 65535)
    )
      throw Error("Invalid SSH profile");
    fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
    for (const n of fs.readdirSync(ROOT)) {
      if (
        /^[a-f0-9]{48}\.json$/.test(n) &&
        Date.now() - fs.statSync(path.join(ROOT, n)).mtimeMs > 86400000
      )
        fs.unlinkSync(path.join(ROOT, n));
    }
    const id = crypto.randomBytes(24).toString("hex"),
      file = sessionFile(id),
      token = crypto.randomBytes(32).toString("hex");
    const config = {
      scope: await scope(api),
      token,
      endpoint: a.endpoint,
      ros: a.ros,
      qos: a.qos === true,
      ssh: a.ssh
        ? {
            alias: a.ssh.alias,
            port: a.ssh.port,
            configFile:
              typeof settings.sshConfigFile === "string"
                ? settings.sshConfigFile
                : undefined,
          }
        : undefined,
    };
    fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600, flag: "wx" });
    const proc = spawn(
      process.execPath,
      ["--max-old-space-size=128", path.join(__dirname, "runtime.cjs"), file],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    proc.unref();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const s = JSON.parse(fs.readFileSync(file, "utf8"));
        if (s.port) return { id, scope: s.scope };
      } catch (_) {
        throw Error("Connection worker failed to start");
      }
    }
    throw Error("Connection worker startup timed out");
  }
  const file = sessionFile(a.id),
    s = JSON.parse(fs.readFileSync(file, "utf8"));
  if (s.scope !== (await scope(api))) {
    await rpc(s, { action: "close" }).catch(() => {});
    throw Error("Project scope changed; reconnect");
  }
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535)
    throw Error("Session is not ready");
  return rpc(s, a);
}
module.exports = {
  name: "rviz",
  apply(ctx) {
    ctx.tool({
      name: "rviz_io",
      description:
        "RViz Workbench read-only ROS topic previews and current project resources. Connect only on explicit user action; no robot commands.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "sources",
              "browse",
              "read",
              "save",
              "open",
              "close",
              "subscribe",
              "unsubscribe",
              "topics",
              "poll",
            ],
          },
          id: { type: "string" },
          path: { type: "string" },
          source: { type: "string" },
          endpoint: { type: "string" },
          ros: { type: "integer" },
          qos: { type: "boolean" },
          ssh: { type: "object" },
          confirm: { type: "boolean" },
          topic: { type: "string" },
          type: { type: "string" },
          fixed: { type: "string" },
          config: { type: "object" },
        },
        required: ["action"],
        additionalProperties: false,
      },
      scheduling: { resources: [] },
      handler: (a, api) => io(a, api, ctx.settings || {}),
    });
  },
  _io: io,
};
