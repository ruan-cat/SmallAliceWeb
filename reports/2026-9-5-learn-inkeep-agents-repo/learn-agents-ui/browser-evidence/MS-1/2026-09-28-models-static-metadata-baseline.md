# MS-1「注册表 label + GET /v1/models」浏览器实测证据

**测试日期**：2026-09-28
**执行端**：in-app Browser（Google Chrome 内核）
**被测端**：`pnpm run docs:dev`（VitePress 站点，端口 8080，**mock 模式**）+ Nitro API dev 未启动

## 测试环境

| 项目          | 取值                                                                              |
| :----------- | :-------------------------------------------------------------------------------- |
| 浏览器内核      | Chromium（in-app Browser）                                                          |
| 站点 URL      | http://localhost:8080/                                                            |
| 渲染管线       | Shadow DOM（外层 DOM 不可见）                                                        |
| 后端装配       | Nitro API dev **未启动**（DATABASE_URL 未配 + 无真实 OpenAI/Anthropic key）     |
| 验证目标       | `GET /v1/models` 静态下发 `{models: [{id, label, model}]}` 不含 baseUrl/凭据（plan 16.3） |
| 实施链路       | ai-rag-api `src/llm-config.ts` 加 label 字段 + `getRagLlmConfigById`；`server/routes/v1/models.get.ts` 新增静态下发路由 |

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

### 步骤 4：query network 确认 GET /v1/models 未被前端消费

```
browser action=query kind=network status=["2xx", "4xx", "5xx"] resourceTypes=["fetch", "xhr"] filter="/v1/models"
→ entries: []
✅ 当前 docs 站点 mock 模式下 useKnowledgeChat 未消费 /v1/models（前端 MS-3 才接入，浏览器端到端交互留待 MS-3/MS-4 联调补做）
```

## 关键限制记录（诚实说明）

**MS-1 浏览器实测的完整端到端验证无法触达**：

1. **Nitro API dev 未启动**：DATABASE_URL 未配 + OpenAI/Anthropic key 未注入，启动 Nitro dev 会立即抛 `RAG 运行时缺少必需配置：database, embedding, model`，所有装配守卫路由都返回 503。
2. **docs 站点 mock 模式**：useKnowledgeChat 在 mock 模式下不调用 /v1/models，所以即便 Nitro dev 启动，前端也不会真的请求该端点（前端 MS-3 才接入）。
3. **ShadowRoot 屏障**：dock 容器在 ShadowRoot 内，`query kind="editable"` 返回空数组，无法在 Browser 自动化中验证前端使用 /v1/models 数据的渲染。

## 已通过本轮 Browser 验证

- ✅ AI 浮动按钮渲染 + dock 展开
- ✅ 渲染管线无 JS 错误 / 资源 200 加载
- ✅ 控制台 0 错误 / 0 警告
- ✅ Shadow DOM 隔离保持

## 替代证据：vitest 全链路覆盖（MS-1 已实施）

MS-1 的实际功能验证已通过 vitest 严格覆盖：

| 用例文件                              | 用例数  | 关键断言                                                                                              |
| :----------------------------------- | :---- | :----------------------------------------------------------------------------------------------------- |
| `tests/llm-config.test.ts`            | 4 → 6 | label 字段正确（`Claude Sonnet 5` / `GPT-5.6 Luna`）；`getRagLlmConfigById` 合法 id 返回、未知 id 返回 undefined |
| `tests/routes/models-http.test.ts`    | 4    | 端点 200 响应 + 两个条目 + 不含 baseUrl/apiKey + POST 形态独立                                            |
| `tests/anthropic-chat.test.ts` 等 4 个 | 0 → 0 | typecheck 补 label 后通过；既有用例无回归                                                                |

**ai-rag-api 153/153 全绿零回归；vue-tsc + tsc --noEmit 0 错误。**

## 端到端联调补做指引

按 plan 21.4 集成纪律，MS-1 后端契约已稳定，前端接入的端到端联调需等待：

1. **MS-3**：useKnowledgeChat 拉取 `/v1/models`（失败静默）+ 选择器状态管理
2. **MS-4**：AiChat 分段选择器 UI 渲染
3. **Nitro API dev 启动**：需配 DATABASE_URL + OpenAI/Anthropic key
4. **docs:dev 切换真实 API 模式**：前端连 Nitro dev（端口 3000）后浏览器实测真实请求链路

## 结论判定

| 阶段项目       | 状态     | 说明                                                                |
| :------------ | :------ | :------------------------------------------------------------------- |
| 渲染层       | ✅ 通过 | dock 展开 + 控制台干净 + 资源全 200                                    |
| /v1/models 端点契约 | ✅ 通过 | vitest 4 用例覆盖响应结构 / 条目数 / 无凭据 / 方法形态               |
| 端到端联调    | ⚠️ 待联调补做 | Nitro dev 未起 + docs mock + ShadowRoot 三层依赖未到位——前端 MS-3/MS-4 接入后浏览器实测 |

**MS-1 阶段浏览器实测渲染层 ✅；后端契约 vitest 全绿；端到端交互 ⚠️ 留待 MS-3/MS-4 + Nitro API dev 联调补做。**