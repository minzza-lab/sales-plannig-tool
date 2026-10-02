import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateCalendarMids, parseNicepayCalendarText } from "./nicepayCalendarText.ts";

const september = `2026.09
일\t월\t화\t수\t목\t금\t토
1
9,156,527
2
8,543,372
3
11,643,518
4
72,157,121
5
6
7
6,602,969
8
1,880,664
9
4,733,978
10
2,445,680
11
33,022,054
12
13
14
28,582,514
15
18,825,522
16
10,289,942
17
6,145,707
18
20,982,400
19
20
21
51,648,423
22
2,874,724
23
3,444,128
24
추석 연휴
25
추석
26
추석 연휴
27
28
9,998,577
29
8,063,168
30
25,012,438`;

test("pasted calendar text keeps dates, skips empty days and holidays", () => {
  const parsed = parseNicepayCalendarText(september, "2026-09");
  assert.equal(parsed.amountCount, 20);
  assert.equal(parsed.total, 336_053_426);
  assert.equal(parsed.amounts["2026-09-01"], 9_156_527);
  assert.equal(parsed.amounts["2026-09-21"], 51_648_423);
  assert.equal(parsed.amounts["2026-09-24"], undefined);
});

test("wrong month and partial calendar are rejected", () => {
  assert.throws(() => parseNicepayCalendarText(september, "2026-08"), /일치/);
  assert.throws(() => parseNicepayCalendarText(september.replace("30\n25,012,438", ""), "2026-09"), /빠졌습니다/);
});

test("identical MID calendars are detected before bank matching", () => {
  const one = { "2026-09-01": 2_649_813, "2026-09-02": 2_495_566 };
  const four = { "2026-09-01": 5_306_639, "2026-09-02": 4_105_838 };
  assert.deepEqual(findDuplicateCalendarMids({ "1m": one, "4m": one, "5m": one }), [["1m", "4m", "5m"]]);
  assert.deepEqual(findDuplicateCalendarMids({ "1m": one, "4m": four, "5m": {} }), []);
});
