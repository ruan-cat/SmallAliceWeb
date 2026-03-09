import { defineConfig } from "@ruan-cat/vercel-deploy-tool";
import { getDomains } from "@ruan-cat/domains";

export default defineConfig({
	vercelProjectName: "small-alice-web-odse",
	vercelOrgId: "team_cUeGw4TtOCLp0bbuH8kA7BYH",
	vercelProjectId: "prj_vdrAvRthiSjkhotfPTXFSV5e1KQW",
	vercelToken: process.env.VERCEL_TOKEN || "",

	deployTargets: [
		{
			type: "userCommands",
			outputDirectory: "docs/.vuepress/dist",
			targetCWD: "./",
			url: getDomains("drill-doc"),
			userCommands: ["pnpm -C=./ docs:build"],
		},
	],
});
