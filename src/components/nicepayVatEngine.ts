export type RawRow = Record<string, unknown>;

export type ClassificationRule = {
  id: string;
  priority: number;
  includeKeywords: string[];
  excludeKeywords: string[];
  standardProductName: string;
  packageName: string;
  enabled: boolean;
  description: string;
};

export type PackageComponent = {
  id: string;
  packageName: string;
  facilityName: string;
  baseAmount: number;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
};

export type Facility = {
  id: string;
  name: string;
  excelColumn: string;
  displayOrder: number;
  enabled: boolean;
};

export type ProcessedRow = {
  rowNumber: number;
  source: RawRow;
  productName: string;
  standardProductName: string;
  packageName: string;
  appliedKeywords: string;
  classificationStatus: "분류완료" | "미분류";
  transactionDate: string;
  status: string;
  transactionAmount: number;
  settlementAmount: number;
  paymentFee: number;
  escrowFee: number;
  authenticationFee: number;
  vat: number;
  feeTotal: number;
};

export type AllocationLine = {
  packageName: string;
  facilityName: string;
  excelColumn: string;
  transactionCount: number;
  approvedCount: number;
  cancelledCount: number;
  feeTotal: number;
  allocationRate: number;
  allocatedFee: number;
  componentKey: string;
};

export type PackageSummary = {
  key: string;
  packageName: string;
  transactionCount: number;
  approvedCount: number;
  cancelledCount: number;
  feeTotal: number;
  allocatedTotal: number;
  difference: number;
  validation: "정상" | "오류";
  message: string;
  allocations: AllocationLine[];
};

export type ProcessingResult = {
  rows: ProcessedRow[];
  summaries: PackageSummary[];
  unclassified: ProcessedRow[];
  errors: string[];
  report: {
    inputCount: number;
    outputCount: number;
    approvedCount: number;
    cancelledCount: number;
    classifiedCount: number;
    unclassifiedCount: number;
    missingAllocationPackageCount: number;
    feeBeforeAllocation: number;
    feeAfterAllocation: number;
    allocationDifferenceCount: number;
    facilityTotals: Record<string, number>;
  };
};

const normalizeHeader = (value: unknown) => String(value ?? "")
  .replace(/[\n\r\s]/g, "")
  .toLowerCase();

export const money = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const text = (value: unknown) => String(value ?? "").trim();

export const valueByHeaders = (row: RawRow, names: string[]) => {
  const keys = Object.keys(row);
  for (const name of names) {
    const normalized = normalizeHeader(name);
    const exact = keys.find((key) => normalizeHeader(key) === normalized);
    if (exact && row[exact] !== "" && row[exact] !== undefined && row[exact] !== null) return row[exact];
    const partial = keys.find((key) => normalizeHeader(key).includes(normalized));
    if (partial && row[partial] !== "" && row[partial] !== undefined && row[partial] !== null) return row[partial];
  }
  return "";
};

export const normalizeDate = (value: unknown): string => {
  const source = text(value);
  const match = source.match(/(20\d{2})[^0-9]?(1[0-2]|0?[1-9])[^0-9]?([12]\d|3[01]|0?[1-9])/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
};

const matchesRule = (productName: string, rule: ClassificationRule) => {
  if (!rule.enabled || !rule.packageName.trim()) return false;
  const target = productName.toLocaleLowerCase("ko-KR");
  const includes = rule.includeKeywords.map(text).filter(Boolean);
  const excludes = rule.excludeKeywords.map(text).filter(Boolean);
  return includes.length > 0
    && includes.every((keyword) => target.includes(keyword.toLocaleLowerCase("ko-KR")))
    && !excludes.some((keyword) => target.includes(keyword.toLocaleLowerCase("ko-KR")));
};

export const classify = (productName: string, rules: ClassificationRule[]) => {
  const match = [...rules]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .find((rule) => matchesRule(productName, rule));
  if (!match) return { packageName: "미분류", standardProductName: "미분류", appliedKeywords: "", status: "미분류" as const };
  return {
    packageName: match.packageName.trim(),
    standardProductName: match.standardProductName.trim() || match.packageName.trim(),
    appliedKeywords: match.includeKeywords.filter(Boolean).join(", "),
    status: "분류완료" as const,
  };
};

export const toProcessedRows = (sourceRows: RawRow[], rules: ClassificationRule[]) => sourceRows.map((source, index) => {
  const productName = text(valueByHeaders(source, ["원본 상품명", "상품명"]));
  const result = classify(productName, rules);
  const paymentFee = money(valueByHeaders(source, ["결제수수료"]));
  const escrowFee = money(valueByHeaders(source, ["에스크로수수료"]));
  const authenticationFee = money(valueByHeaders(source, ["인증수수료"]));
  const vat = money(valueByHeaders(source, ["VAT", "부가세"]));
  return {
    rowNumber: index + 4,
    source,
    productName,
    standardProductName: result.standardProductName,
    packageName: result.packageName,
    appliedKeywords: result.appliedKeywords,
    classificationStatus: result.status,
    transactionDate: normalizeDate(valueByHeaders(source, ["승인일", "거래일", "정산일"])),
    status: text(valueByHeaders(source, ["상태", "승인/취소 상태"])),
    transactionAmount: money(valueByHeaders(source, ["거래금액"])),
    settlementAmount: money(valueByHeaders(source, ["정산금액"])),
    paymentFee,
    escrowFee,
    authenticationFee,
    vat,
    feeTotal: paymentFee + escrowFee + authenticationFee + vat,
  } satisfies ProcessedRow;
});

const isCancelled = (status: string) => /취소|cancel/i.test(status);
const datesMatch = (date: string, component: PackageComponent) =>
  (!component.startDate || !date || component.startDate <= date)
  && (!component.endDate || !date || component.endDate >= date);
const roundWon = (value: number) => value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);

