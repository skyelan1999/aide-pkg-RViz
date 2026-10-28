import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
const $ = (id) => document.getElementById(id),
  client = window.AideWorkbenchClient.create("rviz");
let queue = Promise.resolve(),
  session = "",
  stopped = false,
  busy = false,
  lang = navigator.language.startsWith("zh") ? "zh" : "en",
  lastFrame = null,
  actionMessage = "";
const translations = {
  subtitle: "Projects, transforms & live topics",
  reset: "Reset camera",
  connection: "Connection",
  mode: "Transport",
  qos: "Bridge supports explicit QoS (2.1)",
  connect: "Connect",
  disconnect: "Disconnect",
  networkHint:
    "Connections originate from the Aide backend. SSH uses its configured keys and known_hosts; passwords are not accepted.",
  displays: "Displays",
  topic: "Topic",
  refresh: "Refresh",
  add: "Add",
  save: "Save config",
  demo: "Demo scene",
  project: "Project resources",
  directory: "Project-relative directory",
  browse: "Browse",
  parent: "Parent",
  load: "Load project file",
  packages: "Package map (JSON, relative to project root)",
  diagnostics: "Diagnostics",
  initial: "Disconnected",
  previewBudget: "Preview budget",
  budget:
    "Bounded polling, up to 3,000 cloud/scan points and 16,384 map cells per layer. Sampling and frame errors are shown. No real robot connected.",
  controls: "Drag to orbit · Scroll to zoom · Right drag to pan",
};
const supported = new Set([
  "sensor_msgs/LaserScan",
  "sensor_msgs/PointCloud2",
  "nav_msgs/Path",
  "nav_msgs/Odometry",
  "nav_msgs/OccupancyGrid",
  "visualization_msgs/Marker",
  "visualization_msgs/MarkerArray",
  "sensor_msgs/CompressedImage",
]);
const originals = new Map(
  [...document.querySelectorAll("[data-i18n]")].map((e) => [e, e.textContent]),
);
function language() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  for (const [e, t] of originals)
    e.textContent = lang === "zh" ? t : translations[e.dataset.i18n];
  $("language").textContent = lang === "zh" ? "EN" : "中文";
  if (lastFrame) renderStatus(lastFrame);
}
language();
$("language").onclick = () => {
  lang = lang === "zh" ? "en" : "zh";
  language();
};
function tell(s, bad = false) {
  if (bad) actionMessage = s;
  $("status").textContent = s;
  $("status").className = bad ? "error" : "";
  $("notice").textContent = s;
  $("notice").className = "notice" + (bad ? " error" : "");
}
function call(a) {
  const task = queue
    .then(() => client.call("rviz_io", a))
    .then((v) => {
      if (v.status === "error") throw Error(v.error);
      return v.result;
    });
  queue = task.catch(() => {});
  return task;
}
const scene = new T.Scene(),
  camera = new T.PerspectiveCamera(45, 1, 0.01, 10000);
