import Database from "better-sqlite3";
import { join } from "node:path";

/** 获取 Cursor Access Token */
export function getAccessToken(): string {
	const appData = process.env.APPDATA;
	if (!appData) {
		throw new Error("无法读取 APPDATA 环境变量，当前可能不是 Windows 系统");
	}

	const dbPath = join(appData, "Cursor", "User", "globalStorage", "state.vscdb");

	const db = new Database(dbPath, { readonly: true });
	try {
		const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as
			| { value: string | Buffer }
			| undefined;

		if (!row) {
			throw new Error("未找到 accessToken，请确认 Cursor 已登录");
		}

		return row.value.toString();
	} finally {
		db.close();
	}
}
