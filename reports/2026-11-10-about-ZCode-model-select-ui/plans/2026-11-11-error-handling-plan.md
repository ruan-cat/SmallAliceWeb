# 错误处理增强实施计划（plan）

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 按任务逐个实施。步骤使用 checkbox（`- [ ]`）跟踪。**提交步骤须用户在当前会话明确授权后执行 git commit。**

**目标（Goal）：** 修复 SmallAliceWeb 挂件的三个错误病灶（模型列表失败静默、header 写死文案、chat 失败无状态码无正文），建立统一错误模型并使错误在 UI 及时可见。

**架构（Architecture）：** 宿主 `useKnowledgeChat.ts` 为唯一捕获层（`sourceAwareFetch` 拦截非 2xx 拿 statusCode + `onError` 归一化），产出统一 `AiChatUiError`；ai-vue 组件层保持**零 fetch 纯受控**，经 props（`modelsError`/`headerTitle`/`headerStatus`/增强的 `errorMessage`）呈现，经 emit（`retry-models`）回传动作；`ChatEvent` 增加 error 类型进埋点管线。骨架照抄 ZCode ChatErrorBanner / deepseek 菜单内错误条（来源见 spec 8.1）。

**技术栈（Tech Stack）：** Vue 3.5 + element-plus（仅既有组件）+ @ai-sdk/vue + vitest + jsdom（vi.mock stub 先例）。

**Spec：** [../specs/2026-11-11-error-handling-design.md](../specs/2026-11-11-error-handling-design.md)

## 全局约束（Global Constraints）

- ai-vue 保持零 fetch / 零 localStorage / 零 API 配置的纯受控纪律（一切网络与持久化在宿主 `useKnowledgeChat.ts`）。
- 禁止引入 el-dialog / el-select / 图标库（shadow 分支 teleport 丢 `--ai-chat-*` 变量）；新样式双份同步 `styles/index.scss` 与 `styles/shadow-scoped.ts`。
- `models` 加载失败保持 `[]`，**不得渲染「无可用模型」类文案**（降级不冒充业务结论）。
- 不改 `lightweight-model-config` spec/plan 的端点契约；本计划与其正交。
- commit 提交动作须用户当场授权；署名 `Assisted-by: ZCode / <会话模型>`。
- 仓库内 `.env*` 含 provider key 类配置，严禁引入客户端 bundle 或复述其值。

## 评审焦点（Review Focus）

1. **statusCode 可靠性**：AI SDK 对非 2xx 吞 fetch 层 Error 自建 `Error(body)`——statusCode 只能从 `sourceAwareFetch` 拦截点拿；若从 `error.message` 正则反解析则 FAIL。→ Task 1 测试。
2. **不冒充**：models 加载失败后 UI 不得出现「无可用模型/暂无模型」语义。→ Task 2 测试。
3. **向后兼容**：不传新增 props 时，FloatingButton 文案与 AiChat 行为与改造前一致。→ Task 2 测试。
4. **双分支遗漏**：新错误条必须同时出现在 shadow（约 :314）与 light（约 :433）分支，漏一处 FAIL。→ Task 2 测试 + 样式双份。
5. **静默清零**：`loadModels` 链上不得残留空 catch 或 `: ? undefined` 静默分支。→ Task 1 grep 自查。

---

### Task 1: 宿主捕获层改造（useKnowledgeChat.ts + ChatEvent 类型）

**Files:**

- Modify: `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`（:196-208 loadModels、:211-248 sourceAwareFetch、:249-271 useChat options、:333-338 errorMessage computed、返回值对象）
- Modify: `packages/ai-vitepress-plugins/src/client/composables/` 下 ChatEvent 类型所在 types 文件（`type: "chat_error"` 联合成员；实施前先 grep `ChatEvent` 确认定义位置）
- Test: `packages/ai-vitepress-plugins/src/tests/ms3-model-switching.test.ts`（翻正 :168-231 三个静默用例）、`src/tests/use-knowledge-chat-http.test.ts`（新增非 2xx 用例）

**Interfaces:**

- Produces（Task 2 依赖）:

```ts
interface AiChatUiError {
	code: string;
	message: string;
	statusCode?: number;
	detail?: string;
	scope: "models" | "chat";
}
// useKnowledgeChat 返回值新增：
modelsError: Ref<AiChatUiError | undefined>; // scope="models"
headerStatus: ComputedRef<string>; // chat.error ? "连接异常" : "本地助手"
// 新增 ChatEvent 成员：{ type: "chat_error"; error: { code: string; message: string; statusCode?: number; scope: "models" | "chat" } }
```

- [ ] **Step 1: 翻正与新写失败测试**——ms3 :168-231 三个用例改为断言：fetch reject / 非法 JSON / 503 后 `modelsError` 被填充（code 分别为 MODELS_NETWORK_ERROR / MODELS_LOAD_FAILED，503 含 statusCode=503）且 `models` 保持 `[]`；http 测试新增「POST /v1/chat 返回 405」用例断言 errorMessage 含 `HTTP 405` 与正文摘要、onChatEvent 收到 `chat_error`（statusCode=405）。

