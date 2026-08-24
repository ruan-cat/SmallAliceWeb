import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { inspectEmf } from "../emf/audit";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** 读取受版本控制的真实 EMF fixture。 */
function readFixture(name: string): Buffer {
	return readFileSync(path.join(fixturesDir, name));
}

describe("EMF 审计", () => {
	test("识别高级角色肖像的 EMF+ Dual 与位图复核风险", () => {
		const audit = inspectEmf(readFixture("portrait-high-contrast.emf"));

		expect(audit.format).toBe("emf");
		expect(audit.recordCounts.emfPlusComment).toBeGreaterThan(0);
		expect(audit.riskFlags).toContain("emf-plus-dual");
		expect(audit.riskFlags).toContain("bitmap");
	});

	test("识别 glyph-index 文本，防止把字形 id 当作 Unicode 造成乱码", () => {
		const audit = inspectEmf(readFixture("asset-library-glyph-index.emf"));

		expect(audit.recordCounts.extTextOutW).toBeGreaterThan(0);
		expect(audit.riskFlags).toContain("glyph-index-text");
	});
});
