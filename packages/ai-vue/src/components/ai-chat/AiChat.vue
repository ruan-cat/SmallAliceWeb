<script setup lang="ts">
import { ElSegmented } from "element-plus";
import MarkdownRender from "markstream-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Component } from "vue";
import { Bubble, BubbleList, ConfigProvider, XSender } from "vue-element-plus-x";
import type { ModelValue } from "vue-element-plus-x/types/XSender";
import { useBrandTheme } from "../../composables/useBrandTheme";
import { useChatEvents } from "../../composables/useChatEvents";
import { useMockAiChat } from "../../composables/useMockAiChat";
import { AI_CHAT_SHADOW_STYLES } from "../../styles/shadow-scoped";
import AiShadowRoot from "../ai-shadow-root/AiShadowRoot.vue";
import SearchResultCard from "./cards/SearchResultCard.vue";
import SourceListCard from "./cards/SourceListCard.vue";
import AiChatCustomRenderer from "./parts/AiChatCustomRenderer.vue";
import AiChatExampleQuestions from "./parts/AiChatExampleQuestions.vue";
import AiChatFeedback from "./parts/AiChatFeedback.vue";
import AiChatMessageActions from "./parts/AiChatMessageActions.vue";
import type { AiChatEmits, AiChatMessage, AiChatProps, FeedbackPayload, MessageAction } from "./types";

type AiChatBubbleItem = AiChatMessage & {
	placement: "start" | "end";
};

const props = withDefaults(defineProps<AiChatProps>(), {
	placeholder: "请输入消息",
	mode: "mock",
	variant: "no-shadow",
});
const emit = defineEmits<AiChatEmits>();

const { messages, input, isResponding, sendMessage } = useMockAiChat({
	initialMessages: props.initialMessages,
	mockDelay: props.mockDelay,
});
const displayedMessages = computed(() => props.messages ?? messages.value);
const displayedResponding = computed(() => props.isResponding ?? isResponding.value);
const senderRef = ref<InstanceType<typeof XSender> | null>(null);
const prefersReducedMotion = ref(false);
const smoothStreaming = computed<false | "auto">(() => (prefersReducedMotion.value ? false : "auto"));
const bubbleItems = computed<AiChatBubbleItem[]>(() =>
	displayedMessages.value.map((message) => ({
		...message,
		placement: message.role === "user" ? "end" : "start",
	})),
);
const lastAssistantMessageId = computed(
	() => [...displayedMessages.value].reverse().find((message) => message.role === "assistant")?.id,
);
/** 已反馈过的消息 ID 集合：避免重复反馈 */
const feedbackSubmitted = ref<Set<string>>(new Set());
/** FC-4 接入：会话级 conversationId，AI 对话面板内反馈载荷携带此 ID 供后端 qa_records 关联。
 *  默认 "knowledge-chat" 与 ai-vitepress-plugins useKnowledgeChat 默认值一致；
 *  未来若 AiChatProps 开放 conversationId prop，可改为从 props 注入以避免硬编码。
 */
const conversationId = "knowledge-chat";
let reducedMotionMediaQuery: MediaQueryList | undefined;

/** 品牌主题上下文：cssVars 绑定根节点使 --ai-chat-* 变量随 brandTheme prop 生效；未传 prop 时 useBrandTheme 内部缺省回落默认品牌色 #3b82f6。isDark 由 useThemeColor 注入，跟随 Teek / VitePress 的 html.dark 切换。 */
const { colorScheme, cssVars, isDark } = useBrandTheme(props.brandTheme);

/** vepx ConfigProvider 主题覆盖：键名遵循 vepx dist buildThemeVars 原样拼接 --elx- 前缀的 kebab-case 约定；主色取派生色板的 strong（hex 归一化值），不从 cssVars 复用。 */
const vepxThemeOverrides = computed(() => ({
	common: {
		"color-primary": colorScheme.value.strong,
	},
}));

/**
 * SSR 安全判定：VitePress 构建时 document 不存在，
 * 此时 attachShadow / StyleSheet 等 DOM API 不可用，必须降级为 no-shadow。
 */
const isSSR = computed(() => typeof window === "undefined" || typeof document === "undefined");

/** 是否启用 Shadow DOM 隔离：variant 显式开启且非 SSR。 */
const shouldUseShadow = computed(() => props.variant === "container-with-shadow" && !isSSR.value);

/**
 * Shadow 模式下注入 Shadow Root 的样式：CSS 变量以 `:host` 暴露，
 * 使 Shadow Root 内的 .ai-chat 节点能继承宿主桥接的 brand tokens。
 */
