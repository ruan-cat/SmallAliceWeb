# 2026-11-10 Vercel 到 Cloudflare Workers 外部证据

本报告由 Cursor 主代理使用 Grok 4.7 写成。它只记录已经用 CLI、官方文档和项目记忆核对过的事实。仓库源码盘点仍在进行。自 **2026-11-11** 起生产域名已切到 Workers（见 `AGENTS.md` 与 §3 切流后注记）；下文 §2–§3 中 Vercel/DNS 表项为**切流前快照**，供对照与回滚，不代表现行生产路由。

## 1. 客户要的结果

推送到 `dev` 或 `main` 时，不再因为 Vercel Hobby 的 Deployment Storage 和构建额度而刻意少推。文档站和 Nitro API 仍要能从 Git 发布，自定义域名保持可用，Neon 数据库不新建第二套。

## 2. 切流前快照：Vercel 项目（2026-11-10）

账号 `ruan-cat`，团队 `ruancat-vercel-team`，团队 ID `team_cUeGw4TtOCLp0bbuH8kA7BYH`。2026-09-08 的记忆记录该团队当时是 Hobby plan：部署从 845 个清到 27 个，retention 上限是 1 个月。两个目标项目都连着 GitHub `ruan-cat/SmallAliceWeb`，生产分支都是 `main`。

|              项目              |              项目 ID               |                         生产域名                          |                              构建                               |          产物          | Node |
| :----------------------------: | :--------------------------------: | :-------------------------------------------------------: | :-------------------------------------------------------------: | :--------------------: | :--: |
|     `small-alice-web-odse`     | `prj_vdrAvRthiSjkhotfPTXFSV5e1KQW` | `drill.ruan-cat.com`，另有 `small-alice-web.ruan-cat.com` |                        `pnpm run build`                         | `docs/.vitepress/dist` | 22.x |
| `smallalice-docs-ai-nitro-api` | `prj_Ei3oSQecf4UqPbGX4L0XPxhyglpl` |        `smallalice-docs-ai-nitro-api.ruan-cat.com`        | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |    `.vercel/output`    | 22.x |

两个项目的 Root Directory 都是仓库根。同一次 `main` 推送会触发两套生产构建。`vercel project ls` 还列出了团队里大量其他项目；本次只处理上表两行。

本地工作区当前在 `dev`，相对 `origin/dev` 超前 1 个提交，且 `prompts/01.prompts.md` 有未提交修改。这些改动不属于本次迁移，不能纳入、不能回滚。

## 3. 切流前快照：DNS 在 Cloudflare（2026-11-10）

2026-11-10 通过 `1.1.1.1` 查询（**切流前**；2026-11-11 起三条生产主机名改由 Worker 托管，对外 AAAA `100::`，见 `2026-11-10-handoff.md` §1）：

```log
ruan-cat.com NS = vick.ns.cloudflare.com
ruan-cat.com NS = dolly.ns.cloudflare.com
drill.ruan-cat.com CNAME = cname.vercel-dns.com
smallalice-docs-ai-nitro-api.ruan-cat.com CNAME = ad1c0a65577b8811.vercel-dns-017.com
```

本机默认解析器把 A 记录改写成 `198.18.2.12` / `198.18.2.13`，那是本地代理假 IP，不能当作 Vercel 的真实地址。可信信号是 CNAME 和 NS。切域名是在现有 Cloudflare zone 里改这两条 CNAME，不是把域名搬到 Cloudflare。

## 4. 环境变量只记名字

文档站项目在 production、preview、development 都注入了整套 Neon `POSTGRES_*` / `DATABASE_URL*`，外加 `ENABLE_EXPERIMENTAL_COREPACK`、`VERCEL_DEEP_CLONE`。`VITE_RAG_API_BASE` 只在 preview 和 production。静态文档站不该继承数据库连接串。

API 项目额外有这些名字：`NITRO_DATABASE_URL`、`NITRO_SYNC_DATABASE_URL`、`NITRO_EMBEDDING_MODEL`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET`、`NITRO_OPENAI_API_KEY`、`NITRO_ANTHROPIC_API_KEY`、`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`ENABLE_EXPERIMENTAL_COREPACK`。

