import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareVersions,
  releaseCandidate,
  releasePlan,
} from "./release-policy.mjs";

const metadata = (version) => ({ name: "requestlane", version });
const candidate = releaseCandidate(
  metadata("0.2.0"),
  metadata("0.1.2"),
  "push",
);
const registry =
  (versions = {}, tags = { latest: "0.1.2" }) =>
  async () =>
    new Response(JSON.stringify({ versions, "dist-tags": tags }));

test("仅版本递增触发，手动运行可重试相同版本", () => {
  assert.equal(
    releaseCandidate(metadata("0.1.2"), metadata("0.1.2"), "push"),
    null,
  );
  assert.deepEqual(candidate, {
    version: "0.2.0",
    tag: "latest",
    tarball: "requestlane-0.2.0.tgz",
  });
  assert.equal(
    releaseCandidate(metadata("0.1.2"), metadata("0.1.2"), "workflow_dispatch")
      .version,
    "0.1.2",
  );
  assert.equal(
    releaseCandidate(metadata("1.0.0-rc.1"), null, "push").tag,
    "next",
  );
  assert.throws(
    () => releaseCandidate(metadata("0.1.1"), metadata("0.1.2"), "push"),
    /递增/,
  );
  assert.throws(() =>
    releaseCandidate({ ...metadata("1.0.0"), private: true }, null, "push"),
  );
  assert.throws(() =>
    releaseCandidate({ name: "other", version: "1.0.0" }, null, "push"),
  );
  assert.throws(() =>
    releaseCandidate(metadata("1.0.0"), null, "pull_request"),
  );
});

test("SemVer 顺序及输入边界", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "1.1.0",
    "2.0.0",
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareVersions(ordered[i], ordered[i + 1]), -1);
    assert.equal(compareVersions(ordered[i + 1], ordered[i]), 1);
  }
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.1"), 0);
  for (const value of [
    "v1.0.0",
    "01.0.0",
    "1.0",
    "1.0.0-01",
    "1.0.0+build",
    "1.0.0\n",
    undefined,
  ])
    assert.throws(() => releaseCandidate(metadata(value), null, "push"));
});

test("未改版本不查询，已发布版本跳过，未发布版本允许发布", async () => {
  assert.equal(
    (
      await releasePlan(null, () => {
        throw new Error("不应查询");
      })
    ).publish,
    false,
  );
  assert.equal(
    (await releasePlan(candidate, registry({ "0.2.0": {} }))).publish,
    false,
  );
  assert.deepEqual(await releasePlan(candidate, registry()), {
    publish: true,
    ...candidate,
  });
});

test("stable/next 各自禁止标签回退", async () => {
  await assert.rejects(
    releasePlan(candidate, registry({}, { latest: "0.3.0" })),
    /回退 latest/,
  );
  const prerelease = releaseCandidate(
    metadata("0.3.0-beta.2"),
    null,
    "workflow_dispatch",
  );
  assert.equal(
    (
      await releasePlan(
        prerelease,
        registry({}, { latest: "0.2.0", next: "0.3.0-beta.1" }),
      )
    ).tag,
    "next",
  );
  await assert.rejects(
    releasePlan(prerelease, registry({}, { next: "0.3.0-beta.3" })),
    /回退 next/,
  );
});

test("首次发布缺少 Trusted Publisher、registry 错误及网络失败必须停止", async () => {
  await assert.rejects(
    releasePlan(candidate, async () => new Response(null, { status: 404 })),
    /首次发布/,
  );
  for (const status of [401, 403, 429, 500])
    await assert.rejects(
      releasePlan(candidate, async () => new Response(null, { status })),
      new RegExp(String(status)),
    );
  await assert.rejects(
    releasePlan(candidate, async () => {
      throw new Error("network");
    }),
    /network/,
  );
  await assert.rejects(
    releasePlan(candidate, async () => new Response("{}")),
    /元数据不完整/,
  );
  await assert.rejects(
    releasePlan(candidate, async () => new Response("invalid")),
  );
});
