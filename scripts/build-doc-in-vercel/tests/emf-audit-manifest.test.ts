import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createEmfAuditManifest, readDocxMediaEntries } from "../emf/audit-manifest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("EMF 审计清单", () => {
	test("从真实 DOCX 保留 word/media 的 EMF 条目与原始字节", () => {
		const docxPath = path.join(repoRoot, "drill-docx/插件详细手册/5.战斗UI/关于高级角色肖像.docx");
		const media = readDocxMediaEntries(docxPath);
		const image4 = media.find((entry) => entry.entryName === "word/media/image4.emf");

		expect(image4?.content.length).toBe(375_056);
		expect(image4?.content.readUInt32LE(0)).toBe(1);
	});

	test("跳过 Office 锁文件，继续审计同目录真实 DOCX", () => {
		const sourceDocx = path.join(repoRoot, "drill-docx/插件详细手册/5.战斗UI/关于高级角色肖像.docx");
		const fixtureRoot = mkdtempSync(path.join(tmpdir(), "smallalice-emf-audit-"));
		try {
			copyFileSync(sourceDocx, path.join(fixtureRoot, "真实.docx"));
			writeFileSync(path.join(fixtureRoot, "~$锁文件.docx"), Buffer.from("not a zip"));

			const manifest = createEmfAuditManifest(fixtureRoot);

			expect(manifest.entries.length).toBeGreaterThan(0);
			expect(manifest.entries.every((entry) => entry.docxPath === "真实.docx")).toBe(true);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});
});
