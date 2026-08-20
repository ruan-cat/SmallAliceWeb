# R02 Nitro standalone output 仍缺真正的隔离运行验证

- **优先级**：P0
- **状态**：OPEN
- **类型**：部署产物完整性 / CI 假绿色风险

## 风险说明

当前 CI 会在 `packages/ai-vue-doc` 目录中直接启动：

```sh
node .output/server/index.mjs
```

然后请求 `http://127.0.0.1:3010/`。

这比“只看 build complete”强很多，并且已经成功抓到过 `@popperjs/core` 缺失。但它仍然位于 monorepo 原始工作目录中。Node 的包解析可能沿父级目录寻找 `node_modules`；如果 `.output` 内仍有某个遗漏依赖，而该依赖恰好存在于 package 或 workspace 的父级安装树中，当前 smoke 有可能被仓库环境意外“救活”。

因此当前绿色证明的是：**产物在完整 checkout + workspace node_modules 存在时可以运行**，还没有严格证明“`.output` 自身就是独立、可搬运的 standalone artifact”。

## 已知证据

- 原候选的 runtime smoke 曾稳定返回 500，并通过 artifact 定位到 `.output/server/node_modules/element-plus` 导入 `@popperjs/core` 时 `ERR_MODULE_NOT_FOUND`。
- 显式补齐 npm alias dependency 后，当前 smoke 已绿色。
- 事故记忆已经明确建议：后续把 `.output` 复制到完全脱离 monorepo 的临时目录后再启动。

## 可能后果

1. CI 通过，但部署到真正隔离环境后出现 `MODULE_NOT_FOUND`。
2. 某个依赖从 workspace 根被错误解析，掩盖 Nitro trace/copy 缺陷。
3. Vercel 当前恰好能运行，但迁移到其他 Node hosting / container 时失败。
4. 后续删除 workspace 某个“无关”依赖时，standalone runtime 突然暴露缺包。

## 建议加固任务

1. build 完成后把 `.output` 复制到 `/tmp` 或 runner 的独立临时目录。
2. 确保临时目录不位于仓库目录树下，并且其父级不存在项目 `node_modules`。
3. 检查 `.output` 内 symlink，确认不会通过绝对或相对链接回指 monorepo 的 `node_modules` / pnpm virtual store。
4. 从临时目录启动 `.output/server/index.mjs`。
5. 对 `/` 以及 R03 选定的核心路由执行 HTTP smoke。
6. 建议把“仓库内 smoke”和“isolated smoke”短期并存一次，确认行为一致后再决定是否只保留更强的 isolated 版本。

## 验收标准

- [ ] `.output` 被复制到仓库外的 fresh temp directory。
- [ ] 运行时父目录不存在项目 node_modules。
- [ ] 不存在逃逸到 monorepo 的 symlink。
- [ ] isolated server 能启动。
- [ ] `/` 返回 2xx/3xx。
- [ ] 核心 Content/search/组件路由也通过。
- [ ] 删除部署包显式 runtime dependency 时，测试能够重新捕获已知 alias 缺失反例，证明测试真的有检测能力。

## 不要做什么

- 不要仅通过 `test -f .output/server/index.mjs` 就声明产物完整。
- 不要只验证 server process 没有退出；必须发送真实 HTTP 请求。
- 不要把 `NODE_PATH` 指向 workspace 作为“修复”，这会重新污染隔离边界。