# 2026-08-31 TypeScript/Node RAG 评测生态调研与选型建议

## 1. 先给结论

对刚接触 RAG 的读者，先记住一句话：**评测指标、评测运行器、线上观测不是同一种东西**。指标回答“好不好”，运行器回答“怎样批量比较”，观测平台回答“线上发生了什么”。Promptfoo、Mastra、Braintrust、Langfuse 都能帮助评测，但它们处在不同层次，不能互相替换。

对当前 SmallAliceWeb，第一阶段最稳的选择是：

1. 保留项目内纯 TypeScript evaluator，先把题集补成带 `relevantChunkIds` 的 gold set，再计算 Recall@K、Precision@K、MRR@K、nDCG@K。
2. 继续把现有关键词命中率当作 smoke 指标，但不要把它改名为 Recall@K。
3. 答案级的 faithfulness、answer relevance、citation correctness 先做少量人工抽样；需要批量比较时，再把 `/v1/chat` 或离线函数接到 Promptfoo，或只引入 Mastra 的 scorer。
4. 暂不为了十几道题引入 Braintrust/Langfuse SaaS。等需要保存实验历史、查看生产 trace、人工标注和团队协作时，再选择其中一个平台。

这里的判断基于当前仓库事实：`packages/ai-rag-api/server/evaluation/evaluator.ts` 只比较 lexical、vector、hybrid 三策略，按返回内容做关键词包含和覆盖率计算；相关 OpenSpec 只要求至少 10 道固定题、三策略和 JSON 命中率/关键词覆盖率。它还没有 qrels（问题与相关 chunk 的真值标注）、答案文本评分或语义引用校验。现有 [`reranker 与 RAG 评测报告`](./2026-08-31-reranker-and-rag-evaluation.md) 也明确了这个边界。

## 2. 新手必须分清的三类评测

### 2.1 确定性 IR 指标：检查“检索找没找对”

IR（Information Retrieval，信息检索）指标只看“问题、相关 chunk 标注、返回的 chunk ID 和排名”。常见指标如下：

|    指标     |                          它在问什么                           | 是否适合 CI 门禁 |
| :---------: | :-----------------------------------------------------------: | :--------------: |
| Precision@K |                 Top-K 里有多少结果是相关的？                  |        是        |
|  Recall@K   |             所有相关结果中，有多少被 Top-K 找到？             |        是        |
|    MRR@K    |                第一个相关结果排得够不够靠前？                 |        是        |
|   nDCG@K    | 不同相关等级的结果，是否按价值排在前面？（需要 graded qrels） |        是        |

