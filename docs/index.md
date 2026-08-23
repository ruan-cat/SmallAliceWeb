# 小爱丽丝官网

这是由 DOCX 文档构建的 VitePress 站点，也是小爱丽丝知识库与 AI RAG 能力的开发仓库。项目仍在持续开发；本页只记录仓库内可核对的进度，不把本地实现或历史证据等同于当前云端、生产环境或浏览器验收。

## 1. 快速入口

- [关于本站](/about/)
- [仓库 README](https://github.com/ruan-cat/SmallAliceWeb/blob/dev/README.md)
- [二期 AI RAG 任务清单](https://github.com/ruan-cat/SmallAliceWeb/blob/dev/openspec/changes/ai-rag-phase2/tasks.md)
- [EMF 文本布局修复任务清单](https://github.com/ruan-cat/SmallAliceWeb/blob/dev/openspec/changes/2026-8-23-fix-emf/tasks.md)
- [EMF 转换调研报告](https://github.com/ruan-cat/SmallAliceWeb/blob/dev/reports/2026-08-22-docx-x-emf-conversion-research.md)

本地开发可使用 `pnpm run docs:dev`；构建文档站使用 `pnpm run build`。完整文档构建在 Windows 上需要较高内存并采用串行执行，本文未运行构建命令。

## 2. 当前开发进度

|       领域       |                                                 已有仓库证据                                                 |                                    当前进行中                                    |                                        待外部验证                                         |
| :--------------: | :----------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------: |
| DOCX 与 EMF 图像 |      EMF/WMF 转 PNG、字体映射与字形覆盖，以及第 4.1–4.4 项（完整子包 Vitest、全量转换、原图对照）已完成      |           第 4.5 项：审查当前 change 关联文件并创建有意义的 `dev` 提交           | 第 4.6–4.7 项：推送 `dev`、确认 CI、推进 `main`/Vercel 部署、五页可见浏览器复测和证据记录 |
|   二期 AI RAG    | Development Neon schema/index 迁移已有证据；结构化切分、离线 API 合同、Chat UI/transport、来源锚点与基础设施 | 真实 PostgreSQL provider/查询链路及业务装配仍未完成；provider 装配后推进同步链路 |                    真实 embedding、search/chat 与生产浏览器端到端闭环                     |
|   作品展示资料   |                                         技术设计、任务清单与本地文档                                         |                         README 作品说明尚未进入实施条件                          |                             演示视频需要真实链路与授权后上传                              |

进度判断以各 OpenSpec change 的 `tasks.md` 为准：已勾选项目表示存在可复核的仓库证据；未勾选项目表示尚未完成、证据不足或依赖外部授权。

## 3. 站点与服务入口

|              项目              |       用途       |                         仓库内构建入口                          |              当前边界              |
| :----------------------------: | :--------------: | :-------------------------------------------------------------: | :--------------------------------: |
|     `small-alice-web-odse`     | VitePress 文档站 |                        `pnpm run build`                         | 部署状态不由本页或本地构建结果证明 |
| `smallalice-docs-ai-nitro-api` |  Nitro RAG API   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` | API 包存在；真实 RAG 装配仍待完成  |

Nitro API 包名为 `@ruan-cat-drill-doc/ai-rag-api`，提供本地 `dev`、`build`、`build:vercel`、`test` 与 `typecheck` 脚本。Development Neon schema/index 迁移已有证据，但真实 PostgreSQL provider/查询链路及业务装配仍未完成；同步链路要在装配 provider 后推进。

## 4. 开发约束

- 二期 RAG 复用既有 Neon 资源；连接信息和 token 不提交到仓库。
- 需要 Neon CLI 时仅使用官方 `neon`，禁止使用 `neonctl`。
- 部署前需确认 `.vercel/project.json` 的单槽绑定目标；两个 Vercel 项目的构建配置分别由各自云端 Project Settings 管理。
- 本地测试、构建或离线 mock 只能证明对应本地合同，不能替代真实 provider、数据库、部署或可见浏览器验证。

## 5. 后续关注点

近期优先完成第 4.5 项当前 change 关联文件的审查与有意义的 `dev` 提交；外部验收为第 4.6–4.7 项，包括推送 `dev`、确认 CI、推进 `main`/Vercel 部署、五页可见浏览器复测和证据记录。二期 AI RAG 则先装配真实 PostgreSQL provider/查询链路及业务，再推进同步链路。
