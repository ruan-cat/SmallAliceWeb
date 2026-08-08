# 2026-08-07 use-vercel-deploy-in-monorepo 技能改进分析

## 1. 背景与评估方法

2026-08-07 会话在 SmallAliceWeb monorepo 中完成了 `packages/ai-rag-api`（Nitro v3）到 Vercel 的独立项目部署（项目名 `smallalice-docs-ai-nitro-api`），全程按 `use-vercel-deploy-in-monorepo` 技能 v1.1.0 的"形态 1 / 模式 A"落地。本次部署同时暴露了技能未覆盖的多个环节：云端 Project Settings 写入、Git 连接、`.vercelignore`、远程构建失败排查、环境变量管理等。

本报告采用"实战回放对照"方法：把本次会话实际执行的每个阶段与技能章节逐一比对，区分"已覆盖且生效""部分覆盖""未覆盖"三档，据此给出改进提案与能力扩展方向。

## 2. 技能已覆盖且被验证有效的部分

先说结论：技能的核心架构——部署形态分层、配置来源优先级边界、产物搬运链路——在本次任务中全部命中，是部署架构一次成型的基础。

|     技能章节      |                                     本次会话实际效果                                     |
| :---------------: | :--------------------------------------------------------------------------------------: |
|  §2 部署形态判断  |                      直接判定为形态 1 / 模式 A，架构选型没有走弯路                       |
|  §3 核心原则 1~4  |               Root Directory 留空 + `.vercel/output` 搬运链路一次配置成功                |
|  §4 配置来源边界  | 支撑了"删除仓库根 `vercel.json`"这一破坏性决策的论证（双项目共享根配置属于跨项目污染源） |
| §5.7 单槽绑定纪律 |   双项目共存下，每次部署前 `vercel link --project <name> --yes` 切换绑定，未发生误部署   |
|  §9 搬运工具说明  |        `move-vercel-output-to-root` 链路（来自 `@ruan-cat/utils`）产物搬运零故障         |
|  §7 远程配置校验  |              通过 CLI / API / MCP 三方核对云端字段，发现了云端配置缺失问题               |

特别值得记录的一点：本次在排查 Nitro 404（路由未打包）时，最终修复手段是在 `nitro.config.ts` 补上 `serverDir: "server"`——而技能的 Nitro 模板（`templates/package-scripts-nitro.md`）**早已包含这一行**。技能里有正确答案，但它埋在模板文件里，既不在 §10.1 陷阱清单，也不在 §5 工作流的显式步骤中，执行时没有第一时间对照模板，导致重复踩坑。详见 3.6 节。

## 3. 技能缺口盘点

以下 9 个问题是本次会话实际遇到、但技能 v1.1.0 未覆盖或仅一笔带过的。

### 3.1 云端 Project Settings 只有"读路径"，没有"写路径"

技能 §7 教了如何用 CLI / API / MCP **核对**云端配置，但配置本身如何**写入**云端完全没有覆盖。本次会话的真实链路是：

1. Vercel CLI 没有 `vercel project update` 类命令；
2. Vercel MCP 工具只读，不能修改 Build Command / Output Directory；
3. 最终通过 REST API `PATCH /v9/projects/<projectId>?teamId=<teamId>` 完成云端配置写入；
4. Bearer token 从 Vercel CLI 的认证文件读取，Windows 下路径是非标准的 `%APPDATA%\xdg.data\com.vercel.cli\auth.json`。

用户中途指出"你是不是忽略了云配置"，正是因为技能工作流把"在 Vercel 项目设置中配置"当成一句隐含的人工步骤，没有给出可编程的执行与验证手段。这是本次最大的技能缺口。

### 3.2 Git 连接与 git push 触发部署完全未覆盖

技能 §5.7 的部署手段只有 `vercel deploy --prebuilt`。而本次用户的最终要求是"通过 git commit/push 触发生产部署"，这涉及一整条技能未覆盖的链路：

- `vercel git connect` 必须传完整仓库 URL（`https://github.com/ruan-cat/SmallAliceWeb`），slug 形式会失败；
- git push 触发的是云端远程构建，其正确性取决于云端 Build Command / Install Command / Node 版本全部配置正确；
- **prebuilt 部署成功不能证明云端构建链路正确**——本次 prebuilt 正常，但 git push 触发的两次远程构建均失败（见 3.4）。

