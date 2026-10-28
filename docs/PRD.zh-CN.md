# RViz Workbench 首版需求

日期：2026-10-28。状态：首版预览已实现部分范围；本文是完整目标需求，不能把所有下列目标当作已完成。当前实际能力与未完成项见 README 和 ACCEPTANCE.zh-CN.md。

## 已确认的需求

用户选择 ROS 1 和 ROS 2 同时支持，界面采用 Aide 内网页三维工作台，支持常用 RViz 显示；可关联项目目录，支持 SSH 模式和话题订阅。插件独立分发，不把 ROS、Qt、OGRE 或机器人依赖塞入 Aide 默认发行包。

## 用户使用路径

1. 在当前本地或 SSH 工作空间打开插件，看到当前项目身份和连接状态。
2. 选择 ROS 1 / ROS 2 连接配置，填写 bridge 地址或 SSH 远端回环端口。凭据由宿主保管，不写入项目配置。
3. 主动连接后列出话题与类型，选择 fixed frame、添加显示层；未连接时仍可查看项目模型和已有配置。
4. 选择项目 URDF，按项目 package 映射解析网格和纹理；Xacro 执行作为需审批的代码执行操作。
5. 启停各层订阅，查看 TF、消息频率、延迟、丢帧与错误；切换项目立即撤销原项目通道。
6. 将显示配置经宿主写入审批保存到项目 `.aide/rviz/session.json`；重新打开恢复配置，但不自动开始联网。

## 首版显示范围

| 显示 | 输入 | 验收重点 |
| --- | --- | --- |
| Grid / Axes | 本地配置 | 单位、主题、相机 |
| TF | /tf、/tf_static | fixed frame、时间、缺失/循环变换 |
| RobotModel | 项目 URDF、TF | package://、网格/材质、关节姿态 |
| LaserScan | sensor_msgs/LaserScan | 角度、无效距离、坐标变换 |
| PointCloud2 | sensor_msgs/PointCloud2 | 二进制布局、endianness、row/point step、NaN |
| Map | nav_msgs/OccupancyGrid | origin 姿态、未知格、分辨率 |
| Path / Odometry | nav_msgs/Path、Odometry | frame、轨迹上限 |
| Marker / MarkerArray | visualization_msgs | namespace/id、更新/删除、lifetime；不支持类型明确提示 |
| Image | sensor_msgs/Image、CompressedImage | 支持编码白名单，尺寸与解码预算 |

ROS 2 类型名如 `sensor_msgs/msg/LaserScan` 在适配层归一化，保留原始类型供诊断。首版不做机器人控制、导航目标发布、任意服务调用或用户 C++ 插件加载。话题发现所需的 rosapi 查询仅允许只读方法白名单。

## 项目、连接与兼容

- 项目配置只保存相对资源路径、显示参数、话题与 QoS 偏好；不保存密码、私钥或令牌。SSH 项目依赖当前宿主项目连接。
- 本地模式的 localhost 指 Aide 后端所在网络命名空间，不默认等同于用户 Windows/macOS 主机；界面显示实际连接端。
- SSH 模式的 rosbridge 绑定远端 127.0.0.1，经宿主 SSH 隧道访问，不要求暴露公网 ROS 端口。
- ROS 1 计划以 Noetic 做独立测试基线；ROS 2 计划以 Humble / Jazzy 做基线，结果按组合记录，不将未测试发行版标为支持。
- ROS 2 QoS 需按 bridge 实际能力探测或明确配置；旧 bridge 不支持时提示，不静默假装生效。共享订阅的 QoS 冲突需要可见诊断。
- `.rviz` 文件仅导入已支持显示、相机和 fixed frame；逐项报告不支持配置，不覆盖原文件。

## 验收门槛

1. ROS 1、ROS 2 真实 publisher → bridge → 宿主 → iframe → 画面逐项验收，截图和消息样本共同留证；不能只用模拟消息判定完成。
2. 两个并行项目使用同名话题和不同 TF，切换/重连/重启后不串数据、不复用错误身份。
3. SSH 实测含正常连接、失联重连、密钥错误、主机密钥变化、项目切换；不得通过关闭主机校验解决错误。
4. TF 缺失、过期、模拟时钟回退时停止错误姿态显示并给出诊断；无时钟时给出明确的最新值模式。
5. 点云验收含大小端、非连续行、NaN、超大帧，验证界面仍可操作、内存有界、关闭层释放资源。
6. URDF 包映射、路径穿越、外部网格URL、Xacro 执行边界及取消写入审批需覆盖。
7. Windows / macOS 浏览器至少各一次，适配中文/英文、深浅主题与窄窗。SSH / ROS 运行环境与浏览器平台分别记录。
8. 禁用或卸载插件释放订阅和隧道；打包后不包含凭据、真实机器人数据或私有插件代码。

建议初始预算（需实测调优）：单帧最多 8 MiB，单通道待处理最新帧队列最多 2 帧，点云默认 10 Hz、显示上限 200k 点，单工作台总缓存 64 MiB。超限明确计数与提示，不能把抽稀后数据当完整数据导出。

## 实施顺序与发布门槛

A. 先做宿主流通道/SSH 租约及 ROS 连接诊断；B. Grid、TF、RobotModel、LaserScan；C. PointCloud2、Map、Path、Odometry、Markers、Image；D. 项目配置与 .rviz 部分导入；E. 双 ROS / SSH / 浏览器回归后独立打包。

最初方案阶段仅本地开发。2026-10-28 用户已授权推送与发布，公开仓库定为 skyelan1999/aide-pkg-RViz，MIT，v0.1.0 预发布；市场登记仍是独立步骤，本次不部署 9999。没有远端机器人时只能报告测试 ROS 环境通过，不能宣称用户真实设备验收。
