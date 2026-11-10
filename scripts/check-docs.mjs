import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { root } from "./runtime.mjs";

const metadata = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const shipped = [
  "dist",
  "README.md",
  "USAGE.md",
  "docs/public",
  "examples",
  "LICENSE",
];
assert.deepEqual(
  [...metadata.files].sort(),
  [...shipped].sort(),
  "npm files 必须维持显式公开白名单",
);

function collect(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = `${directory}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `公开文档不应包含链接文件：${file}`);
      return entry.isDirectory() ? collect(file) : [file];
    },
  );
}

const documents = ["README.md", "USAGE.md", ...collect("docs/public")];
for (const required of [
  "docs/public/README.md",
  "docs/public/guides/usage.md",
  "docs/public/reference/exports.md",
  "docs/public/examples/README.md",
])
  assert(documents.includes(required), `缺少公开文档：${required}`);

for (const document of documents) {
  assert(document.endsWith(".md"), `公开文档目录中出现非文档文件：${document}`);
  assert(
    !/(^|\/)(memory|memories|decision|decisions|verification|prd|development|\.agent|\.harness)(\/|$)/i.test(
      document,
    ),
    `内部资料不能随包分发：${document}`,
  );
  const content = readFileSync(resolve(root, document), "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:|^#|^\/\//i.test(link)) continue;
    const target = resolve(
      root,
      document,
      "..",
      decodeURIComponent(link.split(/[?#]/)[0]),
    );
    const path = relative(root, target).replaceAll("\\", "/");
    assert(
      !isAbsolute(path) && !path.startsWith("../"),
      `链接越出项目：${document} → ${link}`,
    );
    assert(
      shipped.some(
        (allowed) => path === allowed || path.startsWith(`${allowed}/`),
      ),
      `公开文档链接了非分发资料：${document} → ${link}`,
    );
    assert(existsSync(target), `公开文档链接不存在：${document} → ${link}`);
  }
}
console.log(
  `[docs] ${documents.length} public documents / local links / npm allowlist passed`,
);
