import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const shadcnDocsRoot = resolve(require.resolve("shadcn-docs-nuxt/package.json"), "..");

export function getAiVueAliases() {
	return {
		"@ruan-cat-drill-doc/ai-vue/styles": resolve(__dirname, "../ai-vue/src/styles/index.scss"),
		"@ruan-cat-drill-doc/ai-vue": resolve(__dirname, "../ai-vue/src/index.ts"),
		"@/lib/utils": resolve(shadcnDocsRoot, "lib/utils.ts"),
		"@/lib/themes": resolve(shadcnDocsRoot, "lib/themes.ts"),
		"@/components/ui/toast/use-toast": resolve(shadcnDocsRoot, "components/ui/toast/use-toast.ts"),
		"@/components/ui/navigation-menu": resolve(shadcnDocsRoot, "components/ui/navigation-menu/index.ts"),
		"reka-ui": resolve(shadcnDocsRoot, "../reka-ui"),
	};
}
