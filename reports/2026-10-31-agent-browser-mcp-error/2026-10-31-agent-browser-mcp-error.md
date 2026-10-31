# 2026-10-31 agent-browser MCP 故障调研报告

> 文档类型：调研报告（RCA）
> 调研对象：`mcp__agent-browser__*` MCP 工具族在本会话内全线 30 秒超时的故障
> 调研方式：活体探针 + 进程/端口取证 + 运行时目录考古 + 包源码静态分析（上游 v0.35.2 tag）+ 上游已知问题核对 + 技能文件逐字审计
> 结论置信度标注：✅ 已实测确认 / 🔶 高置信推断（多证据互证）/ ⬜ 未确认（注明缺口）

---

## 1. 结论速览

1. **agent-browser 不垃圾**——故障是分层的：浏览器与 CDP 层全程健康（本会话用自起 Chrome + CDP 直连完成了全部验收工作），守护进程层中途死亡后已被新实例接管并恢复监听，真正的粘死点是**本会话的 MCP 传输层**（stdio MCP server + 宿主 30 秒硬顶），外加 **0.35.2 版本落后上游 6 个 minor 版本**、缺少守护进程加固。
2. **技能不是没有指导能力，而是指导没被装进会自动触发的位置**：`use-agent-browser` 技能其实写有「CDP 接管」降级链（本次我手工执行的绕过方案正是该链路），但它藏在 164 行正文 + 8 个 references 里，而入口级的两份 `agent-browser/SKILL.md`（全局与 zcode 版）只是 52 行的发现存根（stub），全部实质内容委托给 CLI 的 `skills get core`；项目内 `.agents/skills/` **根本没有** agent-browser 技能。本故障的核心场景（MCP 通道全灭、CLI/CDP 可用的传输层三岔口）在所有技能中均无覆盖。
3. **根因是四因子叠加**：宿主 MCP 工具 30 秒硬顶（参数不可调）× 对冷启动 dev server 的首次 `open` 超窗口 × 并发会话共享 `default` 会话守护进程 × 0.35.2 版本在故障窗口内发生 Chrome 二进制在线下载切换（16:14:33）后守护进程死亡。详见第四章。

---

## 2. 故障时间线与证据链

### 2.1 时间线（2026-10-31，UTC+8）

