# 2026-08-20 二期 AI RAG 切换 Cloudflare BGE-M3 1024 维迁移计划

## 1. 决策

二期放弃原 `vector(1536)` embedding 契约，正式采用 Cloudflare Workers AI `@cf/baai/bge-m3` 的固定 1024 维输出。chat 模型继续独立使用现有文本模型，embedding 不再由同一渠道强行承担。

本次是破坏性契约变更：旧向量不能与新向量混写，Neon schema、检索校验、同步服务、provider 配置、测试和 OpenSpec 行为规格必须一起切换。

## 2. Cloudflare 接口边界

Vercel Nitro 通过 Cloudflare 的 OpenAI-compatible endpoint 调用 embedding：

```log
POST /client/v4/accounts/{account_id}/ai/v1/embeddings
Authorization: Bearer ${NITRO_CLOUDFLARE_API_TOKEN}
Content-Type: application/json
```

请求体使用 `model` 与 `input`，模型为 `@cf/baai/bge-m3`，批量上限按当前同步合同固定为 100。provider 将 `data[].embedding` 按输入顺序映射为 `number[][]`，并在写库或检索前校验每条向量包含 1024 个有限数值。不得发送 `dimensions` 或 `output_dimensionality` 试图改变 BGE-M3 输出维度。

依据：[Cloudflare BGE-M3 模型文档](https://developers.cloudflare.com/ai/models/%40cf/baai/bge-m3/)、[Workers AI OpenAI-compatible API](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)。

## 3. Neon 迁移边界

迁移前必须只读确认 `chunks` 行数与现有向量维度。若 development 数据库仍为空，可删除 HNSW cosine 索引、将 `chunks.embedding` 改为 `vector(1024)`、重建索引，然后执行全量同步。若已经存在 1536 维向量，必须先生成并校验 1024 维影子数据，再原子替换，禁止直接截断或覆盖。

## 4. 实施顺序

1. 修改 OpenSpec 设计、规格、任务、进度与发现文档，建立 1024 维唯一契约。
2. 增加 Nitro Cloudflare embedding provider 及其单元测试、运行时装配测试。
3. 增加 1024 维 Drizzle schema、migration、检索常量和同步校验。
4. 配置 Vercel development 的 Cloudflare 环境变量，执行单条 smoke 与 5–10 条批量 smoke。
5. 执行最多 100 个 chunk 的真实同步，验证幂等、失败保留、锁竞争和向量检索。
6. 完成真实 `/v1/search`、`/v1/chat`、浏览器与部署回归后，才推进后续生产证据。

## 5. 证据与风险

- 文档更新不代表 Cloudflare smoke、Neon migration、Vercel 环境变量接线或生产闭环已经完成。
- Cloudflare token 只能存在服务端环境变量，不能进入浏览器 bundle、日志、报告或 Git。
- 旧 1536 维历史文件保留在 OpenSpec `history/` 与 Memorix 导出中，仅作审计证据，不具有当前任务执行权。