技能目前没有"部署触发策略"这一概念，更没有提醒两种触发方式验证的东西不同。

### 3.3 `.vercelignore` 与上传体积评估缺失

prebuilt 部署默认上传整个工作目录。本次 monorepo 根目录含 `.turbo`（3.3G）、`drill-docx`（257M）、`docs/docx`（282M）等大目录，首次上传 4.3G 直接 fetch failed。补救手段是创建 `.vercelignore`，压缩到约 12MB 后才恢复可控。

技能的工作流（§5.6 本地验证、§5.7 部署）没有任何关于上传体积评估、`.vercelignore` 生成的步骤。对 monorepo 场景，这应该是部署前的必检项。

### 3.4 远程构建失败排查指引缺失（ERR_PNPM_META_FETCH_FAIL）

git push 触发的远程构建两次均失败于 `ERR_PNPM_META_FETCH_FAIL`（Vercel 构建机拉取 pnpm 依赖元数据失败），至今未解决。已知事实：

```log
ERR_PNPM_META_FETCH_FAIL  (云端远程构建，git push 触发，两次均失败)
prebuilt 部署正常          (本地产物上传，功能验证通过)
```

这个组合本身是有诊断价值的：本地产物可用，说明代码、脚本、产物结构都正确；问题收敛在 Vercel 云端构建环境的 pnpm / registry 兼容性上。技能缺少一个"部署失败分诊"章节来沉淀这类判断路径：先看 build logs（MCP `get_deployment_build_logs`），再按错误码分支处理。

### 3.5 环境变量管理只有一个复选框

技能 §10.3 对环境变量只有一条"已同步"复选框，未覆盖本次实际做的事：

- 7 个 `NITRO_*` 环境变量需要在 production / preview / development **三个 target** 分别接线，REST API 是 `POST /v10/projects/<idOrName>/env`（body 带 `target` 数组）；
- Neon 集成命名陷阱：Vercel 集成名 `neon-smallalice-ai-rag` 是**项目名**，实际数据库名是 `neondb`（Neon project `patient-cloud-43432277`）。文档里的旧称谓与实际连接串不一致，本次靠 Neon MCP 直接查证才纠正。这类"集成资源标识 ≠ 环境变量值"的坑值得沉淀。

### 3.6 Nitro v3 `serverDir` 陷阱未提升到显式位置

如第 2 节所述，`serverDir: "server"` 已存在于技能模板，但 §10.1 的 16 条陷阱和 §10.3 检查清单都没有它。Nitro v3 默认扫描根目录 `routes/`，不扫描 `server/` 子目录，漏配的直接后果是构建成功、部署成功、**所有路由 404**——错误非常隐蔽，正是技能最该高亮的那类问题。

### 3.7 MCP 工具清单已过时

技能 §8 与 `references/vercel-mcp-operations.md` 只列了 6 个 MCP 工具。当前 Vercel MCP 实际可用的诊断类工具至少还包括：`get_deployment_build_logs`（排查构建失败的关键）、`get_runtime_logs`、`get_runtime_errors`、`get_project_deployment_protection` / `update_project_deployment_protection`、`search_vercel_documentation`、`web_fetch_vercel_url` 等。本次排查远程构建失败，`get_deployment_build_logs` 是核心工具，技能清单里却没有。

### 3.8 Node 版本等云端字段未覆盖

云端 `nodeVersion`（本次设为 22.x）是 PATCH 配置的一部分，也与 `ERR_PNPM_META_FETCH_FAIL` 的排查相关。技能 §7.2 的关键字段核对表没有 `nodeVersion`。

### 3.9 自定义域名与生产地址沉淀未覆盖

