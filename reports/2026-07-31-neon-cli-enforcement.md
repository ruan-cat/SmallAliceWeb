# 2026-07-31 Neon CLI 强制执行记录

## 1. 变更目标

项目的 Neon 云端操作只允许使用官方 `neon` CLI，禁止 `neonctl`、包装器和临时替代命令。该限制同时覆盖本地构建、类型检查和 CI 的可执行入口。

## 2. 执行约束

- `pnpm run neon:guard` 通过根目录 `tsx` 脚本执行：先用 `std-env` 判断平台，仅在 Windows 扫描可执行文件类型并排除依赖目录、构建产物和守卫自身；Linux、macOS 与 Vercel 构建环境快速跳过。
- 根 `build`、`docs:build` 和 `typecheck` 均先运行守卫；CI 在安装依赖后独立运行守卫。
- 云端操作记录只保留时间、认证确认、工作目录、脱敏命令模板、目标资源、退出码和验证结果；不记录连接串、密码或 token。

## 3. 事故经验

Windows 上的 `neonctl@2.30.1` 曾执行 `dist/cli.js --help` 并进入 `cmd -> node` 死循环。该进程无监听端口，5 秒 CPU 增量为 5.66 秒，累计 CPU 为 7891.41 秒；它不是 MCP、RAG 服务或开发服务器。后续禁止直接执行 `neonctl`，包含 `--help`、`--version` 和资源查询。

正确替代路径是：先运行 `pnpm run neon:guard`，由用户确认官方 `neon` CLI 已安装认证，再执行计划中所需的 `neon projects get`、`neon branches list`、`neon databases list` 与 `neon psql`。不得以 `npx` 临时替代命令或包装器绕过此路径。

## 4. 本次验证

2026-07-31 已执行 `pnpm exec tsx --check scripts/guard-neon-cli.ts` 与 `pnpm run neon:guard`，结果为通过且未在可执行项目入口中发现 `neonctl`。已执行 `git diff --check`，结果为通过。

## 5. 异常处理

官方 `neon` 命令异常时，先采集 PID、父进程、CPU 二次采样和监听端口。仅在一次性命令高 CPU 自旋、无监听端口且进程归属可复核时停止异常 Node 子进程；不按 `node.exe` 名称批量清理。
