import assert from "node:assert/strict";
import test from "node:test";
import { buildVatSummaryPrintHtml, VAT_SUMMARY_PRINT_COLUMNS } from "./nicepayVatPrint.ts";

test("선택한 열과 순서만 A4 세로 인쇄 시트에 포함한다", () => {
  const columns = [VAT_SUMMARY_PRINT_COLUMNS[7], VAT_SUMMARY_PRINT_COLUMNS[0], VAT_SUMMARY_PRINT_COLUMNS[1]];
  const html = buildVatSummaryPrintHtml([{
    keywords: "숙박<특가>", standardProductName: "패키지 A", transactionCount: 2,
    transactionAmount: 100000, paymentFee: 1000, vat: 100, feeTotal: 1100, settlementAmount: 98900,
  }], columns, "원본.xlsx");

  assert.match(html, /@page\{size:A4 portrait/);
  assert.match(html, /H열<br>실입금액[\s\S]*A열<br>분류 키워드[\s\S]*B열<br>X열 표준 상품명/);
  assert.doesNotMatch(html, /D열<br>거래금액/);
  assert.match(html, /숙박&lt;특가&gt;/);
  assert.match(html, /window\.print\(\)/);
});