这些指标必须有可复核的 qrels；`expected_keywords` 只说明答案线索出现在文本里，不代表某个 chunk 是相关证据。指标定义可参阅 [NIST/TREC Common Evaluation Measures](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf) 和 [Järvelin、Kekäläinen 的 nDCG 原始论文](https://dl.acm.org/doi/10.1145/582415.582418)。

### 2.2 答案级指标：检查“模型答得怎样”

答案级评测输入 `question + retrieved context + answer`，关注的是生成结果：

- **Faithfulness/groundedness**：回答中的陈述能否由给定 context 支持，主要抓幻觉；忠实地复述无关内容，仍可能 relevance 很低。
- **Answer relevance**：回答是否直接回应问题，有没有跑题；它不等于事实正确。
- **Answer correctness/factuality**：相对参考答案或专家事实是否正确；需要参考答案或人工事实标注。
- **Citation correctness**：`[来源N]` 是否存在、映射是否正确、链接是否符合 `sourceUrl#headingAnchor`，并且来源实际支持陈述。格式正确不等于语义支持。

这些指标可用规则、人工标注或 LLM-as-a-judge。LLM judge 不是确定性真值，会受提示词、模型、语言和位置偏差影响，因此应先用人工样本校准，不能只看一个漂亮分数。可参考 [RAGAS 原始论文](https://arxiv.org/abs/2309.15217) 对 faithfulness、context precision/recall、answer relevancy 的讨论。

### 2.3 实验与观测平台：检查“版本和线上运行发生了什么”

实验平台保存题集、配置、运行结果，支持比较“旧 prompt 与新 prompt”“无 reranker 与有 reranker”。观测平台保存请求 trace、模型调用、token、延迟、错误和用户反馈，帮助定位线上问题。它们可以运行或展示评分，但通常不会替项目决定 qrels，也不能自动证明 IR 指标正确。

## 3. Promptfoo：面向评测的 CLI 与 Node 库

### 3.1 它是什么

[Promptfoo 的 RAG 评测指南](https://www.promptfoo.dev/docs/guides/evaluate-rag/) 把 RAG 拆成两步：先评估文档检索，再评估 LLM 输出。它提供 `context-recall`、`context-relevance`、`context-faithfulness`、`answer-relevance` 等断言，也能用 `contains-all`、正则和自定义断言做确定性检查。它既有 CLI，也有可导入 `evaluate` 的 [Node package](https://www.promptfoo.dev/docs/usage/node-package/)，适合写一个独立 eval 配置或 TypeScript 脚本。

### 3.2 它不是什么

Promptfoo 的 `context-recall` 是“已知答案中的陈述有多少能从 context 归因”，不是严格按 chunk ID 计算的标准 Recall@K；其模型辅助指标也不是人工真值。它不是向量数据库、reranker，也不应替代项目自己的 IR 指标实现。

### 3.3 怎么接入 TypeScript/Nitro

最小接入方式是把 `hybridSearch` 或 `/v1/chat` 包装为测试 provider：输入题目，返回 `context`、`answer` 和可选 metadata，然后由 Promptfoo 运行多条 assertions。建议作为 `devDependency` 和独立 CI 脚本运行，不要把 CLI、评测配置或 judge API key 打进 Nitro 生产 bundle；生产 API 仍只负责检索和回答。

当前官方包声明 [Node.js >=22.22.0](https://www.promptfoo.dev/docs/installation/)，而仓库根 `package.json` 只声明 `22.x`。因此在安装前应先确认 CI/本机实际小版本；Node 22.0～22.21 不能因为“大版本是 22”就默认兼容。

### 3.4 多少钱、有什么风险、现在是否需要

[Promptfoo pricing](https://www.promptfoo.dev/pricing/) 显示 Community 版本免费、MIT 开源，可本地或自托管并包含评测功能；企业版增加团队协作、云端部署和管理能力。README 还强调本地 eval 的隐私边界，但如果配置了外部模型 judge，问题、context 和答案仍会发送给该模型提供商。

它很适合作为第二阶段的批量答案评测 harness。当前十道题的确定性检索基线不需要先依赖它；先拥有自己的 qrels 和纯 TS 指标，才能避免把工具输出当成项目真值。

## 4. Mastra：TypeScript AI 框架里的 scorer 组件

### 4.1 它是什么

[Mastra Scorers overview](https://mastra.ai/en/docs/scorers/overview) 是 Mastra TypeScript 框架中的评分能力，包含 code-based scorer、LLM-based scorer 和 Native JavaScript scorer。官方列表覆盖 answer relevancy、faithfulness、context precision、context relevancy、contextual recall、keyword coverage 等，适合把一个评分函数放进 TypeScript 测试或 agent 流程。

### 4.2 它不是什么

Mastra 首先是 agent/workflow/application framework，不是专门的 TREC IR benchmark，也不是必须用于 Nitro 的运行时框架。它提供的 contextual recall 等 scorer 与 Promptfoo/RAGAS 风格相近，但不自动替用户完成 qrels 设计、语料快照、chunk ID 版本管理或人工校准。

### 4.3 怎么接入 TypeScript/Nitro

如果只需要评分，可以评估 `@mastra/evals` 的 scorer API，并把 scorer 放在 `scripts/` 或测试中；不必把 Mastra server、agent、memory、observability 全部装进 `packages/ai-rag-api`。当前 API 是 Nitro 3 + 显式 provider 装配，生产部署目标是 Node 22/Vercel；引入 Mastra 的完整 server/bundler 会扩大依赖和构建边界。应先用一个最小 Node 22 fixture 验证导出路径、ESM、pnpm workspace 与 Nitro build。

官方仓库说明核心大部分为 [Apache-2.0](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md)，`ee/` 目录有企业许可边界；[官方模板](https://github.com/mastra-ai/template-deep-search/blob/main/package.json) 当前使用 Node `>=22.13.0`，这说明 Node 22 大体在支持范围内，但不能替代对项目实际依赖的构建验证。

### 4.4 多少钱、有什么风险、现在是否需要

[Mastra pricing](https://mastra.ai/pricing) 区分开源框架与平台：开源部分可免费构建和部署；平台 Starter 为 $0 起，按 observability events、CPU time、数据保留等额度计费，Teams 页面标价 $250/月，企业/自托管企业能力另议。LLM judge 本身产生的模型 token 费用仍由模型提供商收取。

风险是框架体量和版本变化可能超过当前需求，且 scorer API 的发布导出路径需锁版本验证。结论：可把 Mastra scorer 作为轻量的答案级可选适配器，但不建议为了第一阶段 IR 基线迁移到 Mastra 应用架构。

## 5. Braintrust：实验、数据集、评分与团队协作平台

### 5.1 它是什么

[Braintrust evaluation quickstart](https://www.braintrust.dev/docs/evaluation-quickstart) 将一次评测拆成 Data、Task、Scores；[JavaScript/TypeScript SDK 示例](https://www.braintrust.dev/docs/evaluate/run-evaluations) 可配合 `autoevals` 的 AnswerRelevancy、ContextEntityRecall 等 RAGAS 风格 scorer，保存不可变 experiment snapshot，比较不同运行结果。它更像“实验管理与观测平台”，而不是一个只计算 Recall@K 的小包。

### 5.2 它不是什么

Braintrust 不会替项目标注相关 chunk，也不会让 `autoevals` 自动变成 IR 真值。评分器通常需要答案、参考答案或 context，仍应把项目的 chunk ID 排名指标作为独立结果保存。

### 5.3 怎么接入 TypeScript/Nitro

可在 `evals/*.eval.ts` 中调用当前本地检索/聊天函数，使用 `braintrust` SDK 和 `autoevals` 记录实验；不要从 Nitro 请求路径同步调用远程评测平台。官方文档写明 `bt eval` CLI 当前仅支持 macOS/Linux，因此 Windows 开发机不应假设 CLI 可用，需在 Linux CI/容器验证，或使用已验证的 Node 脚本入口。

隐私上，[Remote evals](https://www.braintrust.dev/docs/evaluate/remote-evals) 允许评测代码运行在自己的基础设施，只把结果交给 Braintrust；这比把私有数据库暴露给云端 runner 更可控，但 trace、score、metadata 仍要审查是否含敏感文本。

### 5.4 多少钱、有什么风险、现在是否需要

[Braintrust pricing](https://www.braintrust.dev/pricing/) 当前显示 Starter $0/月，含 $10 模型额度、1 GB processed data、10k scores、14 天保留；Pro $249/月，含更高额度和功能；Enterprise 定制。超出额度按数据、score 和模型 token 计费。SaaS 的收益是可比较、可分享和团队协作，代价是凭据、数据留存、供应商锁定和持续费用。

结论：当 SmallAliceWeb 需要团队查看实验历史、人工反馈和生产质量趋势时再考虑；仅为当前十道题的离线回归，平台成本和治理成本偏高。

## 6. Langfuse：LLM 可观测性优先，兼有离线/在线评估

### 6.1 它是什么

Langfuse 的核心是 trace/observation、token/成本、prompt、dataset、experiment 和 score 的统一平台。[Code evaluators](https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators) 支持 TypeScript/JavaScript 的确定性检查，官方建议把 exact match、JSON/schema、关键词和业务规则交给 code evaluator，把主观语义判断交给 LLM-as-a-judge；[Evaluation core concepts](https://langfuse.com/docs/evaluation/core-concepts) 说明了在线与离线评估的关系。

### 6.2 它不是什么

Langfuse 不是 reranker、向量库，也不是项目 qrels 的替代品。它负责采集、运行、存储和展示分数；Recall@K/nDCG 的计算逻辑仍应在自己的 evaluator 或受控评测 job 中定义，随后把结果作为 score 上报。

### 6.3 怎么接入 TypeScript/Nitro

使用 [Langfuse JS/TS SDK](https://langfuse.com/docs/sdk/typescript) 时，应在 Nitro 服务端运行时初始化，密钥只留在服务端，并对 query、chunk、answer 做脱敏或采样；不要在浏览器暴露密钥，也不要在模块 import 阶段建立不必要的外部连接。Code evaluator 运行环境是受限的：官方说明第三方依赖不可用、无网络出口，TypeScript 需使用可擦除语法。因此复杂指标应先在项目脚本算好，再上报 score。

### 6.4 多少钱、有什么风险、现在是否需要

[Langfuse Cloud pricing](https://langfuse.com/pricing/) 当前 Hobby 免费含 50k units/月，Core $29/月，Pro $199/月，Enterprise $2499/月起；units 是 traces、observations、scores 的计数。[Self-hosted pricing](https://langfuse.com/pricing-self-host) 显示核心能力可按 MIT 开源免费自托管，但需要自行承担数据库、ClickHouse/对象存储、备份、升级和访问控制成本。[Self-hosting guide](https://langfuse.com/self-hosting) 建议低规模用 Docker Compose，生产规模用 Kubernetes 或 Terraform。

结论：如果首要痛点是生产 `/v1/chat` 的延迟、token、错误、引用链和用户反馈，Langfuse 比 Braintrust 更接近“观测平台”需求；当前阶段仍不应为纯离线检索基线先部署一套观测基础设施。

## 7. 四者横向比较

|    工具    |                   核心定位                   |             适合的评测层              |            Node 22/Nitro 结论            |           当前建议            |
| :--------: | :------------------------------------------: | :-----------------------------------: | :--------------------------------------: | :---------------------------: |
| Promptfoo  |    CLI/Node 评测 harness，配置和断言丰富     | 检索上下文、答案、LLM judge、规则断言 | Node >=22.22；独立脚本/CI，勿塞生产路由  |  第二阶段优先候选，按需引入   |
|   Mastra   | TypeScript AI 框架中的 scorers 与 agent 工具 |  答案级 scorer、代码评分、LLM judge   |   只引 scorer；完整框架需额外构建验证    | 可选适配器，不迁移 Nitro 架构 |
| Braintrust |  数据集、实验快照、评分、团队协作与生产信号  | 实验管理、答案 scorer、人工/线上反馈  | SDK 可用；`bt eval` 文档标注 macOS/Linux |      有团队平台需求再上       |
|  Langfuse  | Trace、成本、prompt、实验与评分的可观测平台  |  线上观测、离线/在线 score、人工标注  |    JS/TS SDK 适合服务端；自托管需运维    |    生产观测需求出现后再选     |

共同风险：四者的 LLM judge 都会产生模型调用和费用；私有 query/context/answer 可能离开本机；版本、评分提示词和模型变化会导致分数漂移。任何平台的“通过”都不能单独证明检索 Recall 或引用语义正确。

## 8. 是否有成熟的 TypeScript 专项 RAG 评测包？

答案是：**有可用的 TypeScript 组件，但没有一个可以无条件替代项目 evaluator 的“统一标准包”**。

- Promptfoo 是成熟的 Node/CLI harness，强项是配置化测试、断言、provider 对比和答案级 judge。
- Mastra scorers 是 TypeScript 原生评分组件，强项是把 scorer 嵌入 agent/应用代码。
- Braintrust 的 `autoevals` 是可复用 scorer，强项是实验和结果管理。
- Langfuse code evaluators 强项是把确定性或 LLM 分数关联到 trace 和数据集。
- [Ragas 官方仓库](https://github.com/vibrantlabsai/ragas) 与 [RAGAS 论文](https://arxiv.org/abs/2309.15217) 仍主要是 Python 参考生态；“有 RAGAS 定义”不等于 Node/Nitro 已完成等价适配。

尤其是 Recall@K、Precision@K、MRR、nDCG 这类 IR 指标，核心实现并不复杂，真正困难的是 qrels、chunk ID 稳定性、语料快照和回归阈值。第一阶段在项目内写纯 TS 反而更稳：依赖少、结果确定、能直接读当前 `HybridSearchItem.id`，也更容易在 Windows/Node 22 的 CI 中复现。外部包应作为适配器或实验工具，而不是先替换基本盘。

## 9. SmallAliceWeb 分阶段路线

### 9.1 阶段一：纯 TS 检索基线

1. 保留现有关键词 smoke，不改变其字段含义。
2. 将 10 道题扩展为版本化 gold set：`question`、`relevantChunkIds`、可选 `relevance` 等级和类别。
3. 在独立脚本中对 lexical、vector、hybrid 固定候选 K，计算 Recall@5/10/30、Precision@5、MRR@5；有等级标注时再算 nDCG@5。
4. 输出题集版本、语料快照、embedding 模型、K、延迟和错误；CI 只对确定性 IR 指标设门禁。

### 9.2 阶段二：重排与答案抽样

固定同一候选池，比较无 reranker 与一种授权的本地/外部 reranker；同时记录候选 Recall、最终 Top-5 Recall/MRR/nDCG、延迟和失败回退。再挑 10～20 道代表题人工检查 faithfulness、answer relevance、answer correctness、citation correctness。此时可用 Promptfoo 或 Mastra scorer 做批量辅助，但保留人工校准集。

### 9.3 阶段三：实验历史与生产观测

当出现以下信号之一，再选平台：需要多人比较实验、保存不可变运行快照、查看线上 token/延迟/错误、持续收集用户反馈、或需要自托管审计。偏离线实验和团队协作先试 Braintrust；偏生产 trace、成本与自托管先试 Langfuse；Promptfoo 可继续作为 CI harness，Mastra scorer 可继续作为代码级 scorer。

## 10. 立项前必须回答的决策问题

1. 题集是否已经有稳定的相关 chunk ID，还是只有 `expected_keywords`？没有 qrels 时，任何“Recall 提升”都不成立。
2. 评测是 Windows 本地执行、Linux CI，还是云端执行？这会影响 Promptfoo 的 Node 小版本和 Braintrust `bt eval` CLI 选择。
3. query、chunk、answer 是否包含未公开文档或个人信息？若包含，是否允许发送给外部模型、Braintrust 或 Langfuse Cloud？
4. 需要的是一次性离线回归，还是持续保存实验、人工标注和生产 trace？前者优先纯 TS/Promptfoo，后者才值得平台化。
5. 预算是只承担 LLM judge token，还是也能承担 SaaS 月费、数据留存和自托管运维？
6. 是否愿意锁定 scorer、judge 模型、提示词、题集和语料版本？不锁版本，就无法解释分数漂移。
7. Nitro 生产包是否仍遵守显式 provider 装配、服务端密钥和无 import-time 外部连接的现有约束？评测工具应留在脚本/CI 边界。

## 11. 参考资料

- [Promptfoo：Evaluating RAG pipelines](https://www.promptfoo.dev/docs/guides/evaluate-rag/)
- [Promptfoo：Node package](https://www.promptfoo.dev/docs/usage/node-package/)
- [Promptfoo：Node.js runtime support](https://www.promptfoo.dev/docs/installation/)
- [Promptfoo：Pricing](https://www.promptfoo.dev/pricing/)
- [Mastra：Scorers overview](https://mastra.ai/en/docs/scorers/overview)
- [Mastra：Pricing](https://mastra.ai/pricing)
- [Mastra：GitHub 与许可证](https://github.com/mastra-ai/mastra)
- [Braintrust：Evaluation quickstart](https://www.braintrust.dev/docs/evaluation-quickstart)
- [Braintrust：Create experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [Braintrust：Autoevals TypeScript API](https://www.braintrust.dev/docs/reference/autoevals/nodejs/modules/AnswerRelevancy)
- [Braintrust：Remote evals and sandboxes](https://www.braintrust.dev/docs/evaluate/remote-evals)
- [Braintrust：Pricing](https://www.braintrust.dev/pricing/)
- [Langfuse：Evaluation core concepts](https://langfuse.com/docs/evaluation/core-concepts)
- [Langfuse：Code evaluators](https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators)
- [Langfuse：TypeScript SDK](https://langfuse.com/docs/sdk/typescript)
- [Langfuse：Cloud pricing](https://langfuse.com/pricing/)
- [Langfuse：Self-hosted pricing](https://langfuse.com/pricing-self-host)
- [RAGAS 原始论文](https://arxiv.org/abs/2309.15217)
- [NIST/TREC Common Evaluation Measures](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf)
- [nDCG 原始论文](https://dl.acm.org/doi/10.1145/582415.582418)
