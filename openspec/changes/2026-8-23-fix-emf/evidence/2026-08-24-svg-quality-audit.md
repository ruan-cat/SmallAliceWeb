# 2026-08-24 SVG 质量审计

## 1. 审计状态

本文件记录 `tasks.md` 6.6 的进行中证据，不能替代全量质量通过结论。2026-08-24 经用户明确授权后，EMF/WMF 默认生产产物已切换为 SVG；PNG/JPEG/GIF 原始图片分支保持不变。该默认切换只证明指定真实 EMF 的生产 SVG 链路，不构成 399 个输入的全量质量通过结论。

## 2. 全量源基线

|       项目       |           本轮只读结果            |
| :--------------: | :-------------------------------: |
|     DOCX 数      |                195                |
| 嵌入 EMF/WMF 数  |                399                |
|  当前发现的格式  | 399 个均为含 `EMR_COMMENT` 的 EMF |
| 最大单个输入字节 |              817,924              |

此基线来自对当前 `drill-docx` 的 ZIP `word/media` 条目扫描。`EMR_COMMENT` 只标识必须按 EMF+/高风险路径审计，不能单独作为渲染通过或失败结论。

### 2.1 可重复 record 清单

执行命令：

```powershell
pnpm exec tsx scripts/build-doc-in-vercel/emf/audit-manifest.ts --input drill-docx --output openspec/changes/2026-8-23-fix-emf/evidence/2026-08-24-emf-audit-manifest.json
```

清单 `2026-08-24-emf-audit-manifest.json` 对每个媒体记录 DOCX 相对路径、`word/media` 条目、输入 SHA-256、字节数和 risk flag；扫描直接读取 DOCX 的 ZIP 中央目录，不解压或修改原文档，且复用转换链已有的 `~$` Office 锁文件跳过规则。

|         自动审计项          | 计数 |                             处置                              |
| :-------------------------: | :--: | :-----------------------------------------------------------: |
|          有效 DOCX          | 195  |                     锁文件不计入输入集合                      |
|        EMF/WMF 媒体         | 399  |                        EMF 399，WMF 0                         |
|          EMF+ Dual          | 399  |    不能将“SVG 可解析”视为通过；需与 GDI+ 和浏览器逐图复核     |
|          复杂裁剪           | 399  |             作为裁断候选，仍需目标图视口人工判读              |
|         位图 record         | 399  |      允许局部 `<image>`，但禁止退化成唯一全画布 PNG 包装      |
|      `ETO_GLYPH_INDEX`      |  49  | 作为乱码/占位候选，必须使用已反查的字体 glyph 映射或新增映射  |
| `ROP2` / `DrawDriverString` |  0   | 当前输入集未检出；不得声称这些未出现类别已经得到 SVG 保真证明 |

自动风险 flag 只建立人工门禁候选：`glyph-index-text` 对应乱码/占位符，`emf-plus-dual` 对应错位/重复，`bitmap` 或 `complex-clip` 对应裁断。它不自动认定某张图已经存在视觉故障。

## 3. 已定位缺陷：高级角色肖像关系图低对比

### 3.1 浏览器证据

- 页面：`http://localhost:8080/docx/插件详细手册/5.战斗UI/关于高级角色肖像.html`
- 页面资源：第 3 张图片 `关于高级角色肖像-003.png`
- 资源原始尺寸：1024×379；页面显示尺寸：688×255。
- 客户端截图：`C:\Users\pc\AppData\Local\Temp\smallalice-emf-portrait-003.png`
- 判读：WPS 原图证明白底蓝字本身是正常设计；故障是文字与细线相对框体、箭头和路径发生整体错位/重叠。该图不是加载失败、路由错误或 VitePress SSR 未渲染。

### 3.2 输入与 GDI+ 对照

DOCX `drill-docx/插件详细手册/5.战斗UI/关于高级角色肖像.docx` 的 `document.xml` 图像引用顺序中，第 3 项为 VML `imagedata` 的 `rId12 → word/media/image4.emf`。它被原样提取为受版本控制 fixture：`scripts/build-doc-in-vercel/tests/fixtures/portrait-high-contrast.emf`（375,056 字节）。

