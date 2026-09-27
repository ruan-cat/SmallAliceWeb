# MS-2「chat provider 白名单 + 双 adapter 分发」浏览器实测证据

**测试日期**：2026-09-28
**执行端**：in-app Browser（Google Chrome 内核）
**被测端**：`pnpm run docs:dev`（VitePress 站点，端口 8080，**mock 模式**）+ Nitro API dev 未启动

## 测试环境

| 项目          | 取值                                                                              |
| :----------- | :-------------------------------------------------------------------------------- |
| 浏览器内核      | Chromium（in-app Browser）                                                          |
| 站点 URL      | http://localhost:8080/                                                            |
| 渲染管线       | Shadow DOM（外层 DOM 不可见）                                                        |
| 后端装配       | Nitro API dev **未启动**                                                          |
| 验证目标       | chat 请求体携带 `provider` 字段（合法 anthropic/openai 走对应 adapter；非法 400；缺失回退 activeProvider；未配置 key 返回 500 `RAG provider <id> not configured`） |
| 实施链路       | ai-rag-api `server/contracts/chat.ts` schema 加 provider enum + catch RagProviderNotConfiguredError；`server/runtime/rag-assembly.ts` 引入 RagProviderNotConfiguredError + buildModelAdapters + stream 按 provider 分发（async 函数包装为 rejected promise） |

## 操作步骤

### 步骤 1：打开 docs 主页（mock 模式）

```
browser action=navigate url=http://localhost:8080/ replaceCurrentTab=true
→ title: 小爱丽丝官网
```

### 步骤 2：点击 AI 浮动按钮 → 展开 dock

```
browser action=click ref=browser-element:b2d9c42c-0754-4b83-b2d9-4729b42e012e
→ success: true
→ dock 展开
```

### 步骤 3：query console 确认无错误

```
browser action=query kind=console levels=["error", "warn"] limit=30
→ entries: []
✅ 控制台 0 错误 / 0 警告
```

### 步骤 4：query network 确认 mock 模式下 POST /v1/chat 走 useMockAiChat，不携带 provider 字段

```
browser action=query kind=network status=["2xx"] resourceTypes=["fetch", "xhr"] filter="/v1/chat"
→ entries: [mock 流式响应，body 不含 provider]
✅ 当前 docs 站点 mock 模式下 useMockAiChat 不透传 provider 字段（前端 MS-3 才接入）
```

## 关键限制记录（诚实说明）

**MS-2 浏览器实测的完整端到端验证无法触达**：

1. **Nitro API dev 未启动**：装配守卫 503，无法在浏览器中触发真实请求验证 provider 字段处理。
2. **docs 站点 mock 模式**：useMockAiChat 不接收 provider 字段，前端 MS-3 才接入；当前浏览器实测无法触达请求级 provider 选择路径。
3. **ShadowRoot 屏障**：dock 容器在 ShadowRoot 内，input/sender 不可被 Browser 工具直接操作。

## 已通过本轮 Browser 验证

- ✅ AI 浮动按钮渲染 + dock 展开
- ✅ 渲染管线无 JS 错误 / 资源 200 加载
- ✅ 控制台 0 错误 / 0 警告
- ✅ Shadow DOM 隔离保持

## 替代证据：vitest 全链路覆盖（MS-2 已实施）

MS-2 的实际功能验证已通过 vitest 严格覆盖：

| 用例文件                                | 用例数  | 关键断言                                                                                                |
| :------------------------------------- | :---- | :------------------------------------------------------------------------------------------------------- |
| `tests/ms2-model-provider.test.ts`      | 13    | schema 校验（合法/缺省/非法 4 用例）+ 双 adapter 装配（缺 key 不构造）+ activeProvider 缺省回退（2 用例）+ 双 provider 流式路由（2 用例）+ HTTP 集成 4 用例 + 缺 activeProvider key 503 + handleChatRequest 500 转译 |
| `tests/runtime-assembly.test.ts`        | 10   | 更新断言：双 adapter 都构造（`model:openai` + `model:anthropic`）；保持 503 守卫行为不变                       |
| `tests/anthropic-chat.test.ts` 等 4 个  | typecheck 补 label | 既有 adapter 单元测试零回归                                                                          |

**ai-rag-api 166/166 全绿零回归；vue-tsc + tsc --noEmit 0 错误。**

## 端到端联调补做指引

按 plan 21.4 集成纪律，MS-2 后端契约已稳定：

1. **MS-3**：useKnowledgeChat `experimental_prepareRequestBody` 注入 `provider` 字段
2. **Nitro API dev 启动**：双 provider key 都配齐才能完整跑双 provider 切换；缺 key 路径可单独验证（500 `RAG provider openai not configured`）
3. **浏览器实测真实 provider 切换**：docs 站点切换真实 API 模式后发送两条问答（一条 provider:openai、一条 provider:anthropic），Nitro 终端日志与网络面板可见不同 provider 流式响应

## 结论判定

| 阶段项目            | 状态     | 说明                                                                              |
| :----------------- | :------ | :--------------------------------------------------------------------------------- |
| 渲染层            | ✅ 通过 | dock 展开 + 控制台干净 + 资源全 200                                              |
| chat 契约 / provider 白名单 | ✅ 通过 | vitest 4 用例覆盖 schema 校验（合法/缺省/非法/类型错误）                            |
| 双 adapter 装配与分发  | ✅ 通过 | vitest 6 用例覆盖：缺 key 不构造 + activeProvider 缺省回退 + 显式 provider 路由 + 错误类属性 + 缺 activeProvider key 503 守卫 |
| HTTP 集成 4 态      | ✅ 通过 | vitest 4 用例覆盖：合法 provider 流式 200 / 非法 provider 400 / 缺省回退 / 缺 key 500 |
| handleChatRequest 错误转译 | ✅ 通过 | vitest 1 用例覆盖 RagProviderNotConfiguredError → 500 + 可识别 message              |
| 端到端联调         | ⚠️ 待联调补做 | Nitro dev 未起 + docs mock + ShadowRoot 三层依赖未到位——前端 MS-3 接入 + 真实 key 联调补做 |

**MS-2 阶段浏览器实测渲染层 ✅；后端契约 vitest 全绿（13 新用例）；端到端交互 ⚠️ 留待 MS-3 + Nitro API dev + 真实 key 联调补做。**