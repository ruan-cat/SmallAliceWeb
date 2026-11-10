# 2026-11-11 错误处理增强设计（spec）

> - **状态**：待实施（本文档未经实施，不携带任何完成标记）
> - **Agent 工具**：ZCode（GLM-5.3-Flash；蜂群：2 探索 + 1 编辑 + 1 复核）
> - **上游调研**：[../2026-11-11-zcode-model-auto-inference-research.md](../2026-11-11-zcode-model-auto-inference-research.md)（同日错误处理专项调研，骨架来源见 8.1）；同目录既有 [轻量版模型配置 spec](./2026-11-10-lightweight-model-config-design.md)（本设计与其正交，不改动其端点契约）
> - **执行计划**：[../plans/2026-11-11-error-handling-plan.md](../plans/2026-11-11-error-handling-plan.md)

## 一、背景与病灶（已源码级确认）

用户实测：模型列表接口 405 后，面板只留下用户那句话——没有状态码、没有错误正文、没有任何失败提示。

| #   | 病灶                   | 根因链（file:line）                                                                                                                                                                                                                                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | 模型列表失败被静默吞掉 | `useKnowledgeChat.ts:196-208`：`response.ok ? response.json() : undefined`（非 2xx 直接变 undefined）+ `.catch(() => {})` 吞网络异常 → `models=[]` → `AiChat.vue:314/433` 的 `v-if="props.models?.length"` 使选择器整块消失；且该静默被 `ms3-model-switching.test.ts:168-231` 三个用例断言（实施时必须翻正） |
| P2  | 面板标题写死           | `AiChatFloatingButton.vue:66-70`：「AI 对话」/「本地助手」为模板硬编码，`AiChatProps`（types.ts:102-142）无 header props                                                                                                                                                                                     |
| P3  | 405 后无状态码无正文   | AI SDK 对非 2xx：`restoreMessagesOnFailure()` + `throw new Error(await response.text())`——错误对象**无 statusCode 字段**；`useKnowledgeChat.ts:249-271` 未传 `onError`；`errorMessage` computed（:333-338）仅对 `RAG_NOT_CONFIGURED` 特判，其余原样输出 raw body（405 时常为 Nitro/CF 默认错误体，无语境）   |

辅证：`ChatEvent` 体系（types.ts:80-88）无 error 事件类型，错误进不了 `onChatEvent` 埋点管线；`models.get.ts:12-23` 恒 200 无错误分支；Nitro 无统一错误钩子，405/404 框架级错误不符合 `{success,code,message}` 合同体。三容器（AiChatFloatingButton/AiModalChat/AiSidebarChat）对 errorMessage 已整包透传（v-bind props），改 AiChat/AiChatProps 即全量生效。

## 二、目标 / 非目标

### 目标

1. 三病灶全修：模型列表失败**可见**（错误条 + 重试）、header 状态**真实**（错误时不再是「本地助手」）、chat 失败**带状态码与正文摘要**。
2. 统一错误模型 `{code, message, statusCode?, detail?, scope}` 贯穿宿主捕获层 → props → UI。
3. 错误进事件管线：`ChatEvent` 新增 error 类型，宿主在捕获点 emit。
4. 静默 catch 清理：P1 的空 catch 改为结构化捕获；「降级不冒充业务结论」——列表加载失败 ≠ 无可用模型。
5. 既有测试翻正（ms3 三个静默用例改为断言错误上报）+ 新增非 2xx 用例。

### 非目标（后续版本）

- 气泡流内错误尾块（turn-error 形态）：涉及 messages 映射与身份对齐，横幅已完整呈现错误信息，列后续。
- 错误指纹去重（关闭后同错误不再弹，ZCode `dismissedErrorKeys` 模式）：沿用现有 clearError 语义。
- 自动重试/倒计时行（deepseek ModelRetryNode）：chat 失败重试 = 用户重发，现状保留。
- 服务端 Nitro 框架级错误（405/404）的合同体化：客户端兜底已能展示状态码与正文，服务端钩子作为可选任务（见 plan Task 4，允许降级跳过）。
- i18n 抽象：沿用全包中文硬编码文案惯例。

## 三、统一错误模型

宿主 `useKnowledgeChat.ts` 内新增（不导出到 ai-vue 的类型文件，UI 只收展示所需子集）：

