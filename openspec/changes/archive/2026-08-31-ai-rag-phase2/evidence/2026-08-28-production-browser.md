# 2026-08-28 Production Chrome/CDP 验收

## 1. 发布与监听

```log
git push origin dev
git rebase dev
git push origin main
vercel ls small-alice-web-odse --prod --json
vercel inspect https://small-alice-web-odse-h1xxnddmd-ruancat-projects.vercel.app --json
```

- main HEAD：`485655d2cb20fdb95be791647d91d685e4f65b27`
- Deployment：`dpl_2svy5ahawCbShRYtsrswuKU7xzH5`
- 状态：`READY`
- alias：`https://drill.ruan-cat.com`
- 构建：`pnpm install`、`pnpm run build`、Node `22.x`、输出 `docs/.vitepress/dist`

## 2. 浏览器证据

使用 `agent-browser --args "--no-sandbox"` 启动 Chrome/CDP 会话 `prod2`：

- 生产页面加载成功并通过 `networkidle`。
- AI 对话真实请求返回流式回答；停止按钮“停止生成”出现并可点击。
- 点击停止后，已接收回答内容与参考资料导航仍保留。
- 页面内执行 `fetch` 到 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/v1/search`，返回 HTTP 200，`success=true`。
- 点击参考资料链接后，URL 跳转到真实文档页并包含 `#rag-heading-moqEjZWsXbSGx18MYgHyokPn-U7Wl3gbbNf6gZJfpVI` 稳定锚点。
- 截图：`2026-08-28-production-chat.png`、`2026-08-28-production-chat-final.png`。
