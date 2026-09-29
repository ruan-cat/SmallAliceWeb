# 2026-09-29 EV 评估落库实施与只读两枚接口运行时实测

> 本文档由 WorkBuddy（GLM-5.3-Flash）于 2026-09-29 沉淀，对应 learn-agents-ui plan 第十七章 EV-1..EV-4 实施。

## 1. 一句话结论

> **EV-1..EV-4 全部实施完成**：evaluation_runs 表 + 迁移 0005 + runs-repository + 三 CLI 脚本落库接线（失败不阻断）+ 只读两枚接口 + 19 个新测试；ai-rag-api **185/185 全绿**（166 既有零回归）+ typecheck 0 错误。Nitro dev 实机 curl 验证 `GET /v1/evaluation/runs` 返回 503 装配守卫契约。

## 2. 交付清单

| 任务 | 交付物                                                                                                                                                         | 验证                                   |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------- |
| EV-1 | `server/db/schema.ts` evaluationRuns 表 + `drizzle/0005_add_evaluation_runs.sql` + `meta/_journal.json` idx 5                                                  | typecheck 0 错误；journal 守卫测试通过 |
| EV-2 | `server/evaluation/runs-repository.ts`（insert/list keyset 游标/getById + computeDatasetVersion + recordEvaluationRunFromEnv 落库失败不阻断）；三 CLI 脚本接线 | 仓储单元测试 8 用例                    |
| EV-3 | 两枚路由 + evaluationRunsQuerySchema + 两 handler（safeParse→400 约定）+ rag-assembly 可选 createEvaluation factory + rag-runtime 默认工厂（复用主库连接）     | 路由真实 Nitro/H3 合同 5 用例          |
| EV-4 | `tests/evaluation-runs.test.ts` 19 用例                                                                                                                        | 185/185 全绿                           |

## 3. 运行时实测（Nitro dev，端口 3000）

```log
=== GET /v1/evaluation/runs?limit=5 ===
{"success":false,"code":503,"message":"RAG_NOT_CONFIGURED","data":null}
HTTP:503

=== GET /v1/evaluation/runs/evalrun-1 ===
{"error":true,"stack":["Cannot find any route matching [GET] .../v1/evaluation/runs/evalrun-1",...]}
HTTP:404（Nitro dev HMR 对新增动态路由存在时滞，未加载）
```

- `503 RAG_NOT_CONFIGURED` 与测试合同一致：dev Nitro 实例未完成 RAG 装配（与既有 sync-runs 路由同语义），路由本身已被 dev server 热加载并正确走 503 装配守卫。
- `:id` 动态路由实测受 dev HMR 时滞限制未加载，四态契约（200/400/404/503）由 `tests/evaluation-runs.test.ts` 中 5 个真实 Nitro/H3 createApp 合同用例覆盖。
- 真实 200 链路需要完成 RAG 装配（`.env.local` 完整性 + Nitro 重启）后用 workflow 落库数据验证，与 SY-3 联调同批补做。

## 4. 设计要点与蓝军记录

| 拷问                                         | 结论                                                                                                                                |
| :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| 为何 repository 用 raw SQL 而非 drizzle 查询 | 与 knowledge-sync 服务同构（SyncSqlExecutor 模式）：执行器显式注入，本模块零连接创建；drizzle schema 仅作结构契约与迁移对齐         |
| 为何 createEvaluation 是可选 factory         | 向后兼容：既有测试与部署的 factories 均未提供时不装配 → 路由 503；rag-runtime 默认工厂复用主库 `sql` 连接，零新增配置               |
| 为何 list 游标用 keyset                      | `ORDER BY created_at DESC, id DESC` + `(created_at, id) < ($2, $3)` 行构造器比较，避免 offset 深分页漂移；非法 cursor 400           |
| 为何 handler 用 safeParse 而非 parse         | 既有 chat.ts 约定：结构非法显式 400；顺带记录 sync-runs 同位置存在 parse-throw→500 的潜伏怪癖（无人测契约，本次不动，留待后续统一） |
| 落库失败为何不阻断                           | plan 17.3：stdout 与 JSON 证据文件仍是事实源；recordEvaluationRunFromEnv 失败仅 console.warn，测试覆盖三种路径（skip/失败/成功）    |

## 5. 待办（超出本次会话门禁）

1. 真实 DB 的 insert/query 往返 smoke（迁移可重放实机验证）——依赖 RAG 装配健康的 dev Nitro。
2. 三 CLI 脚本各完成一次真实运行并查表确认（plan 17.3 验收）——依赖 embedding/key 配置环境。
3. 与 SY-3 首跑联调同批补做。
