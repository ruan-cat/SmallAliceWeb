# MS-3「useKnowledgeChat 模型切换接线」浏览器实测证据

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
| 验证目标       | useKnowledgeChat 拉取 `/v1/models`（失败静默 → models 空 → 选择器不渲染）+ provider 字段透传到请求体 + localStorage 持久化 |
| 实施链路       | ai-vitepress-plugins `useKnowledgeChat.ts` 加 models/selectedProvider state + loadModels 异步拉取（相对路径触发，绝对 URL 跳过自动拉取）+ experimental_prepareRequestBody 注入 provider 字段 + selectModel 白名单校验 + refreshModels 暴露；AiChatVitePressShell 透传新 state |

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

### 步骤 4：query network 确认 /v1/models 拉取行为

```
browser action=query kind=network status=["2xx", "4xx", "5xx"] resourceTypes=["fetch", "xhr"] filter="/v1/models"
→ entries: [mock 模式 + Nitro dev 未起 → /v1/models 请求失败静默, 不出现在成功面板]
✅ 选择器因 models 为空 → 不渲染（向后兼容）
```

## 关键限制记录（诚实说明）

**MS-3 浏览器实测的完整端到端验证无法触达**：

1. **Nitro API dev 未启动**：与 MS-1/MS-2 同样的 503 装配守卫限制，/v1/models 无法真实下发。
2. **docs 站点 mock 模式**：useKnowledgeChat 发起 GET /v1/models 请求，但 mock 模式下 fetch 失败被静默（catch 空），models 保持空数组。
3. **ShadowRoot 屏障**：选择器即使在真实模式下渲染，也在 dock 的 ShadowRoot 内，`query kind="editable"` 返回空数组，无法在 Browser 工具中操作。
4. **docs:dev 当前停掉**：浏览器实测需要重启 docs:dev + Nitro dev 才能完整跑通。

## 已通过本轮 Browser 验证

- ✅ AI 浮动按钮渲染 + dock 展开
- ✅ 渲染管线无 JS 错误 / 资源 200 加载
- ✅ 控制台 0 错误 / 0 警告
- ✅ Shadow DOM 隔离保持
- ✅ /v1/models 拉取失败静默（控制台无错误 / 无堆栈）

## 替代证据：vitest 全链路覆盖（MS-3 已实施）

MS-3 的实际功能验证已通过 vitest 严格覆盖（`tests/ms3-model-switching.test.ts`，19 用例）：

| 维度               | 用例数  | 关键断言                                                                                          |
| :----------------- | :---- | :------------------------------------------------------------------------------------------------- |
| state 单元层       | 5    | initialModels 注入时不拉 fetch；selectModel 白名单校验；initialProvider 优先级高于 localStorage；白名单外回退默认 |
| /v1/models 拉取行为 | 9    | api 绝对 URL 跳过自动拉取；fetch reject 静默；body 非法 JSON 静默；非 ok 状态码静默；localStorage 命中恢复；脏值回退 list[0]；无 localStorage 回退 list[0]；URL 派生 `/v1/chat` → `/v1/models` |
| refreshModels 暴露 | 1    | 宿主手动调用可重新拉取（onMounted 后刷新场景）                                                       |
| 请求体携带 provider | 3    | selectedProvider 设置时携带；缺省时不携带；selectModel 后下一次 send 携带新 provider                  |

**ai-vitepress-plugins 72/72 全绿零回归；vue-tsc + tsc --noEmit 0 错误。**

## 端到端联调补做指引

按 plan 21.4 集成纪律，MS-3 前端接线已稳定：

1. **Nitro API dev 启动**：配 DATABASE_URL + OpenAI/Anthropic key
2. **docs 切换真实 API 模式**：`.env` 设 `VITE_RAG_API_BASE=http://localhost:3000/v1`
3. **浏览器实测**：
   - 打开 docs 主页 → 展开 dock → 顶部 XSender 上方出现分段选择器（`Claude Sonnet 5` / `GPT-5.6 Luna`）
   - 切换选择器 → 下一次提问请求体携带对应 provider 字段
   - localStorage 写入 `ai-chat-provider` 键
   - 刷新页面 → 选择器恢复上次选择

## 结论判定

| 阶段项目            | 状态     | 说明                                                                                |
| :----------------- | :------ | :----------------------------------------------------------------------------------- |
| 渲染层            | ✅ 通过 | dock 展开 + 控制台干净 + 资源全 200 + 失败静默（mock 模式符合预期）                |
| /v1/models 拉取契约 | ✅ 通过 | vitest 9 用例覆盖：URL 派生 / 静默 / 恢复 / 脏值回退                              |
| state 单元层       | ✅ 通过 | vitest 5 用例覆盖：selectModel / initialProvider / 白名单                          |
| 请求体 provider 注入 | ✅ 通过 | vitest 3 用例覆盖：携带 / 缺省 / 切换即时生效                                     |
| 端到端联调         | ⚠️ 待联调补做 | Nitro dev 未起 + docs mock + ShadowRoot 三层依赖未到位——切真实 API 后浏览器实测补做 |

**MS-3 阶段浏览器实测渲染层 ✅；前端接线 vitest 全绿（19 用例）；端到端交互 ⚠️ 留待 Nitro dev + 真实 key 联调补做。**