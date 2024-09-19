import { type Config } from "@ruan-cat/vercel-deploy-tool/src/config.ts";

const config: Config = {
	vercelProjetName: "small-alice-web-odse",
	vercelOrgId: "team_cUeGw4TtOCLp0bbuH8kA7BYH",
	vercelProjectId: "prj_vdrAvRthiSjkhotfPTXFSV5e1KQW",
	vercelToken: "",

	deployTargets: [
		{
			type: "userCommands",
			outputDirectory: "docs/.vuepress/dist/**/*",
			targetCWD: "./",
			url: [
				"small-alice-web-dev.ruancat6312.top",
				"small-alice-web.ruan-cat.com",
			],
			userCommands: [
				// "pnpm -C='./' vuepress-vite build docs"
				"pnpm -C=./ vuepress-vite build docs",
			],
		},
	],
};

export default config;
