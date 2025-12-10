# decompress-porn-img-package Specification

## Purpose

TBD - created by archiving change add-decompress-porn-img-package. Update Purpose after archive.

## Requirements

### Requirement: CLI 需要有效绝对路径参数

系统 SHALL 要求用户传入 Windows 绝对路径目录；缺少或非法路径时退出并提示需要提供地址。

#### Scenario: 缺少路径参数

- **WHEN** 用户未提供绝对路径执行 `@ruan-cat/decompress-porn-img-package`
- **THEN** 工具 SHALL 退出并提示必须提供绝对路径

#### Scenario: 提供有效绝对路径

- **WHEN** 用户传入形如 `C:\Users\pc\Desktop\test` 或 `D:\store\baidu\048.蠢沫沫` 的路径
- **THEN** 工具 SHALL 从该目录开始处理压缩包

### Requirement: 配置项与默认值

系统 SHALL 通过 `decompress-porn-img-package.config.ts`（c12 读取，核心命名 `decompress-porn-img-package`）加载配置，并提供以下默认值：

- `password` 默认为字符串 `https://www.91xiezhen.top`
- `dirtyFiles` 默认为包含 `孔雀海` Internet 快捷方式的文件名数组
- `isPureDecompress` 默认为 true
- `isDecompressMixedNamedPackages` 默认为 false
- `isDeletePackages` 默认为 false
- `isMoveFilesToRoot` 默认为 true
- `isRenameRootFolder` 默认为 true

#### Scenario: 使用默认配置

- **WHEN** 配置文件缺省某项
- **THEN** 系统 SHALL 使用上述默认值驱动后续处理

### Requirement: 仅处理单个压缩包实例

系统 SHALL 一次只处理一个压缩包，完成当前包的全部步骤后才继续下一个，禁止并发处理。

#### Scenario: 多包串行

- **WHEN** 目录存在多个符合条件的压缩包
- **THEN** 工具 SHALL 串行逐个完成解压与整理后再处理下一个

### Requirement: 数值命名压缩包识别

系统 SHALL 只对纯数值命名压缩包（如 `031.gz`, `125.zip`）作为默认处理目标；对于混合命名压缩包，仅当 `isDecompressMixedNamedPackages` 为 true 时才解压。

#### Scenario: 纯数值命名

- **WHEN** 发现文件名为纯数字的压缩包
- **THEN** 工具 SHALL 标记为待处理包

#### Scenario: 混合命名受控解压

- **WHEN** 发现包含非数字字符的压缩包
- **THEN** 工具 SHALL 仅在 `isDecompressMixedNamedPackages` 为 true 时解压，否则跳过

### Requirement: 初次解压与脏文件清理

系统 SHALL 将目标压缩包解压到同级独立文件夹（名称为压缩包去扩展名后的值，如 `031`），解压使用 `password`；根据 `isDeletePackages` 决定是否删除源压缩包，并在该层删除 `dirtyFiles` 中列出的脏文件。

#### Scenario: 解压单包到独立文件夹

- **WHEN** 解压 `031.gz`
- **THEN** 工具 SHALL 创建 `031` 文件夹，内容与压缩包同级，并按需要删除源包与脏文件

### Requirement: 分卷压缩处理

系统 SHALL 在下一层目录中识别同名分卷（如 `.7z.001`, `.7z.002`），使用 `password` 解压至当前目录；任何非分卷文件 SHALL 被删除。解压后按 `isDeletePackages` 判定是否删除分卷包，并记录分卷基名（如 `蠢沫沫 - NO.031 惠礼服[40P-436.8M]`）用于后续重命名，同时执行 `dirtyFiles` 清理。

#### Scenario: 分卷解压并清理

- **WHEN** 进入 `031/蠢沫沫 - NO.031 惠礼服[40P-436.8M]` 发现 `.7z.001/.7z.002`
- **THEN** 工具 SHALL 仅解压分卷，删除其他文件，按配置删除分卷包，记录分卷基名，并清理脏文件

### Requirement: 最深层脏文件删除

系统 SHALL 在最深目录层级继续删除 `dirtyFiles` 中列出的脏文件（例如名为 `孔雀海` 的 Internet 快捷方式）。

#### Scenario: 删除最深层快捷方式

- **WHEN** 在最深层目录发现 `孔雀海` 等脏文件
- **THEN** 工具 SHALL 将其删除

### Requirement: 文件上移与根目录重命名

系统 SHALL 在完成分卷解压后，将最底层目录的文件移动到初次解压的根文件夹（如 `031`）；当 `isMoveFilesToRoot` 为 true 时必须移动，移动后删除多余空目录。当 `isRenameRootFolder` 为 true 时，根文件夹 SHALL 重命名为记录的分卷基名（如 `蠢沫沫 - NO.031 惠礼服[40P-436.8M]`）。

#### Scenario: 归并文件并重命名根目录

- **WHEN** 最底层文件已解压完成
- **THEN** 工具 SHALL 将文件上移到根层，移除多余目录，并在需要时将根目录重命名为分卷基名

### Requirement: 继续处理剩余压缩包

系统 SHALL 在完成当前包的完整流程后继续处理同一目录下的下一枚待处理压缩包，直到全部处理完毕。

#### Scenario: 多个压缩包循环

- **WHEN** 目录中存在多枚符合规则的压缩包
- **THEN** 工具 SHALL 重复上述解压、清理、移动、重命名流程直至耗尽

### Requirement: 技术栈与交付约束

系统 SHALL 使用 TypeScript 开发，采用 tsdown 构建，vitest 编写单元测试，c12 读取配置，consola 输出日志；入口文件为 `src/index.ts`；包名 `@ruan-cat/decompress-porn-img-package` 为私包，根项目需安装私包且不得发布到公共 npm。

#### Scenario: 技术与交付守护

- **WHEN** 构建与发布流程执行
- **THEN** 系统 SHALL 依赖 TypeScript + tsdown、使用 vitest 测试、c12 配置、consola 日志，入口 `src/index.ts`，并保持包为私有且在根包安装

### Requirement: 安装后自动构建 CLI 产物

系统 SHALL 在安装 `@ruan-cat/decompress-porn-img-package` 时执行 postinstall 构建，生成 CLI 可执行产物，确保安装完成即可直接运行。

#### Scenario: 安装即构建

- **WHEN** 用户执行包安装
- **THEN** postinstall SHALL 触发构建，准备好 CLI 脚本（dist/ 及 bin 链接可用）

### Requirement: defineConfig 帮助函数

系统 SHALL 导出 `defineConfig` 帮助函数，返回传入的配置对象以支持类型推断。

#### Scenario: 导入并包装配置

- **WHEN** 用户 `import { defineConfig } from "@ruan-cat/decompress-porn-img-package"`
- **THEN** 调用 `defineConfig(config)` SHALL 原样返回配置对象，供 c12 读取

### Requirement: 配置文件使用 defineConfig

系统 SHALL 要求 `decompress-porn-img-package.config.ts` 以 `defineConfig({...})` 形式导出默认配置，字段保持既有默认值与含义。

#### Scenario: 默认配置封装

- **WHEN** 默认配置文件存在
- **THEN** 其默认导出 SHALL 为 `defineConfig({ password, dirtyFiles, isPureDecompress, isDecompressMixedNamedPackages, isDeletePackages, isMoveFilesToRoot, isRenameRootFolder })`
