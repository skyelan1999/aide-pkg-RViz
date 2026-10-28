# 0.1.0 本地预览验收

日期：2026-10-28。这是首版预览的实际证据，不代表完整 PRD 已验收，也不代表已发布或已在 9999 安装。

## 通过项

| 检查 | 实际环境 / 结果 |
| --- | --- |
| 构建 | Node.js 24.19.0，固定 npm lock，esbuild 打包；运行包无需 npm 安装 |
| 自动化回归 | 18/18 PASS，无跳过；含 TF 正反变换/插值/循环拒绝、时钟回退、大小端与行填充点云、NaN、地图预算、真实 WebSocket/HTTP、项目身份变化撤销、OpenSSH 隧道 |
| ROS 1 | 官方 `ros:noetic-ros-core` ARM64；rosbridge 0.11.17；真实 rospy publisher → rosbridge → 插件；发现、订阅、360 点 LaserScan、TF 位移 `[1.25, 0, 0.4]`、取消订阅 PASS |
| ROS 2 | 官方 `ros:humble-ros-core` ARM64；rosbridge 2.0.8；真实 rclpy publisher → rosbridge → 插件；同上 PASS |
| SSH + ROS 1/2 | 临时 OpenSSH 服务、临时合成密钥、严格 known_hosts；经真实 SSH 转发到上述两个隔离 ROS 服务，两种模式均 PASS。不是外部机器人硬件验收 |
| 浏览器 | Codex 内置浏览器，实际 3D 画布；真实 Humble LaserScan + TF、合成 LaserScan/PointCloud2/Map/Path/Odometry/Marker、项目 URDF 两个 link、缺失 fixed frame 隐藏数据与错误提示、中英文切换；560/800/1280 宽度观察 |
| 原生插件宿主 | ZIP 解压后用 Aide `plugin_host.js` validate 和 run 实际装配；rviz 插件加载与 rviz_io 可执行注册 PASS。没有以此冒充完整 Aide 安装验收 |
| 包检查 | 9 个白名单文件，无 node_modules、测试密钥、运行缓存、用户项目或私有插件；ZIP 约 176 KiB；SHA256SUMS 位于 dist |
| 依赖 | ws 已固定 8.22.0；`npm audit --omit=dev --audit-level=high` 返回 0 vulnerabilities |

真实 ROS 复现入口：`scripts/ros-publisher.py` 和 `scripts/verify-ros.js`。协议夹具入口：`scripts/preview.js`，其数据和项目源均为合成内容，不能替代真实 ROS 测试。

## 兼容性发现与处理

- ROS 1 的旧 rosbridge 会校验握手 Host 端口。Docker NAT 测试配置了 `websocket_external_port=18502`；SSH 客户端使用远端 bridge 端口作为 Host 头。没有关闭 TLS 校验或 SSH 主机校验。
- ROS 2 测试使用 2.0.8 bridge，显式 QoS 关闭。2.1 QoS 字段的发送由协议夹具验证；没有宣称在所有 ROS 2 bridge 版本上都验证了该能力。
- 初始页面嵌入脚本构建时曾发生字符串替换错误，已改为替换回调并重新核验最终内联脚本可解析及实际页面加载。
- 窄窗隐藏右侧诊断时，画布保留状态文字；跨项目 fixed frame 无法解析时不继续显示错误位置的旧图层。

## 当前限制 / 未验收

- 完整 Aide 插件安装、真实 SSH 项目文件与用户机器人：NOT_RUN。当前浏览器项目源是合成 fixture，宿主来源 API 与装配边界单独验证。
- ROS 2 Jazzy、用户 Windows / Safari、外部机器人硬件、真实网络中断与密钥变更：NOT_RUN。
- `/tf_static` 历史持久化在真实 ROS 的各 QoS 组合上尚未完整验收；当前真实 ROS 数据回归验证的是动态 `/tf`。
- 大点云高帧率、二进制流通道、自动复连、自动 QoS 协商、自动复用宿主 SSH 凭据：尚未实现。
- `.rviz` 导入、Xacro、DAE、纹理、原始 Image、所有 Marker 类型：尚未实现。对应限制见 README。
- 动态图像、Marker 全寿命周期和网格材质没有真实机器人数据验收，不以当前基础夹具代替。
- 当前只提供深色界面。页面关闭尽力关闭连接；宿主先撤销权限时 worker 最长 30 秒空闲过期，尚非宿主级即时 lease。

## 发布与运行状态

仅本地独立插件仓库开发。本轮没有修改 Aide 主程序、没有推送 GitHub、没有创建远端仓库/Release/市场条目，也没有重启或部署 9999。

本地预览服务为 `127.0.0.1:18496`。验收用两个 ROS 容器和临时 SSH 服务在验收后停止；运行镜像保留供复现。原有 Aide / embedding / CAD 容器不清理。
