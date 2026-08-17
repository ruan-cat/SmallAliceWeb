import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const shadcnDocsRoot = resolve(require.resolve("shadcn-docs-nuxt/package.json"), "..");

export function getAiVueAliases() {
	return {
		"@/lib/utils": resolve(shadcnDocsRoot, "lib/utils.ts"),
		"@/lib/themes": resolve(shadcnDocsRoot, "lib/themes.ts"),
		"@/components/ui/toast/use-toast": resolve(shadcnDocsRoot, "components/ui/toast/use-toast.ts"),
		"@/components/ui/navigation-menu": resolve(shadcnDocsRoot, "components/ui/navigation-menu/index.ts"),
		"reka-ui": resolve(shadcnDocsRoot, "../reka-ui"),
	};
}
