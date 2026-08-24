import fs from "node:fs";
import { provider } from "std-env";
import { setUserConfig, setGenerateSidebar, addChangelog2doc } from "@ruan-cat/vitepress-preset-config/config";
import { installVitePressHeadingAnchors } from "@ruan-cat-drill-doc/ai-rag-core";

// 为文档添加自动生成的changelog
addChangelog2doc({
	// 设置changelog的目标文件夹
	target: "./docs",
	// 设置changelog顶部的yaml数据。通常是排序
	data: {
		order: 1000,
		dir: {
			order: 1000,
		},
	},
});

/**
 * 判断是否应在当前环境中禁用 git-changelog 插件。
 *
 * Vercel CLI 直接上传部署（非 Git 集成克隆）时，构建目录没有 .git 目录，
 * 会导致 @nolebase/vitepress-plugin-git-changelog 在 buildStart 阶段执行
 * git config --local core.quotepath false 时失败（exit code 128）。
 *
 * 仅在 Vercel 环境且构建目录无 .git 时禁用，其余环境保留插件以维持 changelog 功能。
 */
function shouldDisableGitChangelog(): boolean {
	if (provider !== "vercel") {
		return false;
	}
	return !fs.existsSync(".git");
}

const userConfig = setUserConfig(
	{
		title: "小爱丽丝官网",
		description: "天才小爱丽丝，冲鸭！",
		lang: "zh",

		head: [["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }]],

		themeConfig: {
			socialLinks: [
				{
					icon: "github",
					link: "https://github.com/ruan-cat",
				},
			],

			nav: [
				{
					text: "关于本站",
					link: "/about/",
				},
				{
					text: "仓库地址",
					link: "https://github.com/ruan-cat/SmallAliceWeb",
				},
			],
		},

		// 钻头项目有很多emf矢量图 需要添加到vite的assetsInclude中
		vite: {
			assetsInclude: ["**/*.emf"],
		},

		markdown: {
			config(markdown) {
				installVitePressHeadingAnchors(markdown);
			},
		},
	},
	{
		plugins: {
			gitChangelog: shouldDisableGitChangelog()
				? false
				: {
						repoURL: () => "https://github.com/ruan-cat/SmallAliceWeb",
						maxGitLogCount: 10,
						include: ["**/*.md", "!node_modules", "!drill-docx/**"],
					},
		},
	},
);

// 侧边栏配置必须单独赋值
// @ts-ignore
userConfig.themeConfig.sidebar = setGenerateSidebar({
	documentRootPath: "./docs",
	collapsed: true,
	/** 文档未维护 frontmatter `order`，关闭预设默认的 YAML 排序。 */
	sortMenusByFrontmatterOrder: false,
	/** 按标题中的数字自然排序，避免字典序将 `2` 排在 `19`、`20` 后。 */
	sortMenusOrderNumericallyFromTitle: true,
});

export default userConfig;
