<!-- 已完成 -->

# AI 对话完成提醒实施计划

> **面向代理开发者：** 实施时按任务逐项执行，先写失败测试，再写最小实现；不得把本计划标记为完成，直到命令和浏览器证据真实产生。

**目标：** 在 VitePress 单一 AI 聊天框中实现自然回复完成后的标题提醒、授权后的失焦系统通知，以及纯前端受控 data-stream 浏览器验收。

**架构：** `useKnowledgeChat` 只负责识别本轮自然完成并发出一次回调；新的客户端注意力组合式函数负责 `useTitle`、权限、可见性、焦点和通知点击；VitePress 壳负责组装，通用 `ai-vue` 组件只提供可选展示插槽，不承载通知业务。

**技术栈：** Vue 3、VitePress、VueUse `useTitle` / `useDocumentVisibility` / `useWindowFocus`、`@ai-sdk/vue`、Vitest、`agent-browser` CLI。

## 1. 全局约束

- 只实现单一聊天会话，不实现多会话未读计数。
- 只在 AI 回复自然成功结束且产生新的助手消息时提醒；停止和错误不提醒。
- 权限申请只能由用户点击“开启回复通知”触发；拒绝后不循环申请。
- 系统通知只在页面不可见或窗口未聚焦时发送；标题提醒在自然完成后始终切换。
- 通知图标使用站点 favicon；客户端包使用 `import.meta.env.BASE_URL` 解析 `/favicon.svg`，避免把 VitePress Node 入口捆入库构建；站点 favicon 来源为 `docs/public/favicon.svg`。
- 所有浏览器验收使用 `agent-browser` CLI 和 `core` skill，并使用受控本地 data-stream，不依赖真实 embeddings、Neon、模型或生产 `/v1/chat`。
- 不修改 `openspec/changes/ai-rag-phase2/tasks.md` 的任务状态，不把本次前端验收当作 RAG 生产闭环证据。
- 不提交 Git；保留用户已有的 `prompts/index.md` 修改。

---

### 任务 1：为自然完成事件建立失败测试

**文件：**

- 修改：`packages/ai-vitepress-plugins/src/tests/use-knowledge-chat.test.ts`
- 修改：`packages/ai-vitepress-plugins/src/tests/use-knowledge-chat-http.test.ts`
- 修改：`packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`

**接口：**

- `KnowledgeChatOptions` 增加 `onResponseComplete?: () => void`。
- `useKnowledgeChat` 只在本轮请求自然结束、存在新的 assistant message、未调用 `stop()` 且没有 `chat.error` 时调用一次。

- [ ] **步骤 1：写 RED 测试**

使用已有测试中的真实 data-stream fixture，增加以下 `describe` / `test`：

```ts
test("自然流结束后只触发一次完成回调", async () => {
	const completed = vi.fn();
	const chat = useKnowledgeChat("test", { fetch: streamFetch, onResponseComplete: completed });

	await chat.send(userMessage);

	expect(completed).toHaveBeenCalledTimes(1);
});

test("停止请求不触发完成回调", async () => {
	const completed = vi.fn();
	const chat = useKnowledgeChat("test", { fetch: abortableStreamFetch, onResponseComplete: completed });

	const request = chat.send(userMessage);
	chat.stop();
	await request;

	expect(completed).not.toHaveBeenCalled();
});
```

- [ ] **步骤 2：运行 RED 测试**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test -- src/tests/use-knowledge-chat.test.ts src/tests/use-knowledge-chat-http.test.ts
```

预期：新增断言失败，原因是 `onResponseComplete` 尚未存在或未触发。

- [ ] **步骤 3：实现最小请求隔离**

在 `ActiveRequest` 中加入 `stopped: boolean`，`stop()` 先标记当前请求再调用 SDK `chat.stop()`；`send()` 在 `chat.append()` 自然返回后检查本轮 assistant id、错误和停止标记，再调用回调，并将回调限制为当前请求一次。

- [ ] **步骤 4：运行 GREEN 测试**

运行同一条 Vitest 命令，预期自然完成、停止、错误和现有 data-stream 测试全部通过。

### 任务 2：实现客户端注意力提醒组合式函数

**文件：**

- 新增：`packages/ai-vitepress-plugins/src/client/composables/useChatCompletionAttention.ts`
- 新增：`packages/ai-vitepress-plugins/src/tests/use-chat-completion-attention.test.ts`
- 修改：`packages/ai-vitepress-plugins/package.json`

**接口：**

```ts
export type ChatCompletionAttentionOptions = {
	title: string;
	notificationTitle: string;
	notificationBody: string;
	icon: string;
};

export function useChatCompletionAttention(options: ChatCompletionAttentionOptions): {
	permission: Ref<NotificationPermission | "unsupported">;
	canRequestPermission: ComputedRef<boolean>;
	requestPermission: () => Promise<NotificationPermission | "unsupported">;
	markCompleted: () => void;
	clear: () => void;
};
```

- [ ] **步骤 1：添加依赖并写 RED 测试**

将 `@vueuse/core` 作为 `packages/ai-vitepress-plugins` 的直接依赖；在 jsdom 中注入可控的 `Notification`、`document.visibilityState`、`document.hasFocus()` 和 `window.focus()`，测试：完成切题、聚焦不通知、失焦通知、拒绝不重试、点击通知清理、无 API 降级。

- [ ] **步骤 2：运行 RED 测试**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test -- src/tests/use-chat-completion-attention.test.ts
```

