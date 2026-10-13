import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

test("真实 push 范围比较、手动重试及错误路径不会产生可发布输出", () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(join(base, "requestlane-release-test-"));
  const cli = new URL("./release-plan.mjs", import.meta.url);
  const output = join(directory, "github-output");
  const mock = join(directory, "registry-mock.mjs");
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "release-test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "release-test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
    GITHUB_OUTPUT: output,
  };
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, env, encoding: "utf8" }).trim();
  const packageFile = join(directory, "package.json");
  const commit = (version, description) => {
    writeFileSync(
      packageFile,
      JSON.stringify({ name: "requestlane", version, description }),
    );
    git("add", "package.json");
    git("commit", "--quiet", "-m", "test");
    return git("rev-parse", "HEAD");
  };
  const invoke = (event, before) => {
    writeFileSync(output, "");
    return spawnSync(
      process.execPath,
      ["--import", pathToFileURL(mock).href, fileURLToPath(cli)],
      {
        cwd: directory,
        env: { ...env, RELEASE_EVENT: event, RELEASE_BEFORE: before },
        encoding: "utf8",
      },
    );
  };
  try {
    git("init", "--quiet");
    writeFileSync(
      mock,
      'globalThis.fetch = async () => new Response(JSON.stringify({ versions: {}, "dist-tags": { latest: "0.1.2" } }));',
    );
    const before = commit("0.1.2", "old");
    const middle = commit("0.2.0", "version update");
    commit("0.2.0", "other metadata");
    const changed = invoke("push", before);
    assert.equal(changed.status, 0, changed.stderr);
    assert.match(
      readFileSync(output, "utf8"),
      /publish=true\nversion=0.2.0\ntag=latest/,
    );
    const unchanged = invoke("push", middle);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.match(readFileSync(output, "utf8"), /publish=false/);
    const manual = invoke("workflow_dispatch", undefined);
    assert.equal(manual.status, 0, manual.stderr);
    assert.match(readFileSync(output, "utf8"), /publish=true/);
    for (const invalid of [undefined, "malformed", "1".repeat(40)]) {
      const result = invoke("push", invalid);
      assert.notEqual(result.status, 0);
      assert.equal(readFileSync(output, "utf8"), "");
    }
    writeFileSync(
      mock,
      "globalThis.fetch = async () => new Response(null, { status: 500 });",
    );
    const failed = invoke("workflow_dispatch", undefined);
    assert.notEqual(failed.status, 0);
    assert.equal(readFileSync(output, "utf8"), "");
  } finally {
    const child = relative(base, directory);
    assert(
      child.startsWith("requestlane-release-test-") &&
        !child.includes(sep) &&
        !isAbsolute(child),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
