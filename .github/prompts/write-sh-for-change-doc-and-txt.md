# 将指定目录内的文件转换格式

为我编写一个 .sh 文件，名为 `change.sh`，存放在 `scripts/docx2md/change.sh` 内。主要用于以下目的：

1. 进入到 drill-docx 文件夹，遍历全部的 `*.docx` `*.doc` `*.txt` 文件。
2. 使用 pandoc ，将这些文件全部转换成成 `*.md` 格式的文件。
3. 转换完成后，输出全部的 md 格式文件名称。按照文件夹目录结构输出文件名称。

## 无需安装 pandoc

请假设你当前运行环境已经存在有 pandoc 了。直接使用即可。

## 运行环境

你编写的脚本文件，主要在以下两个环境内使用：

1. github workflow 的 linux 系统。
2. Win10 系统。
