import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSummaryCsv } from './competitor-sales.ts';

test('parseSummaryCsv normalizes company metrics and missing rows', () => {
  const csv = [
    '"2026년 1월 현황 구분","","웰리힐리","","하이원"',
    '"내장객","사우나ㆍ온천","100","","0"',
    '"","워터파크","900","","0"',
    '"내장객","","1,000","","0"',
    '"매출","사우나ㆍ온천","1,000,000","",""',
    '"","워터파크","9,000,000","",""',
    '"매출","","10,000,000","","0"',
    '"객단가","사우나ㆍ온천","10,000","",""',
    '"","워터파크","10,000","",""',
    '"객단가","","10,000","",""',
    '"부대매출","","2,000,000","",""',
    '"식음매출","","3,000,000","",""',
    '"총매출","","15,000,000","","0"',
    '"전체 객단가","","15,000","",""',
  ].join('\n');

  const result = parseSummaryCsv(csv, '2026-01', '1월', 1);
  assert.equal(result.reportedCompanyCount, 1);
  assert.deepEqual(result.results[0], {
    company: '웰리힐리',
    saunaVisitors: 100,
    waterparkVisitors: 900,
    totalVisitors: 1000,
    saunaRevenue: 1000000,
    waterparkRevenue: 9000000,
    admissionRevenue: 10000000,
    ancillaryRevenue: 2000000,
    foodRevenue: 3000000,
    totalRevenue: 15000000,
    admissionSpendPerVisitor: 10000,
    totalSpendPerVisitor: 15000,
    reported: true,
  });
  assert.equal(result.results[1].company, '하이원');
  assert.equal(result.results[1].reported, false);
});
