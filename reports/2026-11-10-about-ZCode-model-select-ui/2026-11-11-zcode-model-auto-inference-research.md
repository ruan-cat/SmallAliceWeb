# 2026-11-11 ZCode「填写模型自动推断上下文与能力」机制调研

> - **Agent 工具**：ZCode（主代理第一手探针 + 1 个 Explore 子代理深挖 + 主代理第一手抽验 6 处关键引用）
> - **AI 模型**：GLM-5.3-Flash（`account:bigmodel-start-plan/GLM-5.3-Flash`）
> - **调研对象**：`D:\code\store\ZCode__zai-org`（zcode v3.17.2，Apache-2.0，2026-11-10 浅克隆快照）
> - **关联文档**：[前次模型配置 UI 调研](./2026-11-10-deepseek-harness-zcode-model-config-ui-research.md)、[轻量版 spec](./specs/2026-11-10-lightweight-model-config-design.md)、[实施 plan](./plans/2026-11-10-lightweight-model-config-plan.md)

## 结论速览（先答用户三问）

| 问题                                             | 答案                                                                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZCode 填模型时怎么自动推断容量与能力？           | **纯本地正则规则引擎**：`config/provider/zcode-builtin.json` 内 5 类规则数组（含一条 `.*` 万能兜底），按固定层序逐条匹配 + 深度 overlay，得到该模型的完整配置（上下文窗口/模态/工具调用/思考档位/最大输出）。**全程零网络请求**。 |
| 这个过程是不是调接口？                           | **不是**。推断是完全离线的内存计算；唯一的互联网通道是「内置清单更新下载」（60s 轮询 + 1h 节流 + 失败指数退避），与推断是两条独立通道。ZCode 不存在任何 `/models` 元数据探测。                                                    |
| 我们照抄后能否享受相同配置、实现同样的自动推断？ | **能，且门槛很低**：规则数据是纯 JSON（Apache-2.0 可整搬），解析引擎约 60 行核心代码，DSL 是自研受限解释器约 700 行（无 eval）；照抄后可完全离线工作，也可以只维护一份自己的精简规则集。                                          |

## 一、规则数据结构（`config/provider/zcode-builtin.json`，schemaVersion 1 / revision 43）

文件信封 `{schemaVersion, revision, config}`；`config` 下两大块（主代理第一手探针结果）：

### 1.1 providerConfigRules（provider 层）

| 子键            | 条数 | 内容                                                                | 样本                                                                                                   |
| --------------- | ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `templateRules` | 34   | 模板卡：预置 baseUrl、apiType、`builtinModelIds`、logo、access 类型 | `zai-api` 模板 → `https://api.z.ai/api/anthropic` + anthropic-messages + `["GLM-5.3","GLM-5.3-Flash"]` |
| `providerRules` | 10   | 账户型 provider（z.ai 账号通道）                                    | `account:zai-individual-coding-plan`                                                                   |

### 1.2 modelConfigRules（**自动推断的核心**，模型层）

| 子键                        | 条数 | 匹配维度                                           | 覆盖内容                                                                                      |
| --------------------------- | ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `modelRules`                | 83   | `modelMatch` 正则                                  | 能力全套：contextWindow、input/outputFormat、supportsToolCall、optionSpecs                    |
| `modelApiRules`             | 73   | `modelMatch` + `apiTypeMatch`                      | 思考档位→线格式映射（DSL）、maxOutputTokens 映射                                              |
| `providerSiteRules`         | 58   | `modelMatch` + `apiTypeMatch` + **`baseUrlMatch`** | 同一模型在不同站点容量不同（如 opencode.ai/zen 站点的 `glm-5.3-flash` 是 1M 上下文 + 多模态） |
| `templateModelRules`        | 316  | `templateId` + 精确 `modelId`                      | 模板内模型的显式 enabled/覆盖                                                                 |
| `builtinProviderModelRules` | 30   | `providerId` + 精确 `modelId`                      | 账户 provider 的模型启用                                                                      |

**兜底设计（照抄价值最高的一条）**：`modelRules` 首条是 `modelMatch: ".*"` 万能兜底——任何未知模型先获得合理默认（contextWindow 1000000、supportsToolCall true、maxOutputTokens.max 128000、思考档位 disabled/enabled），再被后续更具体的规则逐层覆盖。样例：

```text
modelMatch: ".*"           → 兜底：1M ctx / toolCall / 128K 输出
modelMatch: ".*glm-5.*"    → 200K ctx / 64K 输出
modelMatch: ".*GLM-5\.2.*" → 1M ctx / disabled/high/max 三档
```

配套规则 schema 定义：`packages/provider/src/config/rule-data-schema.ts`。

## 二、解析引擎：单数组顺序 overlay（不是多层各自合并）

