# Change: 增强解压工具安装与配置体验

## Why
- 新增文档要求：安装后自动构建 CLI，配置文件需使用 `defineConfig`。

## What Changes
- 为 `@ruan-cat/decompress-porn-img-package` 增加 postinstall 构建，安装即准备好 CLI 脚本。
- 提供 `defineConfig` 导出，用于声明配置。
- 要求 `decompress-porn-img-package.config.ts` 以 `defineConfig` 形式导出配置。

## Impact
- 影响的规范：`decompress-porn-img-package`
- 影响的代码：`scripts/decompress-porn-img-package`（postinstall、导出 helper）、根配置文件

