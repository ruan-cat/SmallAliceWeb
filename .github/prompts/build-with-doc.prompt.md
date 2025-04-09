# 在 github workflow 内完成文件格式转换

在本次对话中，我们将编写一个 github workflow，用于完成以下任务：

1. 检出本仓库。
2. 安装 pandoc 库，并输出 pandoc 的版本。
3. 安装 node 环境、pnpm 包管理器、以及全局的 node 包 degit，并输出 node 和 pnpm 的版本号。
4. 使用 node 库 degit，克隆 https://github.com/ruan-cat/drill-docx 仓库到根目录下的 drill-docx 文件夹内。
5. 输出全部 `*.docx` `*.doc` `*.txt` 格式的文件名名称，按照文件夹目录结构输出。
6. 运行 `scripts/docx2md/change.sh` 文件，完成文件格式转换。

你编写的 github workflow 工作流文件，主要工作是搭建环境、准备文件，而不是完成格式转换。

## 每一个 steps 都必须带有 name

你执行的每一个 github workflow 的步骤时，都应该带有 name 字段，以便于我最终阅读。

并且 name 字段要写成中文，便于我阅读。

## 检出仓库时的固定的写法

检出仓库时，你只能使用以下的写法：

```yaml
- name: 检出分支
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
```
