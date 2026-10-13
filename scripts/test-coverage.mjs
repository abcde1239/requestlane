import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript-min";
import { root, run } from "./runtime.mjs";
import { checkCoverage } from "./coverage-policy.mjs";

run(process.execPath, ["--test", "scripts/coverage-policy.check.mjs"]);
run(process.execPath, [
  "--test",
  "scripts/release-policy.check.mjs",
  "scripts/release-cli.check.mjs",
]);
const directory = resolve(root, "coverage");
mkdirSync(directory, { recursive: true });
const files = [];
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      // 类型文件无可执行代码，不计入分母；所有运行时模块必须出现在报告中。
      const output = ts
        .transpileModule(readFileSync(path, "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            removeComments: true,
          },
          fileName: path,
        })
        .outputText.replace(/export\s*\{\s*\}\s*;?/g, "")
        .trim();
      if (output) files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
}
collect(resolve(root, "src"));
const preload = resolve(directory, "source-preload.mjs");
writeFileSync(
  preload,
  files
    .map(
      (file) =>
        `import ${JSON.stringify(pathToFileURL(resolve(root, file)).href)};`,
    )
    .join("\n"),
);
// 删除旧报告，失败运行不能复用上一次的成功结果。
const report = resolve(directory, "lcov.info");
rmSync(report, { force: true });
run("bun", [
  "test",
  "--preload",
  preload,
  "--coverage",
  "--coverage-reporter=lcov",
  "--coverage-dir",
  directory,
]);
const totals = checkCoverage(readFileSync(report, "utf8"), files);
console.log(
  `[coverage] src lines ${((totals.coveredLines / totals.lines) * 100).toFixed(2)}% (${totals.coveredLines}/${totals.lines}); functions ${((totals.coveredFunctions / totals.functions) * 100).toFixed(2)}% (${totals.coveredFunctions}/${totals.functions}); both >= 90%`,
);
