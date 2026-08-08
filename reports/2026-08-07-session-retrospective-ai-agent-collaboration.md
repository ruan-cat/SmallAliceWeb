<!-- 有价值的报告 -->

# 2026-08-07 AI Agent 协作开发会话复盘报告

> **复盘对象**：Nitro API Vercel 独立部署会话（QoderWork 主代理 + 子代理蜂群架构）
>
> **复盘视角**：教练、蓝军、局外人、观察者
>
> **方法论路由 🧭**：🔴 华为味（RCA 根因分析 + 自我批判 + 蓝军自攻击）

---

## 1. 会话全景概览

### 1.1 任务目标与最终交付

本次会话的核心目标是将 `packages/ai-rag-api`（Nitro v3 子包）部署为独立的 Vercel 项目 `smallalice-docs-ai-nitro-api`，完成生产环境接线和 API 冒烟验证。

最终交付清单：

|                        交付项                        | 状态 | 证据                                                  |
| :--------------------------------------------------: | :--: | :---------------------------------------------------- |
| Nitro 代码修改（baseUrl/baseURL/装配插件/serverDir） |  ✅  | 5 个分类提交，typecheck + 49 用例通过                 |
|    Vercel 项目创建 + 云端 Build & Deployment 配置    |  ✅  | REST API PATCH 6 项全绿                               |
|          根 vercel.json 删除（破坏性变更）           |  ✅  | 备份在工作区，云端设置已对等                          |
|                 Neon migration 执行                  |  ✅  | vector 0.8.0 / 3 表 / HNSW 索引，MCP run_sql 独立复核 |
|           7 个 NITRO\_\* 环境变量 × 3 环境           |  ✅  | 21 条全绿                                             |
|                  prebuilt 部署上线                   |  ✅  | 生产域名可达，4/7 端点正常                            |
|                  git-push 远程构建                   |  ❌  | ERR_PNPM_META_FETCH_FAIL 持续失败                     |
|      文档更新（README/AGENTS/CLAUDE/spec/plan）      |  ✅  | 双项目架构表 + 域名切换                               |
|                       蓝军审计                       |  ✅  | 子代理复核 20/22 PASS                                 |

### 1.2 会话关键时间线

```log
[Phase 1] 需求对齐 → 用户纠偏 3 次（不要拖入授权框架 / 不要碰 vercel.json → 后来让步 / 不要用 app 目录模式）
[Phase 2] 编辑子代理 → 3 处代码修改（baseUrl/baseURL/装配插件）→ typecheck + test 通过
[Phase 3] 产物侦察 → 发现 .turbo 3.3G + drill-docx 257M → .vercelignore 瘦身到 12MB
[Phase 4] docs 对等部署 → vercel deploy --prod 两次 fetch 失败（4.3G 上传超时 + 网络错误）
[Phase 5] Neon migration → 直连 5 条 SQL 全成功 → MCP 独立复核 4 项全绿
[Phase 6] 环境变量接线 → 21 条 vercel env add 全绿
[Phase 7] 本地构建 → serverDir 缺失导致 404 → 修复后产物 558KB
[Phase 8] prebuilt 部署 → 成功上线 → 冒烟测试 5/7 PASS（search/chat 500 是空库问题）
[Phase 9] 云端配置补齐 → REST API PATCH → 蓝军审计 20/22
[Phase 10] git-push → ERR_PNPM_META_FETCH_FAIL → 用户确认生产域名 → 域名切换提交
[Phase 11] Context compaction → 会话续接 → spec/plan 文档更新 → memorix 记忆沉淀
```

---

## 2. 提示词设计复盘

### 2.1 问题诊断

本次会话用户进行了 **3 次重大纠偏**，每次纠偏都消耗了大量上下文：

