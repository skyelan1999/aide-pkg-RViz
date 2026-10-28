"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { WebSocketServer } = require("ws"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { serve } = require("../src/runtime"),
  { _io } = require("../index");
test("built short-lived tool workers preserve a session and revoke it on project change", async (t) => {
  const bridge = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => bridge.once("listening", r));
  t.after(() => {
    for (const c of bridge.clients) c.terminate();
    bridge.close();
  });
  let origin = "A";
  const api = {
    sources: async () => ({
      sources: [{ id: "workspace", origin, workspaceKey: origin }],
    }),
  };
  const open = await _io(
    {
      action: "open",
      confirm: true,
      ros: 2,
      endpoint: "ws://127.0.0.1:" + bridge.address().port,
    },
    api,
  );
  t.after(() => _io({ action: "close", id: open.id }, api).catch(() => {}));
  let result;
  for (let i = 0; i < 30; i++) {
    result = await _io({ action: "poll", id: open.id }, api);
    if (result.connected) break;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(result.connected, true);
  origin = "B";
  await assert.rejects(
    _io({ action: "poll", id: open.id }, api),
    /scope changed/,
  );
});
test(
  "real SSH local forwarding reaches loopback rosbridge without exposing keys",
  { skip: !process.env.RVIZ_SSH_TEST_CONFIG },
  async (t) => {
    const bridge = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((r) => bridge.once("listening", r));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rviz-ssh-test-"));
    const app = await serve(
      {
        token: "ssh-test",
        scope: "test",
        ros: 2,
        ssh: {
          alias: "rviz-fixture",
          port: bridge.address().port,
          configFile: process.env.RVIZ_SSH_TEST_CONFIG,
        },
      },
      path.join(dir, "session.json"),
    );
    t.after(() => {
      app.stop();
      for (const c of bridge.clients) c.terminate();
      bridge.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    let status;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const r = await fetch("http://127.0.0.1:" + app.port, {
        method: "POST",
        headers: { Authorization: "Bearer ssh-test" },
        body: JSON.stringify({ action: "poll" }),
      });
      status = await r.json();
      if (status.connected) break;
    }
    assert.equal(status.connected, true, status.error);
    assert.ok(!JSON.stringify(status).includes("client_key"));
  },
);
