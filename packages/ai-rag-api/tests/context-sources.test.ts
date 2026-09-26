import { describe, expect, test } from "vitest";
import { assembleChatContext, normalizeClientContext } from "../server/context/sources";

describe("ai-rag-api context sources", () => {
	test("合法 pageContext 归一化返回原值", () => {
		expect(normalizeClientContext({ pagePath: "/guide/install", title: "安装指南" })).toEqual({
			pagePath: "/guide/install",
			title: "安装指南",
		});
		expect(normalizeClientContext({ pagePath: "/guide/install" })).toEqual({
			pagePath: "/guide/install",
		});
	});

	test("非法 pageContext 归一化返回 undefined 且不抛错", () => {
		expect(() => normalizeClientContext({ pagePath: "", title: "空路径" })).not.toThrow();
		expect(normalizeClientContext({ pagePath: "" })).toBeUndefined();
		expect(normalizeClientContext({ pagePath: 123 })).toBeUndefined();
		expect(normalizeClientContext({ title: "缺少 pagePath" })).toBeUndefined();
		expect(normalizeClientContext({ pagePath: "/guide", title: "x".repeat(257) })).toBeUndefined();
		expect(normalizeClientContext(null)).toBeUndefined();
	});

	test("缺失 pageContext（undefined）归一化返回 undefined 且不抛错", () => {
		expect(() => normalizeClientContext(undefined)).not.toThrow();
		expect(normalizeClientContext(undefined)).toBeUndefined();
	});

	test("装配：合法来源注入容器，非法与缺失来源跳过", () => {
		const withPage = assembleChatContext({ pagePath: "/guide/install", title: "安装指南" }, "SmallAliceWeb");
		expect(withPage).toEqual({
			site: { name: "SmallAliceWeb" },
			page: { pagePath: "/guide/install", title: "安装指南" },
		});

		const skipped = assembleChatContext({ pagePath: 999 }, "SmallAliceWeb");
		expect(skipped.site).toEqual({ name: "SmallAliceWeb" });
		expect(skipped.page).toBeUndefined();
		expect("page" in skipped).toBe(false);

		const missing = assembleChatContext(undefined, "SmallAliceWeb");
		expect(missing).toEqual({ site: { name: "SmallAliceWeb" } });
		expect(() => assembleChatContext(undefined, "SmallAliceWeb")).not.toThrow();
	});
});
