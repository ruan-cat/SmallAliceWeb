# 2026-10-16 ai-rag sync-runs 生产 500（reserved executor stub 与 syncRuns 直连查询失配）

## 1. 问题现象

生产环境 `GET /v1/knowledge/sync-runs`（`packages/ai-rag-api` 子包）稳定返回 500，
错误体 `{"success":false,"code":500,"message":"同步记录查询失败","data":null}`。
本地全量测试套件通过，无任何测试拦截。

## 2. 实际根因

`server/runtime/rag-runtime.ts` 的 `createSync` 注入的是 `createReservedSyncExecutor`，
其 `execute()`/`transaction()` 是**无条件抛错的显式 stub**（"同步执行器必须先保留数据库会话。"），
设计意图是强制一切 SQL 经 `reserve()` 取得的独立 non-pooled 会话执行（advisory lock 正确性要求）。

而 `server/services/knowledge-sync.ts` 的 `syncRuns` 实现仍直接调用
`options.executor.execute()` 查询 `knowledge_sync_runs` 表——每个请求必然命中 stub 抛错，
被 `handleSyncRunsRequest` 的 catch 兜成 500。

时间线（git 证据）：

- `8017328`（2026-08-19）：`syncRuns` 上线，当时注入普通 pooled executor，`execute()` 可用，功能正常。
- `c12faab`（2026-08-24）：引入 `createReservedSyncExecutor` 并替换 `createSync` 的注入，
  **`syncRuns` 自当日起在生产必然 500**，持续近两个月无人发现（前端无调用方，属低频运维端点）。

## 3. 关键误导点

- **同库对照端点全绿**：`/v1/evaluation/runs` 生产返回 200（走 pooled 主库连接），容易误判为
  "数据库连接/建表问题"已排除后无头绪。实际两条路径用的 executor 完全不同（pooled 主库 vs reserved 同步专用）。
- **测试全部通过**：`sync-service.test.ts` 对 `syncRuns` **零覆盖**；`runtime-assembly.test.ts`
  用假 `createSync` mock；`rag-plugin-sync-executor.test.ts` 只单测 reserve/release 行为。
  「真实 `createKnowledgeSyncService` + 真实 `createReservedSyncExecutor`」这一生产组合从未被任何测试拼装过。
- **503 与 500 的分界**：`sync-runs.get.ts` 在 `rag.syncRuns` 不是函数时返回 503；生产返回 500
  说明 runtime 装配成功、函数存在，问题必然在函数执行内——这个分流信号是首个可信线索。

## 4. 有效修复

`knowledge-sync.ts` 的 `syncRuns` 改为：executor 提供 `reserve()` 时经保留会话查询并在
`finally` 中防御性 release（与 `runSync` 既有模式一致）；无 `reserve` 的普通 executor
保持直连 `execute()`，兼容 CLI 与测试注入路径。SQL 语句不变。

配套补三类回归测试：

- `sync-service.test.ts`：execute 抛错的 reserved-shape executor 上 `syncRuns` 走 reserve 并释放（生产 500 场景复现）；
- `sync-service.test.ts`：普通 executor 直连路径保持可用；
- `rag-plugin-sync-executor.test.ts`：真实 `createReservedSyncExecutor` + 真实 `createKnowledgeSyncService` 组合测试（生产装配形状）。

## 5. 验证方式

- `pnpm test`：36 个测试文件、189 个测试全通过（修复前 `syncRuns` 零覆盖）。
- `pnpm typecheck`：0 错误。
- 活体验证：注入 `.env.local` 真实数据库连接启动 `nitro dev`，
  `curl http://localhost:3000/v1/knowledge/sync-runs` 返回 **HTTP 200** 与 20 条真实记录
  （修复前同路径生产复现 500）。
- 提交链：`🌈 style`（425120f，隔离 prettier 整文件重排噪音）→ `🐞 fix`（9f55ba0，+110/-6 纯语义 diff）。

## 6. 后续约束

- **给 executor 增加新能力或替换注入实现时，必须检索服务内所有 `executor.execute` 直连调用点**：
  `createReservedSyncExecutor` 的契约是"一切 SQL 必须先 reserve"，新方法默认直连就会复现本事故。
- **跨边界组合必须有组合测试**：单测 mock executor、单测 executor 工厂都不够；
  生产装配形状（真实服务 + 真实 executor 工厂 + 假传输层）要有一个拼装级测试。
- **lint-staged 整文件重排**：`printWidth` 配置演进后旧文件不合规，触碰即被整文件重排。
  给这类文件做语义修改前，先独立提交 `🌈 style` 重排基线，再提 `fix`，保持 diff 可追溯。
- 同期发现独立问题（未在本案例修复）：GA 定时同步自 2026-09-29 起每日 `status: "partial"`、
  `scannedFileCount: 0`、`failedFiles: ["docs/docx"]`，RAG 索引自 2026-08-31 后未再成功更新，
  需单独排查 GA runner 的 scanner 环境与 `NITRO_REPOSITORY_ROOT`/docs 挂载。