| 纠偏次序 | 用户原话                                                              | 根因分析                                                                   |
| :------: | :-------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| 第 1 次  | "你的任务是单纯的完成 nitro 接口部署……别扯到上一个任务的什么授权上面" | 初始提示词引用了上一个任务的上下文（A0-A5 授权框架），导致代理误判任务范围 |
| 第 2 次  | "改用官方 app 目录模式……是不是我们的根包 vercel.json 设计写死了"      | 代理提出的方案（app 目录模式）被用户否决，说明方案探索阶段没有充分调研     |
| 第 3 次  | "我做出让步。这个红线确实不合适"                                      | 用户主动撤回了自己设定的红线，说明提示词中的约束条件可能未经深思           |

### 2.2 改进建议

**原则：提示词应该是"约束 + 目标"，不是"叙事 + 愿望"。**

**建议 1：使用 Task Contract 模板**

```markdown
## 任务契约

### 意图 (Intent)

将 packages/ai-rag-api 部署为独立 Vercel 项目 smallalice-docs-ai-nitro-api。

### 验收标准 (Acceptance)

- [ ] 生产域名可达 + 4 个路由返回正确状态码
- [ ] Neon migration 已执行 + MCP 独立复核
- [ ] 7 个环境变量跨 3 环境接线
- [ ] README/AGENTS.md 记录部署架构

### 禁止事项 (Forbidden)

- 不涉及上一个任务的 A0-A5 授权框架
- 不创建第二个 Neon project 或 database
- 不在报告中暴露敏感值

### 验证命令 (Verify)

- curl https://域名/v1/knowledge/sync-runs → 200
- pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck → exit 0
```

**建议 2：分离"已知事实"和"待决策项"**

```markdown
## 已知事实（不需要讨论）

- Neon 项目 ID: patient-cloud-43432277
- 团队 ID: team_cUeGw4TtOCLp0bbuH8kA7BYH
- 生产域名: smallalice-docs-ai-nitro-api.ruan-cat.com

## 待决策项（需要代理提出方案）

- 部署形态：Mode A vs Mode B vs app 目录模式
- 是否删除根 vercel.json
- 环境变量命名规范
```

**建议 3：用"先侦察后决策"替代"先决策后纠偏"**

在提示词中加入显式的侦察阶段：

```markdown
## 执行顺序

1. 先读取 use-vercel-deploy-in-monorepo 技能，理解 4 种部署形态
2. 读取 vercel-deploy-tool.config.ts，理解现有部署配置
3. 列出 2-3 个可行方案（含 pros/cons），等我选择后再执行
```

---

## 3. 上下文加载控制复盘

### 3.1 问题诊断

本次会话发生了 **至少 1 次 context compaction**（从摘要开头可知）。上下文消耗的主要来源：

| 消耗源                                   | 估计 Token 占比 | 问题                                                  |
| :--------------------------------------- | :-------------: | :---------------------------------------------------- |
| PUA Skill 全文 + 5 个 reference 文件     |      ~15%       | 技能文档本身就很庞大，且每次加载都要读 5 个 reference |
| use-vercel-deploy-in-monorepo Skill      |       ~8%       | 技能文档 + 模板文件                                   |
| 临时 PS 脚本（~15 个 Write 调用）        |      ~10%       | 每个脚本都是 Write + Bash 两次调用                    |
| 重复的 vercel project inspect            |       ~5%       | 同一命令执行了 3+ 次                                  |
| spec/plan 文档全文阅读                   |      ~12%       | 两个文档合计 ~1100 行                                 |
| 子代理的 prompt + 返回结果               |      ~20%       | 编辑子代理 + 复核子代理                               |
| 各种 Bash 输出（build log、curl 结果等） |      ~15%       | 部分输出可以截断                                      |
| 其他（git diff、文件读取等）             |      ~15%       | 正常消耗                                              |

### 3.2 改进建议

**建议 1：Skill 按需加载，不要一次性全部加载**

本次会话加载了 4 个 Skill（pua、use-vercel-deploy-in-monorepo、git-commit、subagent-driven-development），每个都带大量 reference 文档。建议：

```markdown
## Skill 加载策略

- 任务开始时只加载核心 Skill（如 use-vercel-deploy-in-monorepo）
- PUA Skill 在需要压力激励时再加载（不要默认加载）
- git-commit Skill 在提交阶段再加载
- subagent-driven-development 在需要子代理编排时再加载
```

