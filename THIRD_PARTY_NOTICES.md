# Third-party notices

- Three.js 0.160.1, including OrbitControls, STLLoader and OBJLoader: MIT, Three.js authors. License: `assets/THREE-LICENSE.txt`. Bundled in `viewer.html`.
- ws 8.22.0: MIT, Einar Otto Stangvik and contributors. License: `assets/WS-LICENSE.txt`. Bundled in `runtime.cjs`.
- Aide workbench MessagePort client: MIT, copyright 2026 Skye Lan. Source copied from Aide `internal/server/web/plugin-workbench-client.js` into `src/host-client.js`; covered by the retained MIT license. No host credentials or private plugin sources copied.
- esbuild and Prettier are development-only tools; not shipped as runtime dependencies. Exact versions and transitive dependencies are in `package-lock.json`.

RViz is a separate upstream project. This plugin implements selected ROS display behaviors in a browser; it does not bundle RViz, Qt, OGRE, or native RViz C++ plugins. ROS/rosbridge packages are installed separately in the ROS environment.
