# AI RAG Phase4 持久发现

> 条目格式：`- **<状态>｜<标题>**` + 结论 / 证据 / 后续 / 影响阶段。状态仅 `active` / `superseded` / `resolved`；只记录会改变后续决策的根因、风险、失败索引与禁止重复路径，去重维护，禁止流水账（≤80 行 / 20 条）。

## 1. 当前有效发现

- **active｜阈值拒答防线完全缺失**
  - 结论：现有问答链路无 score threshold，低相关检索照样进入生成，负样本问题无法拒答。
  - 证据：`packages/ai-rag-api/server/contracts/chat.ts:144-162`（top 5 硬编码、无 threshold）；better-SmallAliceWeb 调研 02-gap-analysis。
  - 后续：U1（2.2~2.4）参数化 threshold；U4（5.6）以黄金集 F1 拐点标定后才正式启用。
  - 影响阶段：U1 / U4。

- **active｜reranker 是 noop 半成品**
  - 结论：`noop-reranker.ts` 原样返回 RRF 排名；runtime 配置位（candidateLimit、token/超时/成本预算门禁）已齐全但未激活，激活即用。
  - 证据：`packages/ai-rag-api/server/reranker/noop-reranker.ts`；`packages/ai-rag-api/server/runtime/rag-runtime.ts:58-80`。
  - 后续：U2 选型激活（3.1~3.8）；收益不足则保持默认 noop 并记录判据（3.8）。
  - 影响阶段：U2。

- **active｜模型看不到 sourcePath，来源标注幻觉不可检测**
  - 结论：buildSystemPrompt 的 sources 只传 content 数组，模型引用编号无法对准真实来源路径。
  - 证据：`packages/ai-rag-api/server/contracts/chat.ts:153`（只传 content）；better-SmallAliceWeb 调研 02。
  - 后续：U1（2.5）改为 `[N] (sourcePath) content` 形态并补测试。
  - 影响阶段：U1。

## 2. 固定约束

- `tasks.md` 是唯一任务源；没有命令与输出证据不得勾选（§0.4）。
- 术语红线：PostgreSQL FTS 不得表述为 BM25（design §3.6 边界 6）。
- 方案 C：本地 CLI rag:sync 直连 Neon 是唯一同步事实源，禁 CI/GA 侧同步；禁 neonctl；Neon 固定资源 org-super-fog-48541962 / patient-cloud-43432277 / neon-smallalice-ai-rag，禁新建同用途资源。
- `NITRO_SYNC_DATABASE_URL` 必须 non-pooled；重同步串行且执行前确认无并发（5.4 四条件缺一不可）。
- 多模态属第三期；AI SDK v4→v5 归 ai-sdk-phase4 独立 change，与本 change 完全解耦。
