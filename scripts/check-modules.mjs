import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript-min";

/** 检查真实产物的完整运行时依赖图，包含 re-export 与动态 import。 */
export function checkModules(directory) {
  const rules = [
    ["core/index.js", /^(cache\/|session\/|core\/client\.js$|service\/)/],
    ["cache/index.js", /^(session\/|core\/|adapters\/|service\/)/],
    ["session/index.js", /^(cache\/|core\/|adapters\/|service\/)/],
  ];
  const metrics = {};
  for (const [entry, forbidden] of rules) {
    const visited = new Set();
    function inspect(file) {
      if (visited.has(file)) return;
      visited.add(file);
      const local = relative(directory, file).replaceAll("\\", "/");
      assert(
        !forbidden.test(local),
        `${entry} loads forbidden implementation ${local}`,
      );
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      function visit(node) {
        let literal;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          literal = node.moduleSpecifier;
        else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          literal = node.arguments[0];
          assert(
            literal && ts.isStringLiteral(literal),
            `Uninspectable dynamic import: ${file}`,
          );
        }
        if (literal && ts.isStringLiteral(literal)) {
          assert(
            literal.text.startsWith("."),
            `${entry} loads external dependency ${literal.text}`,
          );
          inspect(resolve(dirname(file), literal.text));
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    inspect(resolve(directory, entry));
    metrics[entry] = {
      modules: visited.size,
      bytes: [...visited].reduce(
        (total, file) => total + statSync(file).size,
        0,
      ),
    };
  }
  console.log(`[modules] isolated runtime graphs ${JSON.stringify(metrics)}`);
  return metrics;
}
