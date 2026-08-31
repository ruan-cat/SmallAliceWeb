# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-31；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 当前 `dev`/`origin/dev` HEAD：`5418ff6`；任务清单 23/23 已勾选，OpenSpec strict validate 通过。
- `origin/main` 仍为 `8bb2b9f`，比 dev 落后 README、任务范围和设计口径的 3 个文档提交；生产运行时代码已包含 RAG 核心实现，但生产页面仍展示旧进度文案。

## 2. 正式 RAG 证据

- RAG API 测试：26 个文件 / 96 个用例通过；ai-rag-core 15、ai-vue 20、ai-vitepress-plugins 36 个用例通过。
- RAG API typecheck、`build:vercel`、`pnpm run neon:guard` 与 OpenSpec strict validate 通过。
- 根级串行 `pnpm run docs:build` 通过：9/9 任务成功，VitePress 页面渲染完成。
- `2.2.3`：三档独立重嵌入无 400/413；HNSW/exact Top-5 一致率 8/10、9/10、9/10。
- `2.2.4`：main SHA `a62f896` 对应 deployment `dpl_2svy5ahawCbShRYtsrswuKU7xzH5` READY；Chrome/CDP 已验证 search 200、chat 流式、停止保留、来源锚点跳转。最新 docs-only production deployment `dpl_3suXNJn8uF4ZaRoT36hRgxpqEnQd`（SHA `8bb2b9f`）也 READY。
- 2026-08-31 fresh production：`vercel inspect` 显示 docs `dpl_3suXNJn8uF4ZaRoT36hRgxpqEnQd` 与 Nitro `dpl_8NTG59AYpUHt8HRgAcT57sY5VwEr` 均 READY；浏览器页面加载和 `/v1/search` HTTP 200 成功。

## 3. 当前边界与风险

- 本次 live chat 观察在 41.9 秒后主动点击停止，runtime logs 记录 `/v1/messages` abort + AbortError；这证明取消链路，不构成自然完成的新鲜 chat 成功证据。完整自然流式/来源跳转证据仍以 2026-08-28 浏览器记录为准。
- 根级 `pnpm run typecheck` 失败于未改动的 `packages/ai-vue-doc`：Nuxt typecheck 报 TS5101（`baseUrl` 将于 TS7 停止工作）；这是依赖漂移/旧 tsconfig 边界，不是 RAG 包失败。
- `reports/2026-8-28-use-Chroma/` 是独立调研目录，尚未提交；Chroma 不属于正式二期任务。
- AI 对话浮层视觉质量需要后续单独 UI 设计重构，不影响已验证的 RAG 链路。

## 4. 下一步

1. 如需让生产文档反映 dev 的最新 README/任务口径，按项目纪律将 `dev` rebase/push 到 `main`，用全局 Vercel CLI 按 SHA 监听至 READY，再做最小浏览器 smoke。
2. 处理 `ai-vue-doc` 的 TS5101 依赖/配置漂移时，另开独立任务，不混入已完成的 RAG change。