camera.up.set(0, 0, 1);
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$("viewport").prepend(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const grid = new T.GridHelper(20, 20, 0x4c6b84, 0x2a4055);
grid.rotation.x = Math.PI / 2;
scene.add(grid, new T.AxesHelper(1));
scene.add(new T.HemisphereLight(0xd3e8ff, 0x283342, 2));
const light = new T.DirectionalLight(0xffffff, 2);
light.position.set(4, -4, 8);
scene.add(light);
function home() {
  camera.position.set(9, -11, 9);
  controls.target.set(0, 0, 0);
  controls.update();
}
home();
$("home").onclick = home;
const objects = new Map(),
  sequences = new Map(),
  robotLinks = new Map();
let demoGroup = null;
function dispose(o) {
  o.traverse((n) => {
    if (n.isInstancedMesh) n.dispose();
    n.geometry?.dispose();
    for (const m of Array.isArray(n.material) ? n.material : [n.material])
      m?.dispose();
  });
  o.removeFromParent();
}
function clear() {
  for (const o of objects.values()) dispose(o);
  objects.clear();
  sequences.clear();
  for (const x of robotLinks.values()) dispose(x.object);
  robotLinks.clear();
  if (demoGroup) dispose(demoGroup);
  demoGroup = null;
}
function setPose(o, t) {
  o.position.fromArray(t.p);
  o.quaternion.fromArray(t.q);
}
function points(pts, line = false, color = 0x6edbd4, size = 0.045) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  return line
    ? new T.Line(g, new T.LineBasicMaterial({ color }))
    : new T.Points(
        g,
        new T.PointsMaterial({ color, size, sizeAttenuation: true }),
      );
}
function color(c) {
  return new T.Color(c?.r ?? 0.5, c?.g ?? 0.8, c?.b ?? 1);
}
function markerObject(m) {
  let o;
  const material = new T.MeshStandardMaterial({
    color: color(m.color),
    transparent: true,
    opacity: m.color?.a ?? 1,
  });
  if (m.type === 1) o = new T.Mesh(new T.BoxGeometry(...m.scale), material);
  else if (m.type === 2)
    ((o = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), material)),
      o.scale.fromArray(m.scale));
  else if (m.type === 3) {
    o = new T.Mesh(
      new T.CylinderGeometry(m.scale[0] / 2, m.scale[1] / 2, m.scale[2], 20),
      material,
    );
    o.geometry.rotateX(Math.PI / 2);
  } else if ([4, 5, 8].includes(m.type)) {
    material.dispose();
    o = points(
      m.points,
      [4, 5].includes(m.type),
      color(m.color),
      Math.max(0.01, m.scale[0]),
    );
    if (m.type === 5) o = new T.LineSegments(o.geometry, o.material);
  } else if (m.type === 0) {
    if (m.points.length)
      throw Error("Arrow points mode is not supported in this preview");
    o = new T.ArrowHelper(
      new T.Vector3(1, 0, 0),
      new T.Vector3(),
      Math.max(0.01, m.scale[0]),
      color(m.color),
    );
    material.dispose();
  } else {
    material.dispose();
    throw Error("Unsupported Marker type " + m.type);
  }
  return o;
}
const markerSets = new Map();
function drawLayer(entry) {
  const v = entry.value;
  if (entry.error) {
    const o = objects.get(entry.topic);
    if (o) o.visible = false;
    return;
  }
  if (v.kind !== "markers" && sequences.get(entry.topic) === entry.sequence) {
    const old = objects.get(entry.topic);
    if (old) {
      old.visible = true;
      if (v.transform) setPose(old, v.transform);
    }
    return;
  }
  sequences.set(entry.topic, entry.sequence);
  if (v.kind === "image") {
    $("image").src = "data:" + v.mime + ";base64," + v.data;
    $("image").hidden = false;
    return;
  }
  if (v.kind === "markers") {
    let set = markerSets.get(entry.topic);
    if (!set) markerSets.set(entry.topic, (set = new Map()));
    for (const m of v.markers) {
      if (m.action === 3) {
        for (const x of set.values()) dispose(x.object);
        set.clear();
        continue;
      }
      const old = set.get(m.id);
      if (
        old &&
        old.sequence === entry.sequence &&
        m.action !== 2 &&
        m.action !== 3
      ) {
        old.object.visible = !m.error && !old.expired;
        if (m.transform) setPose(old.object, m.transform);
        continue;
      }
      if (old) (dispose(old.object), set.delete(m.id));
      if (m.action === 2) continue;
      try {
        if (m.error) throw Error(m.error);
        const o = markerObject(m);
        setPose(o, m.transform);
        scene.add(o);
        if (set.size >= 512) {
          const first = set.keys().next().value;
          dispose(set.get(first).object);
          set.delete(first);
        }
        set.set(m.id, {
          object: o,
          sequence: entry.sequence,
          expires:
            m.lifetime > 0 ? performance.now() + m.lifetime * 1000 : Infinity,
        });
      } catch (e) {
        tell(e.message, true);
      }
    }
    return;
  }
  if (objects.has(entry.topic)) dispose(objects.get(entry.topic));
  let o;
  if (v.kind === "points" || v.kind === "line")
    o = points(v.points, v.kind === "line");
  else if (v.kind === "map") {
    o = new T.InstancedMesh(
      new T.PlaneGeometry(v.resolution, v.resolution),
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
      v.values.length,
    );
    const matrix = new T.Matrix4();
    v.values.forEach((n, i) => {
      matrix.makeTranslation(...v.points.slice(i * 3, i * 3 + 3));
      o.setMatrixAt(i, matrix);
      o.setColorAt(
        i,
        n < 0
          ? new T.Color(0.18, 0.24, 0.31)
          : new T.Color().setRGB(1 - n / 100, 1 - n / 100, 1 - n / 100),
      );
    });
    o.instanceMatrix.needsUpdate = true;
    if (o.instanceColor) o.instanceColor.needsUpdate = true;
  } else if (v.kind === "pose") {
    o = new T.AxesHelper(0.7);
    const group = new T.Group();
    setPose(o, { p: v.p, q: v.q });
    group.add(o);
    o = group;
  } else return;
  setPose(o, v.transform);
  objects.set(entry.topic, o);
  scene.add(o);
}
function renderStatus(s) {
  lastFrame = s;
  if (!s.connected) {
    for (const o of objects.values()) o.visible = false;
    for (const set of markerSets.values())
      for (const m of set.values()) m.object.visible = false;
  }
  $("sceneInfo").textContent =
    (s.connected ? "LIVE" : "OFFLINE") +
    " · " +
    s.fixed +
    " · " +
    s.layers.length +
    " layers · " +
    robotLinks.size +
    " robot links";
  tell(
    s.error ||
      actionMessage ||
      (s.connected
        ? lang === "zh"
          ? "已连接 · 只读预览"
          : "Connected · read-only preview"
        : "Connecting…"),
    !!s.error,
  );
  const selected = $("topics").value;
  const topicsKey = JSON.stringify(s.topics);
  if ($("topics").dataset.key !== topicsKey) {
    $("topics").replaceChildren(
      ...s.topics
        .filter((v) => supported.has(v.type.replace("/msg/", "/")))
        .map((v) => {
          const o = document.createElement("option");
          o.value = v.topic;
          o.textContent = v.topic + " · " + v.type;
          o.dataset.type = v.type;
          return o;
        }),
    );
    $("topics").dataset.key = topicsKey;
    $("topics").value =
      selected ||
      s.topics.find((v) => supported.has(v.type.replace("/msg/", "/")))
        ?.topic ||
      "";
  }
  $("frames").textContent = s.frames
    .map((f) => f.frame + (f.error ? " · !" : ""))
    .join("\n");
  $("frames").style.whiteSpace = "pre-line";
  for (const l of s.layers) drawLayer(l);
  for (const [name, r] of robotLinks) {
    const f = s.frames.find((x) => x.frame === name);
    if (f?.transform) {
      r.object.visible = true;
      setPose(r.object, f.transform);
    } else {
      r.object.visible = !r.requiresTF && name === s.fixed;
      if (r.object.visible) setPose(r.object, r.offline);
    }
  }
  $("layers").replaceChildren(
    ...s.layers.map((l) => {
      const d = document.createElement("div");
      d.className = "layer";
      const b = document.createElement("b");
      b.textContent = l.topic;
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.title = lang === "zh" ? "移除显示" : "Remove display";
      remove.onclick = () =>
        void action(async () => {
          await call({ action: "unsubscribe", id: session, topic: l.topic });
          const o = objects.get(l.topic);
          if (o) dispose(o);
          objects.delete(l.topic);
          sequences.delete(l.topic);
          for (const m of markerSets.get(l.topic)?.values() || [])
            dispose(m.object);
          markerSets.delete(l.topic);
        });
      const info = document.createElement("div");
      info.className = l.error ? "hint error" : "hint";
      info.textContent =
        l.error || (l.value.sampled ? "Sampled · " : "") + l.value.kind;
      d.append(remove, b, info);
      return d;
    }),
  );
}
async function poll() {
  if (!session || stopped || busy) return;
  busy = true;
  try {
    renderStatus(
      await call({ action: "poll", id: session, fixed: $("fixed").value }),
    );
  } catch (e) {
    tell(e.message, true);
    await disconnect();
  } finally {
    busy = false;
  }
}
async function disconnect() {
  const id = session;
  session = "";
  $("connect").disabled = false;
  $("disconnect").disabled = true;
  if (id) await call({ action: "close", id }).catch(() => {});
  clear();
  for (const m of markerSets.values())
    for (const x of m.values()) dispose(x.object);
  markerSets.clear();
  $("image").hidden = true;
  $("layers").replaceChildren();
}
async function action(fn) {
  actionMessage = "";
  try {
    await fn();
  } catch (e) {
    tell(e.message, true);
  }
}
$("mode").onchange = () => {
  $("sshFields").hidden = $("mode").value !== "ssh";
  $("endpoint").hidden = $("endpointLabel").hidden = $("mode").value === "ssh";
};
$("connect").onclick = () =>
  void action(async () => {
    await disconnect();
    $("connect").disabled = true;
    tell("Connecting…");
    try {
      const a = {
        action: "open",
        confirm: true,
        ros: Number($("ros").value),
        qos: $("qos").checked,
        endpoint: $("endpoint").value,
      };
      if ($("mode").value === "ssh")
        a.ssh = { alias: $("alias").value, port: Number($("port").value) };
      const r = await call(a);
      session = r.id;
      $("disconnect").disabled = false;
      await poll();
    } catch (e) {
      $("connect").disabled = false;
      throw e;
    }
  });
