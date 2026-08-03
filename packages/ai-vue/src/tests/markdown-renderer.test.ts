import { afterEach, describe, expect, test } from "vitest";
import MarkdownRender from "markstream-vue";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";

const mountedApps: App[] = [];

function mountMarkdownRenderer(content: string, final = true) {
	const host = document.createElement("div");
	const messageContent = ref(content);
	const isFinal = ref(final);
	const app = createApp(
		defineComponent({
			setup() {
				return () =>
					h(MarkdownRender, {
						content: messageContent.value,
						final: isFinal.value,
						htmlPolicy: "escape",
						mode: "chat",
						renderCodeBlocksAsPre: true,
						smoothStreaming: false,
						typewriter: false,
						fade: false,
					});
			},
		}),
	);

	document.body.append(host);
	app.mount(host);
	mountedApps.push(app);

	return { host, isFinal, messageContent };
}

async function waitForRender() {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		await nextTick();
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	}
}

async function updateMessage(messageContent: Ref<string>, isFinal: Ref<boolean>, content: string, final: boolean) {
	messageContent.value = content;
	isFinal.value = final;
	await waitForRender();
}

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("markstream-vue 真实流式 Markdown 渲染", () => {
	test("渲染 Markdown 表格的结构和单元格内容", async () => {
		const { host } = mountMarkdownRenderer("| 名称 | 状态 |\n| --- | --- |\n| RAG | 就绪 |");
		await waitForRender();

		const table = host.querySelector("table");
		expect(table).not.toBeNull();
		expect(table?.querySelectorAll("thead th")).toHaveLength(2);
		expect(table?.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(table?.textContent).toContain("RAG");
		expect(table?.textContent).toContain("就绪");
	});

	test("未闭合 fenced code block 在生成中和结束后都保留代码文本", async () => {
		const code = "```ts\nconst answer = 42;";
		const { host, isFinal, messageContent } = mountMarkdownRenderer(code, false);
		await waitForRender();

		expect(host.textContent).toContain("const answer = 42;");
		await updateMessage(messageContent, isFinal, code, true);
		expect(host.textContent).toContain("const answer = 42;");
		expect(host.querySelector("pre, code")).not.toBeNull();
	});

	test("渲染至少 20,000 字符且 1,000 行的长回答而不截断末行", async () => {
		const longContent = Array.from(
			{ length: 1000 },
			(_, index) => `第 ${index + 1} 行：${"流式 Markdown 内容 ".repeat(4)}`,
		).join("\n");
		const lastLineMarker = "第 1000 行：流式 Markdown 内容";
		expect(longContent.length).toBeGreaterThanOrEqual(20_000);

		const { host } = mountMarkdownRenderer(longContent);
		await waitForRender();

		expect(host.textContent).toContain("第 1 行：");
		expect(host.textContent).toContain(lastLineMarker);
	});

	test("以 escape HTML policy 阻止危险标签和事件属性进入 DOM", async () => {
		const { host } = mountMarkdownRenderer(
			'<img src=x onerror="globalThis.__xss = true">\n\n<script>globalThis.__xss = true</script>\n\n[危险链接](javascript:globalThis.__xss = true)',
		);
		await waitForRender();

		expect(host.querySelector("img, script")).toBeNull();
		expect(host.querySelector("[onerror]")).toBeNull();
		expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
		expect(host.textContent).toContain("<img src=x onerror=");
		expect(host.textContent).toContain("<script>");
		expect((globalThis as typeof globalThis & { __xss?: boolean }).__xss).toBeUndefined();
	});

	test("同一消息从流式中间态切换为结束态时保留内容并更新 DOM", async () => {
		const partialContent = "```ts\nconst state = 'streaming';";
		const finalContent = `${partialContent}\nconsole.log(state);\n\`\`\``;
		const { host, isFinal, messageContent } = mountMarkdownRenderer(partialContent, false);
		await waitForRender();
		expect(host.textContent).toContain("const state = 'streaming';");

		await updateMessage(messageContent, isFinal, finalContent, true);
		expect(host.textContent).toContain("const state = 'streaming';");
		expect(host.textContent).toContain("console.log(state);");
		expect(host.querySelector("pre, code")).not.toBeNull();
	});
});
