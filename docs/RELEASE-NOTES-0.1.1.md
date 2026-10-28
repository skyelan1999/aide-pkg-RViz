# RViz Workbench v0.1.1 — Guided Preview

This preview makes the first run easier and fixes two failures found through the actual Aide host APIs.

- Chinese/English getting-started panel and usage guides for connections, topic displays, project models and backend SSH setup.
- Docker quick start included in the ZIP: official ROS 1 Noetic / ROS 2 Humble images, rosbridge/rosapi, five synthetic topics and a sample URDF. Choose the Aide backend location to get the correct connection URL. Apply parameters does not connect automatically.
- Actionable connection and TF error guidance, plus a reminder to add a display after connecting.
- Fix project browsing by avoiding Aide's reserved source argument; resolve staged relative paths within the authorized snapshot root.
- Save configuration through a dedicated write-proposal tool with a fixed project resource declaration. Aide approval remains required; no direct writes. Fixes #2 and #3.

本版新增“怎么连接、怎么显示话题、怎么加载模型、SSH 怎么配置”等中英文引导，并附带可直接运行的 Docker 示例。修复通过真实 Aide 宿主发现的项目读取和配置保存问题。

Validation: 23 local tests passed with no skips, including isolated OpenSSH forwarding. Actual ROS 1/2 publishers and rosbridge were tested through native Aide APIs over both a shared Docker network and Docker Desktop host addresses. Five display types, authorized project URDF reads, pending save proposals and absence of writes before approval passed. Browser checks covered the guides, real ROS displays, URDF, TF troubleshooting, English and a narrow window. See [acceptance details](ACCEPTANCE-0.1.1.zh-CN.md).

This remains a read-only web preview, not full Qt RViz. External robot hardware, Windows host installation, Safari full-app acceptance and production timing are not verified. No robot commands, native C++ displays, complete .rviz import, automatic Xacro execution or inherited Aide SSH credentials. ROS is downloaded only when the user explicitly builds the optional Docker example; it is not bundled into the installed plugin.

Install the ZIP through Aide's plugin UI, then open **How to use / 使用指南**. For a first real-data run, extract the same ZIP and follow `examples/docker/README.md`. Requires compatible source/workbench host APIs, backend Node.js 18+ and browser WebGL. Release assets include ZIP, SHA256SUMS and a source/package proof. This release does not deploy or change Aide/9999.
