<!-- 已完成 -->

# 2026-08-23 EMF 文本丢失修复方案

> 针对 `reports/2026-08-23-emf-text-loss-research.md` 定位的三个根因给出修复方案。
> 目标：生产站点（Vercel 容器产物）EMF 图片内嵌中文完整可读，无整段丢失、无豆腐块。

## 1. 方案总览

|                根因                 |                                                                   对策                                                                    |     优先级     |
| :---------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------: | :------------: |
| 根因 1：黑体等 4 个高频字体名未映射 | ① `fontFamilyMap` 补齐真实 faceName（黑体/Tahoma/Franklin Gothic Book/Segoe UI 等）② 兜底策略：**未映射 faceName 统一回退到注册中文字体** |       P0       |
|   根因 2：54.3% 正文汉字不在子集    |                  **按 EMF 文本全集重新子集化字体**（821 汉字 + 标点 + 常见繁体 ≈ 1200~1500 字形，子集体积约 300~500KB）                   |       P0       |
|      根因 3：本地/容器行为差异      |                                          验收只看**容器产物**；本地目视仅作辅助，不替代容器验证                                           | P0（流程约束） |

## 2. 推荐方案（A：单字体全集子集 + 映射兜底）

保持"单字体注册 + fontFamilyMap"架构不变（这是已上线架构），做两处增强，改动面最小、风险可控。

### 2.1 字体资产重出

按 **EMF 文本全集**（报告 §3.2：821 个汉字 + 数字字母 + 中英文标点 + 简体/繁体/全角字符，可再并入近期文档中出现的常用字）重新子集化 Noto Sans SC：

- 字符集来源：`emf-converter` 文本记录（记录 84 / EMF+ DrawString）提取的 CJK 全集，脚本可复用调研时的提取逻辑（解析记录头步进，记录 84 偏移 32 起读 UTF-16LE 文本）；
- 追加覆盖：ASCII 可打印字符、常用标点（`，。：；！？（）【】《》〈〉「」『』“”‘’—…·、`）、数字、字母（EMF 中英文字符）；
- 建议再并入一些高频但可能未出现在当前文本的常用字（预留缓冲，如常用 3500 字的前几百字区间可按体积预算取舍）；
- 重新生成后用 `fontTools` 校验：`text_chars ⊆ cmap`（缺字断言为 0）；
- 体积目标：≤ 600KB（当前 199KB，扩张 2~3 倍仍远小于全量 17.7MB）；
- 重新子集化的具体步骤与脚本要点见 `scripts/build-doc-in-vercel/emf/assets/fonts/README.md` §1.3（含变体表先删的坑）。

### 2.2 fontFamilyMap 与兜底策略

`fonts.ts` 的映射表扩展为 **所有实测出现的 faceName**（注意键必须小写，emf-converter 契约）：

```ts
export const fontFamilyMap: Record<string, string> = {
	// 既有 12 键保留
	simsun: "NotoSansSC",
	宋体: "NotoSansSC", // ... 原有
	// 新增：实测出现但此前未映射的高频字体（黑体是最高频！）
	黑体: "NotoSansSC",
	simhei: "NotoSansSC",
	tahoma: "NotoSansSC",
	"franklin gothic book": "NotoSansSC",
	"segoe ui": "NotoSansSC",
};
```

**兜底策略（关键，解决"未来新字体名"问题）**：emf-converter 的 `mapFontFamily` 未命中时会原样使用 faceName（库行为不可改，除非 fork）。兜底有两个可选实现：

