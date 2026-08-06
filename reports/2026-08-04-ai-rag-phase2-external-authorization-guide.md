# 2026-08-04 AI RAG 二期外部授权与自主测试解锁指南

## 1. 结论先行

当前 goal 暂停是正确的门禁结果，不是本地代码失败。现有 PostgreSQL provider 已经有离线合同和测试证据，但这些证据只能说明“给定 executor 时，SQL、参数、行映射和输入约束成立”，不能说明真实数据库已经连接、真实 pgvector 已启用、真实索引已经工作，或生产 `event.context.rag` 已经装配。

要继续推进，需要把授权和证据分成五层逐级放行：开发数据库只读核对、开发数据库写入与 migration、真实 embedding 调用、生产部署与线上回归、演示视频录制与上传。每层都应有明确目标、预算、停止条件和脱敏记录。不能用一条模糊的“可以继续”同时授权数据库写入、付费模型调用和生产部署。

## 2. 为什么这些事项会导致 goal 暂停

### 2.1 本地合同和真实 provider 是两个不同验收层级

离线合同使用调用方注入的 executor，因此测试可以验证 SQL 文本和参数，却不会创建 PostgreSQL 连接。它能证明以下内容：

- 词法查询使用参数化 `websearch_to_tsquery('simple', $1)`。
- 向量查询使用 `embedding <=> CAST($1 AS vector)`，并将距离映射为相似度。
- 输入向量的有限数值、`1536` 维、分页参数和畸形数据库行受到校验。
- provider 方法和 runtime assembly 的类型边界可以被 fake provider 消费。

它不能证明以下内容：

- 目标数据库确实是预期的 Neon/PostgreSQL database，且 `vector` extension 已在该 database 启用。
- migration 在真实数据库执行成功，`vector(1536)` 列和 HNSW `vector_cosine_ops` 索引确实存在。
- PostgreSQL 真实执行计划、中文词法命中、向量查询结果和索引召回质量符合预期。
- embedding 服务真的返回 `1536` 维向量，并且真实向量已经写入目标数据库。
- Nitro 生产入口确实把真实 provider 挂载到 `event.context.rag`。

因此，把离线合同标为“真实 PostgreSQL provider 完成”会制造证据越级，goal 必须停在候选状态。

### 2.2 外部系统具有副作用，代理不能替用户猜授权

真实验证会触发至少四类外部副作用：

- 数据库 migration 可能改变 schema、extension 和索引。
- 同步和 embedding 会产生数据库写入，并可能产生按量计费的模型请求。
- Vercel 部署会改变可访问的运行版本和环境绑定。
- 真实模型调用、浏览器回归和视频上传会产生外部网络流量或公开内容。

这些动作的目标环境、数据范围、费用上限和回滚方式不能从“继续推进二期”自动推断。缺少明确授权时，继续执行会把开发验证误扩展到生产变更，或把测试数据发送到外部模型。

### 2.3 目前的暂停项是相互依赖的证据链

真实 provider 不只是“能连上数据库”一个点。完整链路如下：

```text
真实 Neon/PostgreSQL
  -> pgvector extension / vector(1536) / HNSW
  -> 真实 embedding 写入
  -> lexical + vector + hybrid 查询
  -> 增量同步事务、失败回滚、advisory lock
  -> Nitro event.context.rag 装配
  -> 真实模型 /v1/chat 流式响应
  -> Vercel 部署与线上浏览器回归
  -> 演示视频
```

上游没有证据，下游就不能被描述为完成。例如，只有数据库查询成功，不能推出生产 chat 已接入；只有本地 UI 测试通过，不能推出生产 hydration 或逐 token Shiki 高亮兼容。

## 3. 当前状态和正确口径

### 3.1 可以直接描述为本地完成的内容

- PostgreSQL provider 的离线 SQL、参数、行映射、`1536` 维和余弦距离合同。
- Nitro 路由在未装配 RAG 时返回 `503 RAG_NOT_CONFIGURED` 的失败合同。
- fake provider 下的 runtime assembly、chat/search/sync 路由测试。
- 本地结构化 chunk、来源 URL、RRF 和 dry-run 知识准备。
- 本地 Chat UI、`@ai-sdk/vue` transport/abort 和 `markstream-vue` renderer 的已覆盖范围。

### 3.2 必须继续使用候选或待外部证据的口径

