import { execSync } from "node:child_process";
import { defineConfig } from "bumpp";

/**
 * @see https://github.com/antfu-collective/bumpp
 */
export default defineConfig({
	commit: "📢 publish(root): release v%s",
	tag: "v%s",
	execute: (operation) => {
		execSync(`pnpm exec changelogen --output CHANGELOG.md -r ${operation.state.newVersion}`, {
			cwd: operation.options.cwd,
			stdio: "inherit",
		});
	},
	all: true,
});