$("disconnect").onclick = () => void action(disconnect);
$("refresh").onclick = () =>
  void action(() => call({ action: "topics", id: session }));
$("add").onclick = () =>
  void action(() =>
    call({
      action: "subscribe",
      id: session,
      topic: $("topics").value,
      type: $("topics").selectedOptions[0]?.dataset.type,
    }),
  );
$("save").onclick = () =>
  void action(async () => {
    const r = await call({
      action: "save",
      config: {
        version: 1,
        fixed: $("fixed").value,
        layers: (lastFrame?.layers || []).map((x) => ({
          topic: x.topic,
          type: lastFrame.topics.find((t) => t.topic === x.topic)?.type || "",
        })),
      },
    });
    tell(
      r.proposal
        ? "Save proposal submitted; approve it in Aide."
        : "Save request submitted.",
    );
  });
async function browse() {
  const r = await call({
    action: "browse",
    source: $("sources").value,
    path: $("directory").value,
  });
  $("filelist").replaceChildren(
    ...r.entries.slice(0, 100).map((f) => {
      const b = document.createElement("button");
      b.className = "file";
      b.textContent = (f.kind === "directory" ? "▸ " : "") + f.path;
      b.onclick = () =>
        void action(async () => {
          if (f.kind === "directory") {
            $("directory").value = f.path;
            await browse();
          } else $("file").value = f.path;
        });
      return b;
    }),
  );
}
$("browse").onclick = () => void action(browse);
$("parent").onclick = () =>
  void action(() => {
    $("directory").value =
      $("directory").value.split("/").slice(0, -1).join("/") || ".";
    return browse();
  });