- **方案 A1（推荐，零库改动）**：在 `fonts.ts` 注册字体时，用 `GlobalFonts.registerFromPath` 的别名注册把**常见中文/Office 字体名注册为 NotoSansSC 的别名**（如注册 `黑体`、`宋体`、`SimSun`、`DengXian`、`等线`、`Microsoft YaHei` 等别名指向同一字体文件）。skia 按名命中已注册别名 → 不触发回退。⚠ 需实测别名注册后 skia 按 faceName 命中行为（napi canvas 的 registerFromPath 第二参数即 family 名，多别名注册同一路径是否互斥需验证，若不支持则退回 A2）；
- **方案 A2（兜底，侵入最小）**：转换封装 `convertEmfToPng` 调用前，把 fontFamilyMap 动态补全为"全量常见 faceName → NotoSansSC"（静态清单，200 行以内的映射表，覆盖 Windows/Office 常见字体：黑体宋体楷体仿宋微软雅黑等线、DengXian、SimHei/SimSun/NSimSun、PMingLiU/新细明体、微软正黑体、华文系列、Times New Roman、Arial、Georgia、Verdana、Tahoma、Segoe UI、Franklin Gothic 系等）。清单来源：报告 §3.1 实测 7 个 + Office 默认字体集。
- 两者可叠加（A1 优先，A2 作为全量清单保底）。

### 2.3 验收标准

1. **容器产物验收（唯一权威）**：部署后抽查 009 截图对应的图片 + ≥5 张含长中文文本的 EMF 图片（优先 黑体 文本、宋体 文本、微软雅黑 文本样本），逐张对比 Word 原图：中文完整可读、无整段空白、无豆腐块；
2. **缺字断言**：重新子集化后 `text_chars ⊆ cmap` 校验通过（字面零缺字）；
3. **回归**：`pnpm test`（子包 vitest 20 用例）全绿；本地管线全量跑通（作为基线，不作为容器验收）；CI ubuntu 构建成功且 `EMF/WMF 转换统计: 成功 N 失败 0`；
4. **体积/时长**：字体资产 ≤ 600KB；容器构建时长增量可接受（与现状同量级）。

## 3. 备选方案（B：多字体注册 / C：不子集化）

|               方案                |                                做法                                |                                         取舍                                         |
| :-------------------------------: | :----------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
|      B：宋体+黑体双字体注册       | 子集化两份字体（黑体风格与宋体风格各一），按 faceName 映射不同字体 |                视觉还原度更高（黑体/宋体区分），体积 ×1.5~2，工作量大                |
|   C：全量 NotoSansSC（17.7MB）    |                        不子集化直接携带全量                        | 零字形缺口、最稳，但构建体积 +17MB、安装/上传时间增加；Vercel 500MB 上限内可用但偏重 |
| D：缩小缺口（仅补映射不重出字体） |                          只修映射不扩字形                          |                 ❌ 不充分——54.3% 缺字号仍会豆腐块，必须同时处理字形                  |

**推荐 A**：单字体全集子集 + 别名/清单兜底，规模最小、直击两因。若验收发现黑体/宋体风格差异明显影响可读性，再升级 B。

## 4. 实施清单（供执行 agent）

1. 重出字体资产：脚本提取 EMF 文本全集 → fontTools 子集化 → `text_chars ⊆ cmap` 断言 → 替换 `assets/fonts/NotoSansSC-Regular.ttf`（更新 README.md 资产说明）；
2. `fonts.ts`：`fontFamilyMap` 补黑体/Tahoma/Franklin Gothic Book/Segoe UI 等键；按 A1/A2 实现兜底；
3. 本地验证：vitest（含 fonts.test 单体；新增用例：黑体键存在、未映射名回退不抛错/命中）、本地管线基线；
4. 部署验收：`git commit` → push dev（CI）→ main（Vercel 生产）→ 站点抽查 009 截图与 5+ 中文字样本，记录对比结论；
5. 回写：更新 `reports/2026-08-22-docx-x-emf-conversion-research.md` 或追加本方案验收章节；必要时在 `prompts/index.md` 009 标记完成。

## 5. 风险与注意

- **skia 别名注册行为需先实测**（A1）：若 napi canvas 不允许同文件多别名注册，改用 A2 静态清单；两者实测成本各约 10 分钟；
- **Windows 本地假象**：本地目视通过不代表容器通过（根因 3），验收必须以部署产物为准；
- **繁体/生僻字**：当前文本全集 821 字含少量繁体；若后续文档引入更多生僻字，需迭代子集（README §1.3 流程已就绪）；
- 本次 logo/装饰性文字丢失也在同一机制内，统一修复即可。
