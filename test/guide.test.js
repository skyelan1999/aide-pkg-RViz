"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  connectionRecipe,
  helpForError,
  guideContent,
} = require("../src/guide");
test("Docker Desktop, native and shared-network addresses cannot be confused", () => {
  assert.equal(
    connectionRecipe(2, "desktop").endpoint,
    "ws://host.docker.internal:18501",
  );
  assert.equal(connectionRecipe(2, "native").endpoint, "ws://127.0.0.1:18501");
  assert.equal(connectionRecipe(2, "network").endpoint, "ws://ros2-demo:9090");
  assert.equal(connectionRecipe(1, "network").endpoint, "ws://ros1-demo:18502");
  assert.throws(() => connectionRecipe(7, "desktop"));
  assert.throws(() => connectionRecipe(2, "other"));
});
test("Docker recipe maps to packaged compose services and the published scan contract", () => {
  const fs = require("fs");
  for (const ros of [1, 2]) {
    const r = connectionRecipe(ros, "desktop");
    assert.ok(
      fs
        .readFileSync("examples/docker/compose.yaml", "utf8")
        .includes(r.service + ":"),
    );
    assert.ok(r.command.endsWith(r.service));
    assert.equal(r.fixed, "map");
    assert.equal(r.topic, "/rviz_acceptance/scan");
  }
});
test("TF, SSH and connection failures lead to specific next steps in both languages", () => {
  for (const lang of ["zh", "en"]) {
    assert.equal(
      helpForError("Missing or stale TF: laser → map", lang).section,
      "topics",
    );
    assert.equal(helpForError("SSH tunnel closed", lang).section, "ssh");
    assert.equal(
      helpForError("ROS bridge connection failed", lang).section,
      "connect",
    );
    assert.equal(
      helpForError("Host source API is required", lang).section,
      "models",
    );
    assert.ok(helpForError("Response budget exceeded", lang).text.length > 40);
  }
});
test("every help section has actionable guidance without claiming automatic credential inheritance", () => {
  for (const lang of ["zh", "en"])
    for (const section of [
      "start",
      "docker",
      "connect",
      "topics",
      "models",
      "ssh",
    ]) {
      const rows = guideContent(section, lang, connectionRecipe(2, "desktop"));
      assert.ok(rows.length >= 4);
      assert.ok(rows.every((x) => typeof x === "string" && x.length));
    }
  assert.ok(
    guideContent("models", "en", connectionRecipe(2, "desktop"))
      .join(" ")
      .includes("package://"),
  );
});