缺口：`NITRO_DATABASE_URL`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET` 没有 preview target。`NITRO_CLOUDFLARE_*` 是 Workers AI embedding 的 REST 凭据，账号 ID 已写在根 `README.md`。token 不进入任何报告。

记忆 #5637：Vercel CLI 拒绝把 Development 标成 Sensitive。这个限制属于 Vercel，不能原样套到 Cloudflare。

## 5. 已有的 Cloudflare 与同步边界

下列一句是 2026-11-10 切流前快照：当时 Cloudflare 已是 embedding 供应商，不是计算宿主。2026-11-11 起文档站与 API 的计算宿主已是 Cloudflare Workers。OpenSpec 部署规格要求 Nitro 调用 `api.cloudflare.com` 的 Workers AI `@cf/baai/bge-m3`。Vercel Cron 已经被否决。`.github/workflows/rag-sync-schedule.yaml` 第 1–11 行写明：2026-09-30 的方案 C 之后，这份 GitHub Actions 是空转留档，因为 `docs/docx` 被 `.gitignore` 第 54–55 行忽略，CI checkout 里没有知识源。2026-11-10 用户决定：同步调度继续留在这份 GitHub Actions，不迁进 Worker。workflow 当前会空转，这次迁移不修改它。同步连接仍必须使用 non-pooled 直连，否则 session advisory lock 失效。

本地 `docs/.vitepress/dist` 现有 7354 个文件、约 400 MB，没有单文件超过 25 MiB。Workers Free 的静态资产上限是 20000 个文件，Paid 是 100000 个。当前产物数量在 Free 上限之内。这是本地产物快照，生产构建可能更多。

本机 Wrangler 版本是 `4.131.1`，高于静态资产计数所需的 `4.34.0`。

## 6. Cloudflare 官方限制

限制页更新于 2026-10-29，Builds 限额页更新于 2026-10-28，定价页更新于 2026-10-02。

|          项          |       Workers Free       |           Workers Paid           |
| :------------------: | :----------------------: | :------------------------------: |
|         订阅         |            0             |          每月 5 美元起           |
|       HTTP CPU       |          10 ms           |    默认 30 秒，可调到 5 分钟     |
|      HTTP 墙钟       | 客户端不断开就没有硬上限 |               同左               |
|     静态资产请求     |      免费且不限次数      |               同左               |
|    静态资产文件数    |       20000 / 版本       |          100000 / 版本           |
|        单文件        |          25 MiB          |              25 MiB              |
|     Worker 脚本      |    64 MiB，启动 1 秒     |               同左               |
|         内存         |     128 MB / isolate     |               同左               |
| 同时等待响应头的连接 |            6             |                6                 |
|       构建分钟       |        3000 / 月         | 6000 / 月，超出每分钟 0.005 美元 |
|       并发构建       |            1             |                6                 |
|       构建超时       |         20 分钟          |             20 分钟              |
|       构建日志       |          90 天           |              90 天               |

Nitro 官方当前预设是 `cloudflare_module`。`cloudflare_pages` 被标成只在需要 Pages 特性时使用。Workers 静态资产的默认 HTML 处理是 `auto-trailing-slash`：目录 `index.html` 走带斜杠的 URL。VitePress 是否正好使用这套 URL，要等源码盘点确认。

`process.env` 在 Worker 全局作用域读不到，只能在请求生命周期里读。构建变量也不会自动变成运行时变量。

Hyperdrive 是外部 Postgres 的推荐接法。同步用的 advisory lock 不能改走连接池。请求路径和同步路径必须继续分开。

## 7. 还不能当成事实的点

1. Worker 旧版本会不会像 Vercel Deployment Storage 一样堆积计费。文档只说构建日志 90 天后删除，版本本身不随日志删除；Wrangler 只展示最近 100 个版本。没有查到与 Hobby Deployment Storage 对等的配额条款。
2. 这两次 VitePress 与 Nitro 构建在 Vercel 上的实际分钟数。20 分钟是 Workers Builds 的硬超时。
3. API 运行时实际 import 的是 `pg`、`postgres.js` 还是 `@neondatabase/serverless`。这决定 Hyperdrive 还是 Neon HTTP 驱动。
4. 本地 `dev` 超前的那 1 个提交是否已经包含未推送的部署改动。本轮不读它的 diff，避免把用户未提交工作卷进来。
