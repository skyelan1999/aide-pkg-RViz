"use strict";
// Runs against a REAL isolated ROS publisher and rosbridge, not the JS protocol fixture.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { serve } = require("../src/runtime");
(async () => {
  const ros = Number(process.argv[2]),
    endpoint = process.argv[3];
  if (![1, 2].includes(ros) || !endpoint)
    throw Error("Usage: node scripts/verify-ros.js 1|2 ws://endpoint");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rviz-real-"));
  const app = await serve(
    {
      ros,
      endpoint,
      token: "synthetic-acceptance",
      scope: "synthetic-acceptance",
      qos: false,
      ssh: process.env.RVIZ_SSH_TEST_CONFIG
        ? {
            alias: "rviz-fixture",
            port: Number(new URL(endpoint).port),
            configFile: process.env.RVIZ_SSH_TEST_CONFIG,
          }
        : undefined,
    },
    path.join(dir, "session.json"),
  );
  const call = async (a) => {
    const r = await fetch("http://127.0.0.1:" + app.port, {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-acceptance" },
      body: JSON.stringify(a),
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.error);
    return v;
  };
  try {
    let status;
    for (let i = 0; i < 80; i++) {
      status = await call({ action: "poll", fixed: "map" });
      if (status.connected && i % 4 === 0) await call({ action: "topics" });
      if (
        status.connected &&
        status.topics.some((x) => x.topic === "/rviz_acceptance/scan")
      )
        break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(status.connected, true, status.error);
    const topic = status.topics.find(
      (t) => t.topic === "/rviz_acceptance/scan",
    );
    assert.ok(topic, "Real ROS topic not discovered");
    await call({ action: "subscribe", ...topic });
    for (let i = 0; i < 80; i++) {
      status = await call({ action: "poll", fixed: "map" });
      if (status.layers[0]?.value.points?.length && !status.layers[0].error)
        break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const layer = status.layers[0];
    assert.ok(layer?.value.points?.length >= 900, JSON.stringify(status));
    assert.equal(layer.error, "");
    assert.deepEqual(layer.value.transform.p, [1.25, 0, 0.4]);
    await call({ action: "unsubscribe", topic: topic.topic });
    assert.equal((await call({ action: "poll" })).layers.length, 0);
    console.log(
      JSON.stringify({
        ros,
        endpoint,
        type: topic.type,
        points: layer.value.points.length / 3,
        transform: layer.value.transform,
        subscribe: true,
        unsubscribe: true,
        result: "PASS",
      }),
    );
  } finally {
    app.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