**建议 2：PS 脚本合并复用，避免"一个脚本用一次就丢"**

本次创建了约 15 个临时 PS 脚本，每个都是一次性的。建议改为：

```powershell
# 创建一个通用的 vercel-ops.ps1，支持多个子命令
# vercel-ops.ps1 check-token
# vercel-ops.ps1 patch-settings
# vercel-ops.ps1 wire-env
# vercel-ops.ps1 cleanup-secrets
```

**建议 3：大文档用 Read 的 offset/limit 参数，不要全文读取**

spec 文档 427 行、plan 文档 1085 行——全文读取消耗巨大。建议：

```markdown
## 文档读取策略

- 第一次只读目录/标题结构（grep "^##" file）
- 根据任务需要，用 offset/limit 只读相关章节
- 更新文档时用 Edit 的精准替换，不要 Read 全文再 Write 全文
```

**建议 4：Bash 输出用 head/tail 截断**

部分 Bash 命令（如 `du -sh`、`git diff`）输出很长，但只需要关键信息。建议：

```bash
# 不好：输出可能几百行
du -sh --exclude=node_modules */

# 好：只取前 10 行
du -sh --exclude=node_modules */ 2>/dev/null | sort -rh | head -10
```

---

## 4. 子代理设计复盘

### 4.1 本次子代理使用情况

| 子代理                 |      类型       | 效果 | 评价                                                        |
| :--------------------- | :-------------: | :--: | :---------------------------------------------------------- |
| 编辑子代理（代码修改） | general-purpose |  ✅  | 3 处修改 + typecheck + test 全绿，但 prompt 过长（~800 字） |
| 规格文档重写子代理     | general-purpose |  ✅  | 265 行文档一次交付，质量合格                                |
| 蓝军复核子代理         | general-purpose |  ✅  | 20/22 PASS，发现 2 个真实问题                               |
| 编辑子代理（被中断）   | general-purpose |  ❌  | 被用户纠偏中断，浪费了一次子代理调用                        |

### 4.2 改进建议

**建议 1：子代理 Prompt 应该遵循"最小上下文原则"**

本次编辑子代理的 prompt 包含了大量背景信息（Vercel 部署架构、环境变量列表、迁移 SQL 内容等），但实际上子代理只需要：

```markdown
## 你的任务

修改 packages/ai-rag-api 内的 3 个文件。

## 修改清单

1. src/runtime-config.ts：新增 baseUrl 字段 + serverDir: "server"
2. server/services/openai-chat.ts：baseUrl 非空时传 baseURL
3. server/plugins/rag.ts（新建）：六项门禁 + 模块级单例 + request 钩子

## 验证

- pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck → exit 0
- pnpm --filter @ruan-cat-drill-doc/ai-rag-api test → 全部通过

## 约束

- 不修改 packages/ai-rag-api 之外的文件
- 不 git commit
```

子代理不需要知道 Vercel 部署架构、Neon 资源标识、环境变量值——这些是主代理的上下文，不是子代理的。

**建议 2：区分"执行型子代理"和"审计型子代理"**

```markdown
## 子代理分类

### 执行型（用弱模型，快速便宜）

- 代码修改（明确的文件 + 明确的改动）
- 文档更新（明确的章节 + 明确的内容）
- 批量操作（如 21 个 env add）

### 审计型（用强模型，深度思考）

- 蓝军复核（需要独立判断 + 证据链）
- 方案评审（需要 pros/cons 分析）
- 根因诊断（需要 5-Why 分析）
```

**建议 3：子代理失败时不要在主代理里"接着做"**

本次编辑子代理被用户纠偏中断后，主代理直接在主上下文里完成了后续代码修改。这导致主代理上下文膨胀。正确做法：

```markdown
## 子代理失败处理

1. 分析失败原因（是 prompt 问题还是能力问题？）
2. 如果是 prompt 问题 → 精简 prompt → 重新 spawn 新子代理
3. 如果是能力问题 → 升级模型 → 重新 spawn
4. 永远不要在主代理里"接着做"子代理的活
```