async function read(path) {
  const r = await call({ action: "read", source: $("sources").value, path });
  return Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
}
function vector(s, def = "0 0 0") {
  const v = (s || def).trim().split(/\s+/).map(Number);
  if (v.length !== 3 || !v.every(Number.isFinite))
    throw Error("Invalid URDF vector");
  return v;
}
function origin(node) {
  const g = new T.Group(),
    e = node.querySelector(":scope > origin");
  g.position.fromArray(vector(e?.getAttribute("xyz")));
  const r = vector(e?.getAttribute("rpy"));
  g.quaternion.setFromEuler(new T.Euler(...r, "ZYX"));
  return g;
}
function assetPath(uri, base, map) {
  let s = uri;
  if (s.startsWith("package://")) {
    const [pkg, ...parts] = s.slice(10).split("/");
    if (typeof map[pkg] !== "string")
      throw Error("Missing package map: " + pkg);
    s = map[pkg] + "/" + parts.join("/");
  } else s = base + "/" + s;
  const out = [];
  if (/^[a-z]+:|^[/\\]/i.test(s))
    throw Error("External URDF resources are blocked");
  for (const p of s.split("/")) {
    if (p === "..") {
      if (!out.length) throw Error("Resource path escapes project");
      out.pop();
    } else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}
async function urdf(bytes, path) {
  const text = new TextDecoder().decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("XML entities are not supported");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror") || !doc.querySelector("robot"))
    throw Error("Invalid URDF");
  const links = [...doc.querySelectorAll("robot > link")];
  if (links.length > 256) throw Error("URDF link budget exceeded");
  for (const x of robotLinks.values()) dispose(x.object);
  robotLinks.clear();
  const map = JSON.parse($("packages").value),
    base = path.split("/").slice(0, -1).join("/") || ".",
    warnings = [];
  for (const link of links) {
    const group = new T.Group();
    for (const visual of [...link.querySelectorAll(":scope > visual")].slice(
      0,
      32,
    )) {
      const place = origin(visual),
        geom = visual.querySelector(":scope > geometry");
      let o;
      const mat = new T.MeshStandardMaterial({
        color: 0xa8bfd0,
        metalness: 0.2,
        roughness: 0.65,
      });
      const rgba = visual
        .querySelector("material > color")
        ?.getAttribute("rgba")
        ?.split(/\s+/)
        .map(Number);
      if (rgba?.length === 4 && rgba.every(Number.isFinite))
        (mat.color.setRGB(...rgba.slice(0, 3)),
          (mat.opacity = rgba[3]),
          (mat.transparent = rgba[3] < 1));
      if (geom?.querySelector("box"))
        o = new T.Mesh(
          new T.BoxGeometry(
            ...vector(geom.querySelector("box").getAttribute("size")),
          ),
          mat,
        );
      else if (geom?.querySelector("sphere"))
        o = new T.Mesh(
          new T.SphereGeometry(
            Number(geom.querySelector("sphere").getAttribute("radius")),
            20,
            12,
          ),
          mat,
        );
      else if (geom?.querySelector("cylinder")) {
        const n = geom.querySelector("cylinder"),
          r = Number(n.getAttribute("radius"));
        const g = new T.CylinderGeometry(
          r,
          r,
          Number(n.getAttribute("length")),
          20,
        );
        g.rotateX(Math.PI / 2);
        o = new T.Mesh(g, mat);
      } else if (geom?.querySelector("mesh")) {
        const n = geom.querySelector("mesh"),
          uri = assetPath(n.getAttribute("filename") || "", base, map);
        const data = await read(uri);
        if (/\.stl$/i.test(uri)) {
          if (data.length >= 84) {
            const count = new DataView(data.buffer).getUint32(80, true);
            if (84 + count * 50 === data.length && count > 30000)
              throw Error("STL triangle budget exceeded");
            if (
              !new TextDecoder().decode(data.slice(0, 5)).startsWith("solid") &&
              84 + count * 50 !== data.length
            )
              throw Error("Invalid binary STL length");
          }
          o = new T.Mesh(new STLLoader().parse(data.buffer), mat);
        } else if (/\.obj$/i.test(uri)) {
          o = new OBJLoader().parse(new TextDecoder().decode(data));
          o.traverse((x) => {
            if (x.isMesh) x.material = mat;
          });
        } else warnings.push("Unsupported mesh: " + uri);
        if (o) o.scale.fromArray(vector(n.getAttribute("scale"), "1 1 1"));
      }
      if (o) (place.add(o), group.add(place));
      else mat.dispose();
    }
    robotLinks.set(link.getAttribute("name"), {
      object: group,
      requiresTF: false,
    });
  }
  // Offline fixed joints assemble a model; moving joints require a TF frame in live mode.
  const children = new Set();
  for (const j of doc.querySelectorAll("robot > joint")) {
    const child = j.querySelector("child")?.getAttribute("link"),
      parent = j.querySelector("parent")?.getAttribute("link");
    const c = robotLinks.get(child),
      p = robotLinks.get(parent);
    if (!c || !p) continue;
    if (children.has(child)) throw Error("URDF child has multiple parents");
    let walk = p.object;
    while (walk) {
      if (walk === c.object) throw Error("Cyclic URDF joints");
      walk = walk.parent;
    }
    const g = origin(j);
    p.object.add(g);
    g.add(c.object);
    children.add(child);
    if (j.getAttribute("type") !== "fixed") c.requiresTF = true;
  }
  for (const [name, r] of robotLinks)
    if (!children.has(name)) scene.add(r.object);
  scene.updateMatrixWorld(true);
  const poses = [...robotLinks.values()].map((r) => {
    const p = new T.Vector3(),
      q = new T.Quaternion(),
      scale = new T.Vector3();
    r.object.matrixWorld.decompose(p, q, scale);
    return { r, p, q, scale };
  });
  for (const { r, p, q, scale } of poses) {
    let ancestor = r.object.parent;
    while (ancestor && ancestor !== scene) {
      if (
        [...robotLinks.values()].some(
          (x) => x.object === ancestor && x.requiresTF,
        )
      )
        r.requiresTF = true;
      ancestor = ancestor.parent;
    }
    r.offline = { p: p.toArray(), q: q.toArray() };
    r.object.removeFromParent();
    scene.add(r.object);
    r.object.position.copy(p);
    r.object.quaternion.copy(q);
    r.object.scale.copy(scale);
  }
  tell(
    "URDF · " +
      links.length +
      " links" +
      (warnings.length ? "\n" + warnings.join("\n") : ""),
    warnings.length > 0,
  );
}
$("load").onclick = () =>
  void action(async () => {
    const path = $("file").value,
      bytes = await read(path);
    if (/\.json$/i.test(path)) {
      const c = JSON.parse(new TextDecoder().decode(bytes));
      if (c.version !== 1 || !Array.isArray(c.layers) || c.layers.length > 20)
        throw Error("Unsupported config");
      $("fixed").value = String(c.fixed || "map");
      if (session)
        for (const l of c.layers)
          await call({
            action: "subscribe",
            id: session,
            topic: l.topic,
            type: l.type,
          });
      tell("Display config loaded; connection credentials are not stored.");
    } else if (/\.urdf$/i.test(path)) await urdf(bytes, path);
    else
      throw Error(
        "Choose URDF or session.json. Xacro / .rviz import are not available in this preview.",
      );
  });
$("demo").onclick = () =>
  void action(async () => {
    if (session) await disconnect();
    clear();
    demoGroup = new T.Group();
    const pts = [];
    for (let i = 0; i < 1800; i++) {
      const a = i * 0.137,
        r = 3 + 0.3 * Math.sin(i * 0.03);
      pts.push(
        Math.cos(a) * r,
        Math.sin(a) * r,
        0.08 + 0.08 * Math.cos(i * 0.1),
      );
    }
    demoGroup.add(points(pts));
    const robot = new T.Mesh(
      new T.BoxGeometry(0.8, 0.6, 0.3),
      new T.MeshStandardMaterial({
        color: 0x8eb8cc,
        metalness: 0.35,
        roughness: 0.4,
      }),
    );
    robot.position.z = 0.25;
    demoGroup.add(robot, new T.AxesHelper(0.7));
    scene.add(demoGroup);
    $("sceneInfo").textContent = "DEMO · synthetic geometry";
    tell(
      lang === "zh"
        ? "合成演示场景，未连接 ROS。"
        : "Synthetic demo scene; ROS is not connected.",
    );
  });
const size = new ResizeObserver(() => {
  const r = $("viewport").getBoundingClientRect();
  renderer.setSize(r.width, r.height);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
});
size.observe($("viewport"));
let raf;
function animate() {
  raf = requestAnimationFrame(animate);
  for (const set of markerSets.values())
    for (const [id, m] of set)
      if (!m.expired && m.expires < performance.now()) {
        m.object.visible = false;
        m.expired = true;
      }
  controls.update();
  renderer.render(scene, camera);
}
animate();
const interval = setInterval(() => void poll(), 500);
function cleanup() {
  stopped = true;
  clearInterval(interval);
  cancelAnimationFrame(raf);
  void disconnect();
  size.disconnect();
  controls.dispose();
  renderer.dispose();
}
client.onEvent((e) => {
  if (e.event === "scope.revoked") cleanup();
});
window.addEventListener("pagehide", cleanup);
void action(async () => {
  await client.connect();
  const r = await call({ action: "sources" });
  $("sources").replaceChildren(
    ...r.sources.map((s) => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name + " · " + s.type;
      return o;
    }),
  );
  tell(
    lang === "zh"
      ? "工作台就绪，请选择连接或演示场景。"
      : "Workbench ready. Connect or open the demo scene.",
  );
});
