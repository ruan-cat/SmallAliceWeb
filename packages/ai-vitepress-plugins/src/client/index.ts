import ElementPlus from "element-plus";
import type { App, Plugin } from "vue";

import AiChatVitePressShell from "./components/AiChatVitePressShell.vue";
import "element-plus/dist/index.css";
import "@ruan-cat-drill-doc/ai-vue/styles";
import "./style.css";
import type { AiChatVitePressPluginOptions } from "./types";

export { AiChatVitePressShell };
export type { AiChatVitePressPluginOptions };

/** Install the AI chat VitePress client shell when it is enabled. */
export function install(app: App, options: AiChatVitePressPluginOptions = {}): void {
	if (options.enabled === false) {
		return;
	}

	app.use(ElementPlus);
	app.component("AiChatVitePressShell", AiChatVitePressShell);
}

const aiChatVitePressPlugin: Plugin = { install };

export default aiChatVitePressPlugin;