|:---|:---|:---|
| 状态 | 允许的描述 | 禁止的描述 |
|:---:|:---:|:---:|
| 离线候选 | “PostgreSQL provider 离线合同已实现，待独立复核和真实数据库验证” | “PostgreSQL provider 已完成” |
| 开发验证 | “已在指定 development database 验证 migration/查询/同步” | “生产数据库已完成” |
| 生产验证 | “已在指定 Vercel 环境完成线上回归” | “所有环境都已验证” |
| 演示材料 | “已录制并验证演示视频” | “功能天然可演示” |

### 3.3 为什么独立复核仍然必要

本地测试由实现者编写和运行，属于 candidate evidence。独立复核需要另一条视角确认：测试没有只验证 mock、没有把测试替代真实连接、没有遗漏失败路径，也没有把 `503` 或 fake stream 当成真实 provider 成功。独立复核记录至少应包含复核人或复核 agent、复核范围、实际命令、输出摘要、未覆盖项和最终 verdict。

## 4. 授权应该怎么给

### 4.1 授权的基本原则

- 不要在聊天、报告、终端输出或测试快照中粘贴密码、连接串、API key、token 或 cookie。
- 授权“使用当前机器上已经认证的 CLI 和当前环境变量”，不要授权代理读取或转述秘密值。
- 明确是 `development`、`preview` 还是 `production`。默认只允许 development。
- 明确允许的写入范围、最大文件数、最大 embedding 请求数和费用上限。
- 明确是否允许 migration、数据库写入、Vercel 部署、真实模型调用、浏览器访问和视频上传。
- 每一层授权都应有停止条件；达到停止条件时先交付证据，不自动升级下一层。

### 4.2 推荐的分级授权表

|:---|:---|:---|:---|
| 等级 | 你明确授权的动作 | 预期副作用 | 必须产出的证据 |
|:---:|:---|:---|:---|
| A0 | 运行本地测试、typecheck、build、CodeGraph、静态检查 | 无外部写入 | 命令、退出码、测试数量、未覆盖边界 |
| A1 | 使用已认证 `vercel`/`neon` 做资源只读核对，拉取 development 环境变量 | 读取资源；生成本地 env 文件 | project/branch/database 脱敏标识、变量名清单、无秘密值日志 |
| A2 | 对指定 development database 执行 migration、SQL smoke test 和受控测试数据写入 | schema、索引和测试数据改变 | migration 结果、extension/column/index 查询、数据行数、清理或回滚结果 |
| A3 | 对指定 development database 运行真实 embedding 和增量同步 | 外部模型请求、数据库写入、模型费用 | 请求计数、维度验证、sync run、失败回滚、锁竞争和费用摘要 |
| A4 | 部署 Vercel preview，访问真实 `/v1/chat` 和页面 | 产生预览部署和外部模型请求 | deployment URL、构建日志摘要、API/浏览器回归、环境名 |
| A5 | 部署 production、线上回归、录制或上传视频 | 生产变更和公开内容 | 生产 URL、回滚点、线上回归、视频地址和访问验证 |

### 4.3 推荐授权消息模板

你可以在准备好后按下面模板给出授权。请把未授权项保留为“否”，不要用“全部允许”代替逐项确认。

```text
授权范围：SmallAliceWeb AI RAG 二期
允许工作目录：D:\code\ruan-cat\SmallAliceWeb
目标环境：development / preview / production（只选明确环境）
Neon 资源：复用 patient-cloud-43432277，数据库 neon-smallalice-ai-rag；禁止新建同用途资源
允许 A0 本地验证：是/否
允许 A1 只读资源核对和拉取 development 环境变量：是/否
允许 A2 development migration、SQL smoke test、测试数据写入：是/否
允许 A3 development 真实 embedding 和同步：是/否
允许 A4 Vercel preview 部署和真实 API/浏览器回归：是/否
允许 A5 production 部署、线上回归、视频录制或上传：是/否
embedding 限制：最多 ___ 个文本，费用上限 ___，允许的模型 ___
数据库写入限制：仅 development；允许 migration 是/否；允许写入的表 ___
测试数据：仅使用脱敏/合成内容，是/否
停止条件：出现非预期环境、权限错误、费用超限、数据不一致或 secrets 泄露迹象时立即停止
证据保存位置：.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/ 或其他指定目录
```

如果只想解锁 PostgreSQL provider 的开发证据，建议先只授权 A0+A1+A2；不要同时授权 A4+A5。这样可以先完成最小真实闭环，再依据证据决定是否扩大范围。

## 5. 我需要的工具和环境前提