const shadowStyles = computed(() => {
	if (!shouldUseShadow.value) return "";
	const hostVars = Object.entries(cssVars.value)
		.map(([key, value]) => `  ${key}: ${value};`)
		.join("\n");
	return `:host {\n${hostVars}\n}\n${AI_CHAT_SHADOW_STYLES}`;
});

/** 事件聚合：onChatEvent prop 统一回调；缺省时为 no-op */
const {
	emitUserMessage,
	emitAssistantDisplayed,
	emitFeedback: emitFeedbackEvent,
	emitMessageAction,
	emitExampleQuestionSelected,
} = useChatEvents(props.onChatEvent);

/** 将系统减少动态效果偏好映射为 Markdown 渲染节奏。 */
function updateReducedMotionPreference(event?: MediaQueryListEvent) {
	prefersReducedMotion.value = event?.matches ?? reducedMotionMediaQuery?.matches ?? false;
}

onMounted(() => {
	if (typeof window.matchMedia !== "function") return;
	reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	updateReducedMotionPreference();
	reducedMotionMediaQuery.addEventListener("change", updateReducedMotionPreference);
});

onBeforeUnmount(() => {
	reducedMotionMediaQuery?.removeEventListener("change", updateReducedMotionPreference);
});

/** 标记当前仍在生成的最后一条助手消息。 */
function isAssistantMessageFinal(message: AiChatMessage) {
	return !displayedResponding.value || message.id !== lastAssistantMessageId.value;
}

/** 读取 XSender 当前输入并清空：XSender 不提供 v-model，值经 expose 的 getModelValue 获取，清空走 expose 的 clear。 */
function readAndClearSender(): string {
	const value: ModelValue | undefined = senderRef.value?.getModelValue();
	senderRef.value?.clear();
	return value?.text?.trim() ?? "";
}

/** 处理 XSender 提交：submit 事件不携带负载，取值与清空均经模板 ref 完成。 */
function handleXSenderSubmit() {
	handleSend(readAndClearSender());
}

/** 发送用户输入，并通知组件使用方。 */
function handleSend(content: string) {
	const normalizedContent = content.trim();
	if (displayedResponding.value || !normalizedContent) return;

	/** emit 负载必须在 sendMessage() 之前构造：mock 模式下 sendMessage() 会同步 push 消息，若在其后求值 id 会整体后移一位。 */
	const message: AiChatMessage = {
		id: `user-${displayedMessages.value.length + 1}`,
		role: "user",
		content: normalizedContent,
	};

	if (props.mode === "mock") {
		input.value = normalizedContent;
		sendMessage();
	}

	emit("send", message);
	emitUserMessage(message);
}

/** 处理示例问题点击：直接当作用户消息发送 */
function handleExampleQuestionSelect(question: string) {
	handleSend(question);
	emitExampleQuestionSelected(question);
}

/** 处理反馈提交：更新已反馈集合 + emit 事件 + 调用回调 + 触发埋点 */
function handleFeedbackSubmit(payload: FeedbackPayload) {
	feedbackSubmitted.value.add(payload.messageId);
	// 触发 Vue 响应式更新（Set 替换而非 add）
	feedbackSubmitted.value = new Set(feedbackSubmitted.value);
	/** FC-4：补充会话级 conversationId，确保反馈载荷可定位一条问答记录 */
	const fullPayload: FeedbackPayload = { ...payload, conversationId };
	emit("feedback", fullPayload);
	props.feedbackOptions?.onSubmit?.(fullPayload);
	emitFeedbackEvent(fullPayload.type, fullPayload.messageId, fullPayload.details, fullPayload.conversationId);
}

/** 处理消息操作点击 */
function handleMessageAction(action: MessageAction, message: AiChatMessage) {
	action.handler(message);
	emitMessageAction(message.id, action.label);
}

/** 请求外部聊天状态管理器中止当前生成。 */
function handleStop() {
	if (!displayedResponding.value) return;
	emit("stop");
}

/** 是否展示反馈按钮（feedbackOptions.enabled 且助手消息） */
const showFeedbackFor = (id: string) => Boolean(props.feedbackOptions?.enabled) && !feedbackSubmitted.value.has(id);

/** 是否展示消息操作菜单 */
const showActionsFor = (message: AiChatMessage) =>
	Boolean(props.messageActions?.length) && message.role === "assistant";

/** P3.5：内置结构化卡片注册表；与 customRenderers 合并时，customRenderers 同名可覆盖内置实现 */
const builtinRenderers: Record<string, Component> = {
	"search-result": SearchResultCard,
	"source-list": SourceListCard,
};