| 时间         | 事件                                                                                                                                          | 证据                                                        | 置信度                                                                    |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------ |
| 16:03:31     | 本地 VitePress dev server 启动（`:8080`）                                                                                                     | dev server 日志 `Local: http://localhost:8080/`             | ✅                                                                        |
| 16:03:51     | dev 日志出现 `/v1/models` 代理 ECONNREFUSED（本地无 Nitro，预期噪音）                                                                         | dev server 日志                                             | ✅                                                                        |
| ~16:04–16:05 | 第 1 次 MCP `open http://localhost:8080/` → **30s 超时**                                                                                      | 会话工具调用记录                                            | ✅                                                                        |
| ~16:05       | 第 2 次 `open`（显式传 `timeoutMs=120000`）→ 仍报 **`timed out after 30000ms`**                                                               | 会话工具调用记录                                            | ✅                                                                        |
| ~16:06–16:07 | `tab_list`、`get_url`（传 `timeoutMs=60000`）→ 均 30s 超时                                                                                    | 会话工具调用记录                                            | ✅                                                                        |
| 16:09        | `default` 会话守护进程（pid 40308）启动并登记 `default.port=50838`                                                                            | `~/.agent-browser/default.pid` / `.port` 文件 mtime 与内容  | ✅                                                                        |
| 16:10        | `default.target` 写入 `{"url":"http://localhost:8080/",...}`——**守护进程确实受理了首次 open 并绑定标签页**                                    | `~/.agent-browser/default.target`                           | ✅                                                                        |
| 16:10:38     | 该守护进程拉起的 Chrome（profile `9717f339`）CDP 就绪（端口 65194）                                                                           | profile 内 `DevToolsActivePort` 文件 mtime + 内容           | ✅                                                                        |
| ~16:11–16:20 | 进程审计：可见 Chrome（chrome-152.0.7977.54）带渲染进程运行中；同时存在两条 MCP 守护链（11:22 与 15:32 启动的 `agent-browser-win32-x64.exe`） | PowerShell `Get-CimInstance` 快照                           | ✅                                                                        |
| 16:14:33     | **故障窗口内发生 chrome-152.0.7977.54 二进制目录的下载/安装/更新**                                                                            | `~/.agent-browser/browsers/chrome-152.0.7977.54` 目录 mtime | ✅（发生）/ ⬜（触发方：手动 install 还是自动升级，文件系统证据无法判定） |
| ~16:20       | CLI `agent-browser open` → **os error 10061（连接被拒）**；`connect 65099` → 超时；再次 `open` → **os error 10060（连接超时）**               | CLI 标准错误输出                                            | ✅                                                                        |
| ~16:20 之后  | 审计时可见的 Chrome（CDP 65099）已退出；CDP 探针 65099 → ECONNREFUSED                                                                         | `curl http://127.0.0.1:65099/json/version` 拒连             | ✅                                                                        |
| ~16:2x       | 自起 headless Chrome（固定端口 9223）+ Node 22 内置 WebSocket 直连 CDP → **导航/求值/截图全部成功**，完成全部浏览器验收                       | 本轮验收产物（截图、computed 值报告）                       | ✅                                                                        |
| 17:0x        | 收尾清理后再次 MCP 探针 → 仍 30s 超时                                                                                                         | 会话工具调用记录                                            | ✅                                                                        |
| 17:10:38     | **新守护进程（pid 36564）启动并接管 50838 端口**（注册档案里的 pid 40308 已死亡）                                                             | `Get-NetTCPConnection` + `Get-Process`                      | ✅                                                                        |
| 17:1x        | 最终 MCP 探针 → **仍 30s 超时**（守护进程已换新且健康，MCP 通道依旧死）                                                                       | 会话工具调用记录                                            | ✅                                                                        |

### 2.2 关键技术事实（包源码静态分析，上游 v0.35.2 tag）

| #   | 事实                                                                                                                                                    | 出处                                               |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------- |
| F1  | MCP server 不直连守护进程：每次工具调用 spawn 一个 CLI 子进程，子进程再 `ensure_daemon` 连接                                                            | `cli/src/mcp.rs:3630-3643`、`connection.rs:792`    |
| F2  | CLI→守护进程是 Windows 本机 TCP（`127.0.0.1:{port}`，换行分隔 JSON）                                                                                    | `connection.rs:996-1010`                           |
| F3  | 守护进程存活判定**只看 TCP 端口连通性，无 PID 校验**；无 `.lock` 文件，注册靠 `.pid/.port/.version/.config/.stream` sidecar 文件组                      | `connection.rs:795-803`、`148-182`                 |
| F4  | 端口文件缺失时回退**哈希端口**（49152–65534），存在被无关进程占用的碰撞风险                                                                             | `connection.rs:382-390`                            |
| F5  | 四层超时：宿主 MCP 工具 30s（实测）→ MCP server 每调用 120s（`DEFAULT_TIMEOUT_MS`）→ CLI→daemon 读超时 `max(op+10s, 30s)` 下限 → 浏览器 action 默认 25s | `mcp.rs:175`、`connection.rs:1085-1101`、`--help`  |
| F6  | 每个 `(namespace, session)` 组合一个守护进程实例，非全局单例；默认会话名 `default` **全机共享**                                                         | `connection.rs:148-158`、CLI 自带 core 技能 L37-45 |
| F7  | 守护进程 stderr 仅在早退时读取，稳态运行**不落任何磁盘日志**                                                                                            | `connection.rs:912, 936-942`                       |
| F8  | 会话隔离有 `--session`（每会话独立 daemon+Chrome）与 `--namespace`（隔离 socket 目录与端口哈希 identity）两层机制                                       | `connection.rs:133-138, 371-379`                   |

### 2.3 上游已知问题核对

