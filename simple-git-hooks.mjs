/**
 * @filename: simple-git-hooks.mjs
 * @description 配置 simple-git-hooks 的 git 钩子。
 *
 * 每次修改该文件后 务必执行一次 `npx simple-git-hooks` 命令
 * 否则这些钩子不会生效
 */
export default {
	/**
	 * @see https://juejin.cn/post/7381372081915166739#heading-8
	 * @see https://fabric.modyqyw.top/zh-Hans/guide/git/commitlint.html#%E6%95%B4%E5%90%88-simple-git-hooks
	 */
	"commit-msg": "npx --no-install commitlint --edit ${1}",
	"pre-commit": "npx lint-staged",

	/**
	 * post-commit：提交完成后将本次提交涉及的文件从 index（LF）写回工作区，
	 * 修复 Windows 上 AI 编辑器（Cursor / Claude Code 等）使用 CRLF 写文件后
	 * 残留在工作区的"幽灵 git modified"。
	 */
	"post-commit":
		"git diff HEAD~1..HEAD --diff-filter=ACMR --name-only -z 2>/dev/null | xargs -0 git restore --worktree -- 2>/dev/null || true",
};
