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
	title: "小爱丽丝官网",
	description: "天才小爱丽丝，冲鸭！",
	lang: "zh",

	themeConfig: {
		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/ruan-cat",
			},
		],

		nav: [
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
});

// 侧边栏配置必须单独赋值
// @ts-ignore
userConfig.themeConfig.sidebar = setGenerateSidebar({
	documentRootPath: "./docs",
	collapsed: true,
});

export default userConfig;
