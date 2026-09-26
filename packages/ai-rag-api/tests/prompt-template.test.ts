import { describe, expect, test } from "vitest";
import {
	buildPageContextSegment,
	buildSystemPrompt,
	CITATION_FORMAT_SEGMENT,
	REFUSAL_POLICY_SEGMENT,
	RETRIEVAL_GUIDE_SEGMENT,
	ROLE_SEGMENT,
} from "../server/context/prompt-template";

describe("ai-rag-api prompt template", () => {
	test("五段式段落常量独立导出且文本固定", () => {
		expect(ROLE_SEGMENT).toBe("你是知识库问答助手。根据以下参考资料回答问题。");
		expect(RETRIEVAL_GUIDE_SEGMENT).toBe("回答必须依据参考资料；资料未覆盖的内容不要编造。");
		expect(CITATION_FORMAT_SEGMENT).toBe("回答中每个观点标注来源 [来源N]，N 对应参考资料编号。");
		expect(REFUSAL_POLICY_SEGMENT).toBe("如果资料不足，说明「根据现有资料无法回答」。");
	});

	test("无 pageContext 渲染基础模板（降级态快照）", () => {
		const prompt = buildSystemPrompt({ site: { name: "SmallAliceWeb" } }, ["内容A", "内容B"]);
		expect(() => buildSystemPrompt({ site: { name: "SmallAliceWeb" } }, [])).not.toThrow();
		expect(prompt).toBe(`你是知识库问答助手。根据以下参考资料回答问题。

回答必须依据参考资料；资料未覆盖的内容不要编造。

回答中每个观点标注来源 [来源N]，N 对应参考资料编号。

参考资料：
[1] 内容A

[2] 内容B

如果资料不足，说明「根据现有资料无法回答」。`);
	});

	test("有 pageContext 渲染注入段（注入态快照）", () => {
		const prompt = buildSystemPrompt(
			{
				site: { name: "SmallAliceWeb" },
				page: { pagePath: "/guide/install", title: "安装指南" },
			},
			["内容A"],
		);
		expect(prompt).toBe(`你是知识库问答助手。根据以下参考资料回答问题。

回答必须依据参考资料；资料未覆盖的内容不要编造。

回答中每个观点标注来源 [来源N]，N 对应参考资料编号。

【页面上下文】以下信息仅作语境参考，不得作为来源引用，不计入 [来源N] 编号：
- 用户当前浏览页面：/guide/install
- 页面标题：安装指南

参考资料：
[1] 内容A

如果资料不足，说明「根据现有资料无法回答」。`);
	});

	test("页面上下文缺 title 时注入段不渲染标题行", () => {
		const segment = buildPageContextSegment({ pagePath: "/guide/install" });
		expect(segment).toBe(
			"【页面上下文】以下信息仅作语境参考，不得作为来源引用，不计入 [来源N] 编号：\n- 用户当前浏览页面：/guide/install",
		);
		expect(segment).not.toContain("页面标题");
	});

	test("页面上下文信息不计入 [来源N] 编号体系", () => {
		const prompt = buildSystemPrompt({ site: { name: "SmallAliceWeb" }, page: { pagePath: "/guide/install" } }, [
			"内容A",
		]);
		expect(prompt).toContain("[1] 内容A");
		expect(prompt).not.toContain("[来源1]");
	});
});