**关键认知**：五类规则在加载时被展开成**一个有序数组**（`modelRules → modelApiRules → providerSiteRules → templateModelRules → builtinProviderModelRules`，`packages/provider/src/config/schema.ts:78-107`），个人配置的精确规则追加在数组尾部（builtin 全量在前 + personal 在后，`model-config.ts:379-381`）——**数组越靠后优先级越高**。

解析入口 `ModelConfigRules.resolve(input)`（`packages/provider/src/config/model-config.ts:387-423`，第一手抽验一致）：

```ts
resolve(input: ModelConfigRuleResolutionInput): ModelConfig {
  let result = ModelConfig.empty();
  const baseUrl = input.baseUrl == null ? undefined : normalizeBaseURLForRuleMatch(input.baseUrl);
  for (const rule of this.#rules) {
    if (isExactModelRule(rule)) {                      // providerId + modelId 全等
      ...result = result.overlay(rule.config); continue;
    }
    if (rule.type === "template-model") {              // templateId + modelId 全等
      if (rule.templateId === input.templateId && rule.modelId === input.modelId)
        result = result.overlay(rule.config);
      continue;
    }
    if (!matchesRule(rule.modelMatch, input.modelId, true)) continue;   // 忽略大小写
    if (rule.apiTypeMatch !== undefined && !matchesRule(rule.apiTypeMatch, input.apiType)) continue;
    if (rule.type === "provider-site" && (baseUrl === undefined || !matchesRule(rule.baseUrlMatch, baseUrl))) continue;
    result = result.overlay(rule.config);              // 命中即叠加
  }
  return result;
}
```

两个必须照抄的细节：

1. **匹配正则**：`matchesRule(pattern, value) = new RegExp(`^(?:${pattern})$`).test(value)`（`model-config.ts:544-546`，第一手抽验一致）——规则 pattern 自动全串匹配，防子串误命中。
2. **深 overlay 而非整体替换**：`ConfigOverlay.overlayValue`（`config-overlay.ts:26-28`）——规则里 `undefined` 字段继承上层、显式 `null` 表示清空、对象递归合并（:30-37）。写成浅 spread 会破坏「只覆盖某几个字段」的规则语义。

输入 `{providerId, templateId?, modelId, apiType?, baseUrl?}` → 输出完整 `ModelConfig`。运行时由 Registry 每模型调用（`packages/provider/src/resolver.ts:230-233, 277-291`）；设置页预览走 `ProviderSettingsFacade.resolveModelConfig`（`packages/provider/src/facades.ts:239-298`），返回 `{inheritedConfig, effectiveConfig, issues}`。

## 三、UI 推断交互（「填模型 → 推荐值浮现」的体验实现）

| 环节       | 实现                                                                                                                                                    | 证据                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 触发时机   | **非每键实时**：1.2s 停止输入后防抖解析（`MODEL_PROVIDER_TEXT_IDLE_TRIGGER_MS = 1_200`），blur / Enter / 保存前强制 flush                               | `packages/ui/.../useIdleTrigger.ts:3`（第一手抽验一致）；`useModelConfigResolution.ts:86-116, 142` |
| 推荐值展示 | **placeholder 而非回填 value**——contextWindow/maxOutputTokens 的 placeholder 显示 inheritedConfig 值，输入框留空 = 「跟随推荐」；模态等控件初值跟随推荐 | `ProviderModelMetadataDialog.tsx:228-233, 282-287`；`ProviderModelDraftState.ts:16-38`             |
| 覆盖追踪   | 用户改某字段即记入 `overriddenFieldsValue`；清空输入即撤销覆盖回推荐值                                                                                  | `ProviderModelDraftState.ts:66-76, 97-109`                                                         |
| 防陈旧回包 | 解析结果带代次/身份校验，旧回包不覆盖新输入；解析签名变化时闪现 3.5s "matched" 反馈                                                                     | `useModelConfigResolution.ts:47-55, 126-127, 56-68`                                                |
| 智能开关   | 「推荐配置」开关（`useRecommendedConfigValue`）：开启 = 智能跟随规则；关闭 = 固定模式，物化 manual config                                               | `ProviderModelMetadataDialog.tsx:91`；`ProviderModelMetadata.ts:298-308, 331-345`                  |

解析回调签名（UI → 服务端）：`resolveModelConfig({providerId, templateId?, modelId, apiType?, baseUrl?}) → {inheritedConfig, effectiveConfig, issues}`——UI 侧只传模型 id 等文本，**推荐值全部由服务端本地规则算出**。

## 四、网络通道澄清：推断离线，远端只管「清单更新」

