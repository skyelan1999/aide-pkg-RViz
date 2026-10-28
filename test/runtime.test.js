"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { WebSocketServer } = require("ws"),
  { serve } = require("../src/runtime");
async function rpc(port, token, a) {
  const r = await fetch("http://127.0.0.1:" + port, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: JSON.stringify(a),
  });
  return { status: r.status, value: await r.json() };
}
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Condition timeout");
}
for (const ros of [1, 2])
  test(
    "real WebSocket / HTTP pipeline ROS " +
      ros +
      " subscription, TF, unsubscribe and disconnect",
    async (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rviz-test-")),
        file = path.join(dir, "session.json");
      const bridge = new WebSocketServer({ host: "127.0.0.1", port: 0 });
      await new Promise((r) => bridge.once("listening", r));
      const seen = [];
      let peer;
      bridge.on("connection", (ws) => {
        peer = ws;
        ws.on("message", (bytes) => {
          const m = JSON.parse(bytes);
          seen.push(m);
          if (m.op === "call_service")
            ws.send(
              JSON.stringify({
                op: "service_response",
                id: m.id,
                result: true,
                values: {
                  topics: ["/scan"],
                  types: [
                    ros === 2
                      ? "sensor_msgs/msg/LaserScan"
                      : "sensor_msgs/LaserScan",
                  ],
                },
              }),
            );
        });
      });
      const app = await serve(
        {
          token: "test-secret",
          scope: "scope-a",
          endpoint: "ws://127.0.0.1:" + bridge.address().port,
          ros,
          qos: ros === 2,
        },
        file,
      );
      t.after(() => {
        app.stop();
        for (const ws of bridge.clients) ws.terminate();
        bridge.close();
        fs.rmSync(dir, { recursive: true, force: true });
      });
      await until(() => seen.find((m) => m.op === "call_service"));
      assert.equal(
        (await rpc(app.port, "wrong", { action: "poll" })).status,
        403,
      );
      if (ros === 2)
        assert.equal(
          seen.find((m) => m.topic === "/tf_static").qos.durability,
          "transient_local",
        );
      const type =
        ros === 2 ? "sensor_msgs/msg/LaserScan" : "sensor_msgs/LaserScan";
      await rpc(app.port, "test-secret", {
        action: "subscribe",
        topic: "/scan",
        type,
      });
      await until(() => seen.find((m) => m.topic === "/scan"));
      peer.send(
        JSON.stringify({
          op: "publish",
          topic: "/tf_static",
          msg: {
            transforms: [
              {
                header: { frame_id: "map" },
                child_frame_id: "laser",
                transform: {
                  translation: { x: 2, y: 0, z: 0 },
                  rotation: { w: 1 },
                },
              },
            ],
          },
        }),
      );
      peer.send(
        JSON.stringify({
          op: "publish",
          topic: "/scan",
          msg: {
            header: { frame_id: "laser" },
            angle_min: 0,
            angle_increment: 1,
            range_min: 0,
            range_max: 10,
            ranges: [1, 2],
          },
        }),
      );
      const value = await until(async () => {
        const r = await rpc(app.port, "test-secret", {
          action: "poll",
          fixed: "map",
        });
        return r.value.layers?.length ? r.value : null;
      });
      assert.deepEqual(value.layers[0].value.transform.p, [2, 0, 0]);
      assert.equal(value.layers[0].error, "");
      const missing = await rpc(app.port, "test-secret", {
        action: "poll",
        fixed: "unrelated-project",
      });
      assert.match(missing.value.layers[0].error, /Missing/);
      await rpc(app.port, "test-secret", {
        action: "unsubscribe",
        topic: "/scan",
      });
      assert.equal(
        (await rpc(app.port, "test-secret", { action: "poll" })).value.layers
          .length,
        0,
      );
      peer.close();
      await until(
        async () =>
          !(await rpc(app.port, "test-secret", { action: "poll" })).value
            .connected,
      );
      assert.equal(
        (await rpc(app.port, "test-secret", { action: "poll" })).value.layers
          .length,
        0,
      );
    },
  );