/** P3.5：合并内置与外部 customRenderers；外部覆盖内置 */
const allDataRenderers = computed<Record<string, Component>>(() => ({
	...builtinRenderers,
	...props.customRenderers,
}));

/** P3.5：根据 message.itemType 解析结构化卡片渲染器；找不到则回退 Markdown */
function resolveDataRenderer(item: AiChatMessage): Component | undefined {
	const type = item.itemType;
	if (!type) return undefined;
	return allDataRenderers.value[type];
}

/** AiChat 主体内容：在 Shadow 与 Light 两个分支中复用 */
defineSlots<{
	"notification-control"(): unknown;
}>();
</script>

<template>
	<ConfigProvider :theme="isDark ? 'dark' : 'light'" :theme-overrides="vepxThemeOverrides" apply-to="self">
		<!-- Shadow DOM 隔离分支 -->
		<AiShadowRoot v-if="shouldUseShadow" :styles="shadowStyles" mode="open">
			<section class="ai-chat" aria-label="AI 对话">
				<div class="ai-chat__messages" aria-live="polite">
					<div v-if="errorMessage" class="ai-chat__error" role="alert">
						<span>{{ errorMessage }}</span>
						<button type="button" class="ai-chat__error-dismiss" aria-label="关闭错误提示" @click="emit('clear-error')">
							关闭
						</button>
					</div>
					<Bubble v-if="displayedMessages.length === 0 && !displayedResponding" class="ai-chat__empty" content="">
						<template #content>
							<div class="ai-chat__empty-mark" aria-hidden="true">AI</div>
							<p v-if="props.introMessage" class="ai-chat__empty-title">{{ props.introMessage }}</p>
							<p v-else class="ai-chat__empty-title">暂无消息</p>
							<p class="ai-chat__empty-description">问一个和当前文档有关的问题。</p>
						</template>
					</Bubble>
					<AiChatExampleQuestions
						v-if="props.exampleQuestions?.length && displayedMessages.length === 0"
						:questions="props.exampleQuestions"
						@select="handleExampleQuestionSelect"
					/>

					<BubbleList v-if="bubbleItems.length" class="ai-chat__bubble-list" :list="bubbleItems" :auto-scroll="false">
						<template #content="{ item }">
							<span v-if="item.role === 'user'">{{ item.content }}</span>
							<AiChatCustomRenderer
								v-else-if="item.component"
								:component-name="item.component.name"
								:component-props="item.component.props"
								:message-id="item.id"
								:custom-components="props.customComponents"
							/>
							<component
								v-else-if="resolveDataRenderer(item)"
								:is="resolveDataRenderer(item)"
								:data="item.data"
								:sources="item.sources"
							/>
							<MarkdownRender
								v-else
								mode="chat"
								:content="item.content"
								:final="isAssistantMessageFinal(item)"
								html-policy="escape"
								:smooth-streaming="smoothStreaming"
								:typewriter="!prefersReducedMotion"
								:fade="false"
							/>
						</template>

						<template #footer="{ item }">
							<nav v-if="item.sources?.length" class="ai-chat__sources" aria-label="参考资料">
								<a
									v-for="source in item.sources"
									:key="source.id"
									class="ai-chat__source"
									:href="source.sourceHref"
									rel="noopener noreferrer"
								>
									{{ source.label }}
								</a>
							</nav>
							<AiChatFeedback
								v-if="item.role === 'assistant' && showFeedbackFor(item.id)"
								:message-id="item.id"
								@submit="handleFeedbackSubmit"
							/>
							<AiChatMessageActions
								v-if="showActionsFor(item)"
								:message="item"
								:actions="props.messageActions ?? []"
								@action="(action, msg) => handleMessageAction(action, msg)"
							/>
						</template>
					</BubbleList>
				</div>

				<button
					v-if="props.mode === 'external' && displayedResponding"
					type="button"
					class="ai-chat__stop"
					aria-label="停止生成"
					@click="handleStop"
				>
					停止生成
				</button>

				<slot name="notification-control" />

				<!--
				  MS-4 接入：模型选择器（el-segmented）。
				  - models 为空或缺省时整块不渲染（向后兼容；mock 模式无网络也能保持原 UI）
				  - 选择器在 XSender 上方右对齐，样式走 --ai-chat-* 变量
				  - responding 中不禁用（plan 16.8 Q1 拍板：当前流继续，下条消息生效）
				-->
				<div v-if="props.models?.length" class="ai-chat__model-picker">
					<el-segmented
						:model-value="props.selectedModelId"
						:options="props.models.map((item) => ({ label: item.label, value: item.id }))"
						size="small"
						:disabled="false"
						aria-label="切换问答模型"
						title="切换后下一条消息生效"
						@update:model-value="emit('select-model', String($event))"
					/>
				</div>

				<XSender
					ref="senderRef"
					:loading="displayedResponding"
					:placeholder="placeholder"
					submit-type="enter"
					@submit="handleXSenderSubmit"
					@cancel="handleStop"
				/>
			</section>
		</AiShadowRoot>

		<!-- Light DOM 渲染分支（默认 / SSR 降级） -->
		<section v-else class="ai-chat" aria-label="AI 对话" :style="cssVars">
			<div class="ai-chat__messages" aria-live="polite">
				<div v-if="errorMessage" class="ai-chat__error" role="alert">
					<span>{{ errorMessage }}</span>
					<button type="button" class="ai-chat__error-dismiss" aria-label="关闭错误提示" @click="emit('clear-error')">
						关闭
					</button>
				</div>
				<Bubble v-if="displayedMessages.length === 0 && !displayedResponding" class="ai-chat__empty" content="">
					<template #content>
						<div class="ai-chat__empty-mark" aria-hidden="true">AI</div>
						<p v-if="props.introMessage" class="ai-chat__empty-title">{{ props.introMessage }}</p>
						<p v-else class="ai-chat__empty-title">暂无消息</p>
						<p class="ai-chat__empty-description">问一个和当前文档有关的问题。</p>
					</template>
				</Bubble>
				<AiChatExampleQuestions
					v-if="props.exampleQuestions?.length && displayedMessages.length === 0"
					:questions="props.exampleQuestions"
					@select="handleExampleQuestionSelect"
				/>

				<BubbleList v-if="bubbleItems.length" class="ai-chat__bubble-list" :list="bubbleItems" :auto-scroll="false">
					<template #content="{ item }">
						<span v-if="item.role === 'user'">{{ item.content }}</span>
						<AiChatCustomRenderer
							v-else-if="item.component"
							:component-name="item.component.name"
							:component-props="item.component.props"
							:message-id="item.id"
							:custom-components="props.customComponents"
						/>
						<component
							v-else-if="resolveDataRenderer(item)"
							:is="resolveDataRenderer(item)"
							:data="item.data"
							:sources="item.sources"
						/>
						<MarkdownRender
							v-else
							mode="chat"
							:content="item.content"
							:final="isAssistantMessageFinal(item)"
							html-policy="escape"
							:smooth-streaming="smoothStreaming"
							:typewriter="!prefersReducedMotion"
							:fade="false"
						/>
					</template>

					<template #footer="{ item }">
						<nav v-if="item.sources?.length" class="ai-chat__sources" aria-label="参考资料">
							<a
								v-for="source in item.sources"
								:key="source.id"
								class="ai-chat__source"
								:href="source.sourceHref"
								rel="noopener noreferrer"
							>
								{{ source.label }}
							</a>
						</nav>
						<AiChatFeedback
							v-if="item.role === 'assistant' && showFeedbackFor(item.id)"
							:message-id="item.id"
							@submit="handleFeedbackSubmit"
						/>
						<AiChatMessageActions
							v-if="showActionsFor(item)"
							:message="item"
							:actions="props.messageActions ?? []"
							@action="(action, msg) => handleMessageAction(action, msg)"
						/>
					</template>
				</BubbleList>
			</div>

			<button
				v-if="props.mode === 'external' && displayedResponding"
				type="button"
				class="ai-chat__stop"
				aria-label="停止生成"
				@click="handleStop"
			>
				停止生成
			</button>

			<slot name="notification-control" />

			<!--
			  MS-4 接入：模型选择器（el-segmented）。
			  - models 为空或缺省时整块不渲染（向后兼容；mock 模式无网络也能保持原 UI）
			  - 选择器在 XSender 上方右对齐，样式走 --ai-chat-* 变量
			  - responding 中不禁用（plan 16.8 Q1 拍板：当前流继续，下条消息生效）
			-->
			<div v-if="props.models?.length" class="ai-chat__model-picker">
				<el-segmented
					:model-value="props.selectedModelId"
					:options="props.models.map((item) => ({ label: item.label, value: item.id }))"
					size="small"
					:disabled="false"
					aria-label="切换问答模型"
					title="切换后下一条消息生效"
					@update:model-value="emit('select-model', String($event))"
				/>
			</div>

			<XSender
				ref="senderRef"
				:loading="displayedResponding"
				:placeholder="placeholder"
				submit-type="enter"
				@submit="handleXSenderSubmit"
				@cancel="handleStop"
			/>
		</section>
	</ConfigProvider>
</template>
