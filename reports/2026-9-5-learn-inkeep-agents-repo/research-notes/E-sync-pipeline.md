# 探索笔记 E：知识同步管线现状

> 调研日期：2026-09-25。范围：`packages/ai-rag-api` 知识同步（knowledge sync）管线的源码现状，供主代理评估「markdown → chunk → embedding → Neon 写入」管线的定时调度方案（候选 a：Vercel Cron；候选 b：GitHub Actions schedule）。所有引用均为真实 file:line。

## 一、管线全景

从 markdown 到 Neon 的完整流程（文字版）：

```log
docs/docx/**/*.md  (当前 290 个 .md 文件, find 统计)
        │  ① 扫描: scanKnowledgeSources 递归枚举 .md, sourcePath=相对仓库根、"/"分隔、按路径排序
        │     packages/ai-rag-api/server/services/knowledge-source.ts:54-73,93-144
        ▼
每文件 sha256(content)  ← 与 documents 表现有 contentHash 对比 (增量判断, 见第二章)
        │  未变更 → 计入 unchangedFileCount, 直接跳过
        ▼
② chunk: chunkMarkdown(content, sourcePath)  来自 @ruan-cat-drill-doc/ai-rag-core
        packages/ai-rag-api/server/services/knowledge-sync.ts:106-108
        ▼
③ embedding: Cloudflare Workers AI @cf/baai/bge-m3, 1024 维, OpenAI 兼容端点
        server/providers/cloudflare-embedding.ts:1-3,42-44
        服务层每 100 条文本一批: knowledge-sync.ts:474-485
        Cloudflare 400/413 时二分递归降批: knowledge-sync.ts:488-514
        ▼
④ 写入 Neon (单文档事务, 每文件一个事务):
        DELETE chunks WHERE document_id → UPSERT documents → 逐 chunk INSERT (含 vector literal)
        knowledge-sync.ts:305-356, 576-578
        ▼
⑤ 同步记录持久化 knowledge_sync_runs 表 (扫描数/未变数/新增/更新/删除/chunk数/失败列表/状态)
        knowledge-sync.ts:221-224, 407-421
```

运行时装配：HTTP 与 CLI 共用 `createRagRuntime`（`server/runtime/rag-runtime.ts:174-233`），scanner 固定绑定 `repositoryRoot/docs/docx`（`rag-runtime.ts:181-188`，若 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向别处直接抛错）。`prepareKnowledgeBase`（`server/services/prepare-knowledge.ts:15-26`）是纯只读准备层，供 dry-run CLI 复用同一扫描与 chunk 合同，不写库。

## 二、增量机制

同步是**真增量**，content_hash 四元组对比已实现并生效：

1. 每轮先全量读取 documents 表的现有行（sourcePath / contentHash / profileVersion / embeddingModel / preprocessingVersion）：`knowledge-sync.ts:227-236`。
2. 对每个扫描文件计算 `sha256(全文 utf8)`：`knowledge-sync.ts:247,536-542`。
3. 跳过条件（四者同时满足）：contentHash 相同 且 profileVersion 相同 且 embeddingModel 相同 且 preprocessingVersion 一致：`knowledge-sync.ts:248-258`。未变更文件计入 unchangedFileCount 后 `continue`，**不发生 chunk 切分、不调用 embedding、不写库**。
4. 未跳过文件：重新 chunk + embedding，成功后单文档事务原子替换旧版本（先删旧 chunks）；失败时旧版本保持可检索：`knowledge-sync.ts:260-369`（对应 spec「单文档事务替换旧版本」`openspec/specs/ai-rag/knowledge-sync/spec.md:107-112`）。
5. 删除对账仅在扫描完整（`scan.complete && failedFiles.length === 0`）时执行：`knowledge-sync.ts:379-394`；扫描不完整绝不删旧数据（spec.md:114-118）。
6. 幂等 ID：document/chunk 主键由 `sha256(kind\0sourcePath\0index)` 派生（`knowledge-sync.ts:544-553`），重复同步不会产生新 ID。
7. 并发互斥：`pg_try_advisory_lock(2026081902)`（`knowledge-sync.ts:100,168-179`），锁由每轮同步独占保留的 non-pooled 连接持有（`rag-runtime.ts:145-171,213-220`），冲突方收到 409。上轮遗留 `running` 记录在新一轮开始时被标 failed（`knowledge-sync.ts:180-183`）。
8. `maxEmbeddingTexts` 未在真实 runtime 接线（`rag-runtime.ts:213-229` 未传），默认 `Number.MAX_SAFE_INTEGER`（`knowledge-sync.ts:112-113`），即不设上限。

