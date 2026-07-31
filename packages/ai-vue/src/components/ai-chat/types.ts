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
	mode?: "mock" | "external";
	placeholder?: string;
	mockDelay?: number;
}

export type AiChatEmits = {
	(event: "send", message: AiChatMessage): void;
	(event: "stop"): void;
};
