<!-- 正在做 -->

# 2026-08-23 调研 EMF 矢量图转换的文本丢失与乱码问题

> 任务来源：`prompts/index.md` 009（用户登记：文档站 EMF 转换已实现，但很多图片仍出现文本丢失/乱码，认定与字体或 UTF-8 中文字符处理有关）。
> 本报告只做调研与根因分析，不涉及修复实施（修复将交由其他 agent 按 `reports/2026-08-23-emf-text-loss-solution.md` 执行）。

## 1. 问题现象

- 生产站点（drill.ruan-cat.com）docx 转出的 PNG 中，**EMF 图片内嵌的文字（尤其中文）整段丢失或显示乱码**（用户截图：`https://gh-img-store.ruan-cat.com/img/2026-08-23-11-43-24.png`）。
- 地方管线（Windows）产出的图片目视"看似正常"，与容器产物不一致——见 §4 根因 3。

## 2. 转换链路的字体机制（源码级事实）

`emf-converter`（v2.0.2，dist 源码核实）的文本渲染路径：

- 经典层文本：`EMR_EXTCREATEFONTINDIRECTW`（记录 82）创建逻辑字体（含 `lfFaceName`）→ `EMR_EXTTEXTOUTW`（记录 84）绘制；EMF+ 文本：`DrawString` 等记录直接带 `font.family`。
- 字体选择统一走 `mapFontFamily(face, map)`：

```js
function mapFontFamily(face, map) {
  const resolved = map?.[face.toLowerCase().trim()] ?? face;  // 未命中 → 原样返回 face
  ...
}
```

- **未命中 `fontFamilyMap` 时，直接用原始字体名**拼进 `ctx.font = "16px 黑体"` 交给 canvas 引擎。
- 当前项目 `fonts.ts` 的 `fontFamilyMap` 只有 12 个键：`simsun/宋体/nsimsun/新宋体/calibri/cambria/courier new/arial/microsoft yahei/微软雅黑/kaiti/楷体`。

## 3. 全量数据统计（382 个 EMF，drill-docx）

### 3.1 EMF 中实际出现的字体名（记录 82 解析，命中 4147+3948+349+325+108+57+12 次）

|        字体名        | 出现次数 |  是否在 fontFamilyMap  |
| :------------------: | :------: | :--------------------: |
|         黑体         |   4147   | ❌ 未映射（最高频！）  |
|       Calibri        |   3948   | ✅ 已映射 → NotoSansSC |
|         宋体         |   349    |       ✅ 已映射        |
|       微软雅黑       |   325    |       ✅ 已映射        |
|        Tahoma        |   108    |           ❌           |
| Franklin Gothic Book |    57    |           ❌           |
|       Segoe UI       |    12    |           ❌           |

### 3.2 文本字符覆盖（记录 84 提取 CJK 字符全集）

- EMF 正文出现 **821 个不同汉字**（含部分繁体/标点）；
- 当前随包子集字体 `NotoSansSC-Regular.ttf` 的 cmap 仅 **568 项**（含 ASCII 与标点，纯汉字约 480+）；
- **446 个汉字（54.3%）不在子集字体中**，缺字形必然（样本：三下专业东两串为久么之乐也了二些产亮什仅……）。

## 4. 根因分析（三因叠加）

### 根因 1️⃣：字体名映射缺口——最高频字体「黑体」未映射

`黑体` 在 382 个 EMF 中是**出现次数最多的字体（4147 次）**，但 `fontFamilyMap` 没有它（也没有 Tahoma / Franklin Gothic Book / Segoe UI）。未映射 → 原始名直接进 `ctx.font` → skia 找不到该字体 → **回退到默认字体**。

- **容器（Vercel AL2023）默认字体链没有任何 CJK 字形** → 整段中文丢失（与用户看到的"文本丢失"吻合）。
- **Windows 本地**：skia 的字体管理器可回退到系统字体，本地渲染"看似正常"。

### 根因 2️⃣：字形覆盖缺口——54.3% 正文汉字不在子集

当前子集字体只覆盖「drill-docx 文件/目录名 + 常用标点」字符集（约 480 个汉字）。EMF 正文是**文档内容文本**，与文件名集合几乎不重叠 → **过半汉字无字形**。即使字体名映射正确（如宋体/Calibri → NotoSansSC），缺字形汉字也渲染为豆腐块/空白。

### 根因 3️⃣：本地/容器行为差异——验证方法论陷阱

- 实验：`ctx.font = "24px DengXian"`（未注册）在 **Windows 本地渲染中文成功**（measureText 宽 140，与 NotoSansSC 一致）——因为系统装有等线字体，skia 回退命中系统字体；
- 同类实验 `PMingLiU` / `Times New Roman` / `黑体` / `sans-serif` 在本地均只剩拉丁字符（宽 122~124，dark 像素 ~1%）；
- **结论：本地转换“看起来正常”不代表容器正常**（容器无系统字体可回退）。8/8 试点与本地管线目视未在 Windows 上抓出问题，但生产站点（容器产物）暴露全貌。任何修复的验收必须看**容器产物**（部署后的站点图片或 CI/Vercel 构建输出），不能只看本地生成图。

### 附加观察

- `emf-converter` 对文本的 `fillText` 不做字形存在性检查（无字形时 skia 静默跳过），因此**不会报错**，静默产出缺字图——与 handle-x-emf-img 期间抓到的「deferred image 绘制错误被 try/catch 静默吞掉」同类，都是"无报错的静默质量损失"。
- 本项目 EMF 内嵌文本以中文为主（黑体/宋体/微软雅黑 合计 4821 次），英文文本（Calibri/Tahoma 等）在子集内 ASCII 已覆盖，问题集中在 CJK。

## 5. 实验证据留存

- 字体回退实验（Windows 本地 napi canvas）：`C:\Users\pc\AppData\Local\Temp\emf-text-exp\*.png`（a1/a2 已注册字体、b1-b4 未映射字体、c1 默认族），dark 像素统计：
  - a1 正常中文 dark≈1.51%；a2 含子集外字 dark≈2.63% 宽度异常；
  - b2/b3/b4/c1（未映射/默认）dark≈0.99~1.04%，仅拉丁字符画出——复现"中文整段丢失"形态；
  - b1（DengXian 本地）dark≈2.79%——本地回退系统字体假象。
- 全量统计脚本与本报告同源，已清理临时文件；可复现命令在解决方案文档中给出。

## 6. 结论

1. 用户判断方向正确：核心是**字体处理**问题，但不止"UTF-8 转换"——EMF 内嵌文本本来就是 UTF-16LE 解码（emf-converter 处理正常），**丢失发生在字体匹配/字形覆盖层**。
2. 两个可量化根因：黑体等 4 个高频字体名未映射（整段丢失）+ 54.3% 正文汉字不在子集（逐字缺失），叠加容器无系统字体回退。
3. 修复验收必须基于容器产物，并给"黑体"类未映射字体提供兜底。

## 7. 后续

- 推荐修复方案：见 `reports/2026-08-23-emf-text-loss-solution.md`。
- 交接信息（给执行 agent）：见 `reports/2026-08-23-emf-text-loss-handoff.md`。