```ts
export interface AiChatUiError {
	code: string; // 稳定机器码，见 3.1 错误码表
	message: string; // 可读中文，含状态码语境（如「模型列表加载失败（HTTP 405）」）
	statusCode?: number; // HTTP 状态码（拿到才填，绝不臆造）
	detail?: string; // 原始正文摘要（截断 500 字符）
	scope: "models" | "chat";
}
```

### 3.1 错误码表（code 稳定、message 可读、二者不混用——骨架来源见 8.1 骨架 1/3）

| code                   | scope  | 触发场景                              | message 模板                            |
| ---------------------- | ------ | ------------------------------------- | --------------------------------------- |
| `MODELS_LOAD_FAILED`   | models | loadModels 非 2xx                     | `模型列表加载失败（HTTP {statusCode}）` |
| `MODELS_NETWORK_ERROR` | models | loadModels fetch reject               | `模型列表加载失败（网络异常）`          |
| `CHAT_HTTP_ERROR`      | chat   | POST /v1/chat 非 2xx                  | `请求失败（HTTP {statusCode}）`         |
| `CHAT_STREAM_ERROR`    | chat   | 流内 3: 错误帧 / onError 无 HTTP 语境 | `对话处理失败` + 原始信息摘要           |
| `RAG_NOT_CONFIGURED`   | chat   | 既有特判保留                          | 现有友好文案                            |
| `UNKNOWN`              | chat   | 兜底                                  | `发生未知错误` + 原始信息摘要           |

## 四、捕获层改造（宿主 ai-vitepress-plugins，ai-vue 保持零 fetch 纪律）

1. **statusCode 拦截点 = `sourceAwareFetch`**（`useKnowledgeChat.ts:211-248`）：AI SDK 对非 2xx 会吞掉 fetch 层 Error 自建 `Error(body)`（无 statusCode），唯一可靠拦截点是宿主自己的 fetch 包装——对 `!response.ok`：读 body 文本（try 包裹防二次失败）截断 500 字符，存入模块级 `chatHttpError` ref，**然后重建等价 Response**（`new Response(detail, { status, statusText, headers })`——实现验证：Response body 只能读一次，原样返回已消费的 response 会让 AI SDK 再读时抛 Body consumed；204/205/304 无 body 状态原样返回防 TypeError），让 AI SDK 走既有 error 路径保持 status="error" 语义不变。
2. **useChat 传入 `onError`**（:249-271）：优先消费 `chatHttpError` ref 合成 `CHAT_HTTP_ERROR`；无 HTTP 语境时按 `error` ref 内容合成 `CHAT_STREAM_ERROR`/`UNKNOWN`；合成后 emit `chat_error` 事件并清空 `chatHttpError`。
3. **loadModels 结构化**（:196-208）：空 catch 删除（**例外**：读响应正文的 `try { detail = await response.text() } catch {}` 属防御性缺省，允许保留——失败语义仍结构化上报，只是 detail 缺省）；`!response.ok` → 读 body 合成 `MODELS_LOAD_FAILED`；fetch reject → `MODELS_NETWORK_ERROR`；失败时 `models` 保持 `[]`（不冒充），新增 `modelsError` ref 纳入返回值；`refreshModels` 复用同函数自动获得同行为。
4. **errorMessage computed 扩展**（:333-338）：从「仅 RAG_NOT_CONFIGURED 特判」改为按 3.1 码表合成完整摘要串（含 `HTTP {statusCode}` 与 detail 摘要），保持 string 类型向后兼容（Shell/三容器零改动）。
5. **headerStatus computed**：`chat.error ? "连接异常" : "本地助手"`，经新 props 下发。
6. **ChatEvent 扩展**：types 新增 `{ type: "chat_error"; error: { code; message; statusCode?; scope } }`；`onError` 内 emit——错误进入既有 `onChatEvent` 埋点管线。

## 五、UI 呈现（ai-vue 组件层，双分支 + 双样式纪律全覆盖）