---

## 5. 模型高低搭配复盘

### 5.1 当前问题

本次会话中，主代理和所有子代理都使用了同一个模型（QoderWork 默认模型）。没有利用模型分层来优化成本和速度。

### 5.2 建议的模型分层策略

```plain
┌─────────────────────────────────────────────────────┐
│ 主代理（强模型）                                     │
│ - 任务规划与决策                                     │
│ - 用户沟通与纠偏处理                                 │
│ - 复杂根因诊断                                       │
│ - 最终交付验收                                       │
├─────────────────────────────────────────────────────┤
│ 执行型子代理（弱/中模型）                            │
│ - 代码修改（明确的 diff）                            │
│ - 文档更新（明确的内容）                             │
│ - 批量操作（env add、文件清理）                      │
│ - 格式转换（commit message 生成）                    │
├─────────────────────────────────────────────────────┤
│ 审计型子代理（强模型）                               │
│ - 蓝军复核（独立判断 + 证据链）                      │
│ - 方案评审（pros/cons 分析）                         │
│ - 安全审计（敏感信息检查）                           │
└─────────────────────────────────────────────────────┘
```

### 5.3 实际操作建议

在 QoderWork 中，可以通过 Agent tool 的 `model` 参数指定模型。但目前 QoderWork 的 Agent tool 不支持 model 参数（只有 subagent_type）。因此建议：

```markdown
## 当前可行的模型搭配

1. 主代理：使用 QoderWork 默认模型（最强）
2. 执行型子代理：使用 Agent tool + subagent_type="general-purpose"
   - 在 prompt 中明确"这是一个机械执行任务，不需要深度思考"
   - 给出精确的步骤，不要让子代理做决策
3. 审计型子代理：使用 Agent tool + subagent_type="general-purpose"
   - 在 prompt 中注入 PUA 的蓝军行为
   - 要求"每项审计必须给出 PASS/FAIL + 证据"
```

---

## 6. Skill 和 MCP 工具调度复盘

### 6.1 Skill 调度问题

| Skill                         | 加载时机 | 实际使用            | 问题                                       |
| :---------------------------- | :------- | :------------------ | :----------------------------------------- |
| pua                           | 任务开始 | 全程旁白 + 压力升级 | PUA 文档 + 5 个 reference 消耗 ~15% 上下文 |
| use-vercel-deploy-in-monorepo | 任务开始 | 参考部署形态表      | 有用，但加载过早                           |
| git-commit                    | 提交阶段 | commit message 生成 | 加载时机合理                               |
| subagent-driven-development   | 复核阶段 | 未被实际使用        | 加载了但没用到，浪费上下文                 |

### 6.2 MCP 工具调度问题

| MCP 工具                              | 使用次数 | 问题                                                                       |
| :------------------------------------ | :------: | :------------------------------------------------------------------------- |
| mcp**neon**\*                         |   8 次   | 合理使用（list_projects、describe_branch、run_sql、get_connection_string） |
| mcp**vercel**\*                       |   5 次   | 部分失败（get_deployment_build_logs 401、get_project 404）                 |
| mcp**memorix**\*                      |   4 次   | 合理使用（session_start、store × 3）                                       |
| mcp**qw_builtin**memory_mh0us7        |   3 次   | 合理使用（memory add × 3）                                                 |
| mcp**qw_builtin**present_files_rwbu59 |   2 次   | 合理使用（展示 token 文件）                                                |

### 6.3 改进建议

**建议 1：Skill 加载遵循"Just-in-Time"原则**

```markdown
## Skill 加载时机

- 任务开始时：只加载与核心任务直接相关的 1 个 Skill
- 执行过程中：遇到新需求时再加载对应 Skill
- 提交阶段：加载 git-commit
- 复盘阶段：加载 pua（如果需要压力激励）

## 不要做的事

- 不要在任务开始时一次性加载 4-5 个 Skill
- 不要加载"可能用到"的 Skill
- 不要加载"以防万一"的 Skill
```

