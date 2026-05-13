import { defineConfig } from "changelogithub";

import changelogConfig from "./changelog.config";

type ChangelogithubConfig = Parameters<typeof defineConfig>[0];
type ChangelogithubTypes = ChangelogithubConfig["types"];

const changelogithubTypes = (
	changelogConfig.types
		? Object.fromEntries(
				Object.entries(changelogConfig.types).filter(([, value]) => typeof value === "object" && value !== null),
			)
		: undefined
) as ChangelogithubTypes;

/**
 * @see https://github.com/antfu/changelogithub
 */
export default defineConfig({
	...changelogConfig,
	types: changelogithubTypes,
	output: false,
	capitalize: false,
});
