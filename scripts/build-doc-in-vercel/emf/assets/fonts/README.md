# 1. 资产说明

本目录存放随包携带的中文字体文件，供 Vercel AL2023 构建容器内注册（容器无任何中文字体，缺失则 EMF 内嵌文字渲染为空白/豆腐块）。

## 1.1 文件清单

|          文件          |  大小  | 字形数 |               说明               |
| :--------------------: | :----: | :----: | :------------------------------: |
| NotoSansSC-Regular.ttf | 291 KB | 1,258  | 子集化产物，常规字重，非可变字体 |

## 1.2 来源与许可证

- **上游字体**：Noto Sans SC（思源黑体的 Google 衍生版），SIL Open Font License 1.1 授权。
- **上游获取**：本机系统字体 `C:\Windows\Fonts\NotoSansSC-VF.ttf`（可变字体，全量约 17.7MB）。
- **子集化处理**（2026-08-23）：使用 fonttools 4.63.0 的 `Subsetter`，字符集为 182 个 `drill-docx` DOCX 内 382 张 EMF 经 `emf-converter` 实际解析到的可读正文字符 + 完整 ASCII 可打印字符 + 常用中英文标点；已删除全部变体轴相关表（fvar/avar/gvar/HVAR/STAT 等），固定为常规字重。
- **OFL 1.1 允许**子集化与再分发，但**不得单独出售字体文件本身**；完整许可证见 <https://openfontlicense.org/>。
- **当前覆盖**：资产为 291,132 字节、1,258 个字形、855 个 Unicode cmap 码点。`tests/fixtures/emf-text-coverage.txt` 固化字符来源；`tests/fonts.test.ts` 断言其字符集合是该 cmap 的子集，缺任一字形即失败。

## 1.3 重新生成方式

当 `emf-text-coverage.txt` 因文档集更新而扩大时，在装有 fonttools 的 Python 环境按以下流程重出资产：

```python
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

font = TTFont(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
for tag in ["fvar", "avar", "HVAR", "VVAR", "STAT", "MVAR", "gvar", "cvar"]:
    if tag in font:
        del font[tag]
opts = Options()
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
subsetter = Subsetter(options=opts)
text = "".join(
    line
    for line in open("emf-text-coverage.txt", encoding="utf-8")
    if not line.startswith("#")
)
subsetter.populate(text=text)
subsetter.subset(font)
font.save("NotoSansSC-Regular.ttf")
```

变体字体表必须在子集化**前**删除（先 subset 后删 `fvar` 会因 `avar` 等表引用缺失而 `KeyError`）。替换资产前运行 `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test`，确认 cmap 覆盖、字体映射和 EMF/WMF 转换用例全部通过。
