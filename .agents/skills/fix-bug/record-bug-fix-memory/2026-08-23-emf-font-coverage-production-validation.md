# 2026-08-23 EMF 中文字体覆盖与生产验收

## 1. 问题现象

文档站已能把 EMF 转为 PNG，但 Vercel 容器生成的部分图片内嵌中文显示为整段空白或豆腐块；Windows 本地渲染又可能看似正常。

## 2. 实际根因

1. 高频 faceName「黑体」、Tahoma、Franklin Gothic Book、Segoe UI 未映射到随包字体；`emf-converter` 未命中后把原始字体名交给容器 Skia，而容器没有可靠 CJK 回退。
2. 原有 199KB Noto Sans SC 子集仅覆盖文件名字符，不能覆盖 EMF 正文的汉字。
3. Windows 系统字体回退掩盖了容器缺少字形的问题，因此本地目视不能代替生产验收。

## 3. 关键误导点

- 直接猜测 `EMR_EXTTEXTOUTW` 二进制偏移提取字符会得到乱码，不能作为字体子集依据。
- 运行时 `fillText` 捕获到的 7 个带控制前缀扩展字符来自错误解码记录，不是可读正文；若盲目要求单字体覆盖它们，会制造错误门禁。
- 0 字节的 `emf-text-chars.tmp.txt` 是调试残留，没有可复现价值；即使用户要求提交全部工作区，也应先指出并删除，不应以 `save-file` 提交进入历史。

## 4. 有效修复

- `fonts.ts` 补齐实测字体名，并用 `Proxy` 让未知字符串 faceName 默认解析到 `NotoSansSC`。
- 以 `emf-converter → Canvas fillText` 的可读输出提取 382 张 EMF 的正文字符，加入完整 ASCII 与标点，固化为 UTF-8 fixture。
- 以 FontTools 重出 291,132 字节的 Noto Sans SC 子集；新增本地 TTF cmap format 4/12 读取工具和零缺字测试。
- 误提交的空临时文件已在后续 `delete` 提交中移除。

## 5. 验证方式

- `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test`：22/22 通过。
- Vercel Git Integration 从 `main@02963b5` 检出；容器日志显示 EMF/WMF 转换成功 421 张、失败 0 张。
- 可见 Chrome 的 Agent Browser 对照 009 原问题截图与生产页面，并抽查五个含 EMF 的 DOCX 页面；图内中文可读、图片无未加载项、无整段空白或豆腐块。

## 6. 后续约束

- 新文档引入 EMF 正文字符时，先以实际 `fillText` 路径更新 fixture，再重出字体并通过 cmap 测试。
- 生产验收必须保留 Git SHA、Vercel build 日志和可见浏览器截图；本地结果仅作辅助。
- 临时文件只要为空、没有可复现输入或没有任务引用，就应在提交前删除；不要把“全部工作区”机械解释为提交调试垃圾。
