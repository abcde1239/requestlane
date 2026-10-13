const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseVersion(value) {
  const match = typeof value === "string" && versionPattern.exec(value);
  if (
    !match ||
    match[0] !== value ||
    match[4]?.split(".").some((part) => /^0\d+$/.test(part))
  )
    throw new Error(`无效版本号（不支持 build metadata）：${value}`);
  return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split(".") };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  }
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function releaseCandidate(current, previous, event) {
  if (current.name !== "requestkit" || current.private)
    throw new Error("只允许发布公开的 requestkit 包");
  parseVersion(current.version);
  if (event !== "push" && event !== "workflow_dispatch")
    throw new Error(`不允许的发布事件：${event}`);
  if (event === "push" && previous) {
    if (previous.version === current.version) return null;
    if (compareVersions(current.version, previous.version) <= 0)
      throw new Error("版本更新必须递增");
  }
  return {
    version: current.version,
    tag: current.version.includes("-") ? "next" : "latest",
    tarball: `${current.name}-${current.version}.tgz`,
  };
}

export async function releasePlan(candidate, fetchRegistry = fetch) {
  if (!candidate) return { publish: false, reason: "版本未变化" };
  const response = await fetchRegistry(
    "https://registry.npmjs.org/requestkit",
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404)
    throw new Error(
      "requestkit 尚未发布，请先手动首次发布并配置 npm Trusted Publisher（见 CONTRIBUTING.md）",
    );
  if (!response.ok)
    throw new Error(`npm registry 查询失败：HTTP ${response.status}`);
  const registry = await response.json();
  if (!registry.versions || !registry["dist-tags"])
    throw new Error("npm registry 返回的包元数据不完整");
  if (Object.hasOwn(registry.versions, candidate.version))
    return { publish: false, reason: "该版本已发布" };
  const channelVersion = registry["dist-tags"][candidate.tag];
  if (channelVersion && compareVersions(candidate.version, channelVersion) <= 0)
    throw new Error(`拒绝回退 ${candidate.tag}：当前为 ${channelVersion}`);
  return { publish: true, ...candidate };
}