Windows GDI+ 参照输出：`C:\Users\pc\AppData\Local\Temp\smallalice-portrait-high-contrast-gdiplus.png`，尺寸为 1094×405。参照图中的同类文字有清晰的深色或白色对比；当前 PNG 输出的尺寸被默认 `maxWidth=1024` 缩放为 1024×379，且含 119,616 个透明像素。透明背景不是本例低对比的唯一根因，但必须与字体字重/抗锯齿和缩放行为分开验证。

透明画布已建立 RED→GREEN：新增 fixture 回归先断言 alpha 必须为 255，初始失败为 `expected 0 to be 255`；patched `emf-converter` 在 PNG 主画布回放前填充白色后，`pnpm --filter @ruan-cat-temp/build-doc-in-vercel test -- emf-converter.test.ts` 为 30/30 通过。此修复只使背景与 GDI+ 参照一致，尚不证明浅色文字/细线的对比度问题已经解决。

### 3.3 已排除与待验证

- 已排除：COLORREF BGR 解码颠倒。输入 `EMR_SETTEXTCOLOR` 的 `0x02bb884f` 被当前实现正确读为 `#4f88bb`。
- 已排除：把白底蓝字当成主要故障。WPS 原图与 GDI+ 参照均显示这是原始视觉设计。
- 高概率根因：该输入有 79 个 `EMR_COMMENT_EMFPLUS` 和 28 个 GDI `EMR_EXTTEXTOUTW`（共 112 个 UTF-16 字符）。当前转换器同时回放 EMF+ 路径层和 GDI 文本/图形回退层；微软对 EMF+ Dual 的定义说明 GDI+ 应采用 EMF+ 记录、GDI 回退记录只服务不识别 EMF+ 的设备。必须以“保留必要文本、排除重复 GDI 图形”的受控实验验证，而不是再改颜色。
- 待验证：SVG 文字轮廓输出是否能改善本图。它仍使用 Skia 字体，不能先验视为 GDI+ 等价。

受控实验最终表明 GDI 回退层本身即可恢复与 WPS 相符的紧凑布局：将 93 个 comment 临时改为无副作用记录后，SVG 截图不再出现双层错位。Windows `MetafileHeader.Type` 返回 `EmfPlusDual`，首个 EMF+ Header flags 为 `0x1`。正式补丁现扫描此标记，并在 Dual 文件跳过 EMF+ comment、只回放 GDI 回退层；真实 fixture 回归以原始 Dual PNG 与临时 GDI-only PNG 的 SHA-256 相等为门禁，RED 的 hash 不同，GREEN 后子包 31/31 通过。新文档产物页面截图仍待 Agent Browser daemon 稳定后复验。

## 4. 用户点名页面的批次视觉抽样

|               页面               |          目标资源          | DOCX 原始类型 |                                   本地截图                                    |                               判读                                |
| :------------------------------: | :------------------------: | :-----------: | :---------------------------------------------------------------------------: | :---------------------------------------------------------------: |
|      `0.基本定义/界面.html`      |       `界面-007.png`       |      PNG      |       `C:\Users\pc\AppData\Local\Temp\smallalice-emf-interface-007.png`       |             未见占位、裁断或重复；不属于 EMF 转换范围             |
| `5.战斗UI/关于高级角色肖像.html` | `关于高级角色肖像-003.svg` |      EMF      | `C:\Users\pc\AppData\Local\Temp\smallalice-emf-production-svg-dual-fixed.png` | 生产 SVG 已通过目标图视口判读；白底蓝字是原设计，未见旧的双层错位 |
|  `21.管理器/关于全局存储.html`   |   `关于全局存储-022.png`   |      PNG      |     `C:\Users\pc\AppData\Local\Temp\smallalice-emf-global-store-022.png`      |             未见占位、裁断或重复；不属于 EMF 转换范围             |

