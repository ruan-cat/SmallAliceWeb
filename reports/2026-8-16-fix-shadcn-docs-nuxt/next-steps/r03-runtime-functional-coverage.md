# R03 运行时 smoke 覆盖面不足

- **优先级**：P1
- **状态**：OPEN
- **类型**：功能回归 / 部署验收

## 风险说明

当前 CI 的 runtime smoke 只请求 `/`。它能够验证 Nitro server 启动、首页 SSR 和部分共享依赖，但不能代表整个文档站的关键功能都可用。

本轮调查涉及 Nuxt Content、search、Element Plus、`@ruan-cat-drill-doc/ai-vue` 组件以及 shadcn-docs-nuxt。不同路由可能触发不同 server chunks 和 runtime dependencies。因此“首页 200”仍可能漏掉只在搜索、组件 demo 或某类 Content 页面加载时出现的缺包与 SSR 错误。

## 已知证据

- E1 prerender 曾生成 Content search/cache 路由，说明 Content/search 是 production build 的真实组成部分。
- `@popperjs/core` 缺失在请求 `/` 时已经暴露，但不能假定所有潜在缺依赖都会在首页触发。
- 最终验收计划原本就要求 docs 页面、组件展示、Content/search 无已知回归，但当前 CI 没有把这些要求全部自动化。

## 建议加固任务

1. 识别 3–5 条最小核心 smoke route：
   - 首页；
   - 一条真实文档 Content 页面；
   - 一条会渲染 `ai-vue` / Element Plus 组件的页面；
   - 搜索相关的稳定 API 或用户可调用搜索路径；
   - 如有 i18n 路由，再覆盖默认 locale 的真实入口。
2. 路由选择必须稳定，避免使用带时间戳的内部 prerender URL 作为长期断言。
3. 对每条路由同时检查：HTTP status、server log 无 unhandled error、返回体包含最小语义锚点。
4. 将这些 smoke 与 R02 的 isolated `.output` 验证结合，而不是只在 monorepo 环境执行。
5. 如果搜索只能通过浏览器交互触发，可增加 Playwright/e2e，但不要一开始就把整个 UI 测试体系塞进当前 CI。

## 验收标准

- [ ] 至少一条普通 Content 页面通过 isolated output HTTP smoke。
- [ ] 至少一条真实组件展示页面通过。
- [ ] search 的真实用户路径或稳定 API 通过。
- [ ] 所有请求均检查 5xx / unhandled runtime error。
- [ ] smoke route 列表有文档说明，页面改名时能明确维护。

## 不要做什么

- 不要把带构建时间戳的内部 Content cache URL 硬编码为永久接口。
- 不要为了测试容易而关闭 search、Content 或组件 SSR。
- 不要用单纯字符串 `curl` 成功替代对 HTTP status 和 server log 的检查。