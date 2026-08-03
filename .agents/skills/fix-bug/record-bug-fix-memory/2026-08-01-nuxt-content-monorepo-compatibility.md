# 2026-08-01 Nuxt Content 在 pnpm monorepo 中跨运行时世代解析错误

## 1. 问题现象

`packages/ai-vue-doc` 在 Nuxt/Nitro 构建与本地开发服务中访问 Content 自动注册的 cache/search API 时返回 `500`。实际异常先后表现为：

- `TypeError [ERR_INVALID_URL]: Invalid URL`
- H3 v2 入口不提供 H3 v1 的 `sendError` 导出

默认约 `4 GiB` V8 堆下，完整文档构建还会在 Nitro prerender 阶段触发 OOM；提高至 `8 GiB` 后，进程在约两分钟内持续高 CPU 和约 `7 GiB` 峰值工作集，容易被误判为卡死。

## 2. 实际根因

这是依赖世代失配与构建资源压力两个问题叠加，不是 Markdown 内容损坏。

- `shadcn-docs-nuxt@1.1.9` 的依赖范围 `@ztl-uwu/nuxt-content: ^2.13.9` 允许安装 `2.14.1`。
- `shadcn-docs-nuxt@1.1.9` 的开发依赖是 Nuxt `^3.21.0`；Content `2.13.9` 的开发依赖是 Nuxt `3.16.2`，而 Content `2.14.1` 的开发依赖已变为 Nuxt `^4.4.5`。
- Content `2.13.9` 与 `2.14.1` 都在运行时导入 `h3`，却都没有声明 H3 dependency 或 peer dependency。pnpm monorepo 中，这个幽灵依赖可穿透到不兼容实例。
- 事故组合中，Nuxt `3.21.2`/Nitro `2.13.3` 需要 H3 v1，但 Content `2.14.1` 的运行时 import 实际解析到 `h3@2.0.1-rc.22`，产生相对 URL 解析和导出 API 不兼容。
- 独立的资源问题来自 Nuxt SSR、Content 索引和 Nitro prerender 同一构建链的高峰内存；默认 V8 堆不足会真实 OOM，增加堆后短时无输出并不等于死锁。

## 3. 关键误导点

- 不能把 `2.13.9 -> 2.14.1` 看成普通、必然兼容的 minor 漂移；本次上游包元数据没有表达 Nuxt 3/Nuxt 4 的实际运行时边界。
- 也不能反向总结为“任意一个小版本变化都会失败”。当前只能证明一个坏的跨代组合和一个好的固定基线，不能证明所有其他组合都失败。
- Content cache/search 路由是主题和 Content 模块的功能产物。清空 prerender routes、关闭搜索或忽略路由只能隐藏异常，并会让静态索引缺失。
- 高 CPU、高内存和约两分钟无完成输出曾被误判为永久卡死；进程资源采样和最终退出码证明它在 `8 GiB` 堆、无并发构建下能够自然结束。
- `D:\code\ruan-cat\eams-component-lib` 的确发生过 Nuxt Content 文档站事故，但其已确认根因是 Windows NFT workaround 泄漏到 Vercel、SSR externalization、workspace 符号链接和预渲染被清空，不是本次 H3 版本失配。两者只能共享预防原则，不能共享未经验证的根因结论。

## 4. 有效修复

在 `packages/ai-vue-doc/package.json` 固定同一条已验证的 Nuxt 3 依赖线：

- `shadcn-docs-nuxt: 1.1.9`
- `@ztl-uwu/nuxt-content: 2.13.9`
- `h3: 1.15.11`
- `nuxt: ^3.21.2`，当前实际安装为 `3.21.2`

直接声明 H3 消除了 Content 幽灵 import 的实例歧义；固定 Content 和主题阻止 `^2.13.9`、`^1.1.9` 在重新安装时跨到未经本仓库验证的 Nuxt 4 依赖线。完整构建以临时 `NODE_OPTIONS=--max-old-space-size=8192` 串行执行，不把高峰内存误修成关闭 Content 功能。

## 5. 验证方式

- `pnpm --filter @ruan-cat-drill-doc/ai-vue-doc list nuxt shadcn-docs-nuxt @ztl-uwu/nuxt-content h3 nitropack --depth 4` 显示 Content、Nuxt 与 Nitro 链均落到 `h3@1.15.11`。
- 全新本地 Nuxt 开发进程下，`/api/_content/cache.json` 与 `/api/_content/search` 均返回 HTTP `200`。
- 单包 `ai-vue-doc build` 成功。
- 两次串行 `pnpm run docs:build` 均输出 `9 successful, 9 total`；VitePress 分别在 `82.36s` 与 `81.10s` 完成。
- 两轮 stderr 未出现 `ERR_INVALID_URL`、Content API `500`、`ENOTEMPTY` 或 OOM；最终 `git diff --check` 通过。

## 6. 后续约束

- Nuxt 3 文档站当前以 `shadcn-docs-nuxt@1.1.9 + @ztl-uwu/nuxt-content@2.13.9 + h3@1.15.11` 作为仓库级已验证基线；升级其中任何一项时，必须按依赖矩阵整体验证，不能只看 semver。
- 升级前检查主题和 Content 的 `dependencies`、`peerDependencies`、`devDependencies`，特别关注未声明的运行时 import 和上游测试所用 Nuxt 世代。
- 验收必须依次覆盖 fresh install 解析树、fresh dev cache/search API、单包构建、两次串行全量构建和目标 Linux/部署环境；本地成功不能代替生产验证。
- 禁止以 `nitro.prerender.ignore`、`routes.clear()`、关闭搜索、关闭 prerender 或直接修改 `node_modules` 作为永久修复。
- Windows 下完整构建应串行并预留 `8 GiB` Node 堆；先观察进程 CPU、工作集和最终退出码，再判断卡死。
- 迁移到 `shadcn-docs-nuxt@1.2.x + Content@2.14.x + Nuxt 4` 只能作为另一条候选同代依赖线；本仓库尚未验证，不能写成可用事实。
