# 2026-11-02 AI 聊天面板发送按钮 disabled：生产 Shadow DOM 真故障与本地合成输入假信号

## 1. 问题现象

- 生产站 `drill.ruan-cat.com` 打开 AI 对话面板后，模型选择器压住输入区、输入框被面板边界裁切，发送按钮恒 disabled，Enter 不发出请求。
- 本地 dev 站用合成注入（CDP `Input.insertText`、逐字符 `Input.dispatchKeyEvent`、agent-browser `type`）也能复现「按钮恒 disabled」，但真人用物理键盘输入完全正常。
- 两个现象表面相同，根因完全不同，曾导致把生产真故障误判为「假阳性」。

## 2. 实际根因

- 生产 `AiChatVitePressShell.vue` 使用 `variant="container-with-shadow"`，`XSender` 被渲染进 `DIV.ai-shadow-root`。Shadow DOM 会把选区 retarget 到宿主，编辑器拿不到真实选区、内部 model 不更新，`EVENT_COMMON_CHANGE` 不触发，`senderState.isEmpty` 恒为 `true`，发送按钮因此恒 disabled。
- 同一 shadow 隔离还让库 CSS 与 `.ai-chat-floating-button__dock .ai-chat` 覆盖全部命不中，工具条失去样式并被 dock-shell 裁切，表现为输入区被选择器压住。
- 本地 dev 已改成 `variant="no-shadow"`，所以本地合成注入看到的 disabled 只是「注入方式不驱动编辑器模型」的另一个现象，与生产根因不同。

## 3. 关键误导点

- 只在已修复的本地配置（`no-shadow`）上验证，就断言生产同类现象是假阳性，**没有对齐生产的 variant**。
- 用 `exposed.getPlugin()` 判断插件注入：该方法是包装器写死返回内联副本，永远报 1.3.3，天然无法证伪。
- 用 `getAttribute("translate")` 判断容器特征，而该信息实际在 `class="... notranslate"` 上。
- 三种合成注入方式结论互相矛盾，仍以其中一种作为判据继续推进。
- agent-browser 在本地 VitePress dev 页会 EOF，且分多条命令执行时会把会话标签页换成 `about:blank`；只有把 `open → click → probe → screenshot` 放进同一次 `batch` 才能拿到稳定读数。

## 4. 有效修复

- `AiChatVitePressShell.vue` 把 `variant` 改为 `no-shadow`，并把 `usePageContextCollector()` 提前到 setup 期调用（同时修掉 send 时的 `useRouter() is called without provider`）。
- 回滚为验证错误假设而引入的 `x-sender@1.4.6` 依赖与 `AiChat.vue` 两处 `:get-plugin`：`dist/index.js` 由 159895 B 降到 48.05 kB，且 `AiChat.vue`、`package.json`、`pnpm-lock.yaml` 对 HEAD 零 diff。

## 5. 验证方式

- 生产部署前（故障态取证）：agent-browser 单次 batch 实测 `shadowHosts=DIV.ai-shadow-root`、`sender-in-shadow`；截图显示模型选择器覆盖输入区、输入框被裁切。
- 本地：真人物理键盘输入后 `senderState.isEmpty=false`、`btnDisabled=false`，Enter 发出请求并回传服务端响应；`pnpm --filter @ruan-cat-drill-doc/ai-vue run test` 17 文件 134 用例全绿。
- 生产部署后（修复态取证）：同批次重新实测 `shadowHosts=0`、`sender-in-light`，并确认输入区可见、不被裁切。

## 6. 后续约束

1. 本地验收必须与生产配置和构建产物对齐（本例是 `variant`）。只测本地已修复配置就断言生产现象真假，属于无效结论。
2. 判定「输入框 / 发送按钮坏了」之前，先让真人用物理键盘敲一次作为基线，禁止只凭合成注入下结论。
3. 探针只认 `getSender().constructor.version` / `senderState.isEmpty` 与按钮 `disabled`；禁止用 `exposed.getPlugin()` 判断注入是否生效。
4. agent-browser 必须在单次 `batch` 内完成 `open → 交互 → 取证`，跨命令的会话标签页会漂移成 `about:blank`。
5. 生产发送后若弹出原始错误 JSON，先分辨是 API 路由缺失还是前端发送链路失败；`/v1` 404 属环境问题。
