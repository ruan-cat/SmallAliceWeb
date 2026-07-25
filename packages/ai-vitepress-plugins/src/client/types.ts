/** VitePress 客户端 AI 对话插件的一期 UI 配置。 */
export interface AiChatVitePressPluginOptions {
	/** 是否渲染浮动对话入口。 */
	enabled?: boolean;
	/** 传递给插件容器的静态 HTML 属性。 */
	containerAttributes?: Record<string, string | boolean | undefined>;
}
