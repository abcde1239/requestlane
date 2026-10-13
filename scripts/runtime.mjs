import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status}`);
  return result;
}
export function compiler(name = "typescript", args = ["--noEmit"]) {
  run(process.execPath, [
    resolve(root, `node_modules/${name}/bin/tsc`),
    ...args,
  ]);
}
export function npm(args, options = {}) {
  const cli =
    process.env.npm_execpath ??
    resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  return process.platform === "win32"
    ? run(process.execPath, [cli, ...args], options)
    : run("npm", args, options);
}
