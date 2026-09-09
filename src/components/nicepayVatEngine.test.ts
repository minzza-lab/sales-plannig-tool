import assert from "node:assert/strict";
import test from "node:test";
import { groupProductNames, isNicepayTargetMid, processVatSettlement, summarizeStandardProducts } from "./nicepayVatEngine.ts";

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

test("only configured Nicepay MID values are accepted", () => {
  assert.equal(isNicepayTargetMid("1M"), true);
  assert.equal(isNicepayTargetMid(" 4m "), true);
  assert.equal(isNicepayTargetMid("5M"), true);
  assert.equal(isNicepayTargetMid("shinanrs1m"), true);
  assert.equal(isNicepayTargetMid("shinanrs4m"), true);
  assert.equal(isNicepayTargetMid("2M"), false);
  assert.equal(isNicepayTargetMid("shinanrs21m"), false);
  assert.equal(isNicepayTargetMid(""), false);
});

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

test("standard product summary combines transaction and fee amounts", () => {
  const processed = processVatSettlement([
    { 상품명: "워터 PKG A", 거래금액: 10000, 결제수수료: 100, VAT: 10, 정산금액: 9890 },
    { 상품명: "워터 PKG B", 거래금액: 20000, 결제수수료: 200, VAT: 20, 정산금액: 19780 },
  ], rules, components, facilities);
  const total = summarizeStandardProducts(processed.rows).find((item) => item.standardProductName === "워터PKG");
  assert.ok(total);
  assert.equal(total.transactionCount, 2);
  assert.equal(total.transactionAmount, 30000);
  assert.equal(total.feeTotal, 330);
  assert.equal(total.settlementAmount, 29670);
});

test("selected S column product names are mapped exactly to one X product", () => {
  const exactRule = { id: "actual-names", priority: -2000, includeKeywords: ["워터파크 선베드"], excludeKeywords: [], exactProductNames: ["워터파크 선베드", "VIP 선베드"], standardProductName: "선베드", packageName: "선베드", enabled: true, description: "" };
  const result = processVatSettlement([
    { 상품명: "워터파크 선베드", 결제수수료: 100 },
    { 상품명: "VIP 선베드", 결제수수료: 200 },
    { 상품명: "선베드 추가", 결제수수료: 300 },
  ], [exactRule], [], facilities);
  assert.equal(result.rows[0].standardProductName, "선베드");
  assert.equal(result.rows[1].standardProductName, "선베드");
  assert.equal(result.rows[2].classificationStatus, "미분류");
});

test("S column names with the same first five non-space characters are grouped together", () => {
  const groups = groupProductNames([
    { 상품명: "워터파크 종일권 성인" },
    { 상품명: "워터 파크 종일권 소인" },
    { 상품명: "객실 조식 패키지" },
  ]);
  const waterGroup = groups.find((group) => group.prefix === "워터파크종");
  assert.ok(waterGroup);
  assert.equal(waterGroup.names.length, 2);
  assert.equal(waterGroup.count, 2);
  assert.equal(groups.length, 2);
});