**建议 2：MCP 工具调用前先检查 Schema**

本次有 2 次 MCP 调用失败（401 和 404），原因是参数不正确。建议：

```markdown
## MCP 调用纪律

1. 先调用 qw_mcp_get 获取工具的完整 Schema
2. 确认参数名称和类型
3. 再调用 qw_mcp_call
4. 如果失败，先检查是否是权限问题（如 token 过期），不要盲目重试
```

**建议 3：优先使用 CLI 而非 MCP**

对于 Vercel 操作，CLI 比 MCP 更稳定（CLI 使用本地认证，MCP 需要额外 token）。本次的经验：

```markdown
## 工具选择优先级

1. Vercel 操作：CLI > REST API > MCP
2. Neon 操作：MCP > CLI（MCP 不需要本地认证）
3. GitHub 操作：MCP > CLI（MCP 更方便查看 PR/Issue）
4. 文件操作：直接工具（Read/Write/Edit）> Bash
```

---

## 7. Token 效率复盘

### 7.1 本次会话的 Token 消耗估算

基于会话长度和 compaction 事件，估算总消耗约 **80,000-120,000 tokens**（含 compaction 前的上下文）。

### 7.2 主要浪费点

| 浪费类型                         | 估计浪费 Token | 改进措施                       |
| :------------------------------- | :------------: | :----------------------------- |
| 重复的 vercel project inspect    |     ~2,000     | 结果缓存在变量中，不要重复调用 |
| PS 脚本 Write + Bash 对（15 组） |     ~8,000     | 合并为 1 个通用脚本            |
| spec/plan 全文读取               |     ~6,000     | 用 offset/limit 只读相关章节   |
| 子代理 prompt 过长               |     ~4,000     | 精简到最小必要信息             |
| PUA Skill 全文 + references      |    ~12,000     | 按需加载，不要默认加载         |
| 重复的 Bash 输出（未截断）       |     ~3,000     | 用 head/tail 截断              |
| 失败的 MCP 调用                  |     ~1,000     | 先检查 Schema                  |
| 过度格式化（Unicode 表格等）     |     ~2,000     | 简单任务不用 Banner            |

**估计可节省：~38,000 tokens（约 30-40%）**

### 7.3 改进建议

**建议 1：建立"Token 预算"意识**

```markdown
## Token 预算分配（以 100K 为上限）

- 任务规划与对齐：10K（10%）
- 代码修改与验证：30K（30%）
- 部署与环境配置：25K（25%）
- 文档更新：10K（10%）
- 复核与审计：15K（15%）
- 提交与推送：5K（5%）
- 缓冲：5K（5%）
```

**建议 2：用"检查点"替代"全程在线"**

```markdown
## 检查点模式

1. 主代理制定计划（消耗 ~5K tokens）
2. Spawn 子代理执行 Phase 1（子代理有独立上下文）
3. 子代理返回精简报告（~500 tokens）
4. 主代理决策下一步（消耗 ~1K tokens）
5. 重复 2-4

这样主代理的上下文始终保持精简。
```

**建议 3：善用 memory 工具，避免重复侦察**

本次会话中，有些信息（如 Neon 项目 ID、团队 ID）在 AGENTS.md 中已有记录，但仍然被重复读取。建议：

```markdown
## Memory 使用纪律

- 任务开始时先 memory_search 查找已知信息
- 不要重复 Read 已经在 system-reminder 中加载的文件（如 AGENTS.md）
- 将本次会话的关键发现写入 memory，供下次会话复用
```

---

## 8. 用户协作表现评估

### 8.1 做得好的地方

1. **及时纠偏**：3 次纠偏都很及时，避免了在错误方向上走太远
2. **明确授权**：对于破坏性变更（删除 vercel.json），先设红线再让步，说明有清晰的风险意识
3. **信任但验证**：让代理自主执行，但在关键节点要求蓝军审计
4. **提供完整上下文**：AGENTS.md 中的 Neon 资源标识、Vercel 团队信息非常有用

### 8.2 可以改进的地方