spec 已固化的增量语义（`openspec/specs/ai-rag/knowledge-sync/spec.md`）：Requirement 3「增量对账与幂等」（:91-118）、Requirement 5 三种触发复用同一同步服务 + advisory lock + non-pooled URL（:138-157）、Requirement 6 批量 embedding ≤100 条/请求 + 1024 维校验（:164-184）、Requirement 7 只读 dry-run CLI（:186-199）。dry-run 语义：HTTP body `{ dryRun: boolean }`（`server/contracts/schemas.ts:21-23`）与 CLI `--dry-run`（`server/cli/local-sync.ts:69-78`）都只做扫描+chunk 统计，不写库、不生成 embedding（`knowledge-sync.ts:196-219`）。

## 三、两种触发路径对比

|      对比维度      |                                                          CLI（tsx 脚本）                                                           |                                                       HTTP（Nitro 端点）                                                       |
| :----------------: | :--------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------: |
|      入口命令      |                                                 `pnpm run rag:sync` / `rag:watch`                                                  |                       `POST /v1/knowledge/sync`、`GET /v1/knowledge/sync`、`GET /v1/knowledge/sync-runs`                       |
|      入口文件      |                                      `scripts/rag-sync.ts:1-12`、`scripts/rag-watch.ts:1-21`                                       |                  `server/routes/v1/knowledge/sync.post.ts:6-28`、`sync.get.ts:6-28`、`sync-runs.get.ts:7-17`                   |
|        参数        |                                      仅支持 `--dry-run`，多余参数报错（local-sync.ts:69-74）                                       |                       POST body `{dryRun}`（schemas.ts:21-23）；GET 无 body，dryRun 默认 false 即真同步                        |
|        鉴权        |                                             不经过 token 鉴权（local-sync.ts:66 注释）                                             |           POST 需 `Bearer NITRO_KNOWLEDGE_SYNC_TOKEN`（auth.ts:24-26）；GET 需 `Bearer CRON_SECRET`（auth.ts:21-23）           |
|     服务层来源     |                              `createLocalRagRuntime`（local-sync.ts:47-64）→ 同一 `createRagRuntime`                               |                             Nitro plugin 惰性装配（plugins/rag.ts:12-28）→ 同一 `createRagRuntime`                             |
|      执行模式      |                              进程内同步执行，无平台超时；watch 模式 500ms 去抖（local-sync.ts:31-34）                              | **同步等待**：`handleSyncRequest` 内 `await deps.sync`（contracts/handlers.ts:98-100），非异步任务，受 serverless 函数时长限制 |
|    知识源可达性    | **本地有 docs/docx；CI checkout 内没有**（该目录被 .gitignore:55 忽略，origin/main 不含知识源——2026-09-29 实测修正，详见下方批注） |  依赖 Vercel 函数运行时能读到 docs/docx（deployment spec Requirement 6，`openspec/specs/ai-rag/deployment/spec.md:146-148`）   |
|    失败返回形态    |                                          stdout JSON + exitCode 1（local-sync.ts:83-86）                                           |                                 HTTP 状态码 + JSON（401/403/409/503/500，handlers.ts:101-106）                                 |
| advisory lock 行为 |                                                     同样申请锁，冲突时报错退出                                                     |                               冲突返回 409 KNOWLEDGE_SYNC_CONFLICT（knowledge-sync.ts:172-178）                                |

两条路径**共用同一服务层**且被 spec 固化：「一次性命令、POST 与 Cron 三种触发方式 MUST 复用同一同步服务」（`openspec/specs/ai-rag/knowledge-sync/spec.md:138,150`）。

## 四、CI 可运行性核查

### 4.1 候选 b（GitHub Actions 跑脚本直连 Neon）：可行

入口命令：

```log
pnpm install                      # 根 workspace 安装（tsx 在根 devDependencies, 根 package.json:91）
pnpm --filter @ruan-cat-drill-doc/ai-rag-core run build   # 必须先构建 core（无 prerag:sync 钩子, rag-sync 间接依赖其产物）
pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync # scripts/rag-sync.ts
```

脚本形态：`scripts/rag-sync.ts` 是普通 tsx 顶层 await 脚本，把 `process.env` 注入 `createLocalRagRuntime`（rag-sync.ts:5-10），用 Node `postgres` 客户端直连 Neon（rag-runtime.ts:189,216-219），无 HTTP 依赖。~~GitHub Actions checkout 内天然有 docs/docx（290 个 md）~~ **此断言已被证伪（2026-09-29 GA 首跑实测）**：docs/docx 整目录被 .gitignore 忽略，CI checkout 内没有任何知识源。CI job 上限 6 小时，远超全量重建所需。

