# 你好

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ruan-cat/SmallAliceWeb)

你好，这是钻头文档。

## 1. 错误占位图片

![2025-04-11-16-41-34](https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-04-11-16-41-34.png)

> 占位图片说明：docx 转换管线中，当图片转换失败（如损坏的 EMF、异常的 GIF）时回退展示此图。自 2026-08-23 起，**EMF/WMF 矢量图已可真实转换为 PNG**（见第 5 节），占位图仅作为失败兜底，不再是 EMF 图片的常态表现。

## 2. AI RAG 的 Neon 资源标识

二期 AI RAG 复用本仓库关联 Vercel 项目中的既有 Neon 资源，不创建同用途的第二套云数据库。

- Neon 组织 ID：`org-super-fog-48541962`
- Neon 项目 ID：`patient-cloud-43432277`
- Vercel 已关联的 Neon 数据库名称：`neon-smallalice-ai-rag`

数据库连接前，生产密钥在 Cloudflare Worker 与 GitHub Actions 中配置，勿将 Vercel 当作现行取值处；连接串和其他凭据不得提交到仓库。所有 Neon CLI 操作统一使用 `neon`，其安装与认证由用户完成。

## 3. 二期 AI RAG 知识库作品

### 3.1 能力概览

本仓库已经完成一个面向 `docs/docx` 文档的 RAG 知识库闭环：文档变化可增量同步为结构化 chunk，使用 Cloudflare Workers AI 生成 1024 维向量，写入 Neon PostgreSQL 的 pgvector/全文检索索引，再由 Nitro API 提供 Hybrid Search 和流式问答。

- **动态知识同步**：扫描 `docs/docx`，按稳定标题锚点和内容哈希生成 chunk；支持一次同步、监听变更和受鉴权的生产同步入口。
- **结构化检索**：每个结果保留 `sourcePath`、标题路径、`headingAnchor`、`sourceUrl`、图片地址等来源元数据。
- **Hybrid Search**：词法检索、向量检索和 RRF 融合共用同一结果合同；三档真实重切分/重嵌入评测已完成，并包含 HNSW 与精确 Top-5 对照。
- **流式问答与溯源**：`/v1/chat` 使用 Anthropic Messages 流式适配，前端显示回答、停止生成和可点击的来源链接；来源跳转到真实文档的稳定 `#rag-heading-*` 锚点。

### 3.2 架构

```text
docs/docx
  -> 结构化扫描、分块、哈希和稳定锚点
  -> Cloudflare Workers AI @cf/baai/bge-m3（1024 维 embedding）
  -> Neon PostgreSQL（FTS + pgvector + HNSW）
  -> Nitro API（/v1/search、/v1/chat、/v1/knowledge/sync）
  -> VitePress + Element Plus X Chat + @ai-sdk/vue
  -> 流式回答、停止生成、来源锚点跳转
```

### 3.3 技术栈

|       层级       |                                        实现                                        |
| :--------------: | :--------------------------------------------------------------------------------: |
|     知识处理     |                Markdown 扫描、结构化 chunk、内容哈希、稳定标题锚点                 |
|    向量与检索    | Cloudflare Workers AI `@cf/baai/bge-m3`、Neon PostgreSQL、pgvector、HNSW、FTS、RRF |
|      服务端      |               Nitro v3、Drizzle ORM、Zod、AI SDK、Anthropic Messages               |
|     对话界面     |          VitePress、`vue-element-plus-x`、`markstream-vue`、`@ai-sdk/vue`          |
| 部署与运行时验证 |      GitHub Actions 构建与 wrangler 上传（Workers）、Chrome/CDP Agent Browser      |

### 3.4 已验证的生产链路