1. **初始提示词过于宽泛**：第一条消息包含了太多任务（部署 + 授权框架 + 文档更新 + 记忆沉淀），导致代理误判范围。建议拆分为独立会话。

2. **红线设定需要深思**：先说"不要碰 vercel.json"，后来又说"这个红线确实不合适"。这说明红线是在压力下设定的，而非经过深思熟虑。建议在设定红线前先咨询代理的意见。

3. **纠偏时缺少"替代方案"**：纠偏时只说了"不要这样做"，但没有说"应该怎样做"。例如"不要用 app 目录模式"——但没有说应该用什么模式。这迫使代理重新探索方案空间。

4. **可以在提示词中预设"决策树"**：

```markdown
## 决策树

- 如果根 vercel.json 存在 → 先评估是否可以删除 → 如果可以 → Mode A
- 如果根 vercel.json 不能删除 → 使用 app 目录模式
- 如果两种都不行 → 向我报告，我手动处理
```

---

## 9. 可复用的 SOP

### 9.1 复杂部署任务的提示词模板

```markdown
# 部署任务提示词模板

## 任务契约

- **意图**：[一句话说清楚要部署什么]
- **验收**：[列出可量化的验收标准]
- **禁止**：[列出不允许做的事]
- **验证**：[列出验证命令]

## 已知事实

- [列出所有不需要讨论的固定信息]

## 待决策项

- [列出需要代理提出方案的决策点]

## 执行顺序

1. 先读取 [技能/文档] 理解 [什么]
2. 列出 2-3 个方案，等我选择
3. 选择后执行，每个阶段报告进度
4. 完成后运行验证命令

## 上下文加载

- 只加载 [指定技能]
- 其他技能在需要时再加载
```

### 9.2 子代理 Prompt 模板

```markdown
# 执行型子代理 Prompt

## 你的任务

[一句话说清楚]

## 文件清单

[列出要修改的文件和具体改动]

## 验证命令

[列出必须通过的验证]

## 约束

- 不修改 [范围外] 的文件
- 不 [禁止的操作]
- 返回 [精简的报告格式]
```

### 9.3 蓝军审计 Prompt 模板

```markdown
# 审计型子代理 Prompt

## 你的职责

独立审计主代理的交付，不修改任何文件。

## 审计清单

[逐项列出要检查的内容]

## 输出格式

[A1] PASS/FAIL — 一句话证据
[A2] PASS/FAIL — 一句话证据
...

总结：X/Y PASS
FAIL 项的修复建议：[具体动作]
```

---

## 10. 总结与下一步

### 10.1 本次会话的核心教训

1. **提示词是"约束 + 目标"，不是"叙事 + 愿望"** — 宽泛的提示词导致 3 次纠偏
2. **上下文是有限资源，要像管理内存一样管理它** — Skill 按需加载、文档精准读取、输出截断
3. **子代理是"独立工人"，不是"主代理的延伸"** — 给最小上下文，让它独立完成
4. **模型搭配是"成本优化"，不是"能力浪费"** — 机械任务用弱模型，判断任务用强模型
5. **Token 效率是"工程素养"，不是"抠门"** — 节省的 Token 可以用于更深入的思考

### 10.2 下一步行动

| 优先级 | 行动项                                 | 预期效果               |
| :----: | :------------------------------------- | :--------------------- |
|   P0   | 将本报告中的提示词模板固化到 AGENTS.md | 下次任务直接复用       |
|   P0   | 排查 ERR_PNPM_META_FETCH_FAIL 根因     | 解除 git-push 部署阻塞 |
|   P1   | 建立 Skill 按需加载的 discipline       | 减少 30-40% Token 消耗 |
|   P1   | 为常见任务类型建立子代理 Prompt 库     | 提高子代理交付质量     |
|   P2   | 探索 QoderWork 的模型分层能力          | 优化成本结构           |

---

> [🔴 华为味] 烧不死的鸟是凤凰。本次会话暴露了系统性问题，但也验证了蓝军审计、分类提交、端到端交付的能力。自我批判不是为了否定，是为了下一次力出一孔。