必需环境变量清单（来自 `createLocalRagRuntime` 的映射 `local-sync.ts:50-62` + 配置门禁 `rag-runtime.ts:19-27,177-179` + `rag-assembly.ts:124-134`）：

|                    环境变量                     |           必需性            |                                      用途                                      |
| :---------------------------------------------: | :-------------------------: | :----------------------------------------------------------------------------: |
|               NITRO_DATABASE_URL                |          必需非空           |                       检索库连接（pooled Neon URL 即可）                       |
|             NITRO_SYNC_DATABASE_URL             |          必需非空           | 每轮同步独占连接持有 advisory lock，**必须 non-pooled URL**（spec.md:156-157） |
|              NITRO_EMBEDDING_MODEL              |          必需非空           |                               embedding 模型标识                               |
|           NITRO_CLOUDFLARE_ACCOUNT_ID           |          必需非空           |                               Cloudflare 账户 ID                               |
|           NITRO_CLOUDFLARE_API_TOKEN            |          必需非空           |                              Cloudflare API token                              |
|           NITRO_KNOWLEDGE_SYNC_TOKEN            |          必需非空           |                           仅门禁要求非空，CLI 不消费                           |
|                NITRO_CRON_SECRET                |          必需非空           |                           仅门禁要求非空，CLI 不消费                           |
| NITRO_OPENAI_API_KEY 或 NITRO_ANTHROPIC_API_KEY | 必需非空（按激活 provider） |            聊天模型 provider 初始化门禁（rag-assembly.ts:128-134）             |
|              NITRO_REPOSITORY_ROOT              |           可省略            |                         rag-sync.ts:4-5 自动置为仓库根                         |
|           NITRO_KNOWLEDGE_SOURCE_ROOT           |           可省略            |            缺省 repositoryRoot/docs/docx（rag-runtime.ts:182-184）             |

注意：`NITRO_KNOWLEDGE_SYNC_TOKEN` 与 `NITRO_CRON_SECRET` 虽然对 CLI 无功能作用，但 `requiredConfigFields` 门禁要求**非空**否则整个 runtime 拒绝装配（rag-runtime.ts:177-179）——CI 里随便填占位值即可。取值方式：`vercel env pull .env.local --environment=development`（deployment spec.md:63）。

阻塞点：无硬阻塞。软性注意——GH Secrets 需要维护上述 8 个非空变量；Neon non-pooled URL 是敏感连接串，只能走 Secrets。

### 4.2 候选 a（Vercel Cron → GET /v1/knowledge/sync）：端点就绪，配置缺位

- GET 端点注释即「Vercel Cron 使用 CRON_SECRET 触发的同一同步服务入口」（sync.get.ts:5），鉴权兼容平台注入的 `Authorization: Bearer $CRON_SECRET`（auth.ts:21-23），Vercel 自动注入的 Cron secret 与 `NITRO_CRON_SECRET` 一致即通过。
- spec 已固化为 Requirement（knowledge-sync spec.md:146-150；deployment spec.md:140-148），包括 `NITRO_CRON_SECRET` 跨三环境接线（deployment spec.md:63）。
- 但**仓库当前无任何 crons 调度配置**：根 vercel.json 已删除且 MUST NOT 重建（deployment spec.md:65-67；AGENTS.md「Vercel 双项目部署架构」）；2026-08-07 设计文档明确记录「Vercel Cron 未配置……本任务不配置 Cron；同步可由携带 Bearer token 的 POST 请求手动触发」（`docs/superpowers/specs/2026-08-07-nitro-api-vercel-deploy-design.md:240`，原因是根 vercel.json 删除 + Vercel 套餐限制）。要启用需走 Vercel Project Settings（Dashboard 或 `vercel.json` 于 Nitro 项目目录）新增 cron，属配置层工作。
- serverless 时长风险：同步在单个请求内同步等待完成（handlers.ts:98-100）。**增量未变更轮**只做「读 290 个文件 + 读 documents 表哈希对比」，无 embedding 与写库，秒级，适合较高频 cron；**首轮全量 / 模型或预处理版本变更触发的全量重建**为逐文件串行（每文件 1 次 embedding HTTP 调用，最多 100 条/批，chunk 多时内部再分片，knowledge-sync.ts:478-484），290 文件线性累加，很可能超出 Vercel Hobby 60s（cron 同样受限）或 Pro 默认 300s。超时中断时函数被杀，run 记录停留 running，直到下一轮把它标 failed（knowledge-sync.ts:180-183）。
- 另一既有边界：docs/docx 是否真的进入 Vercel 函数运行时是 spec 的 MUST（deployment spec.md:146-148），历史上被记录为「已知边界」待部署输入设计解决（design doc:236）；GA 直跑脚本无此问题。

