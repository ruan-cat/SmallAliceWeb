import type { ChangelogConfig } from "changelogen";
import { changelogogenUseTypes } from "@ruan-cat/commitlint-config";

const relizyCompatibleTypes = changelogogenUseTypes as NonNullable<
	Parameters<typeof import("relizy").defineConfig>[0]["types"]
>;

/**
 * @see https://github.com/unjs/changelogen
 */
export default {
	output: "CHANGELOG.md",

	/** @see https://github.com/viapip/ozon-tracker/blob/master/changelogen.config.json */
	types: relizyCompatibleTypes,

	templates: {
		commitMessage: "📢 publish: release {{newVersion}}",
	},
} satisfies Partial<ChangelogConfig>;
