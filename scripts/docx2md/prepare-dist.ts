import * as fs from "fs";
import * as path from "path";
import { consola } from "consola";

const distPath = path.join(process.cwd(), "dist");

export function prepareDist() {
	if (fs.existsSync(distPath)) {
		fs.rmSync(distPath, { recursive: true, force: true });
		consola.success("dist directory deleted.");
	}

	fs.mkdirSync(distPath);
	consola.success("dist directory created.");
}
