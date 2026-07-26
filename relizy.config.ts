import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePnpmWorkspaceYaml } from "pnpm-workspace-yaml";
import { defineConfig } from "relizy";
import changelogConfig from "./changelog.config";

type RelizyConfig = Parameters<typeof defineConfig>[0];
type RelizyTypes = RelizyConfig["types"];

const relizyTypes = changelogConfig.types as RelizyTypes;

function readWorkspacePackageGlobs(): string[] {
	const content = readFileSync(resolve(process.cwd(), "pnpm-workspace.yaml"), "utf8");

	return (parsePnpmWorkspaceYaml(content).toJSON().packages ?? []).filter((p) => !p.startsWith("!"));
}

export default defineConfig({
	projectName: "SmallAliceWeb",

	types: relizyTypes,
	templates: {
		...(changelogConfig.templates ?? {}),
		changelogTitle: "{{newVersion}} ({{date}})",
	},

	monorepo: {
		versionMode: "independent",
		packages: readWorkspacePackageGlobs(),
	},

	changelog: {
		rootChangelog: true,
		includeCommitBody: true,
		formatCmd: "pnpm run format:changelog",
	},
	release: {
		changelog: true,
		commit: true,
		push: true,
		gitTag: true,
		clean: true,
		noVerify: false,
		publish: false,
		providerRelease: false,
		social: false,
		prComment: false,
	},
});
