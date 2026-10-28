"use strict";
// Explicitly targets an isolated, labelled test container. Never targets 9999.
const fs = require("node:fs"),
  https = require("node:https"),
  http = require("node:http"),
  cp = require("node:child_process"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const container = "aide-rviz-guide-host";
const inspect = JSON.parse(
  cp.execFileSync("docker", ["inspect", container]),
)[0];
assert.equal(
  inspect.Config.Labels?.["aide.rviz.acceptance"],
  "true",
  "Refusing a non-fixture Aide container",
);
const ca = cp.execFileSync("docker", [
  "exec",
  container,
  "cat",
  "/data/certs/cert.pem",
]);
const token = cp
  .execFileSync("docker", ["exec", container, "cat", "/data/auth/access-token"])
  .toString()
  .trim();
const root = ".agent-state/native-host";
fs.mkdirSync(root, { recursive: true });
function request(route, method = "GET", value, headers = {}) {
  const data = Buffer.isBuffer(value)
    ? value
    : value === undefined
      ? undefined
      : Buffer.from(JSON.stringify(value));
  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://127.0.0.1:18498" + route,
      {
        method,
        ca,
        headers: {
          Authorization: "Bearer " + token,
          ...(data
            ? {
                "Content-Type": "application/json",
                "Content-Length": data.length,
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const parts = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => {
          const bytes = Buffer.concat(parts);
          let result;
          try {
            result = JSON.parse(bytes);
          } catch (_) {
            result = bytes.toString();
          }
          resolve({ status: res.statusCode, value: result, bytes });
        });
      },
    );
    req.setTimeout(20000, () => req.destroy(Error("Native host timeout")));
    req.on("error", reject);
    req.end(data);
  });
}
async function open() {
  const r = await request("/api/plugins/rviz/workbench/open", "POST", {});
  assert.equal(r.status, 200, JSON.stringify(r.value));
  const page = await request(r.value.url);
  assert.equal(page.status, 200);
  return { ...r.value, html: page.bytes, calls: 0, sequence: 0 };
}
async function invoke(bridge, tool, args) {
  if (bridge.calls >= 90) {
    const r = await request(
      "/api/plugins/rviz/workbench/" + bridge.bridge.instanceId + "/renew",
      "POST",
      {},
    );
    assert.equal(r.status, 200);
    bridge.bridge.instanceId = r.value.instanceId;
    bridge.calls = 0;
  }
  bridge.calls++;
  const r = await request(
    "/api/plugins/rviz/workbench/" + bridge.bridge.instanceId + "/call",
    "POST",
    {
      protocol: 1,
      requestId: "native_" + ++bridge.sequence,
      method: "tool.call",
      tool,
      arguments: args,
    },
  );
  if (r.status !== 200) throw Error(JSON.stringify(r.value));
  return r.value;
}
async function install() {
  const version = JSON.parse(fs.readFileSync("manifest.json")).version,
    zip = fs.readFileSync("dist/rviz-" + version + "-preview.zip"),
    b = "rviz-" + crypto.randomBytes(10).toString("hex");
  const body = Buffer.concat([
    Buffer.from(
      "--" +
        b +
        '\r\nContent-Disposition: form-data; name="bundle"; filename="rviz.zip"\r\nContent-Type: application/zip\r\n\r\n',
    ),
    zip,
    Buffer.from("\r\n--" + b + "--\r\n"),
  ]);
  const exists = await request("/api/plugins");
  const plugins = Array.isArray(exists.value)
    ? exists.value
    : exists.value.plugins || [];
  const route = plugins.some((p) => p.id === "rviz")
    ? "/api/plugins/rviz/upgrade"
    : "/api/plugins/bundle";
  const r = await request(route, "POST", body, {
    "Content-Type": "multipart/form-data; boundary=" + b,
  });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.value));
  console.log("Native ZIP install/upgrade: PASS");
}
async function test() {
  const ros = process.argv.includes("--ros1") ? 1 : 2;
  const endpoint = process.argv.includes("--desktop")
    ? `ws://host.docker.internal:${ros === 1 ? 18502 : 18501}`
    : ros === 1
      ? "ws://ros1-demo:18502"
      : "ws://ros2-demo:9090";
  const bridge = await open();
  let id = "";
  const io = async (a) => (await invoke(bridge, "rviz_io", a)).result;
  try {
    const sources = await io({ action: "sources" });
    assert.ok(sources.sources.some((s) => s.id === "workspace"));
    const file = await io({
      action: "read",
      fileSource: "workspace",
      path: "robot.urdf",
    });
    assert.ok(
      Buffer.from(file.data, "base64").toString().includes("rviz_guided_demo"),
    );
    const session = await io({
      action: "open",
      ros,
      confirm: true,
      qos: false,
      endpoint,
    });
    id = session.id;
    let s;
    for (let i = 0; i < 40; i++) {
      s = await io({ action: "poll", id, fixed: "map" });
      if (
        s.connected &&
        s.topics.some((t) => t.topic === "/rviz_acceptance/scan")
      )
        break;
      if (s.connected && i % 5 === 0) await io({ action: "topics", id });
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(s.connected, s.error);
    const selected = s.topics.filter((t) =>
      /^\/rviz_acceptance\/(scan|cloud|map|path|markers)$/.test(t.topic),
    );
    assert.equal(selected.length, 5);
    for (const topic of selected)
      await io({ action: "subscribe", id, ...topic });
    for (let i = 0; i < 40; i++) {
      s = await io({ action: "poll", id, fixed: "map" });
      if (s.layers.length === 5 && s.layers.every((l) => !l.error)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(s.layers.length, 5);
    assert.ok(
      s.layers.every((l) => !l.error),
      JSON.stringify(s.layers.map((l) => ({ topic: l.topic, error: l.error }))),
    );
    const save = await invoke(bridge, "rviz_save_config", {
      config: { version: 1, fixed: "map", layers: selected },
    });
    assert.equal(save.status, "proposal_pending");
    assert.ok(save.proposalId);
    cp.execFileSync("docker", [
      "exec",
      container,
      "sh",
      "-c",
      "test ! -f /workspace/.aide/rviz/session.json",
    ]);
    await io({ action: "close", id });
    id = "";
    const receipt = {
      nativeInstall: "PASS",
      projectURDF: "PASS",
      nativeSourceAPI: "PASS",
      dockerROS: ros,
      endpoint,
      layers: s.layers.map((l) => ({
        topic: l.topic,
        kind: l.value.kind,
        error: l.error,
      })),
      saveProposal: "PASS",
      notWrittenBeforeApproval: "PASS",
      container,
      hostImage: inspect.Config.Image,
      proposalId: save.proposalId,
    };
    fs.writeFileSync(
      root +
        `/acceptance-ros${ros}${process.argv.includes("--desktop") ? "-desktop" : ""}.json`,
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        ...receipt,
        proposalId: "[synthetic proposal created]",
      }),
    );
  } finally {
    if (id) await io({ action: "close", id }).catch(() => {});
    await request(
      "/api/plugins/rviz/workbench/" + bridge.bridge.instanceId,
      "DELETE",
    );
  }
}
async function serve() {
  let bridge;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        if (bridge)
          await request(
            "/api/plugins/rviz/workbench/" + bridge.bridge.instanceId,
            "DELETE",
          );
        bridge = await open();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(
          `<!doctype html><html><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}#proposal{position:absolute;bottom:0;left:0;right:0;background:#34485d;color:white;padding:10px;font:12px system-ui}</style><iframe src="/viewer" sandbox="allow-scripts"></iframe><div id="proposal" hidden></div><script>const frame=document.querySelector('iframe');window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.type!=='aide.workbench.ready')return;const c=new MessageChannel();c.port1.onmessage=async e=>{const m=e.data;try{const r=await fetch('/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)}),v=await r.json();if(v.status==='proposal_pending'){document.querySelector('#proposal').hidden=false;document.querySelector('#proposal').textContent='真实 Aide 已生成待审批提案；测试页不会自动批准。在实际 Aide 主窗口处理审批。';}c.port1.postMessage({...v,requestId:m.requestId})}catch(err){c.port1.postMessage({status:'error',requestId:m.requestId,error:err.message})}};frame.contentWindow.postMessage({type:'aide.workbench.connect',protocol:1,pluginId:'rviz',tools:${JSON.stringify(bridge.bridge.tools)},capabilities:[]},'*',[c.port2])});</script></html>`,
        );
      }
      if (req.method === "GET" && req.url === "/viewer" && bridge) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src blob:; frame-ancestors 'self'",
        );
        return res.end(bridge.html);
      }
      if (req.method === "POST" && req.url === "/call" && bridge) {
        if (
          req.headers.origin !== "http://127.0.0.1:18496" ||
          req.headers["content-type"] !== "application/json"
        )
          throw Error("Test origin rejected");
        let body = "";
        for await (const c of req) {
          body += c;
          if (body.length > 32768) throw Error("Request budget");
        }
        const m = JSON.parse(body);
        if (m.method !== "tool.call" || !bridge.bridge.tools.includes(m.tool))
          throw Error("Undeclared test method");
        const result = await invoke(bridge, m.tool, m.arguments);
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ...result, requestId: m.requestId }));
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: e.message }));
    }
  });
  server.listen(18496, "127.0.0.1", () =>
    console.log(
      "Native workbench test page: http://127.0.0.1:18496 (HTTPS upstream certificate pinned; no real user data)",
    ),
  );
  const close = async () => {
    if (bridge)
      await request(
        "/api/plugins/rviz/workbench/" + bridge.bridge.instanceId,
        "DELETE",
      ).catch(() => {});
    server.close();
  };
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
}
(async () => {
  await install();
  await test();
  if (process.argv.includes("--serve")) await serve();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
