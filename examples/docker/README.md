# Docker quick start / Docker 入门

This is a synthetic ROS environment for learning the RViz Workbench, not a robot controller. Requires Docker Engine + Compose v2 (Docker Desktop on Windows/macOS). No host ROS, Go, npm or PowerShell is required. First build downloads official ROS images and apt dependencies; allow several GB of disk space. Each running demo is capped at 768 MiB / 1 CPU.

这是用于学习的合成 ROS 环境，不控制机器人。需要 Docker 与 Compose v2；首次构建需要联网。Windows 可使用命令提示符运行以下命令，无需 PowerShell。

## 1. Start / 启动

Extract the plugin ZIP and open a terminal in its root (the folder containing `manifest.json` and `examples`).
解压插件 ZIP，在包含 manifest.json 和 examples 的目录打开终端。

ROS 2 Humble:

```sh
docker compose -f examples/docker/compose.yaml up --build -d ros2-demo
docker compose -f examples/docker/compose.yaml logs -f ros2-demo
```

ROS 1 Noetic:

```sh
docker compose -f examples/docker/compose.yaml up --build -d ros1-demo
docker compose -f examples/docker/compose.yaml logs -f ros1-demo
```

Wait for the rosbridge WebSocket server to start. Ctrl+C exits log following without stopping the container. Noetic is a legacy compatibility fixture, not a recommendation for a new production ROS deployment.
等待日志显示 WebSocket server 已启动；Ctrl+C 只退出日志查看。

## 2. Connect / 连接

Import this ZIP in Aide and open RViz Workbench → How to use → Docker example. Select ROS version and **where the Aide backend runs**:

| Aide backend / 后端位置 | ROS 2 URL | ROS 1 URL |
| --- | --- | --- |
| Windows/macOS Docker Desktop | `ws://host.docker.internal:18501` | `ws://host.docker.internal:18502` |
| Native process / 原生进程 | `ws://127.0.0.1:18501` | `ws://127.0.0.1:18502` |
| Same `aide-rviz-demo` network | `ws://ros2-demo:9090` | `ws://ros1-demo:18502` |

Click Apply parameters, then Connect. Applying parameters does not open a connection. The browser's localhost and the backend's localhost may be different machines/containers.
点“填入参数”后再点“连接”。浏览器和后端的 localhost 不一定相同。共享网络选项只适用于已加入该网络的测试 Aide；不会自动修改现用服务。

Linux Docker users should use a deliberately configured shared network or reachable host address; the Docker Desktop hostname is not universally available there. Loopback ports are intentionally not exposed to the LAN.

## 3. Display / 显示

Set Fixed frame to `map`. Select `/rviz_acceptance/scan` and click **Add**: a ring of 360 laser points should appear. Connecting alone does not add a display.
固定坐标填 map，选择 scan 话题后点“添加”，应出现激光点环。只连接不会自动显示数据。

Other generated topics: `cloud` (800 points), `map` (30×30 cells), `path` (40 poses), `markers` (sphere), plus `/tf`. All are under `/rviz_acceptance/` except TF. Missing/stale TF errors should hide the affected data and show troubleshooting guidance.

## 4. Model and save / 模型与保存

Copy `examples/project/robot.urdf` into your Aide project's root. In Project resources select the authorized workspace, Browse, click `robot.urdf`, then **Load project file**. Two primitive robot links should appear. If the plugin source folder itself is the project root, enter `examples/project/robot.urdf` instead. Paths are always relative to the selected project root.

将示例 URDF 复制到 Aide 项目根目录，浏览选中文件后还需点“加载项目文件”。可显示两个基础几何连杆。不要填本机绝对路径。

Save config creates an Aide approval proposal for `.aide/rviz/session.json`; it does not write before approval. Approve through the real Aide application. This file contains display preferences, not passwords or SSH keys.
保存配置会生成审批提案，审批前不落盘。请在 Aide 主窗口处理。

## 5. Stop / 停止

```sh
docker compose -f examples/docker/compose.yaml stop ros2-demo ros1-demo
```

This stops only this demo's services. It does not delete Aide data or stop 9999. Images remain cached for the next run.
只停止本示例服务，镜像保留以便下次使用。

## If nothing appears / 无画面时

- Connection fails: check logs and the backend address choice; check port conflicts at 18501/18502.
- No topics: confirm the synthetic publisher and rosapi are running, then Refresh.
- Topics but no picture: select one and Add; set frame `map`; read the TF diagnostic.
- Project file denied: select a currently authorized source and a relative path; reopen the workbench after a workspace change.
- SSH: configure keys and known_hosts in the backend first. Choosing an SSH file source does not automatically configure a ROS tunnel.

No real robot, Windows host installation or hardware timing acceptance is implied by this Docker fixture.
