import assert from "node:assert/strict";
import { test } from "node:test";
import { isInternalPath } from "./commit-policy.mjs";

test("允许公开使用文档和源码", () => {
  for (const path of [
    "README.md",
    "USAGE.md",
    "docs/public/guides/usage.md",
    "docs\\public\\README.md",
    "src/core/index.ts",
  ])
    assert.equal(isInternalPath(path), false, path);
});

test("拒绝开发资料、agent 和强制暂存的内部资料", () => {
  for (const path of [
    "docs/development/README.md",
    "docs/memory/overall.md",
    "docs/structure.md",
    "docs/publicity/README.md",
    "docs/public/memory/session.md",
    "verification/result.md",
    "verficaction/result.md",
    ".agent/config.json",
    ".agents/AGENTS.md",
    ".codex/settings.json",
    ".harness/answers.json",
    ".cache/snapshot.json",
    "CONTRIBUTING.md",
    "MEMORY.md",
    "docs\\verification\\result.md",
  ])
    assert.equal(isInternalPath(path), true, path);
});
