# AI 对话与 VitePress 主题统一实施计划

> **For agentic workers:** 本计划在当前会话内按步骤执行；每一步都必须保留可复核测试或浏览器证据。

**目标：** 让 VitePress 文档站中的 AI 对话浮层完整继承 VitePress 亮色/暗色主题变量，消除硬编码深色面板与站点主题割裂。

**架构：** `ai-vue` 保留独立运行时 fallback；`ai-vitepress-plugins` 作为主题适配层，把 VitePress 的背景、文字、边框、品牌色、焦点和阴影语义变量映射到 AI 组件变量。来源链接沿用同一品牌软背景和文本色。

**技术栈：** Vue 3、SCSS、VitePress CSS variables、Vitest、Chrome 浏览器验收。

## 全局约束

- 不改变 `ai-vue` 脱离 VitePress 时的默认可用性。
- 不新增独立颜色体系；VitePress 集成层优先使用 `--vp-c-*` 和 `--vp-shadow-*`。
- 亮色与暗色必须通过 VitePress 的 `dark` 变量自动切换。
- 样式测试使用 Vitest 的 `describe` 与 `test`，文件使用 `*.test.ts`。
- 不勾选 OpenSpec 2.1.4，直到生产 Chrome 真实截图和来源跳转证据通过。

---

### 任务 1：建立主题变量映射契约

**文件：**

- 修改：`packages/ai-vitepress-plugins/src/client/style.css`
- 测试：`packages/ai-vitepress-plugins/src/tests/theme-style.test.ts`

- [ ] 写测试，断言集成 CSS 声明完整映射 AI 的 surface、text、border、primary、focus、shadow 变量，并引用 `--vp-c-*`/`--vp-shadow-*`。
- [ ] 运行该测试并确认旧 CSS 因缺少映射而失败。
- [ ] 添加完整语义变量桥接，保留 safe-area、z-index 与移动端布局规则。
- [ ] 重新运行测试，确认契约通过。

### 任务 2：移除 AI 浮层的主题割裂硬编码

**文件：**

- 修改：`packages/ai-vue/src/styles/index.scss`
- 测试：`packages/ai-vue/src/tests/ai-chat.test.ts`

- [ ] 增加主题变量 fallback 测试，确认独立 `ai-vue` 仍有 fallback，且 VitePress 集成可覆盖 header、trigger、source、status 与 close 状态。
- [ ] 用现有 AI 变量替换 header、open trigger、active trigger、status、来源背景和输入区域中的固定颜色。
- [ ] 保留语义状态色（成功/错误）为独立状态变量，不把它们误映射成品牌色。
- [ ] 运行 AI 组件测试与类型检查。

### 任务 3：本地构建与可见浏览器复核

**文件：**

- 不新增业务文件；检查生成的 `docs/.vitepress/dist`。

- [ ] 运行 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test`。
- [ ] 运行 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins typecheck` 和 `build`。
- [ ] 使用 8 GiB Node heap 运行 `pnpm run docs:build:run`。
- [ ] 启动本地 dev，使用 Chrome 验证亮色和暗色下 AI 面板、来源链接、按钮焦点和主题切换。
- [ ] 运行 `git diff --check` 和目标文件状态检查，记录全仓构建的独立 OOM 风险但不扩大本次范围。

### 任务 4：生产门禁准备

- [ ] 用户授权后提交并推送本次两个包的变更。
- [ ] 使用正确 deployment ID 执行 `inspect --wait --timeout 3m`。
- [ ] Chrome 生产复测亮色/暗色、`.ai-chat__source` 与真实 `sourceUrl#headingAnchor` 跳转。
- [ ] 只有生产证据完整后才更新 OpenSpec 2.1.4。