### 5.1 本地工具

- PowerShell、Node `>=22.14.0`、pnpm 和仓库已有依赖。
- 官方 `neon` CLI，且由你完成安装和认证。
- `vercel` CLI，且已绑定既有关联项目或能通过现有登录状态访问。
- 可运行的 Vitest、TypeScript、Nitro/Vercel build 工具链。
- 可控的 Chrome/CDP 或项目已配置的浏览器验证能力，用于真实页面 hydration、流式内容、中止和来源跳转。

### 5.2 禁止的工具路径

Windows 环境禁止使用 `neonctl`、其包装器和通过 `npx` 临时安装的同名命令。执行云端动作前先运行：

```powershell
pnpm run neon:guard
```

只有守卫通过，并且你确认官方 `neon` CLI 已认证后，才能继续资源核对。不要为了“只读检查”绕过守卫。

### 5.3 环境变量和秘密处理

按项目既定顺序，先拉取 development 环境变量，再让 Nitro 或脚本使用它们：

```powershell
vercel env pull .env.local --environment=development
```

实际变量名以拉取结果为准。连接串、API key、token 和 cookie 只能留在本机受保护的环境文件或进程环境中，不能输出到终端、报告、JSON 快照、测试 fixture、Git diff 或视频画面。应用使用 pooled URL，Drizzle migration 使用非 pooled URL；缺少非 pooled URL 时停止，不用 pooled URL 冒险迁移。

## 6. 建议的自主测试顺序

### 6.1 第一步：先完成 A0，本地证据冻结

先运行当前工作区可以独立复核的检查：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-rag-api test
pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck
git diff --check
```

记录包级测试文件数、用例数、typecheck 退出码和当前未覆盖边界。不要因为 A0 通过就改变真实 provider 的状态。

### 6.2 第二步：A1 只读确认真实资源

先执行 `pnpm run neon:guard`，再只读核对固定资源和目标 development branch。核对结果至少包括：

- project ID、branch ID、database 名称是否与授权目标一致。
- 当前账号是否有读取和后续 development 写入所需的权限。
- `.env.local` 是否来自正确的 Vercel environment，且不是 production 值。
- pooled URL 和非 pooled URL 是否分别存在，变量名是否已经确认。

任何资源名称、环境或 branch 不一致都应停止，不要通过猜测选择“看起来最像”的目标。

### 6.3 第三步：A2 验证 pgvector 和真实检索

只对指定 development database 执行首个 migration，然后用真实数据库查询确认：

1. `vector` extension 在目标 database 中存在。
2. `chunks.embedding` 的实际类型是 `vector(1536)`。
3. HNSW 索引使用 `vector_cosine_ops`，并与 `<=>` 查询一致。
4. 词法查询的参数化 SQL 能对真实中文和技术术语 fixture 返回结果。
5. 向量查询能接受真实 `1536` 维向量并返回可映射行。
6. 精确检索和 HNSW 检索在固定评估集上的结果差异已经记录，不能只看到索引存在就宣称召回质量通过。

测试数据必须是少量、脱敏或合成内容。每次写入后都记录插入数量、查询数量和清理结果；如果 migration 失败、目标不明、行映射异常或维度不一致，立即停止在 A2。

### 6.4 第四步：A3 验证 embedding 和同步事务

真实 embedding 只在 A3 明确授权后执行，先用一小批合成 fixture 验证：

- provider 返回有限数值且长度固定为 `1536`。
- 新文件能写入 document/chunk 和同步记录。
- 未变化文件不会重复调用 embedding。
- 单文件 embedding 或写入失败时，旧 chunk 仍可检索，失败文件进入 `knowledge_sync_runs`。
- 文件清单不完整或扫描失败时，不删除数据库中可能暂时缺失的旧 sourcePath。
- 两个并发同步只有一个持有 PostgreSQL advisory lock，另一个得到可识别的冲突结果，而不是两个实例同时写入。
- 同一文档替换在事务中完成；模拟中途失败后不能出现新旧 chunk 混合的半成品状态。

每次运行应保存脱敏的 sync run、embedding 请求计数、失败文件、锁竞争结果和最终数据库计数。费用上限或请求数量达到授权阈值就停止。

### 6.5 第五步：A4 验证真实生产装配和 preview

先在本地真实 Nitro server 或 Vercel preview 中确认装配入口，而不是只调用 fake factory：

- runtime config 来自私有配置，不从裸 `process.env` 偷读。
- 真实 database、embedding、model provider 被显式创建并挂载到 `event.context.rag`。
- 未配置时仍返回 `503 RAG_NOT_CONFIGURED`，不能以空检索或默认模型返回 `200`。
- `/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs` 和 `/v1/chat` 都消费同一真实装配上下文。
- `/v1/chat` 返回真实 AI SDK data stream，来源 DTO、`sourceHref`、EOF 和错误状态可被客户端解析。

preview 通过后，才讨论 production。部署前检查 build 输入确实包含 `docs/docx`，不能依赖 Vercel 函数运行时恰好保留 Git 工作区。

### 6.6 第六步：A5 线上浏览器、hydration、Shiki 和视频

只有 production 授权明确后，才执行 production 部署和线上回归。真实浏览器验收至少覆盖：

- 首屏 SSR/客户端 hydration 无错误，页面没有空白或重复挂载。
- 输入问题后真实 `/v1/chat` 流式内容逐段可见，来源可点击并跳到稳定标题锚点。
- 点击停止后 AbortSignal 生效，已经收到的内容保留，按钮状态收敛。
- 表格、未闭合代码块、长回答、原始 HTML 和危险 URL 仍符合安全策略。
- `markstream-vue` 自带的 `codeRenderer="shiki"` 或已验证的兼容入口才可以作为逐 token 高亮证据；当前不能把独立 `@shikijs/stream` API spike 直接当成兼容完成。

视频应在以上路径全部通过后录制。录制前检查画面不能出现连接串、token、内部 URL、个人数据或调试面板；上传还需要单独的 A5 外部发布授权。

## 7. 证据包应该长什么样

### 7.1 每次执行的最小记录

```text
runId:
执行时间（Asia/Shanghai）：
操作者授权等级：A0/A1/A2/A3/A4/A5
工作目录：
目标环境：development/preview/production
目标资源：project/branch/database 的非敏感标识
命令模板：不含连接串、密码、token
退出码：
结果摘要：
未覆盖项：
停止原因（如有）：
```

### 7.2 证据的独立复核要求

独立复核人或 verifier 不应只读实现者的结论，而应检查：

- 日志中的环境和资源确实与授权一致。
- 查询是实际执行过的，不是从测试 fixture 推断出来的。
- 真实写入前后计数、事务状态和清理结果相互一致。
- 失败路径和并发路径有原始输出，而不是只有成功路径截图。
- 生产部署、浏览器、模型请求和视频状态没有被本地测试替代。

最终状态建议使用以下状态机：

```text
candidate
  -> independently-reviewed
  -> development-verified
  -> preview-verified
  -> production-verified
  -> demo-ready
