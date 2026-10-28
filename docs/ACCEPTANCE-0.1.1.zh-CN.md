# 0.1.1 本地引导版验收（2026-10-28）

状态：本地开发预览，尚未推送、发布或更新市场。公开市场仍是 0.1.0。本次不改 Aide 主程序、9999 或真实项目数据。

## 实际环境

- macOS ARM64 Docker Desktop；官方 `ros:humble-ros-core` / `ros:noetic-ros-core` 构建示例。
- 实际 ROS 发布节点 + rosbridge/rosapi，不是 JavaScript 伪协议服务。
- 独立 Aide 容器 `aide-rviz-guide-host`，标签 `aide.rviz.acceptance=true`，镜像 `aide:offline-c56effd3445a`，实际 buildVersion=dev / buildCommit=unknown。因此不把它称为已识别 RC12 二进制。
- 仅合成项目 `robot.urdf`、独立数据卷、独立认证与证书。HTTPS 上游证书固定验证，未绕过浏览器证书警告。
- 浏览器验收使用测试父页面承载真实 Aide workbench HTML，MessagePort 请求转发到真实安装、来源、调度和提案 API。它不是完整 Aide 设置/安装 UI 验收。

## 已执行通过

1. `RVIZ_SSH_TEST_CONFIG=<合成 SSH 配置> npm test`：23 通过，0 跳过，0 失败；含真实 OpenSSH 转发测试。
2. `node scripts/verify-ros.js 1 ws://127.0.0.1:18502`、ROS 2 对应 18501：订阅、360 激光点、TF 位移 [1.25,0,0.4]、取消订阅与断开通过。
3. `node scripts/native-acceptance.cjs`，以及 `--ros1`、`--desktop`、`--ros1 --desktop`：通过真实 Aide API 安装/升级 ZIP；读取项目 URDF；ROS 1/2 分别经共享 Docker 网络和 Docker Desktop 主机地址发现、订阅 scan/cloud/map/path/markers 五类话题，数据非空、坐标无错误；配置返回 proposal_pending，审批前文件不存在。
4. 浏览器逐步操作：初始快速开始、Docker 指南、选择后端位置、填参数但不自动连接、连接后提醒添加话题、添加五类显示、加载两连杆 URDF、真实审批提示均通过。故意设不存在的 Fixed frame 后隐藏受影响数据并提示 TF 排查；恢复 map 后恢复画面。
5. 中英文指南、900×700 窄窗口、Escape 关闭对话框通过；浏览器未报告警告或错误。新建显示时可能短暂等待可插值 TF 样本，随后自动恢复，不使用错误坐标兜底。
6. 最终包只按显式清单打包，不含 node_modules、测试密钥、token、.agent-state 或用户数据。Docker 示例随 ZIP 附带，安装插件本身不会启动或下载 ROS。

## 实际发现并修复

- `rviz_io` 的只读调度声明不允许返回写入提案。改为独立 `rviz_save_config`，声明固定 workspace/.aide/rviz/session.json 写入资源，仍需原生审批，不直接落盘。公开追踪 issue #2。
- `source` 是 Aide 保留的工具参数；项目来源改为 fileSource 并经 api.sources 授权。
- Aide stage 返回绝对 workspace + 相对 path；现在组合并 realpath 校验在授权快照根内，再读取文件。公开追踪 issue #3。
- Docker ROS setup.bash 在 set -u 下引用未设置变量；只在加载 ROS 环境时暂时关闭 nounset。

## 仍未验证 / 边界

- 无真实机器人、外部用户 ROS 项目、Windows 主机安装或 Safari 端完整应用验收。
- ROS 1 Noetic 仅为旧版本兼容测试环境。并非新的生产部署建议。
- ROS2 显式 QoS 2.1、硬件高频时序、所有 RViz C++ 显示插件均不在本轮已验收范围。
- SSH 测试为合成 SSH/rosbridge 转发；没有使用用户机器人 SSH 凭据。
- 提案已确认创建且审批前不写；本轮没有自动批准或声称完成用户审批。

## 重现入口

用户步骤见 `examples/docker/README.md`，页面内“使用指南”含相同入口。开发用真实宿主验收脚本只允许带专属标签的隔离容器，不允许指向 9999。

验收结束停止本轮创建的示例、测试 Aide 和 SSH 进程，保留镜像缓存及合成证据供复核，不清理其他容器或用户数据。