预期：测试因组合式函数不存在而失败。

- [ ] **步骤 3：实现最小组合式函数**

使用 VueUse `useTitle` 管理标题，使用 `useDocumentVisibility` 与 `useWindowFocus` 判断当前页面状态；`markCompleted()` 始终切换标题，只有 `permission === "granted"` 且页面隐藏或窗口失焦时构造通知。通知点击调用 `window.focus()`、`notification.close()` 和 `clear()`。所有浏览器对象都放在客户端生命周期内访问。

- [ ] **步骤 4：运行 GREEN 与类型检查**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test -- src/tests/use-chat-completion-attention.test.ts
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins typecheck
```

预期：新增测试和类型检查通过，拒绝/不支持路径无未捕获异常。

### 任务 3：为通用聊天 UI 增加无业务耦合的授权入口插槽

**文件：**

- 修改：`packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue`
- 修改：`packages/ai-vue/src/components/ai-chat/AiChat.vue`
- 修改：`packages/ai-vue/src/tests/ai-chat.test.ts`

- [ ] **步骤 1：写 RED 测试**

增加测试确认 external 模式下可渲染命名插槽，插槽按钮的点击事件由使用方接收；mock 模式和未提供插槽时保持现有渲染不变。

- [ ] **步骤 2：运行 RED 测试**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue test -- src/tests/ai-chat.test.ts
```

- [ ] **步骤 3：实现最小展示扩展**

在对话面板头部或状态区域增加可选 `notification-control` 插槽，并由 `AiChatFloatingButton` 原样透传给 `AiChat`；不在 `ai-vue` 中读取 `Notification`、切换标题或请求权限。

- [ ] **步骤 4：运行 GREEN 与类型检查**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue test -- src/tests/ai-chat.test.ts
pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck
```

### 任务 4：在 VitePress 壳中接入完成提醒与授权状态

**文件：**

- 修改：`packages/ai-vitepress-plugins/src/client/components/AiChatVitePressShell.vue`
- 新增或修改：`packages/ai-vitepress-plugins/src/tests/plugin.test.ts`

- [ ] **步骤 1：写 RED 测试**

使用挂载测试验证：客户端壳提供“开启回复通知”按钮；授权成功后按钮状态更新；权限拒绝显示站点设置说明；`useKnowledgeChat` 完成回调触发 `markCompleted()`；壳卸载不残留事件监听。

- [ ] **步骤 2：实现客户端接入**

在 VitePress 客户端壳初始化注意力组合式函数，使用 `import.meta.env.BASE_URL + "favicon.svg"` 生成 icon，传入 `useKnowledgeChat` 的完成回调；只在 `isMounted` 后显示入口。标题恢复依赖当前页面标题，不使用永久固定的首次页面标题。

- [ ] **步骤 3：运行包级验证**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins typecheck
pnpm run build
```

预期：包测试、类型检查和 VitePress 文档站构建通过；不得修改 `openspec/changes/ai-rag-phase2/tasks.md`。

### 任务 5：使用 agent-browser 完成纯前端受控流验收

**文件：**

- 新增：`.use-other-model/task-20260820-ai-chat-attention-browser/` 下的浏览器验收记录（该目录必须保持 git-ignored）
- 不修改生产源码或 OpenSpec 任务状态。

- [ ] **步骤 1：准备受控 data-stream**

启动文档站开发服务器，并使用 `agent-browser` 的 network route 将 `/v1/chat` 替换为固定、可结束的 AI SDK data-stream 响应；响应必须产生一条 assistant 消息并正常结束，不调用真实 embeddings、Neon 或模型。

- [ ] **步骤 2：按 core skill 打开页面并确认首屏**

运行 `agent-browser skills get core`，然后使用 `agent-browser open`、`snapshot -i`、`get title` 确认页面和 AI 对话入口加载，无白屏、布局错误或阻断性 console/runtime 错误。

- [ ] **步骤 3：执行核心交互**

打开 AI 对话面板，点击“开启回复通知”；在授权成功的浏览器会话中提交测试问题；用 `get title` 记录完成后的标题；切换页面可见性/窗口焦点后确认系统通知触发条件；点击通知后确认标题恢复并尝试聚焦页面。

- [ ] **步骤 4：记录边界与清理**

分别记录授权拒绝、聚焦页面不弹系统通知、页面隐藏时弹通知和不支持通知 API 的结果。将 URL、首屏、交互、标题变化、通知结果和失败原因写入验收日志；结束时运行 `agent-browser close`，确认不遗留本轮浏览器会话。

### 任务 6：最终独立复核

**文件：**

- 复核：本计划列出的所有生产文件和测试文件
- 复核：`.use-other-model/task-20260820-ai-chat-attention-browser/` 验收日志

- [ ] **步骤 1：检查范围与格式**

运行 `git diff --check`、预留词扫描和 `git status --short --untracked-files=all`，确认只包含本功能相关改动与忽略的临时验收目录，且没有 OpenSpec 任务状态变化。

- [ ] **步骤 2：执行全量前端验证**

运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue test
pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins typecheck
pnpm run build
```

- [ ] **步骤 3：复核结论边界**

最终结论只能声明纯前端标题/通知能力已通过自动化和受控浏览器验收；必须明确真实 RAG embeddings、Neon、模型和生产浏览器闭环仍由 `ai-rag-phase2` 的未完成任务负责。