用户手动配置了自定义生产域名 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/`，随后要求同步到 `package.json` 的 `homepage`、README、AGENTS.md。技能对"部署成功后的生产地址归档"（域名配置、三处文档一致性）没有任何指引。

## 4. 改进提案

按第 3 节缺口逐项给出可落地的技能修改方案。

### 4.1 新增"云端配置写入"章节（对应 3.1）

在 §7 之后新增一节，内容包括：

- 明确说明 CLI 无项目配置更新命令、MCP 只读，写入云端配置的标准路径是 REST API；
- token 获取方式：Windows `%APPDATA%\xdg.data\com.vercel.cli\auth.json`，macOS/Linux `~/.local/share/com.vercel.cli/auth.json`；
- PATCH 示例：

```bash
curl -s -X PATCH "https://api.vercel.com/v9/projects/<projectId>?teamId=<teamId>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"framework\":\"other\",\"buildCommand\":\"pnpm --filter <子包名> run build:vercel\",\"outputDirectory\":\".vercel/output\",\"installCommand\":\"pnpm install\",\"nodeVersion\":\"22.x\"}"
```

- 写入后必须用 `vercel project inspect` 或 `get_project` 回读验证，形成"写—读"闭环。

### 4.2 新增"部署触发策略"章节（对应 3.2）

把部署方式显式分为两条路径并写清验证差异：

|   触发方式    |                 验证了什么                 |           不能证明什么            |
| :-----------: | :----------------------------------------: | :-------------------------------: |
| `--prebuilt`  | 本地产物结构、Output Directory、运行时行为 | 云端 Install/Build 链路是否可复现 |
| git push 触发 |  云端完整构建链（安装、构建、Node 版本）   |     本地未提交的改动不在其中      |

并给出 Git 连接步骤：`vercel git connect https://github.com/<owner>/<repo>`（必须完整 URL）。新增纪律：**新项目首次上线，两条路径都必须各验证一次**；只验证 prebuilt 就宣布"部署完成"属于交付不完整。

### 4.3 工作流阶段 4 前置"上传体积评估"（对应 3.3）

在 §5.7 之前插入步骤：

1. 估算待上传目录体积（重点排查 `.turbo`、`dist`、`node_modules` 之外的生成物目录、文档二进制目录）；
2. 超过阈值（建议 100MB）必须先生成 `.vercelignore`；
3. 给出 monorepo 通用模板：

```plain
.turbo
node_modules
docs/.vitepress/dist
docs/.vitepress/cache
packages/*/.vercel
```

### 4.4 新增"部署失败分诊"章节（对应 3.4）

核心是"日志优先"原则与错误码速查表。首条沉淀本次案例：

|                          错误现象                          |                      分诊结论                      |                                 下一步                                 |
| :--------------------------------------------------------: | :------------------------------------------------: | :--------------------------------------------------------------------: |
| `ERR_PNPM_META_FETCH_FAIL`（远程构建失败但 prebuilt 正常） | 问题在云端构建环境的依赖元数据获取，不在代码与产物 | 核对 `packageManager` 字段、pnpm 版本、Node 版本；必要时向 Vercel 反馈 |

同时明确取证命令：MCP `get_deployment_build_logs` / CLI `vercel inspect <deployment-url> --logs`。

### 4.5 扩充 MCP 工具清单（对应 3.7）

在 §8 与 `vercel-mcp-operations.md` 中补充诊断类工具，至少包括 `get_deployment_build_logs`、`get_runtime_logs`、`get_runtime_errors`、`search_vercel_documentation`，并更新"检查顺序建议"，在 `get_deployment` 之后分叉：失败走 build logs，成功走 runtime 冒烟。

### 4.6 将 Nitro v3 `serverDir` 提升为 [CRITICAL] 陷阱（对应 3.6）

在 §10.1 新增一条：

> **Nitro v3 漏配 `serverDir`**：Nitro v3 默认扫描包根目录的 `routes/`、`plugins/`，代码放在 `server/` 子目录时必须显式配置 `serverDir: "server"`。漏配时构建与部署都会成功，但所有路由 404。模板 `templates/package-scripts-nitro.md` 已含该配置，照抄模板即可。

同时在 §10.3 检查清单加一项"Nitro 子包已确认 `serverDir` 与实际目录结构一致"。

### 4.7 新增"环境变量与集成资源"章节（对应 3.5）

覆盖：REST API env 的增删查、`target` 三环境语义、以及一条醒目的反例——Vercel 集成显示名不等于数据库名/连接串，配置前必须用 Neon MCP 或 `neon` CLI 实证核对（本仓库禁用 `neonctl`）。

### 4.8 新增"新项目首次部署端到端检查单"（对应 3.1~3.9 的合流）

把分散的核对项串成一条从 0 到上线的流水线：创建项目 → Git 连接 → 云端 Settings 写入并回读 → 三环境变量接线 → `.vercelignore` → prebuilt 验证 → git push 验证 → 构建日志确认 → 运行时冒烟 → 生产域名与文档归档。本次会话实际走过的完整路径，正好可以作为这条检查单的参考实现。