- [ ] **Step 2: 跑测试确认失败**（Run: `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test`；Expected: 新断言 FAIL）

- [ ] **Step 3: 实现**——按 spec 第四节五点：①sourceAwareFetch 对 `!response.ok` 读 body（try 包裹）截 500 字符存模块级 `chatHttpError` ref 后原样返回 response；②useChat options 传入 `onError`：优先 `chatHttpError` → `CHAT_HTTP_ERROR`，否则 error ref → `CHAT_STREAM_ERROR`/`UNKNOWN`，合成后 emit `chat_error` 并清空 ref；③loadModels 删空 catch 与 `: ? undefined`，非 2xx/异常分别合成 `MODELS_LOAD_FAILED`/`MODELS_NETWORK_ERROR` 写 `modelsError`；④errorMessage computed 按 spec 3.1 码表合成含 `HTTP {statusCode}` 的摘要串；⑤`headerStatus` computed；返回值对象补 `modelsError`/`headerStatus`。

- [ ] **Step 4: 跑测试确认通过 + grep 自查**（`grep -n "catch (() => {})" useKnowledgeChat.ts` 应零命中 loadModels 相关行；全部测试 PASS）

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-vitepress-plugins/
git commit -m "🐞 fix(ai-vitepress-plugins): 知识问答宿主错误链路结构化（状态码/错误模型/事件）"
```

---

### Task 2: ai-vue 呈现层（错误条 / header props / 样式双份）

**Files:**

- Modify: `packages/ai-vue/src/components/ai-chat/types.ts`（AiChatProps + `modelsError?: { message: string; statusCode?: number }`、`headerTitle?: string`、`headerStatus?: string`；Pick 白名单同步）
- Modify: `packages/ai-vue/src/components/ai-chat/AiChat.vue`（双分支 :314/:433 选择器位加 `v-else-if="props.modelsError"` 错误条 + 「重试」文本按钮 emit `retry-models`；emits 定义补充）
- Modify: `packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue`（:25 Pick、:66-70 标题绑定 headerTitle/headerStatus 缺省值；透传 `retry-models`）
- Modify: `packages/ai-vue/src/styles/index.scss` 与 `src/styles/shadow-scoped.ts`（`.ai-chat__models-error` 分节注释两份同步，颜色走 `--ai-chat-*`）
- Test: `packages/ai-vue/src/tests/ai-chat.test.ts`（错误条渲染/重试 emit/向后兼容三断言）

**Interfaces:**

- Consumes: Task 1 的 `modelsError`/`headerStatus`（经 AiChatVitePressShell.vue 透传——Shell Modify 一行绑定）。
- Produces: 双分支错误条（`role="alert"`，红点 + message + 可选 statusCode 徽标 + 「重试」）；emit `retry-models`。

- [ ] **Step 1: 写失败组件测试**——①传 modelsError 时双分支各渲染一条 `role="alert"` 且含 message 与「重试」；②点击重试 emit `retry-models`；③不传 `headerTitle/headerStatus` 时 FloatingButton 文案为「AI 对话/本地助手」（向后兼容）；④传 `headerStatus="连接异常"` 时显示之；⑤`modelsError` 存在时不得出现「无可用模型」类文案。

- [ ] **Step 2: 跑测试确认失败**（Run: `pnpm --filter @ruan-cat-drill-doc/ai-vue test`；Expected: 新断言 FAIL）

- [ ] **Step 3: 实现**——按 spec 第五节：types 三 props、AiChat 双分支错误条（element-plus 仅用既有可用组件，按钮用原生 button + 既有类名）、FloatingButton 绑定与透传、Shell（`packages/ai-vitepress-plugins/src/client/`）绑定 modelsError/headerStatus/refreshModels、SCSS 两份分节同步。

- [ ] **Step 4: 跑测试确认通过 + 双包 typecheck 零错误 + 样式双份 grep 比对**

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-vue/ packages/ai-vitepress-plugins/src/client/
git commit -m "✨ feat(ai-vue): 模型加载失败条与 header 状态位（错误可见化）"
```

---

### Task 3: 端到端验收（对照 spec 第七节）

**Files:** 无新文件；验收记录会话内汇报。

- [ ] **Step 1: 全量测试与 typecheck**——`pnpm --filter @ruan-cat-drill-doc/ai-vue test && pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test` + 双包 typecheck；spec 验收 6/7。
- [ ] **Step 2: 本地行为走查**——VitePress/文档站本地起挂件，用测试服务器分别模拟 405（models）、500（chat）、断网，人工核对 spec 验收 1/2/3/5；浏览器操作遵守用户既有可见性偏好。
- [ ] **Step 3: 事件管线核对**——onChatEvent 收到 chat_error（验收 4）。
- [ ] **Step 4: 向用户汇报验收证据**（命令输出 + 截图），等待用户确认。
