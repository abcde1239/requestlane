import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./runtime.mjs";

const candidates = process.env.HARNESS_KIT_CLI
  ? [resolve(root, process.env.HARNESS_KIT_CLI)]
  : [".codex", ".agents"].map((directory) =>
      join(homedir(), directory, "skills/harness-kit/scripts/harness.mjs"),
    );
const cli = candidates.find((candidate) => existsSync(candidate));
if (!cli) {
  console.error(
    "请先安装 Harness Kit skill，或设置 HARNESS_KIT_CLI 指向 scripts/harness.mjs。",
  );
  process.exit(2);
}
const localBun = join(
  homedir(),
  ".bun/bin",
  process.platform === "win32" ? "bun.exe" : "bun",
);
const bun =
  process.env.BUN_EXEC_PATH || (existsSync(localBun) ? localBun : "bun");
let status = 0;
for (const [command, args] of [
  [bun, [cli, "lint", "--root", root, "--json"]],
  [process.execPath, [join(root, "scripts/check-docs.mjs")]],
]) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  status = Math.max(
    status,
    result.error || result.signal ? 2 : (result.status ?? 2),
  );
}
process.exitCode = status;
