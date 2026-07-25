export type AiChatRole = "user" | "assistant";

export interface AiChatMessage {
	id: string;
	role: AiChatRole;
	content: string;
}

export interface AiChatProps {
	initialMessages?: AiChatMessage[];
	placeholder?: string;
	mockDelay?: number;
}

export type AiChatEmits = (event: "send", message: AiChatMessage) => void;
