import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { root, run } from "./runtime.mjs";

// 使用真实 index 快照：未暂存的修复不能使待提交的错误代码通过检查。
const { spawnSync } = await import("node:child_process");
const listing = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { cwd: root, encoding: "utf8" },
);
if (listing.error) throw listing.error;
if (listing.status !== 0) throw new Error("无法读取暂存区");
const staged = listing.stdout.split("\0").filter(Boolean);
const excluded = staged.filter((path) =>
  /(^|\/)(docs|verification|verficaction|\.agent)(\/|$)/i.test(path),
);
assert.equal(
  excluded.length,
  0,
  `禁止提交本地文档或 agent 文件：${excluded.join(", ")}`,
);

const temporaryRoot = resolve(tmpdir());
const snapshot = mkdtempSync(join(temporaryRoot, "requestkit-pre-commit-"));
const dependencyLink = join(snapshot, "node_modules");
let linked = false;
try {
  run("git", [
    "checkout-index",
    "--all",
    `--prefix=${snapshot.replaceAll("\\", "/")}/`,
  ]);
  assert(
    existsSync(join(snapshot, "test/adapters.test.ts")),
    "暂存区必须包含通信契约测试",
  );
  const normalizedLock = (directory) =>
    readFileSync(join(directory, "bun.lock"), "utf8").replaceAll("\r\n", "\n");
  assert(
    normalizedLock(snapshot) === normalizedLock(root),
    "暂存区锁文件与工作区不一致，请先安装并暂存依赖",
  );
  assert(
    existsSync(join(root, "node_modules")),
    "请先执行 bun install --frozen-lockfile",
  );
  symlinkSync(
    join(root, "node_modules"),
    dependencyLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  linked = true;
  console.log(
    "[pre-commit] 检查暂存区：格式、严格类型、全部测试、行/函数覆盖率 >=90%、ESM/声明构建",
  );
  try {
    run(
      process.execPath,
      [
        join(snapshot, "node_modules/prettier/bin/prettier.cjs"),
        "--check",
        ".",
      ],
      { cwd: snapshot },
    );
  } catch (error) {
    throw new Error("暂存内容未格式化，请执行 npm run format 后重新暂存", {
      cause: error,
    });
  }
  run(
    process.execPath,
    [join(snapshot, "node_modules/typescript/bin/tsc"), "--noEmit"],
    { cwd: snapshot },
  );
  run(process.execPath, ["scripts/test-coverage.mjs"], { cwd: snapshot });
  run(process.execPath, ["scripts/build.mjs"], { cwd: snapshot });
  console.log("[pre-commit] 暂存区检查通过");
} finally {
  // 先移除依赖链接；递归清理只允许本脚本创建的系统临时目录。
  if (linked) unlinkSync(dependencyLink);
  const localPath = relative(temporaryRoot, snapshot);
  assert(
    localPath.startsWith("requestkit-pre-commit-") &&
      !localPath.includes(sep) &&
      !isAbsolute(localPath),
    "临时目录越界，拒绝清理",
  );
  rmSync(snapshot, { recursive: true, force: true });
}
