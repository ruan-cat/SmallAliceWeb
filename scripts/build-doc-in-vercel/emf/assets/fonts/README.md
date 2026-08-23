# 1. 资产说明

本目录存放随包携带的中文字体文件，供 Vercel AL2023 构建容器内注册（容器无任何中文字体，缺失则 EMF 内嵌文字渲染为空白/豆腐块）。

## 1.1 文件清单

|          文件          |  大小  | 字形数 |               说明               |
| :--------------------: | :----: | :----: | :------------------------------: |
| NotoSansSC-Regular.ttf | 199 KB |  931   | 子集化产物，常规字重，非可变字体 |

## 1.2 来源与许可证

- **上游字体**：Noto Sans SC（思源黑体的 Google 衍生版），SIL Open Font License 1.1 授权。
- **上游获取**：本机系统字体 `C:\Windows\Fonts\NotoSansSC-VF.ttf`（可变字体，全量约 17.7MB）。
- **子集化处理**（2026-08-23）：使用 fonttools 4.63.0 的 `Subsetter`，字符集为 drill-docx 全部文件/目录名字符 + ASCII 可见字符 + 常用中英文标点；已删除全部变体轴相关表（fvar/avar/gvar/HVAR/STAT 等），固定为常规字重。
- **OFL 1.1 允许**子集化与再分发，但**不得单独出售字体文件本身**；完整许可证见 <https://openfontlicense.org/>。
- 子集化后字形覆盖有限（931 字形，仅覆盖文件名与常用标点字符集），EMF 内嵌正文中超出该字符集的汉字会回退到默认字体（容器内即豆腐块）——这是体积与覆盖面的权衡，若目视验证发现大量缺字，需扩大字符集重新子集化。

## 1.3 重新生成方式

若需扩大字符集，参考命令（在装有 fonttools 的 Python 环境执行）：

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
subsetter.populate(text="<目标字符集>")
subsetter.subset(font)
font.save("NotoSansSC-Regular.ttf")
```

变体字体表必须在子集化**前**删除（先 subset 后删 fvar 会因 avar 等表引用缺失而 KeyError）。
