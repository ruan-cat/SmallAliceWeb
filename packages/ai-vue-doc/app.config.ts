const repositoryUrl = "https://github.com/ruan-cat/SmallAliceWeb";
const repositoryIssuesUrl = `${repositoryUrl}/issues`;

export default defineAppConfig({
	shadcnDocs: {
		site: {
			name: "AI Vue",
			description: "Vue 3 mock AI 对话组件文档。第一期仅提供本地 mock 对话交互，不连接真实 AI 服务。",
		},
		theme: {
			customizable: true,
			color: "blue",
			radius: 0.5,
		},
		header: {
			title: "AI Vue",
			showTitle: true,
			darkModeToggle: true,
			nav: [
				{
					title: "快速开始",
					to: "/getting-started",
				},
				{
					title: "组件",
					to: "/components",
				},
			],
			links: [
				{
					icon: "lucide:github",
					to: repositoryUrl,
					target: "_blank",
				},
			],
		},
		aside: {
			useLevel: true,
			collapse: false,
			levelStyle: "aside",
			collapseLevel: 1,
			folderStyle: "default",
		},
		main: {
			breadCrumb: true,
			showTitle: true,
		},
		footer: {
			credits: "AI Vue 文档站，聚焦本地 mock AI 对话组件的接入与演示。",
			links: [
				{
					icon: "lucide:github",
					to: repositoryUrl,
					target: "_blank",
				},
			],
		},
		toc: {
			enable: true,
			title: "本页目录",
			links: [
				{
					title: "GitHub",
					icon: "lucide:star",
					to: repositoryUrl,
					target: "_blank",
				},
				{
					title: "提交 Issue",
					icon: "lucide:circle-dot",
					to: repositoryIssuesUrl,
					target: "_blank",
				},
			],
		},
		search: {
			enable: true,
			inAside: false,
		},
	},
});
