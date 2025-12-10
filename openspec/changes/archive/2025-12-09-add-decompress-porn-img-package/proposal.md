# Change: 定义解压图片压缩包工具规范

## Why

- 将 `.github/prompts/decompress-porn-img-package.md` 中的操作规范化，方便实现与验证。

## What Changes

- 规定 CLI 参数与配置项（含默认值与脏文件列表）。
- 定义数值命名压缩包的发现、分卷解压、清理、移动、重命名流程。
- 记录实现约束：TypeScript + tsdown 构建、vitest 测试、c12 读取配置、consola 输出、单包串行处理、入口 `src/index.ts`、私包不发布。

## Impact

- 影响的规范：`decompress-porn-img-package`
- 影响的代码：`scripts/decompress-porn-img-package`
