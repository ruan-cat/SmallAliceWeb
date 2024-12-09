import { type Config } from "@ruan-cat/vercel-deploy-tool/src/config.ts";
import { domains } from "@ruan-cat/domains";

const config: Config = {
	vercelProjetName: "small-alice-web-odse",
	vercelOrgId: "team_cUeGw4TtOCLp0bbuH8kA7BYH",
	vercelProjectId: "prj_vdrAvRthiSjkhotfPTXFSV5e1KQW",
	vercelToken: "",

	deployTargets: [
		{
			type: "userCommands",
			outputDirectory: "docs/.vuepress/dist",
			targetCWD: "./",
			url: domains["drill-doc"] as unknown as string[],
			userCommands: ["pnpm -C=./ docs:build"],
		},
	],
};

export default config;
