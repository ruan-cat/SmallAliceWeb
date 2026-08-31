# 2026-08-28 Cloudflare Embedding 脱敏诊断

## 1. 验证命令

```log
node --env-file=.env.local node_modules/tsx/dist/cli.mjs packages/ai-rag-api/scripts/diagnose-cloudflare-embedding.ts
```

## 2. 结果

```log
{"ok":true,"model":"@cf/baai/bge-m3","dimensions":1024}
```

单条中文请求返回 HTTP 成功和 1024 维向量，说明当前账户并非完全无法使用 embedding。此前批量任务的 HTTP 400 仍需结合 Cloudflare 错误体、批次大小和输入长度继续定位；本次诊断脚本不会输出密钥或完整请求体。
