"use strict";
// Isolated protocol fixture + browser harness. Never connects to real projects or 9999.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { WebSocketServer } = require("ws");
const root = path.resolve(".agent-state/fixture");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "robot.urdf"),
  '<robot name="fixture"><link name="map"><visual><origin xyz="0 0 0.25"/><geometry><box size="0.9 0.6 0.5"/></geometry><material name="blue"><color rgba="0.3 0.6 0.8 1"/></material></visual></link><link name="lidar"><visual><geometry><cylinder radius="0.14" length="0.12"/></geometry></visual></link><joint name="lidar_fixed" type="fixed"><parent link="map"/><child link="lidar"/><origin xyz="0 0 0.65"/></joint></robot>',
);
const api = {
  workspaceRoot: root,
  sources: async (a) => {
    if (a.operation === "sources")
      return {
        sources: [
          {
            id: "workspace",
            name: "Synthetic ROS fixture",
            type: "local",
            origin: "fixture-1",
            workspaceKey: "fixture-1",
          },
        ],
      };
    if (a.operation === "browse")
      return { entries: [{ path: "robot.urdf", kind: "file" }] };
    if (a.operation === "stage") {
      if (a.path !== "robot.urdf")
        throw Error("Fixture only exposes robot.urdf");
      return { workspace: root, path: "robot.urdf" };
    }
    throw Error("Unsupported fixture operation");
  },
  proposeWrite: (file, content) => ({ proposal: { path: file, content } }),
};
const plugin = require("../index.js");
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/viewer") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src blob:; frame-ancestors 'self'",
    );
    return res.end(fs.readFileSync("viewer.html"));
  }
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(
      `<!doctype html><html><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}</style><iframe src="/viewer" sandbox="allow-scripts"></iframe><script>const frame=document.querySelector('iframe');window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.type!=='aide.workbench.ready')return;const channel=new MessageChannel();channel.port1.onmessage=async e=>{const m=e.data;let result;try{if(m.method!=='tool.call'||!['rviz_io','rviz_save_config'].includes(m.tool))throw Error('Unexpected method');const r=await fetch('/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:m.tool,arguments:m.arguments})});const v=await r.json();if(!r.ok)throw Error(v.error);result={requestId:m.requestId,status:'ok',result:v}}catch(e){result={requestId:m.requestId,status:'error',error:e.message}}channel.port1.postMessage(result)};frame.contentWindow.postMessage({type:'aide.workbench.connect',protocol:1,pluginId:'rviz',tools:['rviz_io','rviz_save_config'],capabilities:[]},'*',[channel.port2])});</script></html>`,
    );
  }
  if (req.method === "POST" && req.url === "/call") {
    let b = "";
    try {
      for await (const c of req) {
        b += c;
        if (b.length > 16384) throw Error("Budget");
      }
      if (
        req.headers.origin !== "http://127.0.0.1:18496" ||
        req.headers["content-type"] !== "application/json"
      )
        throw Error("Origin or content type rejected");
      const message = JSON.parse(b);
      if (!["rviz_io", "rviz_save_config"].includes(message.tool))
        throw Error("Unknown tool");
      if (message.tool === "rviz_io" && message.arguments.action === "save")
        throw Error("Use write tool");
      const value = await plugin._io(
        message.tool === "rviz_save_config"
          ? { action: "save", config: message.arguments.config }
          : message.arguments,
        api,
      );
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
const bridge = new WebSocketServer({ server, path: "/ros" });
let tick = 0;
bridge.on("connection", (ws) => {
  const subs = new Set();
  ws.on("message", (b) => {
    const m = JSON.parse(b);
    if (m.op === "subscribe") subs.add(m.topic);
    if (m.op === "unsubscribe") subs.delete(m.topic);
    if (m.op === "call_service")
      ws.send(
        JSON.stringify({
          op: "service_response",
          id: m.id,
          result: true,
          values: {
            topics: ["/scan", "/cloud", "/map", "/path", "/odom", "/markers"],
            types: [
              "sensor_msgs/msg/LaserScan",
              "sensor_msgs/msg/PointCloud2",
              "nav_msgs/msg/OccupancyGrid",
              "nav_msgs/msg/Path",
              "nav_msgs/msg/Odometry",
              "visualization_msgs/msg/MarkerArray",
            ],
          },
        }),
      );
  });
  const timer = setInterval(() => {
    if (ws.readyState !== 1) return;
    tick++;
    const header = { frame_id: "laser", stamp: { sec: 100 } },
      pose = { position: { x: 0, y: 0, z: 0 }, orientation: { w: 1 } },
      pub = (topic, msg) => {
        if (subs.has(topic))
          ws.send(JSON.stringify({ op: "publish", topic, msg }));
      };
    pub("/tf_static", {
      transforms: [
        {
          header: { frame_id: "map" },
          child_frame_id: "laser",
          transform: {
            translation: { x: 0.5, y: 0, z: 0.2 },
            rotation: { w: 1 },
          },
        },
        {
          header: { frame_id: "map" },
          child_frame_id: "lidar",
          transform: {
            translation: { x: 0, y: 0, z: 0.65 },
            rotation: { w: 1 },
          },
        },
      ],
    });
    pub("/scan", {
      header,
      angle_min: -Math.PI,
      angle_increment: Math.PI / 180,
      range_min: 0.1,
      range_max: 10,
      ranges: Array.from(
        { length: 360 },
        (_, i) => 3 + 0.4 * Math.sin(i * 0.1 + tick * 0.04),
      ),
    });
    const data = Buffer.alloc(12000);
    for (let i = 0; i < 1000; i++) {
      data.writeFloatLE(Math.sin(i * 0.19) * 2, i * 12);
      data.writeFloatLE(Math.cos(i * 0.19) * 2, i * 12 + 4);
      data.writeFloatLE((i % 40) / 40, i * 12 + 8);
    }
    pub("/cloud", {
      header,
      width: 1000,
      height: 1,
      point_step: 12,
      row_step: 12000,
      fields: ["x", "y", "z"].map((name, i) => ({
        name,
        offset: i * 4,
        datatype: 7,
      })),
      data: data.toString("base64"),
    });
    pub("/map", {
      header: { frame_id: "map" },
      info: { width: 20, height: 20, resolution: 0.2, origin: pose },
      data: Array.from({ length: 400 }, (_, i) =>
        i % 20 === 0 || i < 20 ? 100 : 0,
      ),
    });
    pub("/path", {
      header: { frame_id: "map" },
      poses: Array.from({ length: 40 }, (_, i) => ({
        pose: { position: { x: i / 10, y: Math.sin(i / 6), z: 0.05 } },
      })),
    });
    pub("/odom", {
      header: { frame_id: "map" },
      pose: {
        pose: {
          position: { x: Math.sin(tick / 20), y: 0, z: 0.1 },
          orientation: { w: 1 },
        },
      },
    });
    pub("/markers", {
      markers: [
        {
          header: { frame_id: "map" },
          ns: "fixture",
          id: 1,
          type: 2,
          action: 0,
          pose: { position: { x: 1, y: 1, z: 0.5 }, orientation: { w: 1 } },
          scale: { x: 0.4, y: 0.4, z: 0.4 },
          color: { r: 0.9, g: 0.6, b: 0.2, a: 1 },
        },
      ],
    });
  }, 200);
  ws.on("close", () => clearInterval(timer));
});
server.listen(18496, "127.0.0.1", () =>
  console.log(
    "Isolated RViz preview: http://127.0.0.1:18496 ; fixture bridge: ws://127.0.0.1:18496/ros",
  ),
);
function stop() {
  for (const c of bridge.clients) c.terminate();
  bridge.close();
  server.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
