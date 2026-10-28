"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  esbuild = require("esbuild");
async function build() {
  await esbuild.build({
    entryPoints: ["src/plugin.js"],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "index.js",
    legalComments: "inline",
  });
  await esbuild.build({
    entryPoints: ["src/runtime.js"],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "runtime.cjs",
    legalComments: "inline",
  });
  const app = await esbuild.build({
    entryPoints: ["src/viewer.js"],
    bundle: true,
    platform: "browser",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "inline",
  });
  const bridge = fs.readFileSync("src/host-client.js", "utf8");
  let html = fs
    .readFileSync("src/viewer.html", "utf8")
    .replace("<!--BRIDGE-->", "<script>" + bridge + "</script>")
    .replace("/*APP*/", () =>
      app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
    );
  html = html.replace(/[ \t]+$/gm, "");
  fs.writeFileSync("viewer.html", html);
  for (const [pkg, name] of [
    ["three", "THREE-LICENSE.txt"],
    ["ws", "WS-LICENSE.txt"],
  ])
    fs.copyFileSync(
      path.join("node_modules", pkg, "LICENSE"),
      path.join("assets", name),
    );
  console.log(
    JSON.stringify({
      htmlBytes: Buffer.byteLength(html),
      entryBytes: fs.statSync("index.js").size,
      runtimeBytes: fs.statSync("runtime.cjs").size,
    }),
  );
}
build().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
