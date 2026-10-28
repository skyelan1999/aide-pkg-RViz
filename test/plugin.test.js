"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { _io } = require("../src/plugin");
const api = {
  sources: async () => ({
    sources: [{ id: "workspace", origin: "a", workspaceKey: "a" }],
  }),
  proposeWrite: (path, content) => ({ proposal: { path, content } }),
};
test("registration is side effect free and exposes only the declared read-only tool", () => {
  let tool;
  require("../src/plugin").apply({ tool: (t) => (tool = t) });
  assert.equal(tool.name, "rviz_io");
  assert.ok(tool.parameters.properties.action.enum.includes("poll"));
});
test("connection requires explicit confirmation and prohibits credentials", async () => {
  await assert.rejects(
    _io({ action: "open", ros: 2, endpoint: "ws://localhost:9090" }, api),
    /confirmation/,
  );
  await assert.rejects(
    _io(
      {
        action: "open",
        confirm: true,
        ros: 2,
        endpoint: "ws://user:password@localhost",
      },
      api,
    ),
    /credentials/,
  );
});
test("config saves only display preferences, never passwords or SSH configuration", async () => {
  const r = await _io(
    {
      action: "save",
      config: {
        version: 1,
        fixed: "map",
        password: "secret",
        ssh: { key: "secret" },
        layers: [
          { topic: "/scan", type: "sensor_msgs/LaserScan", password: "secret" },
        ],
      },
    },
    api,
  );
  assert.equal(r.proposal.path, ".aide/rviz/session.json");
  assert.ok(!r.proposal.content.includes("secret"));
});
test("project resource traversal / invalid session tokens are rejected", async () => {
  await assert.rejects(
    _io({ action: "read", path: "../../private" }, api),
    /Invalid/,
  );
  await assert.rejects(
    _io({ action: "poll", id: "../session" }, api),
    /Invalid/,
  );
});
