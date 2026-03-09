import consola from "consola";
import { getMachineId } from "./get-machine-id.js";
import { getAccessToken } from "./get-access-token.js";

function main() {
	consola.box("Cursor Credentials");

	try {
		const machineId = getMachineId();
		consola.success("Machine ID:", machineId);
		consola.success("Machine ID (no dash):", machineId.replace(/-/g, ""));
	} catch (e) {
		consola.error("获取 Machine ID 失败:", (e as Error).message);
	}

	try {
		const token = getAccessToken();
		consola.success("Access Token:", token);
	} catch (e) {
		consola.error("获取 Access Token 失败:", (e as Error).message);
	}
}

main();