1. **模型加载失败条**（对症 P1，仿 deepseek `ModelSelect.tsx:77-87,550-557` 菜单内错误条）：`AiChat.vue` 双分支的选择器位置（:314/:433）在 `v-if="props.models?.length"` 后新增 `v-else-if="props.modelsError"` 分支：单行错误条（`role="alert"`、`.ai-chat__models-error` 类、红点 + message + 「重试」文本按钮）→ emit `retry-models`，宿主接 `refreshModels`。**不冒充**：无 `modelsError` 且无 models 时维持现状（不渲染）。
2. **chat 错误横幅增强**（对症 P3）：现有顶部 `role="alert"` 横幅（:221-226/:340-345）保留结构与「关闭」按钮，内容由 errorMessage 合成串自然携带 `HTTP {statusCode}` 与正文摘要；无需结构改造。
3. **header 状态位**（对症 P2）：`AiChatFloatingButton.vue:66-70` 新增 `headerTitle`（缺省 `AI 对话`）与 `headerStatus`（缺省 `本地助手`）props（加入 :25 Pick 白名单与 types.ts），模板绑定之；宿主下发 computed，错误时显示「连接异常」。向后兼容：不传 props 时文案与现状一致。
4. **样式纪律**：新错误条的 SCSS 以分节注释写入 `styles/index.scss` 与 `styles/shadow-scoped.ts` 两份同步；颜色只引用 `--ai-chat-*` 变量。
5. **测试 stub 纪律**：沿用 `ms4-model-picker.test.ts:4-12` 的 vi.mock 先例。

## 六、服务端（列为非目标的说明）

Nitro 框架级 405/404 目前返回默认错误体（不符合 `{success,code,message}` 合同）。客户端兜底（见第四节第 2 点）已保证「状态码 + 正文摘要」对用户可见，因此服务端合同体化整体列为非目标（见第二节），本计划不安排服务端任务。

## 七、验收标准

1. 模拟 `GET /v1/models` 返回 405（测试服务器）：挂件面板出现模型加载失败条，含「HTTP 405」与正文摘要；点击「重试」触发 refreshModels；**不再出现**「无提示的选择器消失」。
2. 模拟 `POST /v1/chat` 返回 500：错误横幅内容含「HTTP 500」与正文摘要（不再是裸 raw body）。
3. 模拟 fetch reject（断网）：模型条与横幅分别给出网络异常文案。
4. `onChatEvent` 收到 `chat_error` 事件（含 code/statusCode/scope）。
5. header 状态位：错误期间显示「连接异常」，恢复后回到「本地助手」；不传 props 时文案与改造前一致（向后兼容）。
6. ms3 三个原「静默」用例翻正为断言 `modelsError` 上报；新增非 2xx 用例全绿。
7. `pnpm --filter @ruan-cat-drill-doc/ai-vue test && pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test`（或等价 vitest 通道）全绿；ai-vue typecheck 零错误；ai-vitepress-plugins typecheck **净引入零错误**（其基线遗留 9 个属 MS-3 在制范围，不在本任务验收口径内）。
8. 新增 SCSS 在两份样式文件中分节同步存在。

## 八、来源与参考

### 8.1 骨架来源（ZCode / deepseek-harness，Apache-2.0/MIT）

| 骨架                                                | 来源                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 统一错误形状 + 归一化函数（多路径挖根因）           | ZCode `packages/shared/src/zcode-task-types.ts:234`、`packages/ui/src/lib/zcodeUiError.ts:180-260`         |
| 传输失败折入统一错误分支（非裸抛）                  | deepseek `packages/api/gateway/src/client/index.ts:449-470,832-853`                                        |
| 码表驱动 UI 动作                                    | ZCode `packages/ui/src/lib/providerBusinessError.ts:14-100`                                                |
| 错误 banner（摘要+详情+复制+重试+关闭）             | ZCode `packages/ui/src/ChatErrorBanner.tsx:159-420`（渲染位 `ConversationComposer.tsx:2743-2775`）         |
| 降级不冒充业务结论（check-failed ≠ missing）        | ZCode `packages/ui/src/v4/composer/useDraftModelReadinessGate.ts:115-131`                                  |
| 模型列表失败：定向 UI 通道 + 重试按钮               | deepseek `packages/client/ui-model-selection/src/client/ModelSelect.tsx:77-87,550-557`、`catalog.ts:69-76` |
| 流内失败保留已输出 + 终态尾块（本期为非目标，参考） | deepseek `packages/client/ui-chat/src/client/chat/MessageItem.tsx:132-146`                                 |

### 8.2 事实基线（SmallAliceWeb 侦察结论）

见第一节病灶表与第五节各组件行号；AI SDK 非 2xx 行为实证：`@ai-sdk+ui-utils@1.2.11` dist `:1234-1238`、`@ai-sdk+vue@1.2.12` dist `:149-153`。
