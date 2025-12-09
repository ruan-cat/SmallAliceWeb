## ADDED Requirements
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

