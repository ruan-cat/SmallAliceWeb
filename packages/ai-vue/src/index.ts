import type { App } from "vue";
import {
	AiChat,
	AiChatFloatingButton,
	AiModalChat,
	AiSidebarChat,
	SearchResultCard,
	SourceListCard,
} from "./components";
import { mountAiChat as mountAiChatGeneric } from "./mount";
import type { MountAiChatResult } from "./mount";
import type { AiChatProps, ChatEventHandler } from "./components/ai-chat/types";
import "markstream-vue/index.css";
import "./styles/index.scss";

/**
 * 主入口快捷封装：固定挂载 AiChat 组件，options 直接接收 AiChatProps。
 * 等价于 mount.ts 子入口的 mountAiChat(target, { component: AiChat, componentProps: options })。
 */
function mountAiChat(
	target: string | HTMLElement,
	options: AiChatProps & { onChatEvent?: ChatEventHandler },
): MountAiChatResult {
	const { onChatEvent, ...componentProps } = options;
	return mountAiChatGeneric(target, {
		component: AiChat,
		componentProps,
		onChatEvent,
	});
}

export { AiChat, AiChatFloatingButton, AiModalChat, AiSidebarChat, SearchResultCard, SourceListCard };
export { mountAiChat };
export type { MountAiChatOptions, MountAiChatResult } from "./mount";
export type {
	AiChatEmits,
	AiChatMessage,
	AiChatProps,
	AiChatRole,
	AiChatSource,
	BuiltinItemType,
	ChatEvent,
	ChatEventHandler,
	CustomComponentDirective,
	FeedbackOptions,
	FeedbackPayload,
	FeedbackType,
	MessageAction,
	SearchResultData,
} from "./components";
export type { BrandThemeConfig } from "./theme/types";
export { useMockAiChat } from "./composables/useMockAiChat";
export type { UseMockAiChatOptions } from "./composables/useMockAiChat";
export { useThemeColor } from "./composables/useThemeColor";
export type { ThemeColorState } from "./composables/useThemeColor";

function install(app: App) {
	app.component("AiChat", AiChat);
	app.component("AiChatFloatingButton", AiChatFloatingButton);
	app.component("AiSidebarChat", AiSidebarChat);
	app.component("AiModalChat", AiModalChat);
}

export { install };

export default { install };
