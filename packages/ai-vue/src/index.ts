import type { App } from "vue";
import { AiChat, AiChatFloatingButton, SearchResultCard, SourceListCard } from "./components";
import "markstream-vue/index.css";
import "./styles/index.scss";

export { AiChat, AiChatFloatingButton, SearchResultCard, SourceListCard };
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
}

export { install };

export default { install };
