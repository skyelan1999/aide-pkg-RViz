# RViz Workbench · Aide plugin

A browser-native, read-only ROS 1 / ROS 2 visualization workbench. **0.1.1 is a guided preview**, not a complete RViz port.

[Source repository](https://github.com/skyelan1999/aide-pkg-RViz) · [Preview release](https://github.com/skyelan1999/aide-pkg-RViz/releases/tag/v0.1.1) · [Release notes](docs/RELEASE-NOTES-0.1.1.md)

## Included

- In-page Chinese/English getting-started guides, Docker connection recipes, section help and actionable connection/TF troubleshooting.

- ROS bridge topic discovery and subscriptions; explicitly connect/disconnect.
- Grid, axes, TF diagnostics, LaserScan, PointCloud2, OccupancyGrid, Path, Odometry, common Marker / MarkerArray primitives, and JPEG/PNG CompressedImage previews.
- Project URDF primitives and STL/OBJ meshes. Relative and `package://` resources go through Aide's current authorized source API, including SSH-backed sources when the host provides them.
- SSH local forwarding using a preconfigured OpenSSH alias in the **Aide backend environment**. Private keys and passwords never enter the page or project display configuration.
- Save a credential-free display configuration through Aide's file-write proposal flow, then reload it from the project.
- Chinese/English UI and bounded previews: 3,000 cloud/scan points and 16,384 map cells per layer, at most 24 subscriptions including internal TF/clock subscriptions. Preview sampling is indicated.

## Install and connect

Download the plugin ZIP from the preview release (or build it locally), verify `SHA256SUMS`, then import it through Aide's plugin installation UI and open its workbench. For a reproducible first run, follow [Docker quick start / Docker 入门](examples/docker/README.md) or open **How to use** in the workbench. Isolated Docker/native-host acceptance is recorded in `docs/ACCEPTANCE-0.1.1.zh-CN.md`; a real user robot remains untested. Requires Node.js 18+ in the backend and an Aide host with the source and workbench protocols used by this plugin.

1. Start rosbridge and rosapi in your ROS environment. Install the message definitions needed by your topics, including `tf2_msgs` for TF.
2. Choose ROS 1 or ROS 2 and enter the `ws://` / `wss://` bridge URL reachable from the **Aide backend**, not necessarily from the browser's computer. URL user-info credentials are rejected; authenticated rosbridge sessions are not implemented in this preview.
3. Leave explicit QoS unchecked for older bridges. Enable it only after confirming your bridge implements the 2.1 QoS contract. This preview does not negotiate it automatically.
4. Connect, choose a supported topic, add the display and set the fixed frame. Missing, stale or unbracketed TF is reported rather than plotting in the wrong frame.
5. For a project model, choose the authorized project source and URDF path. An example package map is `{"my_robot":"src/my_robot"}`. Xacro is not executed automatically.

### SSH

Configure a key-authenticated OpenSSH alias and `known_hosts` in the backend first, then choose SSH and enter that alias and the remote bridge port. The remote target is **127.0.0.1** and the WebSocket path is `/`. Strict host-key checking is enabled. No PowerShell is used.

A custom SSH config path can be set in the plugin's host settings as `sshConfigFile`; it is not accepted from a workbench tool argument. The first preview does **not** automatically reuse Aide's currently selected SSH workspace credentials or ControlMaster. Project file access and ROS transport are separate scopes: selecting an SSH file source does not silently open a ROS connection.

For old ROS 1 rosbridge servers behind a NAT port mapping, configure their `websocket_external_port` to match the public forwarded port. For SSH, the client supplies the remote bridge port in its Host header. Use WSS for direct connections crossing untrusted networks, or SSH with a loopback-bound remote bridge.

## Current boundaries

- Read-only visualization. No robot commands, navigation goals, arbitrary service calls or C++ display plugins.
- Bounded tool polling, approximately 2 polls/s, not a high-rate binary transport. Clouds are sampled and cannot be used as full-fidelity exports.
- `.rviz` import, Xacro execution, DAE meshes, external textures, raw `sensor_msgs/Image`, full Marker semantics, automatic reconnection and automatic QoS negotiation are not implemented.
- TF interpolates bracketed samples, rejects conflicting/cyclic frame graphs, and clears dynamic transforms on simulated-clock rewind. Advanced ROS time synchronization remains outside this preview.
- Closing the page normally asks the worker to stop. If the host revokes a scope before the close call can execute, the isolated connection worker expires after at most 30 seconds without polling. Uninstall does not yet provide an immediate host-level socket lease.
- The preview currently uses a dark theme. Windows/macOS user installation and real robot hardware acceptance are pending.

## Development

```sh
npm ci --ignore-scripts
npm run build
npm test
python3 scripts/package.py
node scripts/preview.js
```

The preview server binds only `127.0.0.1:18496`. Its project source is synthetic; it never reads real user workspaces and does not touch 9999. Its WebSocket fixture is `/ros`; do not count it as real ROS acceptance.

Real ROS acceptance uses `scripts/ros-publisher.py` in an isolated ROS environment and `node scripts/verify-ros.js 1|2 ws://endpoint`. Set `RVIZ_SSH_TEST_CONFIG` only for an isolated SSH fixture using the `rviz-fixture` alias. The standalone SSH test is skipped when that fixture is not supplied.

Architecture, requirements and acceptance notes stay in this plugin repository. Marketplace registration is separate from the GitHub preview release. Publishing this plugin does not modify or deploy the Aide main application or the local 9999 service.

The real-host acceptance harness is `node scripts/native-acceptance.cjs --serve`; it refuses containers without the dedicated acceptance label and uses only the isolated `aide-rviz-guide-host` fixture. It is a test parent over real Aide APIs, not a substitute for full application-shell acceptance. `--ros1` and `--desktop` select additional actual ROS paths.
