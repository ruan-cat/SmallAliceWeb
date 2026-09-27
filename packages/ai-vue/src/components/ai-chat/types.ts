import type { BrandThemeConfig } from "../../theme/types";
import type { Component } from "vue";

export type AiChatRole = "user" | "assistant";

/** 反馈类型：正向 / 负向；用于 AiChatFeedback 组件 */
export type FeedbackType = "positive" | "negative";

/** 富组件渲染指令（P3-1）：将 customComponents prop 注册的组件名 + props 嵌入到消息中 */
export interface CustomComponentDirective {
	/** 渲染器名称，对应 customComponents 的 key */
	name: string;
	/** 传递给渲染器的 props；messageId 由 AiChat 在渲染时注入 */
	props?: Record<string, unknown>;
}

/** 反馈载荷：emit('feedback') 时传出 */
export interface FeedbackPayload {
	type: FeedbackType;
	messageId: string;
	details?: string;
	/** FC-4 接入：会话追溯 ID，可唯一定位一条问答记录供后端 qa_records 关联 */
	conversationId: string;
}

/** 消息操作菜单项 */
export interface MessageAction {
	/** 操作标签 */
	label: string;
	/** 操作处理函数 */
	handler: (message: AiChatMessage) => void;
}

/** P3.5：内置结构化消息类型，配合 customRenderers 使用 */
export type BuiltinItemType = "search-result" | "source-list";

/** P3.5：SearchResultCard 卡片数据结构 */
export interface SearchResultData {
	title: string;
	snippet: string;
	sourceUrl: string;
	sourceLabel: string;
	/** 相关度 0~1 */
	score?: number;
	/** 文档标题层级路径 */
	headingPath?: string[];
}

export interface AiChatMessage {
	id: string;
	role: AiChatRole;
	content: string;
	sources?: AiChatSource[];
	/** P3-1：富组件渲染指令（与 content 互斥；存在时跳过 Markdown 渲染） */
	component?: CustomComponentDirective;
	/** P3.5：结构化消息类型，按 itemType 在 builtinRenderers/customRenderers 中查找渲染器；存在时跳过 Markdown 渲染 */
	itemType?: BuiltinItemType | string;
	/** P3.5：传给 itemType 对应渲染器的结构化数据 */
	data?: Record<string, unknown>;
}

/** 可展示、可跳转的 RAG 检索来源。 */
export interface AiChatSource {
	id: string;
	label: string;
	sourceHref: string;
	snippet?: string;
}

/** 反馈配置 */
export interface FeedbackOptions {
	/** 是否启用反馈按钮 */
	enabled?: boolean;
	/** 提交回调（可选；不传则仅 emit 'feedback' 事件） */
	onSubmit?: (feedback: FeedbackPayload) => void;
}

/** AI 对话事件回调（4.6 事件系统的统一回调载荷） */
export interface ChatEvent {
	/** 事件类型 */
	type:
		| "user_message_submitted"
		| "assistant_answer_displayed"
		| "chat_clear_clicked"
		| "feedback_submitted"
		| "example_question_selected"
		| "message_action_clicked"
		| "response-metadata";
	/** 会话 ID（暂未启用，留作多会话扩展） */
	conversationId?: string;
	/** 触发消息 ID（适用于反馈 / 操作 / 用户消息事件） */
	messageId?: string;
	/** 事件标签，用于埋点归类 */
	tags: string[];
	/** 自定义附加字段 */
	properties?: Record<string, unknown>;
}

/** 事件回调签名 */
export type ChatEventHandler = (event: ChatEvent) => void;

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
	/** 样式隔离模式；container-with-shadow 时把内容渲染到 Shadow Root 内，宿主 CSS 不影响组件。SSR 下强制 no-shadow。 */
	variant?: "no-shadow" | "container-with-shadow";
	/** P3-2：自定义消息渲染器注册表（按 name 映射到 Vue 组件） */
	customComponents?: Record<string, Component>;
	/** P3.5：结构化卡片渲染器注册表（按 itemType 映射到 Vue 组件）；与内置卡片合并，内置卡片可被同名自定义组件覆盖 */
	customRenderers?: Record<string, Component>;
	/** P3-4：示例问题列表（空状态展示） */
	exampleQuestions?: string[];
	/** P3-4：引导消息 */
	introMessage?: string;
	/** P3-5：消息操作菜单配置 */
	messageActions?: MessageAction[];
	/** P3-3：反馈配置 */
	feedbackOptions?: FeedbackOptions;
	/** P3-6：AI 对话事件回调 */
	onChatEvent?: ChatEventHandler;
	/**
	 * MS-4 接入：模型选择器选项（由宿主经 props 下发，ai-vue 不发请求）。
	 * 空数组或缺省时整块选择器不渲染，向后兼容。
	 */
	models?: AiChatModelOption[];
	/**
	 * MS-4 接入：当前选中模型的 id（与 models 某项 id 对应）。
	 * 仅控制 el-segmented 的视觉选中态，实际 provider 切换由宿主通过 select-model 事件接收后回写到下一次请求。
	 */
	selectedModelId?: string;
}

/**
 * MS-4 接入：模型选择器选项（由宿主经 props 下发，ai-vue 不发请求）。
 * 该类型与 ai-vitepress-plugins useKnowledgeChat 的 AiChatModelOption 结构同源——保持单向事实源。
 */
export interface AiChatModelOption {
	id: string;
	label: string;
	model: string;
}

/** AiChat emit 事件扩展 */
export type AiChatEmits = {
	(event: "send", message: AiChatMessage): void;
	(event: "stop"): void;
	(event: "clear-error"): void;
	/** P3-3：反馈提交 */
	(event: "feedback", feedback: FeedbackPayload): void;
	/**
	 * MS-4 接入：用户切换模型；宿主收到后回写 useKnowledgeChat 的 selectedProvider 与 localStorage。
	 * 仅改下一条消息的 provider；responding 中切换不打断当前流（plan 16.8 Q1 拍板）。
	 */
	(event: "select-model", id: string): void;
};
