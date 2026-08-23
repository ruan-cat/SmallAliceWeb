# 2026-08-23 drill-docx EMF 全量抽样统计

## 1. 统计方法

- **扫描范围**：`D:\code\ruan-cat\drill-docx` 全量 182 个 docx（os.walk 递归，跳过 node_modules/.git）。
- **读取方式**：Python 3.11 `zipfile` 直读 docx（zip 容器），遍历 `word/media/*.emf`、`word/media/*.wmf` 条目，全程内存处理，无落盘。
- **判定口径**：
  - 传统 EMF：文件头前 4 字节小端 == `0x00000001`（EMR_HEADER）；
  - EMF+：文件体内存在 ASCII 签名 `EMF+`（`45 4D 46 2B`）。EMF+ dual 文件必然携带该签名（GDI+ 记录以 EMF+ 记录头开头），故以「含 `EMF+` 签名」作为 EMF+（含 dual）判据；不含记为经典 EMF；
  - 全部样本均通过传统 EMF 头部魔数校验（0 个魔数异常）。
- **失败记录**：解包异常捕获计入失败清单，本次 0 失败。

## 2. 汇总统计

|        指标         |             值             |
| :-----------------: | :------------------------: |
|      docx 总数      |            182             |
|  含 EMF 的 docx 数  |            112             |
|    EMF 文件总数     |            382             |
| EMF+（含 dual）数量 |            382             |
|      经典 EMF       |             0              |
|    WMF 文件总数     |             0              |
|    EMF 尺寸区间     |     19,288 ~ 817,924 B     |
|    EMF 平均尺寸     | 约 190,680 B（总 72.8 MB） |
|      解包失败       |             0              |

## 3. 分布

|         一级位置          | EMF 数 | EMF+ |
| :-----------------------: | :----: | :--: |
|       插件详细手册/       |  380   | 380  |
| 注意\_v3.80 升级说明.docx |   2    |  2   |

## 4. 结论

1. **drill-docx 全库 EMF 100% 为 EMF+（含 dual）形态，不存在经典 EMF 或 WMF 样本**。该结论对两处设计有影响：
   - fixtures 中 `classic.emf` 实为 EMF+ dual（与 `emfplus-dual.emf` 同形态），测试用例不需要区分两者行为；
   - `classic.wmf` 无法从 drill-docx 抽取，需手工构造最小合法 placeable WMF（仅用于 WMF 分流逻辑验证，见 `2026-08-23-emf-pilot.md` 与 tests fixtures 构造说明）。
2. 全部 382 个 EMF 尺寸 ≤ 818KB，单文件远小于 fixture 100KB 上限之外的大部分真实样本——fixture 抽取需选 ≤100KB 的子集（如 compat/image1 42KB、compat/image9 27KB）。
3. 试点选样结论外推：试点 8 样本（覆盖 5 个 docx、19KB~575KB、全部 EMF+）代表性与真实分布一致，试点结论可外推全库。

## 5. 回归选样建议

- 全量回归（管线级验证）天然覆盖全部 382 个 EMF，无需额外抽样；
- 单测 fixture 保持 3 个真实 EMF+ 样本 + 手工 WMF + 构造负例的形态即可；
- 目视抽查建议优先大尺寸（>500KB，如 faq/image31 575KB）与图表密集文档（按钮组 17 个 EMF）样本。
