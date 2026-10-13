import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCoverage } from "./coverage-policy.mjs";

function report(
  lines,
  coveredLines,
  functions,
  coveredFunctions,
  file = "src/a.ts",
) {
  return `SF:${file}\nLF:${lines}\nLH:${coveredLines}\nFNF:${functions}\nFNH:${coveredFunctions}\n${Array.from({ length: lines }, (_, i) => `DA:${i + 1},${i < coveredLines ? 1 : 0}`).join("\n")}\nend_of_record\n`;
}
test("90% 边界通过；行或函数不足均拒绝", () => {
  assert.equal(
    checkCoverage(report(10, 9, 10, 9), ["src/a.ts"]).coveredLines,
    9,
  );
  assert.throws(
    () => checkCoverage(report(10, 8, 10, 9), ["src/a.ts"]),
    /行覆盖率/,
  );
  assert.throws(
    () => checkCoverage(report(10, 9, 10, 8), ["src/a.ts"]),
    /函数覆盖率/,
  );
  assert.throws(
    () => checkCoverage(report(10001, 9000, 10, 9), ["src/a.ts"]),
    /行覆盖率/,
  );
});
test("空报告、未加载源码和损坏报告均不能放行", () => {
  assert.throws(() => checkCoverage("", ["src/a.ts"]), /缺少源码/);
  assert.throws(
    () => checkCoverage(report(10, 10, 10, 10), ["src/a.ts", "src/b.ts"]),
    /src\/b/,
  );
  assert.throws(() => checkCoverage(report(0, 0, 0, 0), ["src/a.ts"]), /为空/);
  assert.throws(
    () =>
      checkCoverage(report(10, 10, 10, 10).replace("LH:10", "LH:11"), [
        "src/a.ts",
      ]),
    /越界/,
  );
  assert.throws(
    () =>
      checkCoverage(report(10, 10, 10, 10).replace("LF:10", "LF:NaN"), [
        "src/a.ts",
      ]),
    /无效/,
  );
  assert.throws(
    () =>
      checkCoverage(report(10, 10, 10, 10).replace("DA:1,1", "DA:1,0"), [
        "src/a.ts",
      ]),
    /汇总不符/,
  );
});
test("测试夹具不抬高源码覆盖率，路径兼容 Windows", () => {
  assert.throws(
    () =>
      checkCoverage(
        report(10, 8, 10, 9) +
          report(1000, 1000, 1000, 1000, "test/fixture.ts"),
        ["src/a.ts"],
      ),
    /行覆盖率/,
  );
  assert.equal(
    checkCoverage(report(10, 9, 10, 9, "src\\a.ts"), ["src/a.ts"])
      .coveredFunctions,
    9,
  );
  assert.throws(
    () => checkCoverage(report(10, 10, 10, 10).repeat(2), ["src/a.ts"]),
    /重复/,
  );
});
