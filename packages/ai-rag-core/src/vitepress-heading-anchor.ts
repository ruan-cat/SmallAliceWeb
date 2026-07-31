import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { createHeadingAnchor } from "./heading-anchor";

interface HeadingRenderState {
	headingIndex: number;
	headingPath: string[];
}

interface RagHeadingEnvironment {
	__ragHeadingRenderState?: HeadingRenderState;
	relativePath?: string;
}

/** 将 VitePress 的 Markdown 相对路径映射为知识库约定的 sourcePath。 */
function toSourcePath(relativePath: string): string {
	return `docs/${relativePath.replaceAll("\\", "/").replace(/^\.\//, "")}`;
}

/** 从 heading_open 后的 inline token 提取可见标题文本。 */
function headingText(tokens: Token[], index: number): string {
	return tokens[index + 1]?.content.trim() ?? "";
}

/** 为 VitePress 的 H1/H2/H3 写入与 RAG chunk 相同的确定性 DOM id。 */
export function installVitePressHeadingAnchors(markdown: MarkdownIt): void {
	markdown.core.ruler.after("inline", "rag-heading-render-state", (state) => {
		(state.env as RagHeadingEnvironment).__ragHeadingRenderState = {
			headingIndex: -1,
			headingPath: [],
		};
	});

	const defaultHeadingOpen = markdown.renderer.rules.heading_open;
	markdown.renderer.rules.heading_open = (tokens, index, options, environment, self) => {
		const token = tokens[index];
		const headingLevel = Number(token.tag.slice(1));
		const env = environment as RagHeadingEnvironment;

		if (headingLevel >= 1 && headingLevel <= 3) {
			const state = env.__ragHeadingRenderState ?? { headingIndex: -1, headingPath: [] };
			state.headingIndex += 1;
			state.headingPath = [...state.headingPath.slice(0, headingLevel - 1), headingText(tokens, index)];
			env.__ragHeadingRenderState = state;

			if (env.relativePath)
				token.attrSet("id", createHeadingAnchor(toSourcePath(env.relativePath), state.headingPath, state.headingIndex));
		}

		return defaultHeadingOpen
			? defaultHeadingOpen(tokens, index, options, environment, self)
			: self.renderToken(tokens, index, options);
	};
}