页面资源与 DOCX 的映射均按 `document.xml` 的图像引用顺序反查：`界面-007.png → word/media/image7.png`，`关于全局存储-022.png → word/media/image22.png`，`关于高级角色肖像-003.png → word/media/image4.emf`。三张截图均由 Agent Browser 先枚举图片、再滚入目标资源视口后保存并人工判读。

本轮控制链仍记录 daemon EOF，故本节仅是本地页面视觉抽样，不能替代生产环境验收；但 EOF 不应抹消已成功保存、且已实际查看的截图证据。

## 5. 后续门禁

此类别的修复只能在以下证据齐全后标记通过：真实 fixture 的 RED→GREEN 回归、Windows GDI+ 对照、Agent Browser 目标图视口截图和生产容器复验。其余乱码、错位、重复、裁断与占位符类别仍未完成审计。

### 5.1 已固定与待补齐的代表样本

|          类别           |                       真实样本与现有参照                       |                     当前状态                      |
| :---------------------: | :------------------------------------------------------------: | :-----------------------------------------------: |
|   错位 / 重复 / 裁断    |    `portrait-high-contrast.emf` 与 Windows GDI+ 关系图参照     | 已证实 Dual 双回放是根因；生产 SVG 已完成一图复验 |
|      乱码 / 占位符      |    `asset-library-glyph-index.emf`，黑体 glyph id 266 → `…`    | 回归已固定；仍需在 SVG 覆盖清单中做目标图视口复验 |
|     复杂裁剪 / 位图     | 清单中 399/399 全部命中，候选样本见 `插件类型.docx` image1.emf |      尚未完成 GDI+ 与 Chrome 的代表样本验收       |
| ROP2 / DrawDriverString |                    当前 399 个输入均未检出                     |  没有可用真实样本，不能将“零检出”宣传为格式保真   |

## 6. Production Git Integration 复验

### 6.1 旧 PNG 部署

- Production deployment：`dpl_6rHWuuruwdDWYhvvmeayhwng4xe8`，checkout `main@d288ded`。
- 该部署的第 3 张资源为 PNG，截图 `C:\Users\pc\AppData\Local\Temp\smallalice-emf-production-dual-fixed.png` 已确认 EMF+ Dual 旧错位消失。

### 6.2 当前 SVG 默认部署

- Production deployment：`dpl_J6jGa8LpiMchKGri6DMd4ECL6UjW`，状态 Ready，checkout `main@54e153267ce9eaff8850650e656411f354db2e48`；别名包含 `https://drill.ruan-cat.com`。
- 构建日志：EMF/WMF 转换成功 421 张、失败 0 张。
- 原样生产 URL：`https://drill.ruan-cat.com/docx/插件详细手册/5.战斗UI/关于高级角色肖像.html`。
- 浏览器控制：本机 `C:\Program Files\Google\Chrome\Application\chrome.exe`，隔离临时 profile，CDP 端口 9228，由 `agent-browser --cdp 9228` 接管；打开页面后统计 26 张客户端图片，再把目标图滚入视口截图。
- 目标资源：`/assets/关于高级角色肖像-003.DwzJBk5U.svg`，自然尺寸 1024×379，页面盒尺寸 688×255；HTTP `200`、`Content-Type: image/svg+xml`、220,075 字节，SVG 根元素存在，含 144 个 `<path>` 与 20 个局部 `<image>`，不是整图 PNG 包装。
- 目标图视口截图：`C:\Users\pc\AppData\Local\Temp\smallalice-emf-production-svg-dual-fixed.png`。
- 人工判读：文本框、三条箭头和动画序列均为紧凑单一布局，与 WPS/GDI+ 基准的相对位置一致；未见此前 SVG POC 中“全套文本、箭头和框体彼此错开”的错误，也未见 EMF+ Dual 的重复图层。

结论：默认 SVG 的真实 Git Integration 生产链路和该高风险 Dual 关系图通过。该结论不替代任务 6.6 的全量分类与 6.7 的覆盖清单逐图视觉验收。
