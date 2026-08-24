import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { validateAuditCorpusSources, validateAuditCorpusSvg, type EmfAuditCorpusManifest } from "../emf/audit-corpus";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, "../../..");
const manifestPath = path.join(testsDir, "fixtures/emf-audit-corpus-manifest.json");

/** 读取独立于 OpenSpec 生命周期的全量审计测试基线。 */
function readManifest(): EmfAuditCorpusManifest {
	return JSON.parse(readFileSync(manifestPath, "utf8")) as EmfAuditCorpusManifest;
}

/** 读取显式配置的本地 DOCX 源目录，缺少时拒绝伪造全量通过。 */
function readSourceRoot(): string {
	const sourceRoot = process.env.EMF_AUDIT_SOURCE_ROOT;
	if (!sourceRoot) {
		throw new Error("缺少 EMF_AUDIT_SOURCE_ROOT；全量审计必须显式指向本地 DOCX 源目录，不能跳过后报告通过");
	}
	return path.resolve(repoRoot, sourceRoot);
}

if (!process.env.EMF_AUDIT_SOURCE_ROOT) {
	describe("EMF 全量审计语料", () => {
		test("未显式指定本地 DOCX 源目录时拒绝跳过全量审计", () => {
			readSourceRoot();
		});
	});
} else {
	describe("EMF 全量审计语料", () => {
		test("源媒体 SHA-256 漂移时拒绝把旧清单当作通过证据", () => {
			const manifest = readManifest();
			const firstEntry = manifest.entries[0];
			const changedManifest: EmfAuditCorpusManifest = {
				...manifest,
				entries: [{ ...firstEntry, sha256: "0".repeat(64) }, ...manifest.entries.slice(1)],
			};

			expect(() => validateAuditCorpusSources(changedManifest, readSourceRoot())).toThrow("SHA-256 漂移");
		});

		test("逐条回读源 DOCX，拒绝清单与当前媒体字节或 record 审计漂移", () => {
			const result = validateAuditCorpusSources(readManifest(), readSourceRoot());

			expect(result.entries).toBe(399);
			expect(result.uniquePayloads).toBe(356);
			expect(result.revalidatedEntries).toBe(399);
			expect(result.reviewCandidates).toEqual({ 乱码: 49, 占位符: 49, 错位: 399, 重复: 399, 裁断: 399 });
			console.info(
				`EMF 审计来源：${result.entries} 条引用，${result.uniquePayloads} 个唯一载荷，已回读 ${result.revalidatedEntries} 条`,
			);
		});

		test("按唯一 SHA-256 转换全量 SVG，并将结果覆盖回全部清单引用", async () => {
			const result = await validateAuditCorpusSvg(readManifest(), readSourceRoot());

			expect(result.entries).toBe(399);
			expect(result.uniquePayloads).toBe(356);
			expect(result.convertedUniquePayloads).toBe(356);
			expect(result.coveredEntries).toBe(399);
			expect(result.reviewCandidates).toEqual({ 乱码: 49, 占位符: 49, 错位: 399, 重复: 399, 裁断: 399 });
			expect(result.converterWarnings).toEqual({ "Unhandled EMR record type: 90": 3 });
			console.info(
				`EMF SVG 契约：${result.convertedUniquePayloads} 个唯一载荷，覆盖 ${result.coveredEntries} 条引用；人工复核候选 ${JSON.stringify(result.reviewCandidates)}；转换器警告 ${JSON.stringify(result.converterWarnings)}`,
			);
		});
	});
}
