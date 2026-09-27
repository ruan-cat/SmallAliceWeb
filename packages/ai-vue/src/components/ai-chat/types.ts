import type { BrandThemeConfig } from "../../theme/types";

export type AiChatRole = "user" | "assistant";

export interface AiChatMessage {
	id: string;
	role: AiChatRole;
	content: string;
	sources?: AiChatSource[];
}

/** 可展示、可跳转的 RAG 检索来源。 */
export interface AiChatSource {
	id: string;
	label: string;
	sourceHref: string;
	snippet?: string;
}

export interface AiChatProps {
	initialMessages?: AiChatMessage[];
	messages?: AiChatMessage[];
	isResponding?: boolean;
	errorMessage?: string;
	mode?: "mock" | "external";
	placeholder?: string;
	mockDelay?: number;
	/** 品牌主题配置：驱动 --ai-chat-* CSS 变量派生与 vepx 品牌色覆盖；缺省时使用默认品牌色 #3b82f6。普通对象配置在挂载时按快照语义取值。 */
	brandTheme?: BrandThemeConfig;
}

export type AiChatEmits = {
	(event: "send", message: AiChatMessage): void;
	(event: "stop"): void;
	(event: "clear-error"): void;
};
