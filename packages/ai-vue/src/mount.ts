import { createApp, h, type App as VueApp, type Component } from "vue";

/**
 * mountAiChat 选项：与 AiChatProps 同形，新增 onChatEvent 统一事件回调。
 *
 * 设计原则（mount 子包保持 standalone）：
 * - mountAiChat 不依赖 ./components 任何模块，避免 vite lib 多入口 code splitting 生成未声明 chunk
 * - 调用方显式传入 component，使 mount 包保持解耦、tree-shaking 友好
 *
 * @example
 * ```ts
 * import { AiChat } from '@ruan-cat-drill-doc/ai-vue';
 * import { mountAiChat } from '@ruan-cat-drill-doc/ai-vue/mount';
 *
 * mountAiChat('#ai-target', {
 *   component: AiChat,
 *   componentProps: { mode: 'external', placeholder: '提问…' },
 *   onChatEvent: (e) => console.log(e),
 * });
 * ```
 */

/**
 * 通用事件回调签名：与 AiChat 的 ChatEventHandler 对齐（mount 包不依赖 AiChat 类型，故独立定义）。
 */
export type MountChatEventHandler = (event: import("./components/ai-chat/types").ChatEvent) => void;

export interface MountAiChatOptions<P extends Record<string, unknown> = Record<string, unknown>> {
	/** 要挂载的 Vue 组件（一般是 AiChat） */
	component: Component;
	/** 透传给 component 的 props */
	componentProps?: P;
	/** 统一事件回调：与 AiChat 的 onChatEvent prop 同语义 */
	onChatEvent?: MountChatEventHandler;
}

export interface MountAiChatResult {
	/** 卸载并清理 DOM */
	unmount: () => void;
	/** Vue 应用实例 */
	app: VueApp;
}

/**
 * 将指定 Vue 组件挂载到任意 DOM 节点。用于非 Vue 项目集成 ai-vue 组件。
 *
 * @throws 当 target 选择器找不到节点时抛 Error
 */
export function mountAiChat(target: string | HTMLElement, options: MountAiChatOptions): MountAiChatResult {
	const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
	if (!el) {
		throw new Error(`[mountAiChat] Target not found: ${String(target)}`);
	}

	const { component, componentProps, onChatEvent } = options;

	const app = createApp({
		render() {
			return h(component, {
				...(componentProps ?? {}),
				/** 桥接 mount 包的 onChatEvent 到 AiChat 的 onChatEvent prop */
				...(onChatEvent ? { onChatEvent } : {}),
			});
		},
	});

	app.mount(el);

	return {
		app,
		unmount: () => {
			app.unmount();
			/** 清空 host 节点残留占位内容（createApp 默认保留 innerHTML） */
			if (el) el.innerHTML = "";
		},
	};
}