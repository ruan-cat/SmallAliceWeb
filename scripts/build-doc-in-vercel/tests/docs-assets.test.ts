import { describe, expect, test } from "vitest";
import { resolveAssetRequest } from "../../../workers/docs-assets";

describe("docs asset fallback", () => {
	test("保留 .html 路径", () => {
		expect(resolveAssetRequest("/docx/插件小工具/部署AI绘画工具.html")).toEqual({
			pathname: "/docx/插件小工具/部署AI绘画工具.html",
			redirect: false,
		});
	});

	test("目录请求补 index.html", () => {
		expect(resolveAssetRequest("/about/")).toEqual({
			pathname: "/about/index.html",
			redirect: false,
		});
	});

	test("不把无斜杠路径猜成 html", () => {
		expect(resolveAssetRequest("/about")).toEqual({
			pathname: "/about",
			redirect: false,
		});
	});
});