1. **推断零网络**：`resolveModelConfig` 全程内存快照计算（`facades.ts:240-247`），UI→Host 为本地 RPC。
2. **唯一互联网通道 = builtin 清单下载**（`packages/provider-node/src/zcode-builtin-download.ts:40-122`，第一手抽验函数签名与 20s 超时一致）：GET `{origin}/api/v1/client/configs` 拿 CDN 地址再下完整 JSON，zod 校验 + 10MB 上限 + `redirect:"error"` + `credentials:"omit"`。
3. **同步节流**：启动刷一次后每 60s 检查；lease 30s、成功后 1h 内不再下载、失败指数退避 60s→1h（`zcode-builtin-remote-synchronizer.ts:7, 92-99, 150-159`）。
4. **缓存兜底**：bundled（随包分发）与 active（下载）两份取 revision 高者，同 revision 取 bundled；bundled 缺失用进程内 LKG；下载失败静默沿用旧清单（`zcode-builtin-provider-config-source.ts:208-234`）。
5. **明确不存在**：无 `/models` 元数据探测、无在线能力推断 API；连通性测试走正式模型执行链（见前次调研报告 2.3 节）。

**用户预判「大概率调接口」的修正**：ZCode 的自动推断**不调接口**——它把「模型知道多少」固化成了随包分发的规则文件，接口只负责让这份规则文件保鲜。

## 五、DSL：自研「受限 CEL 子集」解释器（无 eval）

`modelApiRules` 里的 `reasoningLevel.map` 字符串（如 `"reasoningLevel == \"disabled\" ? {\"thinking\":{\"type\":\"disabled\"}} : {\"thinking\":{\"type\":\"adaptive\"},...}"`）由 `@zcode/model-option-map` 编译执行（`packages/model-option-map/src/compiler.ts:17-57`，第一手抽验一致）：

- **管线**：tokenizer → 递归下降 parser → AST 树遍历求值；token/AST/program 三级缓存。**约 4 文件 700 行，无 `eval`/`new Function`**。
- **语法白名单**：字面量、唯一变量、`[]`/`{}`、一元 `! - +`、二元逻辑/比较/算术、三元 `?:`；**显式拒绝成员访问与函数调用**（`parser.ts:65-70, 159-161`）。
- **沙箱措施**：标识符仅允许变量名/`true`/`false`/`null`；对象 key 必须字符串字面量且去重；数值必须 JSON-safe；求值输入仅 string/number；条件必须布尔；结果深 freeze（`parser.ts:158-214`；`evaluator.ts:46-48, 161-210`）。
- **执行时机**：Model 创建时编译一次，每请求以本轮 reasoningLevel/maxOutputTokens 求值出 JSON merge patch 再应用（`option-maps.ts:20-34`）；配置加载时即校验可编译性，失败归类 `invalid-option-spec`（`model-config.ts:66-68`）。

## 六、模板命中方式：纯手选，无 baseUrl 反查

- 模板在 `ProviderTemplatePicker.tsx:37-49` 分组渲染（zhipu 组 4 个 + other 组 + 「自定义」卡），**用户手点模板卡**（:122-124）；不存在「按输入的 baseUrl 自动反查模板」的 UI 逻辑——resolver 里唯一的 baseUrl 关联只用于补 logo（`resolver.ts:210-229`）。
- 选模板后模板数据**不拷贝进表单**：`createPersonalProvider` 只落 `templateId`（且禁止携带 builtinModelIds，`config-service.ts:233-235`），模板的 baseUrl/apiType/内置模型清单在**解析期**由 `template.overlay(personal)` 直接生效（`resolver.ts:201-207`），随后逐模型走规则解析（:277-284）。

## 七、与 deepseek-harness 路线对照

| 维度            | ZCode                                                   | deepseek-harness                                                               |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 能力数据来源    | 本地规则文件（5 类规则 + 万能兜底正则）                 | 代码内 `DEFAULT_MODELS` 常量（`packages/llm/llm-deepseek/src/models.ts:9-27`） |
| 远端动态        | builtin 清单下载（revision 竞争，静默失败沿用）         | 官方部署跟随 `GET /models` listing 动态合并（`listed-catalog.ts:30-46`）       |
| 填模型时推荐值  | **本地规则引擎实时解析**（placeholder + override 追踪） | `discoverModels` 探测远端真实清单（拉列表而非推能力）                          |
| 思考档位→线格式 | DSL 表达式（受限 CEL）                                  | `reasoningEfforts` 结构化枚举                                                  |
| 兜底哲学        | 未知模型给保守合理默认（1M/toolCall），再被规则修正     | 探测失败不阻塞手动填写                                                         |

两条路线互补：**ZCode 擅长「从模型名推能力」（离线、确定、秒级），deepseek 擅长「从端点拉清单」（真实、覆盖私有部署模型）**。SmallAliceWeb 两者都要（见第八节）。

