"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { TF, normalize, compose, invert } = require("../src/ros");
const q = { x: 0, y: 0, z: 0, w: 1 };
const edge = (parent, child, x, time = 10) => ({
  header: { frame_id: parent, stamp: { sec: time } },
  child_frame_id: child,
  transform: { translation: { x, y: 0, z: 0 }, rotation: q },
});
test("TF composes / inverts paths and rejects missing or stale dynamic data", () => {
  const tf = new TF();
  tf.update({ transforms: [edge("map", "odom", 3)] }, true);
  tf.update({ transforms: [edge("odom", "laser", 2)] });
  assert.deepEqual(tf.lookup("map", "laser", 10).p, [5, 0, 0]);
  assert.deepEqual(tf.lookup("laser", "map", 10).p, [-5, 0, 0]);
  assert.throws(() => tf.lookup("map", "laser", 14), /stale/);
  assert.throws(() => tf.lookup("map", "other"), /Missing/);
});
test("simulation clock rewind discards dynamic transforms but retains static TF", () => {
  const tf = new TF();
  tf.update({ transforms: [edge("map", "odom", 3)] }, true);
  tf.update({ transforms: [edge("odom", "laser", 2)] });
  tf.setClock(10);
  tf.setClock(2);
  assert.deepEqual(tf.lookup("map", "odom", 2).p, [3, 0, 0]);
  assert.throws(() => tf.lookup("map", "laser", 2));
});
test("ROS 1 and ROS 2 LaserScan names produce the same bounded preview", () => {
  const m = {
    header: { frame_id: "/laser", stamp: { secs: 4, nsecs: 5e8 } },
    angle_min: 0,
    angle_increment: Math.PI / 2,
    range_min: 0.1,
    range_max: 10,
    ranges: [1, 2, null, Infinity, NaN, 20],
  };
  const a = normalize("sensor_msgs/LaserScan", m);
  assert.deepEqual(a, normalize("sensor_msgs/msg/LaserScan", m));
  assert.equal(a.points.length, 6);
  assert.equal(a.time, 4.5);
  assert.equal(a.frame, "laser");
});
for (const big of [false, true])
  test(
    "PointCloud2 handles " +
      (big ? "big" : "little") +
      " endian / row padding / NaN",
    () => {
      const b = Buffer.alloc(40);
      for (const [o, v] of [
        [0, 1],
        [4, 2],
        [8, 3],
        [20, 4],
        [24, NaN],
        [28, 6],
      ])
        b[big ? "writeFloatBE" : "writeFloatLE"](v, o);
      const m = {
        width: 1,
        height: 2,
        point_step: 12,
        row_step: 20,
        is_bigendian: big,
        data: b.toString("base64"),
        fields: ["x", "y", "z"].map((name, i) => ({
          name,
          offset: i * 4,
          datatype: 7,
        })),
      };
      assert.deepEqual(
        normalize("sensor_msgs/PointCloud2", m).points,
        [1, 2, 3],
      );
      assert.throws(
        () => normalize("sensor_msgs/PointCloud2", { ...m, row_step: 8 }),
        /layout/,
      );
      assert.throws(
        () => normalize("sensor_msgs/PointCloud2", { ...m, data: "" }),
        /Truncated/,
      );
    },
  );
test("large point clouds and occupancy maps are sampled within preview budget", () => {
  const b = Buffer.alloc(120000);
  const m = {
    width: 10000,
    height: 1,
    point_step: 12,
    row_step: b.length,
    data: b.toString("base64"),
    fields: ["x", "y", "z"].map((name, i) => ({
      name,
      offset: i * 4,
      datatype: 7,
    })),
  };
  assert.ok(normalize("sensor_msgs/PointCloud2", m).points.length <= 9000);
  const map = normalize("nav_msgs/OccupancyGrid", {
    info: {
      width: 200,
      height: 200,
      resolution: 0.1,
      origin: { position: { x: 0, y: 0, z: 0 }, orientation: q },
    },
    data: Array(40000).fill(-1),
  });
  assert.ok(map.values.length <= 16384);
  assert.equal(map.sampled, true);
});
test("quaternion composition rotates translation and round trips", () => {
  const t = { p: [1, 2, 3], q: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    a = compose(t, invert(t));
  a.p.forEach((x) => assert.ok(Math.abs(x) < 1e-10));
});
test("marker deletion / lifetime and unsupported displays remain explicit", () => {
  const v = normalize("visualization_msgs/msg/Marker", {
    id: 5,
    ns: "test",
    action: 2,
    lifetime: { sec: 3 },
    pose: { position: { x: 0, y: 0, z: 0 }, orientation: q },
    scale: { x: 1, y: 1, z: 1 },
  });
  assert.equal(v.markers[0].action, 2);
  assert.equal(v.markers[0].lifetime, 3);
  assert.throws(() => normalize("sensor_msgs/Image", {}), /not supported/);
});
test("TF interpolates bracketed samples and rejects cycles", () => {
  const tf = new TF();
  tf.update({
    transforms: [edge("map", "robot", 0, 10), edge("map", "robot", 2, 12)],
  });
  assert.deepEqual(tf.lookup("map", "robot", 11).p, [1, 0, 0]);
  assert.throws(
    () => tf.update({ transforms: [edge("robot", "map", 1, 12)] }),
    /Cyclic/,
  );
  assert.throws(
    () => tf.update({ transforms: [edge("map", "robot", 1, 12)] }, true),
    /Conflicting/,
  );
});
test("rectangular occupancy grids cannot evade cell budget", () => {
  const map = normalize("nav_msgs/OccupancyGrid", {
    info: {
      width: 50000,
      height: 1,
      resolution: 0.1,
      origin: { position: { x: 0, y: 0, z: 0 }, orientation: q },
    },
    data: Array(50000).fill(0),
  });
  assert.ok(map.values.length <= 16384);
});
