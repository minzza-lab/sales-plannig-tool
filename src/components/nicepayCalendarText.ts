export type ParsedCalendarText = {
  amounts: Record<string, number>;
  amountCount: number;
  total: number;
};

export function findDuplicateCalendarMids(
  calendars: Record<string, Record<string, number>>,
): string[][] {
  const groups = new Map<string, string[]>();
  Object.entries(calendars).forEach(([mid, amounts]) => {
    const signature = JSON.stringify(Object.entries(amounts).sort(([a], [b]) => a.localeCompare(b)));
    if (signature === "[]") return;
    groups.set(signature, [...(groups.get(signature) || []), mid]);
  });
  return Array.from(groups.values()).filter((mids) => mids.length > 1);
}

export function parseNicepayCalendarText(source: string, selectedMonth: string): ParsedCalendarText {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.find((line) => /^20\d{2}[./-]\s*\d{1,2}$/.test(line));
  if (!header) throw new Error("텍스트 맨 위의 조회월(예: 2026.09)을 포함해 붙여넣어 주세요.");
  const [year, month] = header.split(/[./-]/).map(Number);
  const actualMonth = `${year}-${String(month).padStart(2, "0")}`;
  if (actualMonth !== selectedMonth)
    throw new Error(`붙여넣은 달력은 ${actualMonth}입니다. 검증 대상 월 ${selectedMonth}과 일치시켜 주세요.`);

  const lastDay = new Date(year, month, 0).getDate();
  const seenDays = new Set<number>();
  const amounts: Record<string, number> = {};
  let currentDay = 0;
  for (const line of lines.slice(lines.indexOf(header) + 1)) {
    const inline = line.match(/^([1-9]|[12]\d|3[01])\s+([\d,]+)\s*원?$/);
    if (inline) {
      const day = Number(inline[1]);
      if (day > lastDay || seenDays.has(day)) throw new Error(`${day}일이 중복되거나 해당 월에 없는 날짜입니다.`);
      seenDays.add(day);
      currentDay = day;
      const amount = parseAmount(inline[2]);
      if (amount == null) throw new Error(`${day}일 금액 형식을 확인해 주세요.`);
      amounts[`${selectedMonth}-${String(day).padStart(2, "0")}`] = amount;
      continue;
    }
    if (/^(?:[1-9]|[12]\d|3[01])$/.test(line)) {
      const day = Number(line);
      if (day > lastDay || seenDays.has(day)) throw new Error(`${day}일이 중복되거나 해당 월에 없는 날짜입니다.`);
      seenDays.add(day);
      currentDay = day;
      continue;
    }
    if (currentDay && /^(?:\d{1,3}(?:,\d{3})+|\d+)\s*원?$/.test(line)) {
      const date = `${selectedMonth}-${String(currentDay).padStart(2, "0")}`;
      if (date in amounts) throw new Error(`${currentDay}일에 금액이 두 번 나옵니다. 원본 텍스트를 확인해 주세요.`);
      amounts[date] = parseAmount(line)!;
    }
  }
  const missingDays = Array.from({ length: lastDay }, (_, index) => index + 1).filter((day) => !seenDays.has(day));
  if (missingDays.length)
    throw new Error(`날짜 ${missingDays.slice(0, 8).join("·")}일${missingDays.length > 8 ? " 외" : ""}이 빠졌습니다. 달력 전체를 붙여넣어 주세요.`);
  const amountCount = Object.keys(amounts).length;
  if (!amountCount) throw new Error("날짜별 금액을 찾지 못했습니다.");
  return { amounts, amountCount, total: Object.values(amounts).reduce((sum, amount) => sum + amount, 0) };
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(/원$/, "").trim();
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(trimmed)) return null;
  const amount = Number(trimmed.replaceAll(",", ""));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
