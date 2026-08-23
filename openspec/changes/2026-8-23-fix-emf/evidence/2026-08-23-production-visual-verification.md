# 2026-08-23 EMF 文本修复生产视觉验收

## 1. 部署与构建证据

### 1.1 Git 与 Vercel 部署

- 生产提交：`02963b525f4794ab6dd99ae8031b6189c130b54a`（`main` 与 `dev` 同 SHA）。
- Vercel Production deployment：`dpl_3FRZj7YhkGNUmRHSrE2zTbfAYs83`，状态 `Ready`。
- Vercel Git 构建日志已确认：从 `main` 检出 `02963b5`，不是本地 CLI 上传链路。
- 生产域名：`https://drill.ruan-cat.com`。

### 1.2 容器转换统计

Vercel 构建日志包含以下结果：

```log
2026-08-23T12:26:42.908Z  //:build:doc-in-vercel: [info] EMF/WMF 转换统计: 成功 421 张，失败 0 张
2026-08-23T12:26:50.308Z  //:build:doc-in-vercel: [success] 文档构建完成
2026-08-23T12:26:50.308Z  //:build:doc-in-vercel: [success] 所有文件处理成功
```

## 2. Agent Browser 可见 Chrome 验收

### 2.1 009 对应图片对照

009 原始问题截图为 <https://gh-img-store.ruan-cat.com/img/2026-08-23-11-43-24.png>，对应页面是「关于输入设备核心（高级篇）」。原截图中流程框内中文显示为豆腐块；本次生产页面的同类图内「键盘绑定」「触发自定义事件」「手柄按键」均清晰可读。

|          项目          |                                                                                                                 生产页面                                                                                                                 | 图片加载 | 结论 |
| :--------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------: | :--: |
| 009 对应输入设备核心图 | <https://drill.ruan-cat.com/docx/%E6%8F%92%E4%BB%B6%E8%AF%A6%E7%BB%86%E6%89%8B%E5%86%8C/1.%E7%B3%BB%E7%BB%9F/%E5%85%B3%E4%BA%8E%E8%BE%93%E5%85%A5%E8%AE%BE%E5%A4%87%E6%A0%B8%E5%BF%83%EF%BC%88%E9%AB%98%E7%BA%A7%E7%AF%87%EF%BC%89.html> | 30 / 30  | 通过 |

截图：`C:\Users\pc\AppData\Local\Temp\fix-emf-009-original-issue.png`、`C:\Users\pc\AppData\Local\Temp\fix-emf-009-diagram-production.png`。

### 2.2 含中文 EMF 文本样本

以下页面均从当前 `drill-docx` 中确认含 EMF；Agent Browser 使用 `--headed` 的 Chrome 打开页面并检查 `naturalWidth`。每页图片加载数均无失败，视口截图中图内与正文中文可读，没有整段空白或豆腐块。

|     样本页面     | EMF 数 | 图片加载  |                            截图路径                             | 结论 |
| :--------------: | :----: | :-------: | :-------------------------------------------------------------: | :--: |
|      兼容性      |   9    |  10 / 10  |   `C:\Users\pc\AppData\Local\Temp\fix-emf-compatibility.png`    | 通过 |
|   大家族-开关    |   25   | 191 / 191 |  `C:\Users\pc\AppData\Local\Temp\fix-emf-switches-sample.png`   | 通过 |
|    触发的本质    |   24   | 127 / 127 |  `C:\Users\pc\AppData\Local\Temp\fix-emf-trigger-essence.png`   | 通过 |
|  关于按钮组核心  |   17   |  54 / 54  |    `C:\Users\pc\AppData\Local\Temp\fix-emf-button-group.png`    | 通过 |
| 独立开关与事件页 |   13   |  44 / 44  | `C:\Users\pc\AppData\Local\Temp\fix-emf-independent-switch.png` | 通过 |

### 2.3 浏览器状态

- 当前验收页面：`关于输入设备核心（高级篇）`。
- `agent-browser errors --clear` 未返回页面错误。
- Chrome 启动初始出现 exit code 3；使用 Agent Browser `doctor` 后按诊断提示为有界可见会话追加 `--no-sandbox`，之后页面加载、截图和 DOM 图片检查均正常。

## 3. 结论与剩余风险

### 3.1 验收结论

本次生产验收通过：Vercel 容器转换 421 张 EMF/WMF、失败 0；009 对应页面已从豆腐块状态恢复为图内中文可读；另有五个含中文 EMF 的独立样本页均无未加载图片、无整段空白或豆腐块。

### 3.2 未解决风险

- 本验收以生产 PNG 的可读性和原始问题截图对照为准，未对每张图片执行 Word 原图像素级比对；字体风格可能与 Windows 原字体不同。
- `emf-converter` 对 record type 90 的既有 `Unhandled` 警告仍是上游限制，未在本次生产构建中造成转换失败。
