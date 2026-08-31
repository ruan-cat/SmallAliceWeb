# Changelog

**Multiple Packages Updated** - 2026-08-31

## @ruan-cat-drill-doc/ai-rag-core@0.1.0 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-rag-core@0.1.0)

### ✨ 新增功能

- **rag-core:** 完善结构化分块与 embedding 文本 ([3f73a81](https://github.com/ruan-cat/SmallAliceWeb/commit/3f73a81))

  将标题路径、父块关系、FAQ/代码原子块和句子边界 overlap 纳入统一 chunk 合同，并提供排除图片地址的确定性 embedding 文本。这样同步与检索可以共享同一份结构化语料语义。

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## @ruan-cat-drill-doc/ai-vitepress-plugins@0.0.1 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-vitepress-plugins@0.0.1)

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## @ruan-cat-drill-doc/ai-vue@0.0.1 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-vue@0.0.1)

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))