- `POST https://smallalice-docs-ai-nitro-api.ruan-cat.com/v1/search` 已在真实浏览器上下文返回 HTTP 200 和来源 DTO。
- `POST /v1/chat` 已验证流式回答、停止生成后内容和来源保留，以及来源跳转。
- `https://drill.ruan-cat.com` 由 Worker `small-alice-web-docs` 承载；`main` 推送触发 GitHub Actions 构建并 wrangler 上传后，按 checkout SHA 与 Actions 日志收敛，再使用 Chrome/CDP 验收。
- 真实参数评测覆盖 `300/30/5`、`500/50/10`、`800/100/15`：`800/100/15` 在固定题集上的 vector/hybrid 命中率为 8/10、关键词覆盖率为 0.70；HNSW/exact Top-5 一致率分别为 8/10、9/10、9/10。

生产浏览器验收截图：

![二期 AI RAG 生产对话与来源跳转](./openspec/changes/ai-rag-phase2/evidence/2026-08-28-production-chat-final.png)

完整评测、部署和浏览器证据见 [OpenSpec change](./openspec/changes/ai-rag-phase2/) 与 [生产浏览器记录](./openspec/changes/ai-rag-phase2/evidence/2026-08-28-production-browser.md)。

### 3.5 RAG 命令、embedding 耗时与 Cloudflare 额度速览

接手知识库维护前，先知道三件事（详细版见文档站 [RAG embedding 命令、模型消耗与频度纪律](./docs/about/rag-embedding-cost.md)，或仓库内 `docs/about/rag-embedding-cost.md`）：

1. **`run-parameter-evaluation` 参数评估脚本耗时很长（约 18 分钟）是预期行为**——它要对 290 个文档做三种 chunk profile 的全量 embedding（约 1.9 万个 chunk、750 批次请求），控制台持续输出 `profile=xxx embedded=当前/总数` 进度即是在正常工作，不是卡死。
2. **额度账本**：embedding 用 Cloudflare Workers AI `@cf/baai/bge-m3`（1024 维），免费额度 10,000 Neurons/天 ≈ 930 万 input tokens。单次全量同步约 1,600 Neurons（15~20% 日额度），参数评估一轮约 5,200 Neurons（约一半），增量同步与每日兜底轮几乎零消耗（内容哈希未变的文件自动跳过）。
3. **频度纪律**：push 驱动增量为主 + 每日兜底一次；全量重建与参数评估**错峰、不同日各 ≤1 轮**（Neurons 是账户级共享额度池）。Cloudflare 偶发 502 时等待约 90 秒人工重跑即可。

### 3.5 已知边界

- 当前对话浮层的视觉层级和信息密度需要后续单独进行 UI 重构；这不影响已验证的检索、流式、停止和来源跳转能力。
- 早期学习计划曾出现 Chroma 本地练习，但它从未进入正式实现，也不属于当前二期交付；正式向量主线唯一是 Neon + pgvector。
- 作品说明以 README 和可复核生产证据为交付物；不再要求录制或外部上传演示视频。

## Cloudflare Workers 与历史 Vercel 项目名

**现行生产（2026-11-11 起）**

|      Worker 名称       |       用途       |                               生产域名                               |
| :--------------------: | :--------------: | :------------------------------------------------------------------: |
| `small-alice-web-docs` | VitePress 文档站 | `https://drill.ruan-cat.com`、`https://small-alice-web.ruan-cat.com` |
| `small-alice-web-api`  |  Nitro API 接口  |         `https://smallalice-docs-ai-nitro-api.ruan-cat.com/`         |

**历史 Vercel 项目名（仅回滚对照；对应 Worker 已删除同名占位，不得当作现行 Worker 名）**

- 核心 VitePress 文档项目：`small-alice-web-odse`
- RAG Nitro 接口项目：`smallalice-docs-ai-nitro-api`

## 4. 现行 Worker 生产与 Vercel 历史/回滚架构

2026-11-11 起，文档站与 API 的自定义域名由 Cloudflare Workers 承载：`git push`（经 `dev` → `main` 纪律）触发 **GitHub Actions** 构建，并用 **wrangler** 上传到上表两个 Worker。知识库同步仍在 GitHub Actions（`.github/workflows/rag-sync-schedule.yaml`），不在 Worker 内调度。

