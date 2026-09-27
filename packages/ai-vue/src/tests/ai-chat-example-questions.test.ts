import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import AiChatExampleQuestions from "../components/ai-chat/parts/AiChatExampleQuestions.vue";

const mountedApps: App[] = [];
const selected: string[] = [];

function mountExamples(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		setup() {
			const onSelect = (q: string) => selected.push(q);
			return () => h(AiChatExampleQuestions, { ...props, onSelect: onSelect });
		},
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

beforeEach(() => {
	selected.length = 0;
});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("AiChatExampleQuestions", () => {
	test("空数组不渲染", async () => {
		const host = mountExamples({ questions: [] });
		await nextTick();
		expect(host.querySelector(".ai-chat__examples")).toBeNull();
	});

	test("传入 N 个问题渲染 N 个按钮", async () => {
		const host = mountExamples({ questions: ["怎么用？", "为什么？"] });
		await nextTick();
		expect(host.querySelectorAll(".ai-chat__example-item")).toHaveLength(2);
		expect(host.textContent).toContain("怎么用？");
		expect(host.textContent).toContain("为什么？");
	});

	test("点击问题 emit('select', question)", async () => {
		const host = mountExamples({ questions: ["怎么用？", "为什么？"] });
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__example-item")[1].click();
		await nextTick();
		expect(selected).toEqual(["为什么？"]);
	});
});
