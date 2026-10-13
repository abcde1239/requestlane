import assert from "node:assert/strict";

/** 仅统计 src；整数比较避免 89.999% 被四舍五入后放行。 */
export function checkCoverage(report, requiredFiles) {
  const records = new Map();
  for (const block of report.split("end_of_record")) {
    const fields = block.trim().split(/\r?\n/);
    const source = fields.find((line) => line.startsWith("SF:"));
    if (!source) continue;
    const file = source.slice(3).replaceAll("\\", "/");
    if (!requiredFiles.includes(file)) continue;
    assert(!records.has(file), `重复覆盖率记录：${file}`);
    const count = (name) => {
      const values = fields.filter((line) => line.startsWith(`${name}:`));
      assert(
        values.length === 1 && /^\d+$/.test(values[0].slice(name.length + 1)),
        `无效覆盖率字段 ${file}: ${name}`,
      );
      const value = Number(values[0].slice(name.length + 1));
      assert(Number.isSafeInteger(value), `无效覆盖率计数：${file}`);
      return value;
    };
    const lines = count("LF");
    const coveredLines = count("LH");
    const functions = count("FNF");
    const coveredFunctions = count("FNH");
    assert(
      coveredLines <= lines && coveredFunctions <= functions,
      `覆盖率计数越界：${file}`,
    );
    const hits = fields.filter((line) => line.startsWith("DA:"));
    assert(
      hits.every((line) => /^DA:\d+,\d+$/.test(line)),
      `无效行记录：${file}`,
    );
    assert(
      hits.length === lines &&
        hits.filter((line) => Number(line.split(",")[1]) > 0).length ===
          coveredLines,
      `行记录与汇总不符：${file}`,
    );
    records.set(file, { lines, coveredLines, functions, coveredFunctions });
  }
  assert(
    requiredFiles.length > 0 &&
      new Set(requiredFiles).size === requiredFiles.length,
    "源码清单为空或重复",
  );
  for (const file of requiredFiles)
    assert(records.has(file), `缺少源码覆盖率：${file}`);
  const totals = {
    lines: 0,
    coveredLines: 0,
    functions: 0,
    coveredFunctions: 0,
  };
  for (const record of records.values())
    for (const key of Object.keys(totals)) totals[key] += record[key];
  assert(totals.lines > 0 && totals.functions > 0, "覆盖率报告为空");
  assert(
    totals.coveredLines * 100 >= totals.lines * 90,
    `行覆盖率未达到 90%：${totals.coveredLines}/${totals.lines}`,
  );
  assert(
    totals.coveredFunctions * 100 >= totals.functions * 90,
    `函数覆盖率未达到 90%：${totals.coveredFunctions}/${totals.functions}`,
  );
  return totals;
}
