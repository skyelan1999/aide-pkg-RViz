"use strict";
const pick = (lang, zh, en) => (lang === "zh" ? zh : en);
function connectionRecipe(ros, location) {
  if (![1, 2].includes(Number(ros))) throw Error("Choose ROS 1 or ROS 2");
  if (!["desktop", "native", "network"].includes(location))
    throw Error("Choose a runtime location");
  const service = Number(ros) === 2 ? "ros2-demo" : "ros1-demo";
  const port = Number(ros) === 2 ? 18501 : 18502;
  const host =
    location === "desktop"
      ? "host.docker.internal"
      : location === "native"
        ? "127.0.0.1"
        : service;
  return {
    ros: Number(ros),
    endpoint: `ws://${host}:${location === "network" && Number(ros) === 2 ? 9090 : port}`,
    fixed: "map",
    topic: "/rviz_acceptance/scan",
    service,
    command: `docker compose -f examples/docker/compose.yaml up --build -d ${service}`,
    logs: `docker compose -f examples/docker/compose.yaml logs -f ${service}`,
  };
}
function helpForError(error, lang) {
  const text = String(error || "");
  if (/Missing or stale TF|Cyclic TF|Conflicting.*TF/i.test(text))
    return {
      section: "topics",
      text: pick(
        lang,
        "话题已收到，但坐标无法对齐。先把 Fixed frame 改为消息的 frame_id，或检查 /tf、/tf_static 和 ROS 时钟；不要用另一个项目的坐标系。",
        "Messages arrived, but their frame cannot be resolved. Use the message frame_id as Fixed frame, or check /tf, /tf_static and the ROS clock. Do not use another project's frame.",
      ),
    };
  if (/SSH|alias|known_hosts/i.test(text))
    return {
      section: "ssh",
      text: pick(
        lang,
        "SSH 配置必须存在于 Aide 后端。先在同一后端用 ssh alias 验证密钥登录和 known_hosts；桌面上的 SSH 配置不会自动进入 Docker。",
        "SSH configuration must exist in the Aide backend. Verify key login and known_hosts there with ssh alias. Your desktop SSH configuration is not automatically copied into Docker.",
      ),
    };
  if (/bridge|ECONNREFUSED|ENOTFOUND|Invalid URL|endpoint/i.test(text))
    return {
      section: "connect",
      text: pick(
        lang,
        "先确认 ROS 端 rosbridge/rosapi 已启动，再检查地址与端口。Aide 在 Docker 时，127.0.0.1 指 Aide 容器；同机 Docker Desktop 通常应使用 host.docker.internal。",
        "Confirm rosbridge/rosapi are running, then check the address and port. In Docker, 127.0.0.1 means the Aide container; Docker Desktop usually needs host.docker.internal for a host service.",
      ),
    };
  if (/scope|Project.*changed|Session|ENOENT.*json/i.test(text))
    return {
      section: "connect",
      text: pick(
        lang,
        "连接会话已失效或项目发生变化。请重新连接当前项目，不要继续复用旧项目会话。",
        "The connection expired or the project changed. Reconnect for the current project instead of reusing an old session.",
      ),
    };
  if (/budget|limit|exceeds/i.test(text))
    return {
      section: "topics",
      text: pick(
        lang,
        "数据超过预览预算。减少图层、降低 ROS 端发布频率或点数，再重新订阅；本工具不是全量点云导出器。",
        "The preview budget was exceeded. Remove layers or reduce publisher frequency/point count, then resubscribe. This is not a full-fidelity cloud exporter.",
      ),
    };
  if (/source API|Host bridge|Tool not declared/i.test(text))
    return {
      section: "models",
      text: pick(
        lang,
        "请从 Aide 的插件工作台打开，并使用带 source/workbench 接口的 RC12 或更新宿主；不能直接双击 viewer.html。",
        "Open this through Aide's plugin workbench on an RC12-or-newer compatible host. Do not open viewer.html directly.",
      ),
    };
  if (/URDF|package map|mesh|project path|ENOENT/i.test(text))
    return {
      section: "models",
      text: pick(
        lang,
        "先选择正确的项目来源，再填写相对路径。package 映射指向项目内包根目录；目前支持 URDF、STL/OBJ，不直接执行 Xacro。",
        "Choose the project source and a relative path. Package mappings point to package roots inside that project. This preview supports URDF with STL/OBJ and does not execute Xacro.",
      ),
    };
  return {
    section: "connect",
    text: pick(
      lang,
      "打开使用指南，按“准备 ROS → 连接 → 添加话题”逐步检查。",
      "Open the guide and check Prepare ROS → Connect → Add a topic.",
    ),
  };
}
function guideContent(section, lang, recipe) {
  const t = (zh, en) => pick(lang, zh, en);
  const content = {
    start: [
      t("先选一种体验方式", "Choose how to start"),
      t(
        "没有 ROS 或机器人：先点“离线演示”，只看几何示例，不会连接网络。",
        "No ROS or robot: use Offline demo for synthetic geometry without a network connection.",
      ),
      t(
        "想看真实 ROS 数据：使用随 ZIP 附带的 Docker 示例，启动 ROS + rosbridge + 合成发布节点。",
        "For real ROS messages, start the Docker example included in the ZIP: ROS + rosbridge + a synthetic publisher.",
      ),
      t(
        "已有机器人：先在 ROS 电脑启动 rosbridge/rosapi，再选择局域网地址或已配置的后端 SSH alias。",
        "For your robot, start rosbridge/rosapi on its ROS computer, then use a reachable LAN address or configured backend SSH alias.",
      ),
      t(
        "连接只是建立通道。选择话题并点“添加”后，画布才会显示数据；加载 URDF 是可选的下一步。",
        "Connecting only opens the channel. Select a topic and click Add to display it. Loading a URDF is an optional next step.",
      ),
    ],
    docker: [
      t(
        "用 Docker 跑通第一幅真实 ROS 画面",
        "Your first real ROS view with Docker",
      ),
      t(
        "先解压本地引导版插件 ZIP，在含 examples/docker 的目录打开终端。只需 Docker，不需要本机安装 ROS、Go 或 npm。",
        "Extract the guided-preview plugin ZIP and open a terminal in the folder containing examples/docker. Only Docker is needed; no host ROS, Go or npm installation.",
      ),
      t(
        "首次构建会联网下载官方 ROS 镜像和 rosbridge 依赖。服务只映射本机回环端口，不连接真实机器人，也不修改现有 Aide。",
        "The first build downloads official ROS images and rosbridge packages. Demo ports bind to host loopback only; no real robot or existing Aide service is modified.",
      ),
      t(
        "在下面选择 Aide 实际运行的位置，复制启动命令。日志就绪后点“填入参数”，关闭指南，再点“连接”。",
        "Select where Aide actually runs, copy the command, and wait for the bridge-ready log. Apply parameters, close the guide, then click Connect.",
      ),
      t(
        `成功后选择 ${recipe.topic}，点击“添加”。Fixed frame 用 map；应出现一圈激光点。`,
        `Then select ${recipe.topic} and click Add. Use map as Fixed frame; a ring of laser points should appear.`,
      ),
    ],
    connect: [
      t("地址该怎么填？", "Which address should I use?"),
      t(
        "这里填的是 Aide 后端能访问的 ROS bridge 地址，不是浏览器当前页面地址，也不是 ROS master 地址。",
        "Use a ROS bridge address reachable from the Aide backend, not the browser page URL or ROS master URL.",
      ),
      t(
        "Windows/macOS Docker Desktop，同机 Docker 示例：通常用 ws://host.docker.internal:18501。",
        "Windows/macOS Docker Desktop with the local demo: usually ws://host.docker.internal:18501.",
      ),
      t(
        "Aide 原生跑在本机：同机示例用 ws://127.0.0.1:18501。Aide 和 ROS 在同一 Docker 网络：用服务名 ros2-demo:9090。Linux Docker 优先采用同一 Docker 网络。",
        "Native Aide on the host: ws://127.0.0.1:18501. Same Docker network: ros2-demo:9090. Prefer a shared Docker network on Linux.",
      ),
      t(
        "真实机器人：用它的可达 IP 与 bridge 端口，例如 ws://机器人IP:9090。不要直接把示例地址当作机器人地址。跨不可信网络应使用 WSS 或 SSH。",
        "For a robot, use its reachable IP and bridge port, e.g. ws://ROBOT_IP:9090. Demo addresses are not robot addresses. Use WSS or SSH over untrusted networks.",
      ),
      t(
        "连接成功后还要添加话题。如果列表为空，检查 rosapi 和发布节点，再点击“刷新话题”。旧 bridge 的显式 QoS 先保持关闭。",
        "After connecting, add a topic. If the list is empty, check rosapi and publishers, then Refresh. Leave explicit QoS off on older bridges.",
      ),
    ],
    topics: [
      t("为什么连上了还是空白？", "Connected, but the view is empty?"),
      t(
        "1. 选择有发布者的话题并点击“添加”；列表只显示本预览支持的消息类型。示例先选 /rviz_acceptance/scan。",
        "1. Select a published topic and click Add. The list contains only supported message types. Start with /rviz_acceptance/scan in the demo.",
      ),
      t(
        "2. Fixed frame 是所有数据汇总到的坐标系。示例填 map；自己的数据可先填消息 header.frame_id，之后再检查 TF 链。",
        "2. Fixed frame is the common coordinate system. Use map for the demo. For your data, try its header.frame_id first, then check the TF chain.",
      ),
      t(
        "3. 点云无效值、坐标缺失、消息过期和超出预算会显示错误；不要只看“已连接”状态。",
        "3. Invalid clouds, missing transforms, stale messages and budget limits have separate errors. Connected does not mean a display is receiving valid data.",
      ),
      t(
        "4. 旋转：左键拖动；缩放：滚轮；平移：右键拖动；视角乱了点“重置视角”。删除图层用 ×。",
        "4. Left-drag to orbit, wheel to zoom, right-drag to pan. Reset camera restores the view; × removes a layer.",
      ),
    ],
    models: [
      t(
        "URDF 和 package 映射怎么用？",
        "How do URDF and package mappings work?",
      ),
      t(
        "1. 项目来源由 Aide 授权；本机路径和 SSH 项目路径是不同来源。先选对来源并点“浏览”。",
        "1. Aide authorizes project sources. Host paths and SSH project paths are different sources. Choose one and Browse.",
      ),
      t(
        "2. 把示例 robot.urdf 复制到你的项目根目录后，填 robot.urdf；若项目本身就是本插件源码目录，填 examples/project/robot.urdf。路径相对所选项目根目录，不是本机绝对路径。",
        "2. Copy the sample robot.urdf into your project root and enter robot.urdf. If the plugin source folder is your project, use examples/project/robot.urdf. Paths are relative to the selected project root.",
      ),
      t(
        '3. 如果 URDF 写 package://my_robot/meshes/body.stl，且包位于 src/my_robot，填 {"my_robot":"src/my_robot"}。不使用 package:// 时保持 {}。',
        '3. For package://my_robot/meshes/body.stl with a package at src/my_robot, enter {"my_robot":"src/my_robot"}. Keep {} if no package:// paths are used.',
      ),
      t(
        "4. 支持基础几何、STL/OBJ；Xacro、DAE、纹理和完整 .rviz 导入尚未支持。实时关节姿态需要与 link 名称一致的 TF。",
        "4. Supports primitives and STL/OBJ. Xacro, DAE, textures and complete .rviz import are not supported. Live link poses require matching TF frame names.",
      ),
      t(
        "“保存配置”会生成待审批的文件提案，不会直接覆盖项目。重新载入保存的 session.json 后，仍需明确建立连接。",
        "Save config creates a file proposal requiring approval. It does not silently overwrite the project. Loading session.json still requires an explicit connection.",
      ),
    ],
    ssh: [
      t("SSH 要在哪配置？", "Where do I configure SSH?"),
      t(
        "SSH 是 Aide 后端发起的。Aide 在 Docker 内时，后端必须能看到 SSH config、密钥和 known_hosts；Windows/macOS 桌面的配置不会自动继承。",
        "SSH starts in the Aide backend. In Docker, that backend must have the config, keys and known_hosts; desktop configuration is not inherited.",
      ),
      t(
        "先在同一后端验证 ssh robot-lab 能密钥登录。插件填 alias robot-lab 和远端回环 bridge 端口，通常是 9090。",
        "Verify ssh robot-lab with key authentication in that backend. Enter robot-lab as the alias and the remote loopback bridge port, usually 9090.",
      ),
      t(
        "使用自定义 config 时，在 Aide 插件设置中填写 sshConfigFile，指向后端可读的配置文件。不要把密码或私钥粘到聊天、连接地址或项目配置中。",
        "For a custom config, set sshConfigFile in the Aide plugin settings to a backend-readable path. Do not paste passwords or private keys into chat, URLs or project settings.",
      ),
      t(
        "远端 rosbridge 可只监听 127.0.0.1；插件建立加密转发。主机密钥不匹配时先核实服务器，不应关闭校验。",
        "The remote bridge may bind only to 127.0.0.1; the plugin opens an encrypted tunnel. Verify host-key changes instead of disabling verification.",
      ),
    ],
  };
  return content[section] || content.start;
}
function mountGuide({
  document: doc,
  language,
  onDemo,
  onApply,
  onFirstTopic,
}) {
  let lang = language,
    section = "start",
    state = { connected: false, topics: [], layers: 0 },
    dismissed = false;
  const $ = (id) => doc.getElementById(id),
    el = (tag, text) => {
      const e = doc.createElement(tag);
      if (text) e.textContent = text;
      return e;
    };
  const t = (zh, en) => pick(lang, zh, en);
  const names = {
    start: ["从这里开始", "Start here"],
    docker: ["Docker 示例", "Docker example"],
    connect: ["如何连接", "Connection"],
    topics: ["如何显示话题", "Display topics"],
    models: ["如何加载模型", "Load a model"],
    ssh: ["SSH 配置", "SSH setup"],
  };
  function render() {
    const ros = Number($("guideRos").value),
      recipe = connectionRecipe(ros, $("guideWhere").value),
      body = $("guideBody");
    body.replaceChildren();
    for (const [i, text] of guideContent(section, lang, recipe).entries())
      body.append(el(i === 0 ? "h2" : "p", text));
    for (const button of doc.querySelectorAll("[data-guide]")) {
      const label = names[button.dataset.guide];
      if (label)
        button.setAttribute(
          "aria-label",
          button.id === "guideOpen"
            ? t("使用指南", "How to use")
            : t(label[0] + "指南", label[1] + " help"),
        );
    }
    $("guideTitle").textContent = t("使用指南", "How to use");
    $("guideClose").textContent = t("关闭指南", "Close guide");
    $("guideSettings").hidden = section !== "docker" && section !== "connect";
    $("guideRosLabel").textContent = t("示例 ROS 版本", "Demo ROS version");
    $("guideWhereLabel").textContent = t(
      "Aide 实际运行在哪里？",
      "Where does Aide run?",
    );
    const opts = $("guideWhere").options;
    opts[0].text = t(
      "Windows/macOS Docker Desktop",
      "Windows/macOS Docker Desktop",
    );
    opts[1].text = t(
      "原生 Aide（不在 Docker 内）",
      "Native Aide (outside Docker)",
    );
    opts[2].text = t(
      "与 ROS 共用 Docker 网络",
      "Shared Docker network with ROS",
    );
    if (section === "docker") {
      for (const command of [recipe.command, recipe.logs]) {
        const row = el("div");
        row.className = "command";
        const code = el("textarea");
        code.readOnly = true;
        code.value = command;
        code.setAttribute(
          "aria-label",
          t("可复制的 Docker 命令", "Copyable Docker command"),
        );
        const copy = el("button", t("复制命令", "Copy command"));
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(command);
            copy.textContent = t("已复制", "Copied");
          } catch (_) {
            code.focus();
            code.select();
            const ok = doc.execCommand?.("copy");
            copy.textContent = ok
              ? t("已复制", "Copied")
              : t("已选中，请 Ctrl/Cmd+C", "Selected: press Ctrl/Cmd+C");
          }
        };
        row.append(code, copy);
        body.append(row);
      }
      body.append(
        el(
          "p",
          t(
            "共享网络模式需把测试 Aide 加入 aide-rviz-demo 网络；这个示例不会自动改变你的现用 Aide。",
            "Shared-network mode requires your test Aide to join aide-rviz-demo. The example never changes your existing Aide automatically.",
          ),
        ),
      );
    }
    if (section === "docker" || section === "connect") {
      body.append(
        el(
          "p",
          t("此示例应填：", "Use for this demo: ") +
            recipe.endpoint +
            " · Fixed frame: map",
        ),
      );
      const apply = el(
        "button",
        t(
          "填入示例连接参数（不自动连接）",
          "Apply demo parameters (does not connect)",
        ),
      );
      apply.id = "applyRecipe";
      apply.onclick = () => {
        if (onApply(recipe) !== false) $("guideDialog").close();
      };
      body.append(apply);
    }
    const nav = $("guideNav");
    nav.replaceChildren();
    for (const [key, value] of Object.entries(names)) {
      const b = el("button", value[lang === "zh" ? 0 : 1]);
      b.setAttribute("aria-pressed", String(key === section));
      b.onclick = () => open(key);
      nav.append(b);
    }
    update(state);
  }
  function open(key = "start") {
    section = key;
    if (!$("guideDialog").open) $("guideRos").value = $("ros").value;
    render();
    if (!$("guideDialog").open) $("guideDialog").showModal();
  }
  function update(next) {
    state = next;
    const welcome = $("welcome");
    welcome.hidden = dismissed || state.layers > 0;
    const body = $("welcomeBody");
    body.replaceChildren();
    if (welcome.hidden) return;
    body.append(
      el(
        "h2",
        state.connected
          ? t("已连接，接下来添加话题", "Connected. Now add a display.")
          : t("不知道从哪开始？", "Not sure where to start?"),
      ),
    );
    body.append(
      el(
        "p",
        state.connected
          ? state.topics.length
            ? t(
                "连接不等于显示数据。选择一个话题，点“添加”才会出画面。",
                "A connection alone does not display data. Select a topic and click Add.",
              )
            : t(
                "还没有可显示的话题。检查 rosapi 和发布节点，再刷新话题列表。",
                "No supported topics yet. Check rosapi and publishers, then refresh.",
              )
          : t(
              "先看演示，或用 Docker 跑通真实 ROS 数据，再连接自己的机器人。",
              "Try the demo or real ROS messages in Docker before connecting your robot.",
            ),
      ),
    );
    const actions = el("div");
    actions.className = "welcome-actions";
    const button = (text, fn, id) => {
      const b = el("button", text);
      if (id) b.id = id;
      b.onclick = fn;
      actions.append(b);
    };
    if (state.connected && state.topics.length)
      button(
        t("显示第一个话题", "Show first topic"),
        onFirstTopic,
        "firstTopic",
      );
    if (!state.connected)
      button(
        t("离线演示，不需 ROS", "Offline demo, no ROS"),
        () => {
          dismissed = true;
          onDemo();
          update(state);
        },
        "welcomeDemo",
      );
    button(t("Docker 入门示例", "Docker quick start"), () => open("docker"));
    button(t("已有机器人，如何连接？", "Connect my robot"), () =>
      open("connect"),
    );
    button(t("暂时收起", "Dismiss"), () => {
      dismissed = true;
      update(state);
    });
    body.append(actions);
  }
  for (const button of doc.querySelectorAll("[data-guide]"))
    button.onclick = () => open(button.dataset.guide);
  $("guideClose").onclick = () => $("guideDialog").close();
  $("guideRos").onchange = render;
  $("guideWhere").onchange = render;
  render();
  return {
    open,
    update,
    setLanguage(value) {
      lang = value;
      render();
    },
    showError(error) {
      const advice = helpForError(error, lang);
      $("advice").hidden = false;
      $("adviceText").textContent = advice.text;
      $("adviceHelp").textContent = t("查看处理步骤", "Troubleshooting steps");
      $("adviceHelp").onclick = () => open(advice.section);
    },
    clearError() {
      $("advice").hidden = true;
    },
  };
}
module.exports = { connectionRecipe, helpForError, guideContent, mountGuide };
