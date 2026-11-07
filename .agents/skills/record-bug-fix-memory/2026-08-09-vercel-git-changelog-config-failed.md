# 2026-08-09 Vercel 上传部署触发 git-changelog git config --local 失败

## 1. 问题现象

Vercel production 部署 `small-alice-web-odse` 项目时，`@nolebase/vitepress-plugin-git-changelog` 插件执行 `git config --local core.quotepath false` 命令失败，exit code 128，构建中断。

失败日志关键行：

```log
//:docs:build:run: [@nolebase/vitepress-plugin-git-changelog] Command failed with exit code 128: git config --local core.quotepath false
```

部署地址：https://vercel.com/ruancat-projects/small-alice-web-odse/F1oDwcRXtacbsyKmbjW2NgNqb4ZA

## 2. 实际根因

Vercel 有两种部署方式，决定了构建目录 `/vercel/path0/` 是否存在 `.git` 目录：

| 部署方式        | 触发条件                  | 构建目录 .git | git-changelog 结果 |
| :-------------- | :------------------------ | :-----------: | :----------------: |
| Git 集成克隆    | push 到 GitHub 触发       |     存在      |        成功        |
| Vercel CLI 上传 | 本地 `vercel deploy` 触发 |  **不存在**   |      **失败**      |

失败部署的日志头部为 `Downloading 637 deployment files...`，成功部署为 `Cloning github.com/ruan-cat/SmallAliceWeb`。

`@nolebase/vitepress-plugin-git-changelog` 在 `buildStart` 钩子（`dist/vite/index.mjs:334`）中**无条件**执行 `git config --local core.quotepath false`，不读取任何插件选项。当构建目录无 `.git` 时，该命令返回 `fatal: --local can only be used inside a git repository`（exit 128）。

部署 meta 中的 `gitDirty: "1"` 和 `gitRootDirectory: ""` 是 Vercel CLI 上传部署的特征字段。

## 3. 关键误导点

用户初始假设 `scripts/build-doc-in-vercel/index.ts` 克隆 `drill-docx` 仓库产生的 `drill-docx/.git` 嵌套目录是根因。代码级 RCA 推翻该假设：

- 报错命令在 `process.cwd()`（即 `/vercel/path0/`）执行，完全不读取 `cwd` / `include` 选项
- exit 128 的含义是"当前目录不是 git 仓库"，不是"扫描到了错误的 git 仓库"
- `drill-docx/.git` 只可能影响 `index.mjs:88` 的 `git log`（`cwd: fileDir`），不影响 `index.mjs:334` 的 `git config --local`

同款 issue：`vbenjs/vue-vben-admin#4730`（Docker 构建无 `.git` 触发同款错误）。

## 4. 有效修复

修改 `docs/.vitepress/config.mts`，通过 `@ruan-cat/vitepress-preset-config` 的 `setUserConfig(config, extraConfig)` 第二参数配置 git-changelog 插件：

1. 新增 `shouldDisableGitChangelog()` 函数：当 `provider === "vercel"` 且 `!fs.existsSync(".git")` 时返回 true
2. `shouldDisableGitChangelog()` 为 true 时设置 `gitChangelog: false`，禁用插件
3. 正常环境下保留插件，并添加 `include: ["**/*.md", "!node_modules", "!drill-docx/**"]` 排除 drill-docx 目录（防御性措施）

关键代码：

```typescript
function shouldDisableGitChangelog(): boolean {
	if (provider !== "vercel") return false;
	return !fs.existsSync(".git");
}

setUserConfig(config, {
	plugins: {
		gitChangelog: shouldDisableGitChangelog()
			? false
			: {
					repoURL: () => "https://github.com/ruan-cat/SmallAliceWeb",
					maxGitLogCount: 10,
					include: ["**/*.md", "!node_modules", "!drill-docx/**"],
				},
	},
});
```

## 5. 验证方式

- 静态验证：`npx tsc --noEmit docs/.vitepress/config.mts` 文件本身零报错
- 逻辑验证：`std-env` 的 `provider` 字段在 Vercel 环境下为 `"vercel"`，本地为空字符串
- 部署 meta 验证：失败部署 meta 有 `gitRootDirectory: ""`，成功部署无此字段
- 历史部署统计：20 次部署中 17 次 Git 克隆方式成功、3 次 CLI 上传方式失败，修改后 CLI 上传方式将跳过插件不再失败
- 预期线上验证：下次 `vercel deploy`（CLI 上传方式）应成功，git-changelog 功能在 Git 集成克隆部署中保留

## 6. 后续约束

1. 修改 `docs/.vitepress/config.mts` 时，`setUserConfig` 的 `gitChangelog` 配置必须保留 `shouldDisableGitChangelog()` 检测逻辑，不可移除
2. `@ruan-cat/vitepress-preset-config` 的 `getPlugins` 是"整体替换"语义，传 `gitChangelog` 对象时必须包含完整字段（`repoURL` + `maxGitLogCount`），否则丢失默认值
3. Vercel production 部署优先使用 Git 集成方式（push 到 GitHub），避免 CLI 上传方式丢失 `.git` 目录
4. 若 `@nolebase/vitepress-plugin-git-changelog` 未来版本修复了 `buildStart` 无条件执行 `git config` 的问题，可移除 `shouldDisableGitChangelog()` 检测
5. `scripts/build-doc-in-vercel/index.ts` 克隆 `drill-docx` 产生的 `drill-docx/.git` 不是本 bug 的直接根因，但已通过 `include` 选项排除，避免干扰 `git log` 扫描
