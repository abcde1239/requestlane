import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vitepress";
import { root, run } from "./runtime.mjs";

run(process.execPath, ["scripts/check-docs.mjs"]);
await build(resolve(root, "website"));

const output = resolve(root, "artifacts/docs-site");
for (const file of [
  "index.html",
  "guides/usage.html",
  "reference/client.html",
  "reference/cache.html",
  "reference/session.html",
  "reference/response.html",
  "reference/service.html",
  "examples/index.html",
])
  assert(existsSync(resolve(output, file)), `缺少文档站页面：${file}`);

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), `文档站产物不能包含符号链接：${file}`);
    assert(
      !/^(?:memory|memories|decision|decisions|verification|development|prd|\.harness|\.git)$/i.test(
        entry.name,
      ),
      `文档站产物包含内部目录：${file}`,
    );
    if (entry.isDirectory()) inspect(file);
  }
}
inspect(output);
const home = readFileSync(resolve(output, "index.html"), "utf8");
assert(
  home.includes("/requestlane/assets/"),
  "Pages 资源必须使用仓库 base 路径",
);
assert(home.includes("/requestlane/reference/client"), "首页缺少 API 入口");
console.log(
  "[docs-site] VitePress pages / base / public output boundary passed",
);
