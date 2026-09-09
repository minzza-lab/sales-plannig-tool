import assert from "node:assert/strict";
import test from "node:test";
import { processVatSettlement } from "./nicepayVatEngine.ts";

const facilities = [
  { id: "room", name: "객실료", excelColumn: "AE", displayOrder: 1, enabled: true },
  { id: "water", name: "워터파크", excelColumn: "AU", displayOrder: 2, enabled: true },
];

const rules = [
  { id: "water-breakfast", priority: 1, includeKeywords: ["워터", "조식"], excludeKeywords: [], standardProductName: "워터조식", packageName: "워터조식", enabled: true, description: "" },
  { id: "water", priority: 2, includeKeywords: ["워터", "PKG"], excludeKeywords: ["조식"], standardProductName: "워터PKG", packageName: "워터PKG", enabled: true, description: "" },
];

const components = [
  { id: "room", packageName: "워터PKG", facilityName: "객실료", baseAmount: 93000, enabled: true },
  { id: "water", packageName: "워터PKG", facilityName: "워터파크", baseAmount: 40000, enabled: true },
];

test("highest priority and exclusion classify the correct package", () => {
  const result = processVatSettlement([
    { 상품명: "여름 워터 조식 PKG", 결제수수료: 100, 에스크로수수료: 10, 인증수수료: 1, VAT: 11, 상태: "승인" },
    { 상품명: "여름 워터 객실 PKG", 결제수수료: 100, 에스크로수수료: 10, 인증수수료: 1, VAT: 11, 상태: "승인" },
  ], rules, components, facilities);
  assert.equal(result.rows[0].packageName, "워터조식");
  assert.equal(result.rows[1].packageName, "워터PKG");
});

test("rounding remainder is assigned so allocation equals source fee", () => {
  const result = processVatSettlement([
    { 상품명: "워터 PKG", 결제수수료: 3, 에스크로수수료: 0, 인증수수료: 0, VAT: 0, 상태: "승인" },
  ], rules, components, facilities);
  const summary = result.summaries.find((item) => item.packageName === "워터PKG");
  assert.ok(summary);
  assert.equal(summary.allocatedTotal, 3);
  assert.equal(summary.difference, 0);
  assert.deepEqual(summary.allocations.map((item) => item.allocatedFee), [2, 1]);
});

test("negative cancelled fees retain their sign through allocation", () => {
  const result = processVatSettlement([
    { 상품명: "워터 PKG", 결제수수료: -100, 에스크로수수료: 0, 인증수수료: 0, VAT: -10, 상태: "취소" },
  ], rules, components, facilities);
  const summary = result.summaries.find((item) => item.packageName === "워터PKG");
  assert.ok(summary);
  assert.equal(summary.feeTotal, -110);
  assert.equal(summary.allocatedTotal, -110);
  assert.equal(summary.cancelledCount, 1);
});