## 五、关键发现

1. **增量是真增量且成本低**：跳过判定为 sha256 内容哈希 + profileVersion + embeddingModel + preprocessingVersion 四元组一致（`knowledge-sync.ts:248-258`）。未变更轮零 embedding 调用、零写库，只有目录扫描 + 一次 documents 表全读。定时调度频率的主要成本是「重复读 290 个 md 文件」，边际成本极低；高变更成本只出现在文件实际修改后。
2. **三种触发方式共用同一 `createKnowledgeSyncService`**，CLI 经 `createLocalRagRuntime`（local-sync.ts:47-64）、HTTP 经 Nitro plugin（plugins/rag.ts:12-28）汇入同一 `createRagRuntime`（rag-runtime.ts:174-233），且被 spec 固化（knowledge-sync spec.md:138,150）——调度方案换成哪种都不会产生语义分叉。
3. **候选 a（Vercel Cron）只差配置层**：GET 端点、`CRON_SECRET` 鉴权、spec 条款全部就绪（sync.get.ts:5、auth.ts:21-23、deployment spec.md:140-148），仓库无 crons 配置且根 vercel.json 被禁（deployment spec.md:65-67），设计文档明确当时因套餐限制不配置（design doc:240）。启用需在 Vercel 侧补 cron 调度 + 确认 CRON_SECRET 已接线。
4. **候选 b（GitHub Actions）可直跑，但有 8 个非空环境变量门禁**：`NITRO_SYNC_DATABASE_URL`（必须 non-pooled）、`NITRO_CLOUDFLARE_ACCOUNT_ID/API_TOKEN`、`NITRO_EMBEDDING_MODEL`、`NITRO_DATABASE_URL`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET`、聊天 provider key，缺一 runtime 直接抛错（rag-runtime.ts:19-27,177-179）；且 CI 必须先 `pnpm --filter @ruan-cat-drill-doc/ai-rag-core run build`（无 prerag:sync 钩子，rag-sync 间接 import core 产物）。
5. **HTTP 同步是同步等待模式，全量重建有 serverless 超时风险**：`handleSyncRequest` 直接 `await deps.sync`（handlers.ts:98-100），无异步任务/轮询机制。写入为逐文件事务、逐 chunk INSERT（knowledge-sync.ts:305-356），无 COPY 批量；290 文件全量时串行 embedding 调用线性累加。若走 Vercel Cron，适合「未变更轮高频 + 全量重建交给别处」的组合；GA 直跑无此限制（job 上限 6h）。
6. **并发与幂等护栏完备**：non-pooled 会话上的 `pg_try_advisory_lock` 拒绝并发同步返回 409（knowledge-sync.ts:100,168-179；spec.md:152-157）；文档/chunk 主键内容派生幂等（knowledge-sync.ts:544-553）；删除对账仅在扫描完整时执行（knowledge-sync.ts:379-394）。调度重叠（cron 重入、手动触发撞车）不会损坏数据，只会 409。
7. **`maxEmbeddingTexts` 与 `syncRuns` 游标未接线**：前者默认无限（rag-runtime.ts:213-229 未传、knowledge-sync.ts:112-113）；`syncRunsQuerySchema` 有 `cursor` 字段（schemas.ts:25-30）但服务端只按 limit 查询（knowledge-sync.ts:131-140）——对定时调度无影响，但对「超大规模知识源失控」缺少一道保险丝。

---

## ⚠️ 2026-09-29 重要修正批注

本笔记「候选 a（GA 直跑 CLI）」的前提「GitHub Actions checkout 内天然有 docs/docx（290 个 md）」**已被实测证伪**：`docs/docx` 整目录在 `.gitignore:55` 被忽略（本地由 DOCX 转换管线生成的产物），`origin/main` 不含任何知识源文件。GA 首跑（run 36569710912）workflow 层 exit 0，但同步层真实统计为 `status:"partial", scannedFileCount:0, failedFiles:["docs/docx"]`——CI 内扫 0 个文件。

**推论**：GA 直跑 CLI 的同步能力当前**不成立**，push `paths: docs/**` 触发与 schedule 兜底轮都会扫 0 文件。知识库数据的生产事实源目前是**本地 CLI 同步**（本地连 Neon 写入）。知识源分发机制**已于 2026-09-30 00:36 拍板选方案 C：本地 CLI 为主、手动低频更新**——GA 调度路线搁置，workflow 保留空转留档，knowledge-sync spec（SY-0 delta Requirement 8）已标注搁置前提。证据链见 `learn-agents-ui/browser-evidence/SY/2026-09-29-ga-sync-first-run.md` 第 5 节。
