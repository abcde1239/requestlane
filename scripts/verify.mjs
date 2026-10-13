import { compiler, run } from "./runtime.mjs";
import { pack } from "./pack.mjs";
import { consumers } from "./consumer-smoke.mjs";
import { browserSmoke } from "./browser-smoke.mjs";
import { installSmoke } from "./install-smoke.mjs";
console.log("[verify] formatting");
run(process.execPath, [
  "node_modules/prettier/bin/prettier.cjs",
  "--check",
  ".",
]);
console.log("[verify] strict types, including negative fixtures and examples");
compiler();
console.log("[verify] isolated adapter/cache/session tests");
run(process.execPath, ["scripts/test-coverage.mjs"]);
console.log("[verify] ESM and declarations");
run(process.execPath, ["scripts/build.mjs"]);
console.log("[verify] local package and independent consumers");
const tarball = pack();
consumers(tarball);
installSmoke(tarball);
await browserSmoke();
console.log("[verify] all checks passed");