- 上游仓库存在同类已知故障：[Issue #1308「open hangs pre-handshake on Windows 11 (0-byte stdout)」](https://github.com/vercel-labs/agent-browser/issues/1308)（2026-04 起，首次 `open` 在握手前挂起，用户把超时从 30s 提到 120s 仍挂）——与本故障「首次 open 挂起、后续全灭」症状同类。
- 官方 README 明确 30s 是刻意默认值：盲目调大反而会在慢操作上触发 `EAGAIN`。
- 官方 changelog 载有「守护进程在 Linux 上因 `waitpid(-1)` 竞争挂起已修复」「daemon 启动错误改为直接上报而非静默挂起」——即**旧版本存在"守护进程静默挂起"行为段**。
- 本机安装 `0.35.2`（约 2026-08），npm 最新 `0.41.0`（2026-10-29），中间隔 6 个 minor 版本；无法逐版本确认加固落点，但版本差距方向明确：**本机版本在守护进程可观测性加固之前**。

---

## 3. 根因分析（多层归因）

### 3.1 故障模型：四层链路，哪层断了

```log
[ZCode 宿主 MCP 客户端]  ← 30s 工具调用硬顶（timeoutMs 参数被忽略，实测两次）
   └─ stdio → [agent-browser mcp server（本会话常驻）]  ← 粘死层：首次挂起后全会话未恢复
        └─ 每次调用 spawn CLI 子进程 → [守护进程 agent-browser-win32-x64.exe]  ← 中途死亡(40308)，17:10 被新实例(36564)接管，现健康
             └─ CDP → [Chrome]  ← 全程健康，CDP 直连完成全部验收工作
```

### 3.2 归因明细

| 层                   | 状态            | 依据                                                                                                                              |
| :------------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / CDP 层      | ✅ 健康         | 自起 Chrome + Node 内置 WebSocket 直连 CDP 完成导航、求值、截图全套验收                                                           |
| 守护进程层           | 🔶 先故障后自愈 | 受理首次 open 并拉起 Chrome（`default.target` 证据）→ 中途死亡（pid 40308 不在运行）→ 17:10 被新实例接管端口，现健康              |
| MCP 传输层（本会话） | ✅ 确认粘死     | 首次挂起后 7+ 次调用全部 30s 超时；**跨守护进程换血后仍超时**——排除守护进程单独致因，钉死在本会话 stdio MCP server / 宿主客户端层 |
| 版本层               | ✅ 确认落后     | 0.35.2 vs 上游 0.41.0，跨「守护进程静默挂起」行为段；上游 Issue #1308 同症状                                                      |

### 3.3 根因链（按因果序）

1. **触发因子**：首次 `open` 的目标是刚启动的 VitePress dev server——首屏按需编译 + `/v1/models` 代理错误噪音，页面 `load` 事件大概率超出 30s 窗口；宿主在 30s 处客户端中止调用，但守护进程侧导航继续（Chrome 确实拉起并绑定了标签页）。
2. **直接原因**：宿主 MCP 工具调用存在 **30 秒硬顶**（显式 `timeoutMs=120000` 被忽略，两次实测），且首调用挂起后本会话 MCP 通道永久失效（7+ 次调用全灭、跨守护进程换血不自愈）。宿主层为 ZCode 行为，非 agent-browser 包内可配。
3. **放大因子 A（并发共享）**：两个并发 ZCode 会话的 MCP server 都使用默认 `default` 会话 → 共享同一个守护进程（F6：默认会话全机共享）。并发会话的守护进程活动与本次故障窗口重叠（审计时两条守护链并存），争用与状态互踩无法排除。
4. **放大因子 B（版本陈旧）**：0.35.2 处于上游「守护进程静默挂起」行为段，且故障窗口内（16:14:33）发生 Chrome 二进制在线下载切换——大体积下载极可能阻塞守护进程单线程命令循环数分钟，随后守护进程死亡（pid 40308 现已不在；死因 ⬜ 未确认：无磁盘日志（F7）、Crashpad 有写入但无 dump 文件）。
5. **恢复失败因子**：CLI 降级尝试（os error 10061/10060）发生在守护进程已死、端口短暂无监听的窗口；`ensure_daemon` 的一次性 respawn + 哈希端口回退（F4）未能在我尝试的窗口内重建可用链路。
6. **观测缺失因子**：守护进程稳态零日志（F7），导致「守护进程为何死」只能靠文件系统 mtime 考古，无法直接定论——这本身就是 0.35.2 的可观测性缺陷。

### 3.4 自查贡献（诚实披露）

对冷启动的 dev server 直接 `open`，而不是先用 curl 探活确认首屏可快速返回，是本次触发链的第一步。更稳妥的序列（先探活、或 open 后以 `wait --load networkidle` 类纪律接管）会显著降低踩中 30s 窗口的概率——该纪律在 CLI 自带 core 技能中存在（"Waiting (read this)"），但未进入任何本地技能的操作主流程。

---

## 4. 技能指导能力审计（回答"技能一点指导能力都没有么"）

### 4.1 审计对象与总体覆盖

| 技能文件                                                |                    健康检查                    |             冷启动/慢页面              |                     MCP 超时降级                      |      daemon 生命周期       |       会话/namespace 隔离       | 宿主 30s 上限 |
| :------------------------------------------------------ | :--------------------------------------------: | :------------------------------------: | :---------------------------------------------------: | :------------------------: | :-----------------------------: | :-----------: |
| 全局 `~/.agents/skills/agent-browser/SKILL.md`（52 行） |                       空                       |                   空                   |                          空                           |             空             |               空                |      空       |
| zcode `~/.zcode/skills/agent-browser/SKILL.md`          |       空（与全局逐字节相同，diff 确认）        |                   空                   |                          空                           |             空             |               空                |      空       |
| **项目 `.agents/skills/agent-browser/`**                | **不存在**（项目技能目录 18 个子目录中无此项） |                   —                    |                           —                           |             —              |                —                |       —       |
| `use-agent-browser`（164 行 + 8 references）            |     ✅ 最强（doctor 先行 + 三步分离诊断）      | 部分（导航后等待纪律，无 open 前探活） |               ✅ 最强（CDP 接管降级链）               |  部分（daemon EOF 处置）   | 部分（有 session 无 namespace） |      空       |
| `browser-testing-with-devtools`（317 行）               |                       空                       |                   空                   |                空（被指定为降级终点）                 |             空             |              部分               |      空       |
| `cleanup-agent-team-node-processes`                     |         空（事后审计定位，非实时恢复）         |                   空                   |                          空                           |            部分            |               空                |      空       |
| CLI 自带 core 技能（`skills get core`，31KB，最终权威） |       ✅（doctor 自动清 stale sidecar）        |    ✅ 页面级（默认 25s，wait 纪律）    | 部分（`--cdp`/`--auto-connect` 旗标在，无超时降级链） | ✅ 行为级（1h 空闲自停等） | ✅（session + namespace 双层）  |      空       |

### 4.2 关键判定

1. **入口技能是存根**：全局与 zcode 两份 `agent-browser/SKILL.md` 内容逐字节一致，仅 52 行，自述"discovery stub, not the usage guide"，实质指导全部委托给运行时 CLI 下发的 `skills get core`。**当 MCP 通道死了、agent 又没读 CLI 自带技能时，入口层给不了任何故障指导**——这是"感觉技能没指导能力"的直接来源。
2. **真正的指导存在但分散且假设错位**：`use-agent-browser` 的降级链（`--no-sandbox` → CDP 接管 → headless=new + connect → 切 DevTools 类 MCP）正是本次我手工走通的路径；CLI 自带 core 技能也写明 doctor 先行、默认会话全机共享、namespace 隔离。**但所有降级链的触发假设是"启动失败"，没有覆盖本次"MCP 通道 30s 全灭 + CLI 10061/10060 + CDP 直连正常"的传输层三岔口。**
3. **六项系统性缺口**（所有技能合计）：
   1. 四层超时分层模型零文档——没人告诉你"MCP 工具 30s 被杀是宿主行为，包内链路其实允许到 120s"；
   2. "MCP 死但 CLI/CDP 活"的分流决策树缺失；
   3. `--namespace` 并发隔离零覆盖（use-agent-browser 全家检索无一处，仅 CLI core 一行带过）——而本仓库存在多会话并发的真实常态；
   4. 守护进程状态文件（`.pid/.port/.stream` 等 sidecar）的人工取证与只读诊断路径缺失（只有 `doctor --fix` 一句，doctor 本身又要走 daemon 链）；
   5. agent-browser 自带 Chrome 版本在线漂移（本次 16:14:33 的 152 下载）对运行中任务的风险零提示；
   6. 「MCP 挂 ≠ daemon 挂 ≠ Chrome 挂」的三层进程拓扑无描述，直接导致误判（例如"MCP 超时就杀 daemon"）。

### 4.3 判定原文（回答用户的质问）

> 局部与全局技能**不是"一点指导能力都没有"**——`use-agent-browser` 的 CDP 接管降级链是存在的、可用的（本次绕过即其手工版）；但**指导被埋在了第二层技能里**，入口级 SKILL.md 是空壳存根，项目内没有任何本地化沉淀，且全部技能对"本故障的确切形态"（传输层粘死 + 宿主 30s 硬顶 + 共享会话并发争用 + 版本陈旧）**均无覆盖**。指导能力的问题不是"没有"，是"没装到会自动命中的位置、没覆盖到真实故障形态"。

---

## 5. "agent-browser 是否垃圾"的分层裁定

| 层                 | 裁定                            | 理由                                                                                                                                |
| :----------------- | :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------- |
| 浏览器/CDP 能力    | ✅ 不垃圾                       | 全 session 验收工作靠 CDP 层完成，稳定                                                                                              |
| CLI 与守护进程架构 | 🔶 设计合理但 0.35.2 实现欠加固 | 多会话/namespace 隔离设计在；但静默挂起（上游已认）、零磁盘日志、哈希端口碰撞风险、无 PID 校验的存活判定都是实打实的缺陷            |
| MCP 封装层         | 🔶 当前版本下是薄弱点           | 每调用 spawn 子进程 + 120s 内部超时的设计本可容忍慢操作，但叠加宿主 30s 硬顶后，>30s 的合法操作必然表现为"全会话工具不可用"且无自愈 |
| 本仓使用方式       | 🔶 有改进空间                   | 未使用 session/namespace 隔离（默认会话被两个并发会话共享），未做 open 前探活，未升级版本                                           |

**一句话裁定**：工具不是垃圾，是一个**架构合格、当前安装版本（0.35.2）处于上游已知脆弱行为段、且被本仓以最容易踩坑的方式（默认共享会话 + 并发多会话 + 对冷启动页面直接 open）使用**的浏览器自动化栈。升级到 0.41.0 + 按 5.1 SOP 使用后，预期可用性会显著改善。

---

## 6. 防再发 SOP 与改进建议

### 6.1 会话级操作纪律（立即生效，零成本）

1. **open 前先探活**：对任何本地 dev server，先 `curl -s -m 5 http://127.0.0.1:PORT/` 确认首屏可快速返回，再 `agent-browser open`；冷启动页面先用 `wait --load networkidle` 接管等待。
2. **并发会话一律隔离**：每个 ZCode 会话用独立标识（`--session sess-xxx` 或 `AGENT_BROWSER_NAMESPACE=<task>`），杜绝默认 `default` 会话全机共享导致的守护进程争用（CLI 自带 core 技能 L37-45 明确警告）。
3. **故障三岔口分流顺序**（MCP 全灭时按序执行）：
   1. 只读取证：读 `~/.agent-browser/{session}.pid/.port`，`Get-NetTCPConnection` 查端口监听与归属 pid；
   2. CLI 直连探活：`agent-browser --help`（不依赖 daemon）→ `agent-browser get url`（走 daemon）；
   3. CDP 直连兜底：自起 headless Chrome（`--remote-debugging-port=固定端口`）+ Node 内置 WebSocket / `--cdp <port>` 接管——本次全量验收即由此完成；
   4. 不要在 MCP 全灭的会话里反复重试 MCP 调用（每次白耗 30s），也不要先杀 daemon——本次取证证明守护进程可能被并发会话使用且会被新实例接管。
4. **升级版本**：`pnpm add -g agent-browser@latest`（0.35.2 → 0.41.0，跨"守护进程静默挂起"行为段）；升级前核对本机 Chrome 缓存目录（`~/.agent-browser/browsers/`）避免任务中途触发在线下载切换。

### 6.2 技能补丁建议（涉及全局技能资产，列出待授权，未擅动）

| 优先级 | 建议                                                                                                                                                                                     | 落点                                                      |
| :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| P0     | 在入口 `agent-browser/SKILL.md` 存根中加入"故障三岔口分流"一节（MCP 30s 全灭 → 只读取证 → CLI 探活 → CDP 兜底），并把"宿主 MCP 工具 30s 硬顶、包内 120s、action 25s"的四层超时表写进正文 | `~/.agents/skills/agent-browser/SKILL.md` + 同步 zcode 版 |
| P0     | `use-agent-browser` 补 `--namespace` 并发隔离纪律（本仓多会话并发是常态）                                                                                                                | `use-agent-browser/SKILL.md`                              |
| P1     | `use-agent-browser` 降级链触发假设从"启动失败"扩展为"传输层故障三态"（MCP 死/daemon 死/Chrome 死），补状态文件只读取证配方                                                               | `use-agent-browser/SKILL.md` + command-cookbook           |
| P1     | 项目 `.agents/skills/` 建本地 `agent-browser` 技能：固化本报告 6.1 的操作纪律与 drill 站验收模板                                                                                         | 项目技能目录（新建）                                      |
| P2     | 向上游反馈：MCP 工具调用在宿主 30s 硬顶下的行为（建议 MCP server 侧把预期 >30s 的操作改为快速返回 + 轮询查询），并附 Issue #1308 关联                                                    | 上游仓库                                                  |

### 6.3 备查：本报告结论的可复核命令

```log
:: 守护进程与端口现状
powershell -NoProfile -Command "Get-Process -Id 40308 -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort 50838 -State Listen -ErrorAction SilentlyContinue"
:: 注册档案
dir C:\Users\pc\.agent-browser\default.*
:: 版本差距
agent-browser --version && npm view agent-browser version
:: 上游已知问题
:: https://github.com/vercel-labs/agent-browser/issues/1308
```

---

## 7. 附录：本次绕过方案的完整形态（已验证可用）

```log
:: 1. 自起 headless Chrome（固定 CDP 端口，独立 profile，不碰 agent-browser 守护进程）
C:\Users\pc\.agent-browser\browsers\chrome-152.0.7977.54\chrome.exe ^
  --headless=new --remote-debugging-port=9223 --no-first-run ^
  --user-data-dir=%TEMP%\p15-chrome-profile about:blank

:: 2. Node 22 内置 WebSocket 直连 CDP（无需任何依赖）
::    GET http://127.0.0.1:9223/json/list 取 webSocketDebuggerUrl
::    Runtime.evaluate 求值 / Page.captureScreenshot 截图 / Page.navigate 导航
:: 3. 用后清理：停止 chrome 进程（按端口归属精确命中，勿批量杀）
```

该方案的完整脚本（本地三场景 + 生产四场景验收）已在本会话实证，可支撑 learn-agents-ui 第十二章的浏览器验收流程作为 MCP 故障时的备份通道。

---

## 8. 遗留未确认项（诚实清单）

1. 守护进程 pid 40308 的**确切死因**：无磁盘日志（0.35.2 行为），Crashpad 有写入无 dump；候选解释为 Chrome 在线切换扰动 / 并发争用 / 崩溃，均无法定论。
2. 16:14:33 Chrome 152 下载的**触发方**（守护进程自动升级 vs 外部手动 install）。
3. 宿主 MCP 客户端 30s 硬顶的**确切实现位置与是否可配**（ZCode 宿主侧行为，本报告以两次实测 `timeoutMs` 参数被忽略为据）。
4. 本会话 MCP stdio server 粘死的**内部机制**（请求相关性永不 resolves，还是串行队列被首个挂起调用堵塞）——需要宿主侧或上游源码进一步定位。
