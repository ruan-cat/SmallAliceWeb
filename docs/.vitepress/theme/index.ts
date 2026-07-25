import aiChatVitePressPlugin, { AiChatVitePressShell } from "@ruan-cat-drill-doc/ai-vitepress-plugins/client";
import "@ruan-cat-drill-doc/ai-vitepress-plugins/client/style.css";
import { defineRuancatPresetTheme } from "@ruan-cat/vitepress-preset-config/theme";
import type { Theme } from "vitepress";
import { h } from "vue";

// 增加用户自定义样式
import "./style.css";

const baseTheme = defineRuancatPresetTheme();
const BaseLayout = baseTheme.Layout ?? baseTheme.extends?.Layout;

export default {
	...baseTheme,
	Layout() {
		return h(BaseLayout, null, {
			"layout-bottom": () => h(AiChatVitePressShell),
		});
	},
	enhanceApp(context) {
		baseTheme.enhanceApp?.(context);
		context.app.use(aiChatVitePressPlugin);
	},
} satisfies Theme;
