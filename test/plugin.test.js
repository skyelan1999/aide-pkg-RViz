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
test("registration separates read-only I/O from a bounded config-write proposal", async () => {
  const tools = [];
  require("../src/plugin").apply({ tool: (t) => tools.push(t) });
  assert.deepEqual(
    tools.map((t) => t.name),
    ["rviz_io", "rviz_save_config"],
  );
  assert.deepEqual(tools[0].scheduling.resources, []);
  assert.deepEqual(tools[1].scheduling.resources, [
    { root: "workspace", path: ".aide/rviz/session.json", access: "write" },
  ]);
  assert.ok(!tools[0].parameters.properties.action.enum.includes("save"));
  assert.throws(
    () => tools[0].handler({ action: "save" }, api),
    /rviz_save_config/,
  );
  const saved = await tools[1].handler(
    { config: { version: 1, fixed: "map", layers: [] } },
    api,
  );
  assert.equal(saved.proposal.path, ".aide/rviz/session.json");
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
test("project file reads resolve host-relative snapshot paths under the authorized snapshot root", async () => {
  const fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rviz-source-"));
  try {
    fs.mkdirSync(path.join(root, "path"));
    fs.writeFileSync(
      path.join(root, "path", "robot.urdf"),
      '<robot name="source-test"/>',
    );
    let request;
    const mock = {
      sources: async (a) => {
        request = a;
        return { workspace: root, path: "path/robot.urdf" };
      },
    };
    const result = await _io(
      { action: "read", fileSource: "workspace", path: "robot.urdf" },
      mock,
    );
    assert.equal(request.source, "workspace");
    assert.equal(
      Buffer.from(result.data, "base64").toString(),
      '<robot name="source-test"/>',
    );
    await assert.rejects(
      _io(
        { action: "read", fileSource: "workspace", path: "robot.urdf" },
        {
          sources: async () => ({
            workspace: path.join(root, "path"),
            path: "../../outside",
          }),
        },
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
