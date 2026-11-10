import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { run } from "./runtime.mjs";
const root = process.cwd();
const folder = path.resolve(".cache/docs-validation");
fs.mkdirSync(folder, { recursive: true });
function collect(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? collect(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const docs = ["README.md", "USAGE.md", ...collect("docs/public")];
const headingSlug = (value) =>
  value
    .replace(/\x60/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/ /g, "-");
let snippets = 0,
  anchors = 0;
const generated = [];
for (const file of docs) {
  const source = fs.readFileSync(file, "utf8");
  const code = [
    ...source.matchAll(/\x60\x60\x60ts\r?\n([\s\S]*?)\x60\x60\x60/g),
  ].map((m) => m[1]);
  snippets += code.length;
  if (code.length) {
    const target = path.join(
      folder,
      path.relative(root, path.resolve(file)).replace(/[^\p{L}\p{N}]/gu, "_") +
        ".ts",
    );
    fs.writeFileSync(target, "export {};\n" + code.join("\n"), "utf8");
    generated.push(target);
  }
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || !link.includes("#")) continue;
    const [target, hash] = link.split("#");
    if (!hash) continue;
    const content = fs
      .readFileSync(
        target
          ? path.resolve(path.dirname(file), decodeURIComponent(target))
          : file,
        "utf8",
      )
      .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, "");
    const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) =>
      headingSlug(m[1].trim()),
    );
    assert(headings.includes(decodeURIComponent(hash)), file + " -> " + link);
    anchors++;
  }
}
const metadata = JSON.parse(fs.readFileSync("package.json", "utf8"));
const paths = Object.fromEntries(
  Object.entries(metadata.exports).map(([key, value]) => [
    key === "." ? "requestlane" : "requestlane" + key.slice(1),
    [path.resolve(value.types).replaceAll("\\", "/")],
  ]),
);
fs.writeFileSync(
  path.join(folder, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: [],
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        paths,
      },
      files: generated,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    documents: docs.length,
    snippets,
    pages: generated.length,
    anchors,
  }),
);
run(process.execPath, [
  "node_modules/typescript/bin/tsc",
  "--project",
  path.join(folder, "tsconfig.json"),
]);
