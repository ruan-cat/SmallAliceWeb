/** AiShadowRoot 组件的 props 定义 */
export interface AiShadowRootProps {
	/** 是否启用 Shadow DOM；false 时降级为普通 light DOM 渲染 */
	enabled?: boolean;
	/** Shadow Root 模式；仅在 enabled=true 时生效 */
	mode?: "open" | "closed";
	/** 注入到 Shadow Root 内的 CSS 文本 */
	styles?: string;
}