const componentKey = (components: PackageComponent[]) => components
  .map((item) => item.id)
  .sort()
  .join("|");

export const processVatSettlement = (
  sourceRows: RawRow[],
  rules: ClassificationRule[],
  components: PackageComponent[],
  facilities: Facility[],
): ProcessingResult => {
  const rows = toProcessedRows(sourceRows, rules);
  const facilityMap = new Map(facilities.filter((facility) => facility.enabled).map((facility) => [facility.name, facility]));
  const errors: string[] = [];
  const grouped = new Map<string, { packageName: string; rows: ProcessedRow[]; components: PackageComponent[] }>();

  rows.filter((row) => row.classificationStatus === "분류완료").forEach((row) => {
    const matching = components.filter((component) => component.enabled && component.packageName === row.packageName && datesMatch(row.transactionDate, component));
    const key = `${row.packageName}::${componentKey(matching) || "직접배부"}`;
    const previous = grouped.get(key);
    if (previous) previous.rows.push(row);
    else grouped.set(key, { packageName: row.packageName, rows: [row], components: matching });
  });

  let missingAllocationPackageCount = 0;
  const summaries = Array.from(grouped.entries()).map(([key, group]) => {
    const feeTotal = group.rows.reduce((sum, row) => sum + row.feeTotal, 0);
    const approvedCount = group.rows.filter((row) => !isCancelled(row.status)).length;
    const cancelledCount = group.rows.length - approvedCount;
    const directFacility = facilityMap.get(group.packageName);
    const allocationComponents = group.components.length > 0
      ? group.components
      : directFacility
        ? [{ id: `direct-${directFacility.id}`, packageName: group.packageName, facilityName: directFacility.name, baseAmount: 1, enabled: true }]
        : [];
    const baseTotal = allocationComponents.reduce((sum, item) => sum + item.baseAmount, 0);
    const validFacilities = allocationComponents.every((item) => facilityMap.has(item.facilityName));
    const valid = allocationComponents.length > 0 && baseTotal > 0 && validFacilities;
    if (!valid) {
      missingAllocationPackageCount += 1;
      const missingFacilities = allocationComponents.filter((item) => !facilityMap.has(item.facilityName)).map((item) => item.facilityName);
      const message = missingFacilities.length ? `출력 열이 없는 이용업장: ${missingFacilities.join(", ")}` : "활성 PKG 구성표가 없습니다.";
      errors.push(`${group.packageName}: ${message}`);
      return { key, packageName: group.packageName, transactionCount: group.rows.length, approvedCount, cancelledCount, feeTotal, allocatedTotal: 0, difference: -feeTotal, validation: "오류" as const, message, allocations: [] };
    }
    let allocated = 0;
    const allocations = allocationComponents.map((component, index) => {
      const rate = component.baseAmount / baseTotal;
      const allocatedFee = index === allocationComponents.length - 1 ? feeTotal - allocated : roundWon(feeTotal * rate);
      allocated += allocatedFee;
      const facility = facilityMap.get(component.facilityName)!;
      return { packageName: group.packageName, facilityName: component.facilityName, excelColumn: facility.excelColumn, transactionCount: group.rows.length, approvedCount, cancelledCount, feeTotal, allocationRate: rate, allocatedFee, componentKey: key };
    });
    const allocatedTotal = allocations.reduce((sum, item) => sum + item.allocatedFee, 0);
    const difference = allocatedTotal - feeTotal;
    return { key, packageName: group.packageName, transactionCount: group.rows.length, approvedCount, cancelledCount, feeTotal, allocatedTotal, difference, validation: difference === 0 ? "정상" as const : "오류" as const, message: difference === 0 ? "배분 합계 일치" : "반올림 차이 확인", allocations };
  });

  const unclassified = rows.filter((row) => row.classificationStatus === "미분류");
  const facilityTotals: Record<string, number> = {};
  summaries.flatMap((summary) => summary.allocations).forEach((line) => { facilityTotals[line.facilityName] = (facilityTotals[line.facilityName] || 0) + line.allocatedFee; });
  const feeBeforeAllocation = summaries.reduce((sum, summary) => sum + summary.feeTotal, 0);
  const feeAfterAllocation = summaries.reduce((sum, summary) => sum + summary.allocatedTotal, 0);
  return {
    rows,
    summaries,
    unclassified,
    errors,
    report: {
      inputCount: rows.length,
      outputCount: rows.length,
      approvedCount: rows.filter((row) => !isCancelled(row.status)).length,
      cancelledCount: rows.filter((row) => isCancelled(row.status)).length,
      classifiedCount: rows.length - unclassified.length,
      unclassifiedCount: unclassified.length,
      missingAllocationPackageCount,
      feeBeforeAllocation,
      feeAfterAllocation,
      allocationDifferenceCount: summaries.filter((summary) => summary.difference !== 0).length,
      facilityTotals,
    },
  };
};
