"use strict";
const MAX_POINTS = 3000,
  MAX_CELLS = 16384;
const SUPPORTED = [
  "sensor_msgs/LaserScan",
  "sensor_msgs/PointCloud2",
  "nav_msgs/Path",
  "nav_msgs/Odometry",
  "nav_msgs/OccupancyGrid",
  "visualization_msgs/Marker",
  "visualization_msgs/MarkerArray",
  "sensor_msgs/CompressedImage",
];
function frame(s) {
  return String(s || "").replace(/^\/+/, "");
}
function stamp(s) {
  return (
    Number(s?.sec ?? s?.secs ?? 0) + Number(s?.nanosec ?? s?.nsecs ?? 0) / 1e9
  );
}
function point(v) {
  const a = [Number(v?.x), Number(v?.y), Number(v?.z)];
  if (!a.every(Number.isFinite)) throw Error("Invalid vector");
  return a;
}
function quaternion(v) {
  const a = [v?.x ?? 0, v?.y ?? 0, v?.z ?? 0, v?.w ?? 1].map(Number),
    n = Math.hypot(...a);
  if (!a.every(Number.isFinite) || n < 1e-8) throw Error("Invalid quaternion");
  return a.map((x) => x / n);
}
function rotate(q, p) {
  const [x, y, z, w] = q,
    [a, b, c] = p;
  const u = [y * c - z * b, z * a - x * c, x * b - y * a];
  return [
    a + 2 * (w * u[0] + y * u[2] - z * u[1]),
    b + 2 * (w * u[1] + z * u[0] - x * u[2]),
    c + 2 * (w * u[2] + x * u[1] - y * u[0]),
  ];
}
function multiply(a, b) {
  const [x, y, z, w] = a,
    [i, j, k, l] = b;
  return [
    x * l + w * i + y * k - z * j,
    y * l + w * j + z * i - x * k,
    z * l + w * k + x * j - y * i,
    w * l - x * i - y * j - z * k,
  ];
}
const identity = () => ({ p: [0, 0, 0], q: [0, 0, 0, 1] });
function compose(a, b) {
  const p = rotate(a.q, b.p).map((x, i) => x + a.p[i]);
  return { p, q: multiply(a.q, b.q) };
}
function interpolate(a, b, t) {
  const f = (t - a.t) / (b.t - a.t);
  let q = b.q.slice(),
    dot = a.q.reduce((s, v, i) => s + v * q[i], 0);
  if (dot < 0) {
    q = q.map((v) => -v);
    dot = -dot;
  }
  let out;
  if (dot > 0.9995) out = a.q.map((v, i) => v + (q[i] - v) * f);
  else {
    const angle = Math.acos(Math.min(1, dot)),
      den = Math.sin(angle);
    out = a.q.map(
      (v, i) =>
        (v * Math.sin((1 - f) * angle) + q[i] * Math.sin(f * angle)) / den,
    );
  }
  const n = Math.hypot(...out);
  return {
    ...a,
    t,
    p: a.p.map((v, i) => v + (b.p[i] - v) * f),
    q: out.map((v) => v / n),
  };
}
function invert(a) {
  const q = [-a.q[0], -a.q[1], -a.q[2], a.q[3]];
  return {
    p: rotate(
      q,
      a.p.map((x) => -x),
    ),
    q,
  };
}
class TF {
  constructor() {
    this.edges = new Map();
    this.clock = null;
  }
  update(msg, isStatic = false) {
    for (const v of (msg.transforms || []).slice(0, 2048)) {
      const parent = frame(v.header?.frame_id),
        child = frame(v.child_frame_id);
      if (!parent || !child || parent === child) continue;
      const key = (isStatic ? "s:" : "d:") + child;
      const old = this.edges.get(key) || [];
      const entry = {
        parent,
        child,
        t: stamp(v.header?.stamp),
        received: Date.now(),
        ...{
          p: point(v.transform.translation),
          q: quaternion(v.transform.rotation),
        },
      };
      const opposite = this.edges.get((isStatic ? "d:" : "s:") + child);
      if (opposite)
        throw Error("Conflicting static/dynamic TF child: " + child);
      let parentWalk = parent;
      const visited = new Set([child]);
      while (parentWalk) {
        if (visited.has(parentWalk)) throw Error("Cyclic TF graph");
        visited.add(parentWalk);
        const prior =
          this.edges.get("s:" + parentWalk) ||
          this.edges.get("d:" + parentWalk);
        parentWalk = prior?.at(-1)?.parent;
      }
      if (isStatic) this.edges.set(key, [entry]);
      else {
        const items = old.filter((x) => x.t !== entry.t);
        items.push(entry);
        items.sort((a, b) => a.t - b.t);
        this.edges.set(key, items.slice(-60));
      }
      if (this.edges.size > 2048) throw Error("TF frame limit exceeded");
    }
  }
  setClock(t) {
    if (this.clock !== null && t < this.clock)
      for (const k of this.edges.keys())
        if (k.startsWith("d:")) this.edges.delete(k);
    this.clock = t;
  }
  lookup(fixed, source, time = 0) {
    fixed = frame(fixed);
    source = frame(source);
    if (fixed === source) return identity();
    const adj = new Map();
    for (const [key, list] of this.edges) {
      let e = key.startsWith("s:")
        ? list[0]
        : [...list].reverse().find((v) => !time || v.t <= time);
      if (!e) continue;
      if (!key.startsWith("s:")) {
        if (!time && Date.now() - e.received > 2000) continue;
        if (time && time !== e.t) {
          const next = list.find((v) => v.t > time);
          if (!next || next.parent !== e.parent || next.t - e.t > 2) continue;
          e = interpolate(e, next, time);
        }
      }
      const put = (a, b, t) =>
        adj.set(a, [...(adj.get(a) || []), { to: b, t }]);
      put(e.child, e.parent, e);
      put(e.parent, e.child, invert(e));
    }
    const todo = [{ to: source, t: identity() }],
      seen = new Set();
    for (let i = 0; i < todo.length && i < 4096; i++) {
      const x = todo[i];
      if (x.to === fixed) return x.t;
      if (seen.has(x.to)) continue;
      seen.add(x.to);
      for (const e of adj.get(x.to) || [])
        if (!seen.has(e.to)) todo.push({ to: e.to, t: compose(e.t, x.t) });
    }
    throw Error("Missing or stale TF: " + source + " → " + fixed);
  }
  frames() {
    return [
      ...new Set(
        [...this.edges.values()].flatMap((v) =>
          v.length ? [v[0].parent, v[0].child] : [],
        ),
      ),
    ].sort();
  }
}
function cloud(m) {
  const width = m.width,
    height = m.height,
    step = m.point_step,
    row = m.row_step;
  if (
    ![width, height, step, row].every(Number.isSafeInteger) ||
    width < 0 ||
    height < 0 ||
    step < 1 ||
    row < width * step ||
    width * height > 1e7 ||
    row * height > 8 * 1048576
  )
    throw Error("PointCloud2 layout exceeds budget");
  const b =
    typeof m.data === "string"
      ? Buffer.from(m.data, "base64")
      : Buffer.from(m.data || []);
  if (b.length < row * height) throw Error("Truncated PointCloud2");
  const fields = ["x", "y", "z"].map((name) =>
    (m.fields || []).find((f) => f.name === name),
  );
  if (
    fields.some(
      (f) =>
        !f ||
        ![7, 8].includes(f.datatype) ||
        !Number.isSafeInteger(f.offset) ||
        f.offset < 0 ||
        f.offset + (f.datatype === 7 ? 4 : 8) > step,
    )
  )
    throw Error("Unsupported PointCloud2 XYZ fields");
  const out = [],
    stride = Math.max(1, Math.ceil((width * height) / MAX_POINTS));
  for (let i = 0; i < width * height; i += stride) {
    const offset = Math.floor(i / width) * row + (i % width) * step;
    const p = fields.map((f) =>
      b[
        (f.datatype === 7 ? "readFloat" : "readDouble") +
          (m.is_bigendian ? "BE" : "LE")
      ](offset + f.offset),
    );
    if (p.every(Number.isFinite)) out.push(...p);
  }
  return {
    kind: "points",
    points: out,
    inputPoints: width * height,
    sampled: stride > 1,
  };
}
function normalize(type, m) {
  type = type.replace("/msg/", "/");
  const base = {
    frame: frame(m.header?.frame_id),
    time: stamp(m.header?.stamp),
  };
  if (type === "sensor_msgs/PointCloud2") return { ...base, ...cloud(m) };
  if (type === "sensor_msgs/LaserScan") {
    if (!Array.isArray(m.ranges) || m.ranges.length > 1e6)
      throw Error("Invalid LaserScan");
    const pts = [],
      step = Math.max(1, Math.ceil(m.ranges.length / MAX_POINTS));
    for (let i = 0; i < m.ranges.length; i += step) {
      const r = m.ranges[i],
        a = m.angle_min + i * m.angle_increment;
      if (
        Number.isFinite(r) &&
        r >= m.range_min &&
        r <= m.range_max &&
        Number.isFinite(a)
      )
        pts.push(r * Math.cos(a), r * Math.sin(a), 0);
    }
    return {
      ...base,
      kind: "points",
      points: pts,
      sampled: step > 1,
      inputPoints: m.ranges.length,
    };
  }
  if (type === "nav_msgs/Path") {
    const poses = m.poses || [];
    const stride = Math.max(1, Math.ceil(poses.length / MAX_POINTS));
    return {
      ...base,
      kind: "line",
      points: poses
        .filter((_, i) => i % stride === 0)
        .flatMap((x) => point(x.pose.position)),
      sampled: stride > 1,
    };
  }
  if (type === "nav_msgs/Odometry")
    return {
      ...base,
      kind: "pose",
      p: point(m.pose.pose.position),
      q: quaternion(m.pose.pose.orientation),
    };
  if (type === "nav_msgs/OccupancyGrid") {
    const w = m.info?.width,
      h = m.info?.height;
    if (
      !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(h) ||
      w <= 0 ||
      h <= 0 ||
      w * h > 4e6 ||
      m.data?.length !== w * h ||
      !Number.isFinite(m.info.resolution) ||
      m.info.resolution <= 0
    )
      throw Error("Invalid map");
    const stride = Math.max(
        1,
        Math.ceil(w / Math.sqrt(MAX_CELLS)),
        Math.ceil(h / Math.sqrt(MAX_CELLS)),
      ),
      pts = [],
      values = [];
    for (let y = 0; y < h; y += stride)
      for (let x = 0; x < w; x += stride) {
        pts.push(
          (x + 0.5) * m.info.resolution,
          (y + 0.5) * m.info.resolution,
          0,
        );
        values.push(m.data[y * w + x]);
      }
    return {
      ...base,
      kind: "map",
      points: pts,
      values,
      p: point(m.info.origin.position),
      q: quaternion(m.info.origin.orientation),
      resolution: m.info.resolution * stride,
      sampled: stride > 1,
    };
  }
  if (
    type === "visualization_msgs/Marker" ||
    type === "visualization_msgs/MarkerArray"
  ) {
    return {
      ...base,
      kind: "markers",
      markers: (type.endsWith("Array") ? m.markers : [m])
        .slice(0, 128)
        .map((v) => ({
          id: String(v.ns || "") + ":" + v.id,
          action: v.action,
          type: v.type,
          frame: frame(v.header?.frame_id),
          time: stamp(v.header?.stamp),
          p: point(v.pose?.position || { x: 0, y: 0, z: 0 }),
          q: quaternion(v.pose?.orientation),
          scale: point(v.scale || { x: 1, y: 1, z: 1 }),
          color: v.color,
          lifetime: stamp(v.lifetime),
          points: (v.points || []).slice(0, MAX_POINTS).flatMap(point),
        })),
    };
  }
  if (type === "sensor_msgs/CompressedImage") {
    if (!/(?:^|;)\s*(jpeg|jpg|png)(?:\s|;|$)/i.test(m.format || ""))
      throw Error("Only JPEG/PNG compressed images supported");
    const b =
      typeof m.data === "string"
        ? Buffer.from(m.data, "base64")
        : Buffer.from(m.data || []);
    if (b.length > 128 * 1024) throw Error("Image preview budget 128 KiB");
    return {
      ...base,
      kind: "image",
      mime: /png/i.test(m.format) ? "image/png" : "image/jpeg",
      data: b.toString("base64"),
    };
  }
  throw Error("Display type not supported: " + type);
}
module.exports = {
  TF,
  normalize,
  frame,
  stamp,
  compose,
  invert,
  rotate,
  MAX_POINTS,
  SUPPORTED,
};