```

实现者可以提交 candidate 和证据包，但不能仅凭自报把状态晋级为 production-verified。每次晋级都要保留对应 verifier 记录或用户明确确认的外部证据。

## 8. 什么时候应该停止而不是继续尝试

遇到以下任一情况，停止当前等级并报告证据，不要盲目重试：

- 目标 project、branch、database 或 Vercel environment 与授权不一致。
- 只有 pooled URL，没有用于 migration 的非 pooled URL。
- CLI 登录状态不明、权限不足或需要用户重新认证。
- embedding 返回维度错误、非有限数值或费用超过上限。
- 同步失败后旧数据不可检索，或出现半成品 chunk。
- advisory lock 未生效，两个同步同时写入。
- 真实 `/v1/chat` 仍由 fake provider、默认模型或空检索兜底。
- 线上页面出现 hydration、CORS、流式协议、来源跳转或 XSS 回归。
- 需要上传视频但尚未得到外部发布授权。

这些停止条件不是拖延，而是防止把一个局部成功包装成二期完成。目标是让每个结论都能由另一人使用相同资源和命令复核。

## 9. 本轮报告结论

本轮可以完成的是授权方案和证据 SOP，不能在未得到分级授权前替用户执行真实数据库写入、付费 embedding、生产部署或视频上传。下一次继续时，最小可行入口是用户明确回复 A0+A1+A2 的授权模板；完成 development provider、migration 和真实查询证据后，再单独评估是否放行 A3。

本报告引用的项目约束来源为：

- `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 的 Neon/pgvector 与 CLI 门禁章节。
- `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 的当前本地成果、真实数据库、同步事务、生产装配、浏览器和演示边界。
- `reports/2026-07-31-neon-cli-enforcement.md` 的 Windows `neonctl` 事故和官方 `neon` 替代路径。
