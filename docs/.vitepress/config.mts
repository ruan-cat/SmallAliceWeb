import { setUserConfig, setGenerateSidebar, addChangelog2doc } from "@ruan-cat/vitepress-preset-config/config";

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

const userConfig = setUserConfig({
	title: "阮喵喵的01星球笔记",
	description: "阮喵喵在01星球内的一些公用文档",
	lang: "zh",

	themeConfig: {
		outline: {
			label: "本页目录",
			level: "deep",
		},

		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/ruan-cat",
			},
		],

		nav: [
			{ text: "首页", link: "/" },
			{
				text: "仓库地址",
				link: "https://github.com/ruan-cat/vercel-monorepo-test/blob/dev/tests/monorepo-1/docs/index.md",
			},
		],
	},
});

// 侧边栏配置必须单独赋值
// @ts-ignore
userConfig.themeConfig.sidebar = setGenerateSidebar({
	documentRootPath: "./docs",
	collapsed: true,
});

export default userConfig;