### 4.9 期望值表补充 SmallAliceWeb 双项目案例（对应 §2.3）

本次落地后，§2.3 期望值表可追加两行，这也是表中首个"同一仓库、一个模式 A + 一个模式 B"的双项目样本：

|          Vercel 项目           |      GitHub 仓库       | Root Directory | Framework |                          Build Command                          |    Output Directory    | Install Command |      形态       |
| :----------------------------: | :--------------------: | :------------: | :-------: | :-------------------------------------------------------------: | :--------------------: | :-------------: | :-------------: |
|     `small-alice-web-odse`     | ruan-cat/SmallAliceWeb |      `.`       |   Other   |                        `pnpm run build`                         | `docs/.vitepress/dist` | `pnpm install`  | 形态 1 / 模式 B |
| `smallalice-docs-ai-nitro-api` | ruan-cat/SmallAliceWeb |      `.`       |   Other   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |    `.vercel/output`    | `pnpm install`  | 形态 1 / 模式 A |

## 5. 技能还能做到哪些东西（能力扩展方向）

除修补本次缺口之外，技能还有五个可做的方向：

### 5.1 云端配置漂移检测

技能已有"期望值表"（§2.3）的概念，可以更进一步：以期望值表（或 `vercel-deploy-tool.config.ts`）为单一事实来源，引导 agent 用 `get_project` 拉取云端实际值，逐项 diff 并输出漂移报告。本次"云端配置缺失"若有一张漂移表，会在部署前就被发现，而不是被用户发现。

### 5.2 与 @ruan-cat/vercel-deploy-tool 双向打通

技能 §9 已提及 `@ruan-cat/vercel-deploy-tool` 的批量部署配置，但两者目前是割裂的。方向：配置文件同时驱动 prebuilt 批量部署与云端 Settings 同步（配合 4.1 的 PATCH 路径），让"本地期望 = 云端实际"成为工具保证，而非人工纪律。

### 5.3 部署失败分诊决策树

把 4.4 的速查表扩展为完整决策树：构建失败（看 build logs → 安装段/构建段/上传段分支）→ 运行时失败（看 runtime logs → 启动崩溃/路由 404/依赖缺失分支）→ 域名与保护设置问题。每条叶子节点绑定取证命令。

### 5.4 跨项目环境变量审计

同一仓库多个 Vercel 项目共享同一后端资源（本例两个项目共享 Neon）时，技能可引导 agent 跨项目核对 env 的 key、target、取值指向是否一致，防止"docs 项目与 api 项目指向不同 Neon 实例"这类事故（本次就发现过旧文档记载与实际不符）。

### 5.5 生产地址归档一致性

部署完成后自动核对三处记录是否一致：子包 `package.json` 的 `homepage`、仓库 README 的部署架构表、AGENTS.md/CLAUDE.md 的固定资源记忆。本次这三处是靠用户提醒才补齐的。

## 6. 优先级建议

| 优先级 |                                   提案                                    |               理由               |
| :----: | :-----------------------------------------------------------------------: | :------------------------------: |
|   P0   |      4.1 云端配置写入、4.2 部署触发策略、4.4 失败分诊、4.5 MCP 清单       | 直接对应本次会话的实际卡点与返工 |
|   P1   | 4.3 `.vercelignore`、4.6 serverDir 提升、4.7 环境变量、4.8 首次部署检查单 |      高频踩坑点，预防价值高      |
|   P2   |                      4.9 案例表补充、第 5 节能力扩展                      |  沉淀性质，可与下次实战迭代合并  |

建议随上述 P0/P1 落地发布技能 v1.2.0。

## 7. 结论

`use-vercel-deploy-in-monorepo` v1.1.0 的骨架——形态分层、配置来源边界、产物搬运链路、单槽绑定纪律——在本次双项目部署中全部经受住了检验，架构选型零返工。缺口集中在**云端侧的写操作与部署触发闭环**：技能把"云端 Project Settings 已配置"当成前提假设，而真实任务里它恰恰是需要编程化完成并回读验证的核心工作；技能把 `--prebuilt` 当成唯一部署路径，而生产级交付要求 git push 触发链路同样可用。

一句话总结改进方向：技能已经教会了"本地怎么配对"，下一步要教会"云端怎么写对、两条触发路径怎么都验对、失败了怎么快速分诊"。
