# 小爱丽丝官网

这是正在开发维护的项目。

## 自动转写计划

## 独立的 docx 仓库

新建一个独立的 docx 仓库，专门存储 drill 的 docx 文件。不做版本划分。

## 克隆项目

使用 degit 完成项目克隆。用 degit 的 api 实现克隆。也可以考虑用 cli 完成。

## 将 docx 生成为 html 文件

使用该库完成。

- https://github.com/mwilliamson/mammoth.js
- https://www.npmjs.com/package/mammoth

## 将 html 生成为 md 文件

- https://www.npmjs.com/package/html-to-md

## 将 txt 生成为 md 文件

先去找一下类似的库。实在不行就 ai 生成。

## 用 biome 代替 prettier 完成格式化

- https://github.com/biomejs/biome

预期文件很多，为了提高格式化效率，故使用 biome 完成格式化。

## 图片压缩

看看有没有合适的 node 库，压缩全部的图片资源，且失真率较低，原地修改文件，且不更改后缀名和文件名。

- https://github.com/lovell/sharp

## 用 vitepress 渲染页面

不使用 vuepress，用 vitepress 提高效率。因为钻头文档有着非常多的静态文件和网页。必须要提高部署和运行速度。

## 部署策略

只使用 vercel 平台的服务器来完成，不使用 vercel output api 来实现。预期的部署文件和数量会非常大，容易超出限制。