## 八、SmallAliceWeb 照抄可行性

### 8.1 回答「能否享受相同配置」

**能**。三重依据：

1. **许可证**：Apache-2.0（仓库 LICENSE，第一手确认）——复制、修改、商用均可，保留 LICENSE/NOTICE 版权声明即可；`zcode-builtin.json` 规则数据不含 z.ai 运行时依赖（无签名校验、无鉴权）。
2. **纯数据 + 纯本地计算**：5 类规则数组、resolve 引擎、受限 CEL 解释器均为零第三方依赖的小模块，可整体翻译进 `ai-rag-api`。
3. **可脱离 z.ai 远端**：ZCode 自身支持无 remote 配置的纯 bundled 模式（`provider-config-runtime.ts:66-75`：无 remote 时 synchronizer 直接为 undefined）——照抄者不需要 `/api/v1/client/configs` 控制面。

### 8.2 移植清单（按工作量排序）

| 层       | 内容                                                                                                                                                                              | 工作量                             | 落点建议                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 数据     | 自维护一份精简规则集（万能兜底 `.*` + 你常用的模型族正则，如 `.*glm-5.*`、`.*claude-.*`、`.*gpt-5.*`），格式照抄 `modelConfigRules`                                               | 低（几十条起步）                   | `packages/ai-rag-api/server/config/model-capability-rules.json`                                 |
| 引擎     | `ModelConfigRules.resolve` 顺序 overlay（含 `matchesRule` 正则包装与深 overlay 语义）                                                                                             | 低（核心 ~60 行 + overlay ~30 行） | `server/services/model-config-rules.ts`                                                         |
| 解析端点 | `POST /api/model-providers/recommend-config`：入参 `{apiType, baseUrl?, modelId}` → 本地规则解析 → 返回 `{contextWindow, maxOutputTokens, inputModalities, reasoningLevels, ...}` | 低                                 | 挂进既有 spec/plan 的五端点体系                                                                 |
| 前端交互 | 1.2s 防抖 + blur flush；推荐值作 placeholder；override 追踪；matched 反馈                                                                                                         | 中                                 | `ModelSettingsDialog.vue` 增加推荐联动                                                          |
| DSL      | 受限 CEL 解释器（仅当要照抄 `reasoningLevel.map` 时需要）                                                                                                                         | 中（~700 行）                      | 可先不搬：轻量版用「结构化 reasoningLevels 数组 + 少量 if 分支」替代，规则文件里不写 map 表达式 |
| 远端保鲜 | builtin 清单下载同步器                                                                                                                                                            | 可不做                             | 构建期内嵌规则集 + 版本字段即可；日后要热更新再加                                               |

### 8.3 与既有 spec/plan 的整合建议（增量，不推翻轻量版）

1. `provider_models` 表的 `context_window / max_output_tokens / input_modalities / reasoning_levels` 允许 NULL = 「跟随推荐」，读取层合并规则引擎结果（对应 ZCode 的 placeholder/跟随语义）。
2. plan 的 **Task 4** 增加第六个端点 `recommend-config`（纯本地计算，无 IO，天然好测试）；**Task 5** 表单增加推荐联动与「智能推荐」开关。
3. 测试连接（已有 Task 4）与推荐引擎互补：推荐负责「能力预设」，探测负责「真实模型清单」，两者独立。

### 8.4 风险与注意

1. **规则数据时效**：`zcode-builtin.json` 是 2026-11-10 快照（revision 43），照抄数据后需自维护；正则规则对新模型族（如未来的 glm-6）不匹配时会落到 `.*` 兜底——兜底值是否合适要自己审。
2. **深 overlay 语义易错**：实现时严禁浅 spread；`undefined` 继承 / `null` 清空的差异要有单测钉死（评审焦点风格）。
3. **规则文件含 z.ai 业务信息**：整搬 `templateRules`（含 z.ai 套餐地址等）需注意是否要对外暴露；建议只搬 `modelConfigRules` 能力规则，模板自己写。
4. **CEL 不搬的代价**：不搬解释器则 `modelApiRules` 的 map 表达式用不了——轻量版用不到该复杂度，纯结构化规则已够。

## 九、调研方法记录

- 主代理第一手探针：node .mjs 解剖 `zcode-builtin.json`（两次修正取数路径，最终确认规则嵌套在 `config` 信封内）；LICENSE/NOTICE 头部直读。
- 1 个 Explore 子代理深挖五问（模型约 189 万 token，69 次工具调用）。
- 主代理第一手抽验 6 处关键 file:line（resolve 引擎、matchesRule、规则层序展开、防抖常量、CEL 编译入口、下载函数）——**全部一致**。
- memorix 记忆：本报告结论已存（见会话记录）。
