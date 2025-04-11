# 将 docx 转换成 md 文档

目前已经完成了最核心的 docx 生成 md 的步骤，现在已经在 vercel 服务器内完成文件获取，以及文档生成了。

## 独立的 docx 仓库

新建一个独立的 docx 仓库，专门存储 drill 的 docx 文件。不做版本划分。

- https://github.com/ruan-cat/drill-docx

## 克隆项目

使用 degit 完成项目克隆。用 degit 的 api 实现克隆。也可以考虑用 cli 完成。

- https://github.com/Rich-Harris/degit/blob/master/README.md#javascript-api

## 将 docx 生成为 html 文件

### mammoth

使用该库完成。

- https://github.com/mwilliamson/mammoth.js
- https://www.npmjs.com/package/mammoth

经过试验，效果不好。很多图片都不能生成出有效的内容。生成的 png 图片直接失败了。

### onlyoffice

### libreoffice

### 腾讯云

- https://cloud.tencent.com/document/product/1250/109280

## 将 html 生成为 md 文件

- https://www.npmjs.com/package/html-to-md

## 将 txt 生成为 md 文件

先去找一下类似的库。实在不行就 ai 生成。

## 用 biome 代替 prettier 完成格式化

- https://github.com/biomejs/biome

预期文件很多，为了提高格式化效率，故使用 biome 完成格式化。

## 继续用 prettier 完成格式化

- https://biomejs.dev/zh-cn/internals/language-support

biome 目前（2025-2-12）还不能格式化 md 文档。

## 图片压缩

看看有没有合适的 node 库，压缩全部的图片资源，且失真率较低，原地修改文件，且不更改后缀名和文件名。

- https://github.com/lovell/sharp

## 用 vitepress 渲染页面

不使用 vuepress，用 vitepress 提高效率。因为钻头文档有着非常多的静态文件和网页。必须要提高部署和运行速度。

## 部署策略

只使用 vercel 平台的服务器来完成，不使用 vercel output api 来实现。预期的部署文件和数量会非常大，容易超出限制。

## 失败的图片

vitepress 严格的机制，决定了我们不能给 md 文件生成出不存在的静态图片，故这里打算提供一个固定的图片，作为占位符。

![2025-02-12-18-13-41](https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-02-12-18-13-41.png)