**DNS 回滚目标（仅在用户授权回滚 Vercel 时使用）**：文档站 `cname.vercel-dns.com`；API `ad1c0a65577b8811.vercel-dns-017.com`。设计记录见 `reports/2026-11-10-vercel-to-cloudflare/`。

### 4.0 历史：Vercel 双项目配置（回滚参考）

切流前本仓库同时绑定两个 Vercel 项目，采用统一的**仓库根安装 + 产物搬运**模式（`use-vercel-deploy-in-monorepo` 技能的形态 1 模式 A）。下表**不是现行生产入口**。

|          Vercel 项目           |       用途       | Root Directory | Framework |                          Build Command                          |    Output Directory    | Install Command | Node |
| :----------------------------: | :--------------: | :------------: | :-------: | :-------------------------------------------------------------: | :--------------------: | :-------------: | :--: |
|     `small-alice-web-odse`     | VitePress 文档站 |      `.`       |   Other   |                        `pnpm run build`                         | `docs/.vitepress/dist` | `pnpm install`  | 22.x |
| `smallalice-docs-ai-nitro-api` |  Nitro API 接口  |      `.`       |   Other   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |    `.vercel/output`    | `pnpm install`  | 22.x |

### 4.1 破坏性变更记录：删除根 `vercel.json`

仓库根 `vercel.json` 已于 2026-08-07 删除（备份在 QoderWork 工作区）。原因：`vercel.json` 会覆盖云端 Project Settings，在同一仓库绑定多个 Vercel 项目时会造成跨项目配置污染。原 `vercel.json` 中的文档站配置已迁移到 `small-alice-web-odse` 的云端 Project Settings，两者值完全一致。

`vercel.old.json` 是更早期 VuePress 的遗留配置，仍指向 `vuepress-vite build docs` 与 `docs/.vuepress/dist`。当前文档站已经使用 VitePress，其构建入口和输出目录分别为 `pnpm run build` 与 `docs/.vitepress/dist`；因此移除该旧文件属于清理过期配置，不会改变当前两个 Vercel 项目的云端 Project Settings，也不得将其恢复为有效部署配置。

### 4.2 历史：CLI 单槽绑定纪律（Vercel 回滚/诊断）

`.vercel/project.json` 是单槽绑定。**仅当用户明确要求 Vercel 回滚、本地 CLI 诊断或应急部署时**，才先 `vercel link --project <name> --yes` 切换到历史 Vercel 项目，再执行 `vercel deploy`。现行文档站生产不由 Vercel Git Integration 触发。

### 4.3 文档站 Worker 生产发布纪律

文档站现行生产由 **`small-alice-web-docs`** 承载；正式链路为 **GitHub Actions + wrangler**，不是本地 CLI 直传。开发始终在 `dev` 分支完成；仅当需要真实生产部署和验收时，才按以下顺序执行：

1. 使用全局 `git-commit` 技能审查工作区、按功能/文件类型分组创建有意义的提交。提交前确认 `.gitattributes` 保持二进制文件属性，`.gitignore` 没有遗漏本地生成物或调试垃圾。
2. `git push origin dev`，让 CI 消费开发提交。
3. 工作树干净后，将 `dev` rebase 到本地 `main`，普通 `git push origin main` 推送 remote `main`，最后切回 `dev`。禁止 force push；不得在 `main` 直接开发。
4. `main` 推送后，等待 GitHub Actions 完成构建与 wrangler 上传；用 Actions 日志核对 checkout SHA、EMF/WMF 转换统计与部署结果。不得把本地 build 或未上传 wrangler 的产物当作生产证据。
5. 部署收敛后，在 `https://drill.ruan-cat.com`（及需要的 `small-alice-web.ruan-cat.com` 路径）用本机 Google Chrome 的 Agent Browser 完成功能和视觉验收；先本地转换/本地页面验收，再复测同一生产 URL。

#### 4.3.1 历史：Vercel Git Integration 与 `vercel inspect`（回滚场景）

回滚到 Vercel 时，推送 `main` 后可按 deployment ID 或 URL 用 `vercel inspect --wait` / `--logs` 监听 Git Integration 部署收敛；现行 Worker 生产以 GitHub Actions 运行记录为准。

