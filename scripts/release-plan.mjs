import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { releaseCandidate, releasePlan } from "./release-policy.mjs";

const current = JSON.parse(readFileSync("package.json", "utf8"));
let previous;
if (process.env.RELEASE_EVENT === "push") {
  const before = process.env.RELEASE_BEFORE;
  if (!/^[0-9a-f]{40}$/.test(before ?? ""))
    throw new Error("缺少有效的 push before SHA");
  if (!/^0+$/.test(before)) {
    // 比较整个 push 之前的版本，支持一次推送多个提交；读取失败不能当作首次发布。
    previous = JSON.parse(
      execFileSync("git", ["show", `${before}:package.json`], {
        encoding: "utf8",
      }),
    );
  }
}
const plan = await releasePlan(
  releaseCandidate(current, previous, process.env.RELEASE_EVENT),
);
console.log("[release]", plan);
if (process.env.GITHUB_OUTPUT) {
  const outputs = {
    publish: String(plan.publish),
    version: plan.version ?? "",
    tag: plan.tag ?? "",
    tarball: plan.tarball ?? "",
  };
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}
