import { resolve } from "node:path";

export function getAiVueAliases() {
	return {
		"@ruan-cat-drill-doc/ai-vue/styles": resolve(__dirname, "../ai-vue/src/styles/index.scss"),
		"@ruan-cat-drill-doc/ai-vue": resolve(__dirname, "../ai-vue/src/index.ts"),
	};
}
