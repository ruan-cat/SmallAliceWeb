import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 获取 Cursor Machine ID（保留原始 UUID 格式，含连字符） */
export function getMachineId(): string {
	const appData = process.env.APPDATA;
	if (!appData) {
		throw new Error("无法读取 APPDATA 环境变量，当前可能不是 Windows 系统");
	}

	const machineIdPath = join(appData, "Cursor", "machineid");
	return readFileSync(machineIdPath, "utf-8").trim();
}