`pnpm run deploy-vercel` 与 `vercel-deploy-tool.config.ts` 已于 2026-11-11 删除。不要再用本地 `vercel deploy` 发布这两个已删除的项目。

### 4.4 Nitro API 生产域名（Worker `small-alice-web-api`）

- 生产：`https://smallalice-docs-ai-nitro-api.ruan-cat.com/`（Cloudflare Worker，非 Vercel 默认域）
- 历史 Vercel 默认地址（回滚对照，现行不使用）：`https://smallalice-docs-ai-nitro-api.vercel.app`
- 路由前缀：`/v1/chat`、`/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs`

### 4.5 Nitro RAG 环境变量

二期 RAG 的 Cloudflare embedding 运行时会读取以下环境变量：

- `NITRO_CLOUDFLARE_ACCOUNT_ID`：`3412269ab0def154c8806e38acd1b493`
- `NITRO_EMBEDDING_MODEL`：`@cf/baai/bge-m3`
- `NITRO_CLOUDFLARE_API_TOKEN`：Cloudflare Workers AI 专用 API token，必须保密；现行存放在 Worker `small-alice-web-api` 与 GitHub Actions secrets；回滚 Vercel 时仍在对应 Vercel 项目的 Sensitive 环境变量中维护

其中 `ACCOUNT_ID` 可以公开写入文档，`API_TOKEN` 不能提交到仓库。你贴出的 R2/S3 兼容密钥属于另一组云存储凭证，不参与 embedding 接入，也不应写入 README。

## 5. EMF 矢量图转 PNG

docx 源（drill-docx）中的 EMF（Enhanced Metafile）矢量图——主要来自 Excel 图表与 Word 公式，多为 **EMF+ / EMF+ dual** 形态——现在能够在构建管线内真实转换为可阅读的 PNG 图片（自 2026-08-23 上线）。

### 5.1 能力说明

- **转换链路**：`scripts/build-doc-in-vercel/transformers.ts` 的 `docx2html()` 图片回调中，`x-emf` / `emf` / `wmf` 不再走占位图，而是经 `emf-converter`（EMF+/EMF+ dual 记录集完整解析）+ `@napi-rs/canvas`（Skia 渲染）转换为 PNG 落盘，链接显式使用 `.png` 扩展名。
- **覆盖率**：drill-docx 全量 382（GitHub 仓库 403）个 EMF 均为 EMF+（含 dual），转换成功率 100%（本地管线、GitHub Actions ubuntu 构建与生产站点产物三方验证一致）。
- **中文渲染**：Linux 构建环境（CI/容器）无系统中文字体，随包携带 OFL 授权的 Noto Sans SC 子集字体（约 199KB）经 `GlobalFonts.registerFromPath` 注册，配合 `fontFamilyMap` 小写键映射（宋体/SimSun/Calibri/Cambria 等 → NotoSansSC），避免文字豆腐块。
- **失败兜底**：转换失败仅影响单张图片（回退占位图 + 记入错误清单 + 计入成功/失败统计），不中断构建。
- **已知限制**：输出为 PNG 光栅（非矢量 SVG）；个别 EMF+ 记录类型（如 record type 90）会被库跳过但仍成功输出；渲染质量受 Canvas 引擎字体度量影响。

### 5.2 相关工件

- 技术设计与实现约束：`openspec/changes/handle-x-emf-img/design.md`
- 任务清单与验证证据：`openspec/changes/handle-x-emf-img/tasks.md` 与 `evidence/`
- 调研报告：`reports/2026-08-22-docx-x-emf-conversion-research.md`

### 5.3 历史背景

2025-02 曾尝试纯 Node 处理 EMF 失败（sharp/libvips 无 EMF 解码器、浏览器不渲染 `image/x-emf`、npm 生态当时无 EMF+ 渲染实现）；2026 年 `emf-converter`（Apache-2.0）+ `@napi-rs/canvas`（零系统依赖预编译二进制）组合落地，实现 Windows 本地与 CI Linux 构建环境同一套代码的运行形态。
