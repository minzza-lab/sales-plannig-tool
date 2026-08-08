import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { callGeminiWithFallback } from "../utils/apiProxy";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileSpreadsheet,
  GitCompareArrows,
  PackageSearch,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings2,
  Split,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import "./NicepaySettlement.css";

type RawRow = Record<string, unknown>;
type MappingRule = { keyword: string; result: string };
type AllocationItem = { target: string; price: number };
type AllocationRule = { basePrice: number; items: AllocationItem[] };
type AllocationRules = Record<string, AllocationRule>;

type ReconciliationRow = {
  date: string;
  bankAmount: number;
  mid1Amount: number;
  mid4Amount: number;
  mid5Amount: number;
  niceAmount: number;
  difference: number;
  status: "정상" | "확인필요";
};

type CalendarMid = "1m" | "4m" | "5m";
type CalendarAmounts = Record<CalendarMid, Record<string, number>>;

type ClassifiedRow = RawRow & {
  __date: string;
  __category: string;
  __amount: number;
  __settlement: number;
  __fee: number;
  __vat: number;
};

type AllocatedRow = {
  date: string;
  mid: string;
  tid: string;
  productName: string;
  category: string;
  allocationTarget: string;
  allocationRate: number;
  transactionAmount: number;
  supplyAmount: number;
  salesVat: number;
  paymentFee: number;
  feeVat: number;
  settlementAmount: number;
  validation: string;
};

const DEFAULT_MAPPINGS: MappingRule[] = [
  { keyword: "리프트", result: "리프트" },
  { keyword: "눈썰매", result: "눈썰매" },
  { keyword: "시즌권", result: "스키시즌권" },
  { keyword: "룸온리", result: "객실" },
];

const createItems = () =>
  Array.from({ length: 6 }, () => ({ target: "", price: 0 }));
const formatWon = (value: number) => `${Math.round(value).toLocaleString()}원`;
const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/[\n\r\s]/g, "")
    .toLowerCase();
const parseMoney = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });

const getValue = (row: RawRow, names: string[]) => {
  for (const name of names) {
    const target = normalizeHeader(name);
    const exact = Object.keys(row).find(
      (key) => normalizeHeader(key) === target,
    );
    if (exact && row[exact] !== "" && row[exact] != null) return row[exact];
    const partial = Object.keys(row).find((key) =>
      normalizeHeader(key).includes(target),
    );
    if (partial && row[partial] !== "" && row[partial] != null)
      return row[partial];
  }
  return "";
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value > 20_000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed)
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(
    /(20\d{2})[^0-9]?(0?[1-9]|1[0-2])[^0-9]?(0?[1-9]|[12]\d|3[01])/,
  );
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
};

const classifyProduct = (productName: string, mappings: MappingRule[]) => {
  const target = productName.toLowerCase();
  const sorted = [...mappings]
    .filter((rule) => rule.keyword.trim())
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return (
    sorted.find((rule) => target.includes(rule.keyword.trim().toLowerCase()))
      ?.result || "미분류"
  );
};

const readWorkbook = async (file: File): Promise<RawRow[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const headerKeywords = [
    "mid",
    "정산일",
    "거래일",
    "입금일",
    "거래금액",
    "입금액",
    "상품명",
    "정산금액",
  ];
  let bestIndex = 0;
  let bestScore = -1;
  matrix.slice(0, 30).forEach((row, index) => {
    const normalized = row.map(normalizeHeader);
    const keywordScore =
      headerKeywords.filter((keyword) =>
        normalized.some((cell) => cell.includes(normalizeHeader(keyword))),
      ).length * 10;
    const score = keywordScore + normalized.filter(Boolean).length;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  const headers = matrix[bestIndex].map((value, index) =>
    String(value || `열${index + 1}`).trim(),
  );
  return matrix
    .slice(bestIndex + 1)
    .filter((row) => row.some((value) => value !== "" && value != null))
    .map((row) => {
      const record: RawRow = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });
};

const downloadWorkbook = async (
  fileName: string,
  build: (workbook: import("exceljs").Workbook) => void | Promise<void>,
) => {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WELLIHILLI Sales Planning";
  workbook.created = new Date();
  await build(workbook);
  const output = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([output]), fileName);
};

const styleWorksheet = (
  sheet: import("exceljs").Worksheet,
  widths: number[],
) => {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.properties.defaultRowHeight = 20;
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const header = sheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: widths.length },
  };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      cell.alignment = { vertical: "middle" };
    });
  });
};

const UploadBox = ({
  title,
  description,
  file,
  onFile,
  accept = ".xlsx,.xls,.xlsm,.csv",
}: {
  title: string;
  description: string;
  file?: File;
  onFile: (file: File) => void;
  accept?: string;
}) => (
  <label className={`nicepay-upload-box ${file ? "complete" : ""}`}>
    <input
      type="file"
      accept={accept}
      onChange={(event) =>
        event.target.files?.[0] && onFile(event.target.files[0])
      }
    />
    {file ? <FileCheck2 size={26} /> : <UploadCloud size={28} />}
    <span>{title}</span>
    <small>{file ? file.name : description}</small>
    <em>{file ? "파일 변경" : "파일 선택"}</em>
  </label>
);

type NicepaySettlementProps = { mode?: "settlement" | "deposit" };

const NicepaySettlement: React.FC<NicepaySettlementProps> = ({
  mode = "settlement",
}) => {
  const isDepositMode = mode === "deposit";
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(
    isDepositMode ? 1 : 2,
  );
  const [mappings, setMappings] = useState<MappingRule[]>(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("nicepay_mapping_master_v1") || "null",
        ) || DEFAULT_MAPPINGS
      );
    } catch {
      return DEFAULT_MAPPINGS;
    }
  });
  const [allocationRules, setAllocationRules] = useState<AllocationRules>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("nicepay_allocation_rules_v1") || "{}",
        );
      } catch {
        return {};
      }
    },
  );
  const [midText, setMidText] = useState(
    "shinanrs1m, shinanrs3m, shinanrs4m, shinanrs5m",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newResult, setNewResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const [bankFile, setBankFile] = useState<File>();
  const [depositMonth, setDepositMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [calendarImages, setCalendarImages] = useState<Partial<Record<CalendarMid, File>>>({});
  const [, setCalendarAmounts] = useState<CalendarAmounts>({ "1m": {}, "4m": {}, "5m": {} });
  const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>([]);
  const [bankSource, setBankSource] = useState<RawRow[]>([]);

  const [settlementFile, setSettlementFile] = useState<File>();
  const [classifiedRows, setClassifiedRows] = useState<ClassifiedRow[]>([]);

  const [transactionFile, setTransactionFile] = useState<File>();
  const [allocatedRows, setAllocatedRows] = useState<AllocatedRow[]>([]);

  const mids = useMemo(
    () =>
      midText
        .split(",")
        .map((mid) => mid.trim())
        .filter(Boolean),
    [midText],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          mappings
            .map((rule) => rule.result)
            .filter((result) => result && result !== "미분류"),
        ),
      ).sort(),
    [mappings],
  );

  useEffect(() => {
    localStorage.setItem("nicepay_mapping_master_v1", JSON.stringify(mappings));
  }, [mappings]);
  useEffect(() => {
    localStorage.setItem(
      "nicepay_allocation_rules_v1",
      JSON.stringify(allocationRules),
    );
  }, [allocationRules]);
  useEffect(() => {
    setAllocationRules((previous) => {
      const next = { ...previous };
      categories.forEach((category) => {
        if (!next[category])
          next[category] = { basePrice: 0, items: createItems() };
      });
      return next;
    });
  }, [categories]);

  const filterNiceRows = (rows: RawRow[]) =>
    rows.filter((row) => {
      const mid = String(getValue(row, ["MID"])).trim();
      return mids.length === 0 || mids.includes(mid);
    });

  const handleReconciliation = async () => {
    const requiredMids: CalendarMid[] = ["1m", "4m", "5m"];
    if (!bankFile || requiredMids.some((mid) => !calendarImages[mid]))
      return setMessage("빠른계좌조회 엑셀과 1m·4m·5m 정산달력 이미지 3장을 모두 선택해 주세요.");
    setIsProcessing(true);
    setMessage("");
    try {
      const bankRows = await readWorkbook(bankFile);
      const imageParts = await Promise.all(requiredMids.map(async (mid) => ({ mid, data: await fileToBase64(calendarImages[mid]!) })));
      const prompt = `${depositMonth} 나이스페이 정산달력 스크린샷 3장에서 날짜별 입금금액을 정확히 추출해 주세요. 각 이미지 앞의 MID 라벨을 반드시 지키고, 입금액이 표시되지 않은 날짜는 제외하세요. 응답은 설명 없이 JSON만 반환하세요. 형식: {"1m":{"2026-07-01":12345},"4m":{},"5m":{}}`;
      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [{ text: prompt }];
      imageParts.forEach(({ mid, data }) => {
        parts.push({ text: `다음 이미지는 ${mid} 정산달력입니다.` });
        parts.push({ inlineData: { data, mimeType: calendarImages[mid]!.type || "image/png" } });
      });
      const response = await callGeminiWithFallback(parts, ["gemini-2.5-flash", "gemini-2.5-pro"], { responseMimeType: "application/json", temperature: 0 });
      const parsed = JSON.parse(response.replace(/```json|```/g, "").trim()) as Partial<CalendarAmounts>;
      const extracted: CalendarAmounts = { "1m": parsed["1m"] || {}, "4m": parsed["4m"] || {}, "5m": parsed["5m"] || {} };
      const bankDaily: Record<string, number> = {};
      bankRows.forEach((row) => {
        const memo = String(
          getValue(row, ["적요", "내용", "거래내용", "입금자명", "보낸분"]),
        );
        if (!/나이스정보통신/i.test(memo)) return;
        const date = normalizeDate(
          getValue(row, ["입금일", "거래일자", "거래일", "일자", "거래일시"]),
        );
        const amount = parseMoney(
          getValue(row, ["입금액", "입금금액", "거래금액", "금액"]),
        );
        if (date.startsWith(depositMonth) && amount > 0)
          bankDaily[date] = (bankDaily[date] || 0) + amount;
      });
      const dates = Object.keys(bankDaily).sort();
      const result = dates.map((date) => {
        const mid1Amount = parseMoney(extracted["1m"][date]);
        const mid4Amount = parseMoney(extracted["4m"][date]);
        const mid5Amount = parseMoney(extracted["5m"][date]);
        const niceAmount = mid1Amount + mid4Amount + mid5Amount;
        const difference = bankDaily[date] - niceAmount;
        return {
          date,
          bankAmount: bankDaily[date], mid1Amount, mid4Amount, mid5Amount, niceAmount,
          difference,
          status: difference >= 0 ? ("정상" as const) : ("확인필요" as const),
        };
      });
      setBankSource(bankRows);
      setCalendarAmounts(extracted);
      setReconciliation(result);
      setMessage(`${depositMonth} 나이스정보통신 입금일 ${result.length}개를 분리했습니다. 주말 등 입금이 없는 날짜는 시트를 만들지 않습니다.`);
    } catch (error) {
      setMessage(
        `파일 처리 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const buildClassifiedRows = (rows: RawRow[], dateNames: string[]) =>
    filterNiceRows(rows)
      .map((row) => {
        const productName = String(getValue(row, ["상품명"])).trim();
        return {
          ...row,
          __date: normalizeDate(getValue(row, dateNames)),
          __category: classifyProduct(productName, mappings),
          __amount: parseMoney(getValue(row, ["거래금액", "결제금액"])),
          __settlement: parseMoney(getValue(row, ["정산금액", "지급금액"])),
          __fee: parseMoney(getValue(row, ["결제수수료", "수수료"])),
          __vat: parseMoney(getValue(row, ["VAT", "부가세"])),
        };
      })
      .filter((row) => row.__date);

  const handleSettlementClassification = async () => {
    if (!settlementFile)
      return setMessage("정산일 기준 상세내역 파일을 선택해 주세요.");
    setIsProcessing(true);
    setMessage("");
    try {
      const rows = buildClassifiedRows(await readWorkbook(settlementFile), [
        "정산일",
        "입금일",
      ]);
      setClassifiedRows(rows);
      const unmapped = rows.filter((row) => row.__category === "미분류").length;
      setMessage(
        `${rows.length.toLocaleString()}건을 정산일·상품별로 분류했습니다.${unmapped ? ` 미분류 ${unmapped.toLocaleString()}건을 확인해 주세요.` : ""}`,
      );
    } catch (error) {
      setMessage(
        `파일 처리 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAllocation = async () => {
    if (!transactionFile)
      return setMessage("거래일 기준 상세내역 파일을 선택해 주세요.");
    setIsProcessing(true);
    setMessage("");
    try {
      const source = buildClassifiedRows(await readWorkbook(transactionFile), [
        "승인일",
        "거래일자",
        "거래일",
      ]);
      const output: AllocatedRow[] = [];
      source.forEach((row) => {
        const rule = allocationRules[row.__category];
        const activeItems =
          rule?.items.filter((item) => item.target.trim() && item.price > 0) ||
          [];
        const rateSum =
          rule?.basePrice > 0
            ? activeItems.reduce(
                (sum, item) => sum + item.price / rule.basePrice,
                0,
              )
            : 0;
        const valid = activeItems.length > 0 && Math.abs(rateSum - 1) <= 0.005;
        const items = valid
          ? activeItems
          : [{ target: row.__category, price: 1 }];
        const denominator = valid ? rule.basePrice : 1;
        let usedAmount = 0;
        let usedFee = 0;
        let usedVat = 0;
        let usedSettlement = 0;
        items.forEach((item, index) => {
          const rate = item.price / denominator;
          const last = index === items.length - 1;
          const transactionAmount = last
            ? row.__amount - usedAmount
            : Math.round(row.__amount * rate);
          const paymentFee = last
            ? row.__fee - usedFee
            : Math.round(row.__fee * rate);
          const feeVat = last
            ? row.__vat - usedVat
            : Math.round(row.__vat * rate);
          const settlementAmount = last
            ? row.__settlement - usedSettlement
            : Math.round(row.__settlement * rate);
          usedAmount += transactionAmount;
          usedFee += paymentFee;
          usedVat += feeVat;
          usedSettlement += settlementAmount;
          const supplyAmount = Math.round(transactionAmount / 1.1);
          output.push({
            date: row.__date,
            mid: String(getValue(row, ["MID"])),
            tid: String(getValue(row, ["TID"])),
            productName: String(getValue(row, ["상품명"])),
            category: row.__category,
            allocationTarget: item.target,
            allocationRate: rate,
            transactionAmount,
            supplyAmount,
            salesVat: transactionAmount - supplyAmount,
            paymentFee,
            feeVat,
            settlementAmount,
            validation: valid ? "안분 완료" : "미설정·100% 일괄",
          });
        });
      });
      setAllocatedRows(output);
      const invalid = output.filter(
        (row) => row.validation !== "안분 완료",
      ).length;
      setMessage(
        `${output.length.toLocaleString()}개의 안분 내역을 생성했습니다.${invalid ? ` 설정 미완료 내역 ${invalid.toLocaleString()}건이 있습니다.` : ""}`,
      );
    } catch (error) {
      setMessage(
        `파일 처리 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const exportReconciliation = () =>
    downloadWorkbook(
      `입금내역_${new Date().toISOString().slice(0, 10)}.xlsx`,
      (workbook) => {
        const summary = workbook.addWorksheet("입금대사");
        summary.addRow([
          "입금일",
          "나이스정보통신 총입금",
          "1m",
          "4m",
          "5m",
          "1m+4m+5m",
          "기타 MID",
          "검증",
        ]);
        reconciliation.forEach((row) =>
          summary.addRow([
            row.date,
            row.bankAmount,
            row.mid1Amount,
            row.mid4Amount,
            row.mid5Amount,
            row.niceAmount,
            row.difference,
            row.status,
          ]),
        );
        [2, 3, 4, 5, 6, 7].forEach((column) => {
          summary.getColumn(column).numFmt = "#,##0;[Red](#,##0);-";
        });
        styleWorksheet(summary, [14, 21, 15, 15, 15, 18, 18, 12]);
        summary.eachRow((row, index) => {
          if (index > 1 && row.getCell(8).value === "확인필요")
            row.getCell(8).font = { bold: true, color: { argb: "FFDC2626" } };
        });
        const sourceSheet = workbook.addWorksheet("은행입금원본");
        const bankHeaders = Array.from(
          new Set(bankSource.flatMap(Object.keys)),
        );
        sourceSheet.addRow(bankHeaders);
        bankSource.forEach((row) =>
          sourceSheet.addRow(bankHeaders.map((header) => row[header] as never)),
        );
        styleWorksheet(
          sourceSheet,
          bankHeaders.map(() => 18),
        );
        reconciliation.forEach((result) => {
          const dateRows = bankSource.filter((row) => {
            const memo = String(getValue(row, ["적요", "내용", "거래내용", "입금자명", "보낸분"]));
            const date = normalizeDate(getValue(row, ["입금일", "거래일자", "거래일", "일자", "거래일시"]));
            return date === result.date && /나이스정보통신/i.test(memo);
          });
          const dateSheet = workbook.addWorksheet(result.date.slice(5));
          dateSheet.addRow(["입금일", "총입금", "1m", "4m", "5m", "선택 MID 합계", "기타 MID"]);
          dateSheet.addRow([result.date, result.bankAmount, result.mid1Amount, result.mid4Amount, result.mid5Amount, result.niceAmount, result.difference]);
          dateSheet.addRow([]);
          const headers = Array.from(new Set(dateRows.flatMap(Object.keys)));
          dateSheet.addRow(headers);
          dateRows.forEach((row) => dateSheet.addRow(headers.map((header) => row[header] as never)));
          [2, 3, 4, 5, 6, 7].forEach((column) => { dateSheet.getColumn(column).numFmt = "#,##0;[Red](#,##0);-"; });
          dateSheet.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
          dateSheet.getRow(4).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; cell.font = { bold: true }; });
          dateSheet.columns.forEach((column) => { column.width = 18; });
        });
      },
    );

  const exportClassification = () =>
    downloadWorkbook(
      `정산일별_품목분류_${new Date().toISOString().slice(0, 10)}.xlsx`,
      (workbook) => {
        const summary = workbook.addWorksheet("정산일별요약");
        summary.addRow([
          "정산일",
          "상품 분류",
          "건수",
          "거래금액",
          "수수료+VAT",
          "정산금액",
        ]);
        const grouped = new Map<
          string,
          { count: number; amount: number; fee: number; settlement: number }
        >();
        classifiedRows.forEach((row) => {
          const key = `${row.__date}|${row.__category}`;
          const value = grouped.get(key) || {
            count: 0,
            amount: 0,
            fee: 0,
            settlement: 0,
          };
          value.count += 1;
          value.amount += row.__amount;
          value.fee += row.__fee + row.__vat;
          value.settlement += row.__settlement;
          grouped.set(key, value);
        });
        Array.from(grouped.entries())
          .sort()
          .forEach(([key, value]) => {
            const [date, category] = key.split("|");
            summary.addRow([
              date,
              category,
              value.count,
              value.amount,
              value.fee,
              value.settlement,
            ]);
          });
        [4, 5, 6].forEach((column) => {
          summary.getColumn(column).numFmt = "#,##0;[Red](#,##0);-";
        });
        styleWorksheet(summary, [14, 24, 12, 18, 18, 18]);
        const detail = workbook.addWorksheet("분류상세");
        detail.addRow([
          "정산일",
          "MID",
          "상품 분류",
          "상품명",
          "거래금액",
          "결제수수료",
          "VAT",
          "정산금액",
          "TID",
          "상태",
        ]);
        classifiedRows.forEach((row) =>
          detail.addRow([
            row.__date,
            getValue(row, ["MID"]),
            row.__category,
            getValue(row, ["상품명"]),
            row.__amount,
            row.__fee,
            row.__vat,
            row.__settlement,
            getValue(row, ["TID"]),
            getValue(row, ["상태"]),
          ]),
        );
        [5, 6, 7, 8].forEach((column) => {
          detail.getColumn(column).numFmt = "#,##0;[Red](#,##0);-";
        });
        styleWorksheet(detail, [14, 16, 20, 44, 16, 14, 12, 16, 28, 12]);
        const mapping = workbook.addWorksheet("매핑데이터");
        mapping.addRow(["검색 키워드", "최종 분류"]);
        mappings.forEach((rule) => mapping.addRow([rule.keyword, rule.result]));
        styleWorksheet(mapping, [42, 24]);
      },
    );

  const exportAllocation = () =>
    downloadWorkbook(
      `나이스페이_수수료_부가세_${new Date().toISOString().slice(0, 10)}.xlsx`,
      (workbook) => {
        const summary = workbook.addWorksheet("부가세요약");
        summary.addRow([
          "거래일",
          "상품 분류",
          "안분 항목",
          "건수",
          "거래금액",
          "공급가액",
          "매출부가세",
          "결제수수료",
          "수수료VAT",
          "정산금액",
        ]);
        const grouped = new Map<string, number[]>();
        allocatedRows.forEach((row) => {
          const key = `${row.date}|${row.category}|${row.allocationTarget}`;
          const value = grouped.get(key) || [0, 0, 0, 0, 0, 0, 0];
          value[0] += 1;
          value[1] += row.transactionAmount;
          value[2] += row.supplyAmount;
          value[3] += row.salesVat;
          value[4] += row.paymentFee;
          value[5] += row.feeVat;
          value[6] += row.settlementAmount;
          grouped.set(key, value);
        });
        Array.from(grouped.entries())
          .sort()
          .forEach(([key, value]) => {
            const [date, category, target] = key.split("|");
            summary.addRow([date, category, target, ...value]);
          });
        [5, 6, 7, 8, 9, 10].forEach((column) => {
          summary.getColumn(column).numFmt = "#,##0;[Red](#,##0);-";
        });
        styleWorksheet(summary, [14, 20, 20, 10, 16, 16, 14, 14, 14, 16]);
        const detail = workbook.addWorksheet("안분상세");
        detail.addRow([
          "거래일",
          "MID",
          "TID",
          "원상품명",
          "상품 분류",
          "안분 항목",
          "안분율",
          "거래금액",
          "공급가액",
          "매출부가세",
          "결제수수료",
          "수수료VAT",
          "정산금액",
          "검증",
        ]);
        allocatedRows.forEach((row) =>
          detail.addRow([
            row.date,
            row.mid,
            row.tid,
            row.productName,
            row.category,
            row.allocationTarget,
            row.allocationRate,
            row.transactionAmount,
            row.supplyAmount,
            row.salesVat,
            row.paymentFee,
            row.feeVat,
            row.settlementAmount,
            row.validation,
          ]),
        );
        detail.getColumn(7).numFmt = "0.0%";
        [8, 9, 10, 11, 12, 13].forEach((column) => {
          detail.getColumn(column).numFmt = "#,##0;[Red](#,##0);-";
        });
        styleWorksheet(
          detail,
          [14, 16, 28, 44, 18, 18, 12, 16, 16, 14, 14, 14, 16, 16],
        );
        const ruleSheet = workbook.addWorksheet("안분설정");
        ruleSheet.addRow(["상품 분류", "최저가", "항목", "기준금액", "안분율"]);
        categories.forEach((category) => {
          const rule = allocationRules[category];
          rule?.items
            .filter((item) => item.target || item.price)
            .forEach((item) =>
              ruleSheet.addRow([
                category,
                rule.basePrice,
                item.target,
                item.price,
                rule.basePrice > 0 ? item.price / rule.basePrice : 0,
              ]),
            );
        });
        ruleSheet.getColumn(5).numFmt = "0.0%";
        styleWorksheet(ruleSheet, [20, 16, 20, 16, 12]);
      },
    );

  const classifiedSummary = useMemo(() => {
    const result: Record<string, { count: number; amount: number }> = {};
    classifiedRows.forEach((row) => {
      const key = row.__category;
      if (!result[key]) result[key] = { count: 0, amount: 0 };
      result[key].count += 1;
      result[key].amount += row.__amount;
    });
    return Object.entries(result).sort((a, b) => b[1].amount - a[1].amount);
  }, [classifiedRows]);

  const allocationSummary = useMemo(() => {
    const result: Record<string, { amount: number; vat: number; fee: number }> =
      {};
    allocatedRows.forEach((row) => {
      const key = row.allocationTarget;
      if (!result[key]) result[key] = { amount: 0, vat: 0, fee: 0 };
      result[key].amount += row.transactionAmount;
      result[key].vat += row.salesVat;
      result[key].fee += row.paymentFee + row.feeVat;
    });
    return Object.entries(result).sort((a, b) => b[1].amount - a[1].amount);
  }, [allocatedRows]);

  const updateAllocation = (category: string, patch: Partial<AllocationRule>) =>
    setAllocationRules((previous) => ({
      ...previous,
      [category]: {
        ...(previous[category] || { basePrice: 0, items: createItems() }),
        ...patch,
      },
    }));

  const updateDepositAmount = (date: string, mid: CalendarMid, amount: number) => {
    setCalendarAmounts((previous) => ({ ...previous, [mid]: { ...previous[mid], [date]: amount } }));
    setReconciliation((rows) => rows.map((row) => {
      if (row.date !== date) return row;
      const next = { ...row, ...(mid === "1m" ? { mid1Amount: amount } : mid === "4m" ? { mid4Amount: amount } : { mid5Amount: amount }) };
      next.niceAmount = next.mid1Amount + next.mid4Amount + next.mid5Amount;
      next.difference = next.bankAmount - next.niceAmount;
      next.status = next.difference >= 0 ? "정상" : "확인필요";
      return next;
    }));
  };

  return (
    <div className="nicepay-container">
      <header className="nicepay-hero">
        <div>
          <span>
            {isDepositMode
              ? "INTERNAL DEPOSIT VERIFICATION"
              : "NICEPAY SETTLEMENT WORKFLOW"}
          </span>
          <h1>{isDepositMode ? "입금 내역 검증" : "나이스페이 정산 자동화"}</h1>
          <p>
            {isDepositMode
              ? "회사 입금 내역과 나이스정보통신 정산액을 날짜별로 대조합니다."
              : "날짜별 품목 분류부터 알로 안분, 수수료와 부가세 정리까지 처리합니다."}
          </p>
        </div>
        {!isDepositMode && (
          <button
            className="nicepay-settings-button"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={17} /> 매핑·안분 설정 <ChevronDown size={16} />
          </button>
        )}
      </header>

      {!isDepositMode && (
        <div className="nicepay-stepper two-step">
          {(
            [
              {
                id: 2,
                number: 1,
                eyebrow: "SETTLEMENT DATE",
                title: "날짜별 품목 분류",
                icon: PackageSearch,
              },
              {
                id: 3,
                number: 2,
                eyebrow: "TRANSACTION DATE",
                title: "수수료·부가세",
                icon: Split,
              },
            ] as const
          ).map((step, index) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.id}>
                <button
                  className={activeStep === step.id ? "active" : ""}
                  onClick={() => {
                    setActiveStep(step.id);
                    setMessage("");
                  }}
                >
                  <Icon size={19} />
                  <span>
                    <small>
                      STEP {step.number} · {step.eyebrow}
                    </small>
                    <b>{step.title}</b>
                  </span>
                </button>
                {index < 1 && <ArrowRight size={17} />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {!isDepositMode && settingsOpen && (
        <section className="nicepay-settings-panel">
          <div className="nicepay-settings-heading">
            <div>
              <span>SHARED RULES</span>
              <h2>상품 매핑과 알로 안분 설정</h2>
            </div>
            <button
              onClick={() => {
                setMappings(DEFAULT_MAPPINGS);
                setAllocationRules({});
              }}
            >
              <RotateCcw size={15} /> 기본값 초기화
            </button>
          </div>
          <label className="nicepay-mid-field">
            <span>분석 대상 MID</span>
            <input
              value={midText}
              onChange={(event) => setMidText(event.target.value)}
            />
            <small>쉼표로 구분합니다.</small>
          </label>
          <div className="nicepay-settings-grid">
            <div className="nicepay-mapping-editor">
              <h3>상품 키워드 매핑</h3>
              <div className="nicepay-add-rule">
                <input
                  placeholder="검색 키워드"
                  value={newKeyword}
                  onChange={(event) => setNewKeyword(event.target.value)}
                />
                <input
                  placeholder="분류 결과"
                  value={newResult}
                  onChange={(event) => setNewResult(event.target.value)}
                />
                <button
                  onClick={() => {
                    if (!newKeyword.trim()) return;
                    setMappings((rules) => [
                      {
                        keyword: newKeyword.trim(),
                        result: newResult.trim() || "미분류",
                      },
                      ...rules,
                    ]);
                    setNewKeyword("");
                    setNewResult("");
                  }}
                >
                  <Plus size={15} /> 추가
                </button>
              </div>
              <div className="nicepay-rule-list">
                {mappings.map((rule, index) => (
                  <div key={`${rule.keyword}-${index}`}>
                    <input
                      value={rule.keyword}
                      onChange={(event) =>
                        setMappings((rules) =>
                          rules.map((item, i) =>
                            i === index
                              ? { ...item, keyword: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>→</span>
                    <input
                      value={rule.result}
                      onChange={(event) =>
                        setMappings((rules) =>
                          rules.map((item, i) =>
                            i === index
                              ? { ...item, result: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() =>
                        setMappings((rules) =>
                          rules.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="nicepay-allocation-editor">
              <h3>알로 안분 규칙</h3>
              <div className="nicepay-allocation-list">
                {categories.map((category) => {
                  const rule = allocationRules[category] || {
                    basePrice: 0,
                    items: createItems(),
                  };
                  const rate =
                    rule.basePrice > 0
                      ? rule.items.reduce((sum, item) => sum + item.price, 0) /
                        rule.basePrice
                      : 0;
                  return (
                    <details key={category}>
                      <summary>
                        <b>{category}</b>
                        <span
                          className={
                            Math.abs(rate - 1) <= 0.005 ? "valid" : "invalid"
                          }
                        >
                          {(rate * 100).toFixed(1)}%
                        </span>
                      </summary>
                      <label>
                        <span>상품 최저가</span>
                        <input
                          type="number"
                          value={rule.basePrice || ""}
                          onChange={(event) =>
                            updateAllocation(category, {
                              basePrice: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <div className="nicepay-allocation-items">
                        {rule.items.map((item, index) => (
                          <div key={index}>
                            <input
                              placeholder={`안분 ${index + 1} 항목`}
                              value={item.target}
                              onChange={(event) =>
                                updateAllocation(category, {
                                  items: rule.items.map((current, i) =>
                                    i === index
                                      ? {
                                          ...current,
                                          target: event.target.value,
                                        }
                                      : current,
                                  ),
                                })
                              }
                            />
                            <input
                              type="number"
                              placeholder="기준금액"
                              value={item.price || ""}
                              onChange={(event) =>
                                updateAllocation(category, {
                                  items: rule.items.map((current, i) =>
                                    i === index
                                      ? {
                                          ...current,
                                          price:
                                            Number(event.target.value) || 0,
                                        }
                                      : current,
                                  ),
                                })
                              }
                            />
                            <em>
                              {rule.basePrice > 0
                                ? `${((item.price / rule.basePrice) * 100).toFixed(1)}%`
                                : "-"}
                            </em>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <main className="nicepay-workspace">
        {isDepositMode && activeStep === 1 && (
          <section className="nicepay-stage deposit-only">
            <div className="nicepay-stage-heading">
              <div>
                <span>INTERNAL CHECK</span>
                <h2>입금 내역 대사</h2>
                <p>은행 입금액과 나이스페이 정산금액을 날짜별로 비교합니다.</p>
              </div>
              <GitCompareArrows size={34} />
            </div>
            <label className="nicepay-month-field">
              <span>검증 대상 월</span>
              <input type="month" value={depositMonth} onChange={(event) => setDepositMonth(event.target.value)} />
              <small>선택한 한 달만 처리합니다.</small>
            </label>
            <div className="nicepay-upload-grid deposit-grid">
              <UploadBox
                title="빠른계좌조회 입금 총내역"
                description="적요·입금일·입금액이 포함된 엑셀"
                file={bankFile}
                onFile={setBankFile}
              />
              {(["1m", "4m", "5m"] as CalendarMid[]).map((mid) => <UploadBox key={mid} title={`${mid} 정산달력`} description={`${mid} 날짜별 입금내역 스크린샷`} accept="image/png,image/jpeg,image/webp" file={calendarImages[mid]} onFile={(file) => setCalendarImages((previous) => ({ ...previous, [mid]: file }))} />)}
            </div>
            <div className="nicepay-action-row">
              <button
                className="primary"
                disabled={isProcessing}
                onClick={handleReconciliation}
              >
                <GitCompareArrows size={17} />{" "}
                {isProcessing ? "스크린샷 판독·분리 중..." : "입금 내역 분리 실행"}
              </button>
              {reconciliation.length > 0 && (
                <button onClick={exportReconciliation}>
                  <Download size={17} /> 날짜별 입금내역 엑셀
                </button>
              )}
            </div>
            {reconciliation.length > 0 && (
              <div className="nicepay-result-table">
                <div className="nicepay-result-summary">
                  <span>
                    생성 예정 시트 <b>{reconciliation.length}개</b>
                  </span>
                  <span>
                    선택 MID <b>1m · 4m · 5m</b>
                  </span>
                  <span className="danger">
                    확인 필요 <b>{reconciliation.filter((row) => row.status === "확인필요").length}일</b>
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>입금일</th>
                      <th>총입금</th>
                      <th>1m</th>
                      <th>4m</th>
                      <th>5m</th>
                      <th>선택 MID 합계</th>
                      <th>기타 MID</th>
                      <th>검증</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliation.slice(0, 50).map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{formatWon(row.bankAmount)}</td>
                        <td><input className="nicepay-amount-input" type="number" value={row.mid1Amount} onChange={(event) => updateDepositAmount(row.date, "1m", Number(event.target.value) || 0)} /></td>
                        <td><input className="nicepay-amount-input" type="number" value={row.mid4Amount} onChange={(event) => updateDepositAmount(row.date, "4m", Number(event.target.value) || 0)} /></td>
                        <td><input className="nicepay-amount-input" type="number" value={row.mid5Amount} onChange={(event) => updateDepositAmount(row.date, "5m", Number(event.target.value) || 0)} /></td>
                        <td>{formatWon(row.niceAmount)}</td>
                        <td className={row.difference < 0 ? "negative" : ""}>
                          {formatWon(row.difference)}
                        </td>
                        <td>
                          {row.status === "정상" ? (
                            <span className="status pass">
                              <CheckCircle2 size={13} /> 정상
                            </span>
                          ) : (
                            <span className="status fail">
                              <XCircle size={13} /> 확인
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!isDepositMode && activeStep === 2 && (
          <section className="nicepay-stage">
            <div className="nicepay-stage-heading">
              <div>
                <span>STEP 01</span>
                <h2>정산일별 품목 분류</h2>
                <p>
                  정산일 기준 상세내역을 키워드 규칙으로 상품군에 연결합니다.
                </p>
              </div>
              <PackageSearch size={34} />
            </div>
            <div className="nicepay-upload-grid">
              <UploadBox
                title="정산일 기준 상세내역"
                description="나이스페이에서 내려받은 정산 상세 파일"
                file={settlementFile}
                onFile={setSettlementFile}
              />
            </div>
            <div className="nicepay-action-row">
              <button
                className="primary"
                disabled={isProcessing}
                onClick={handleSettlementClassification}
              >
                <PackageSearch size={17} />{" "}
                {isProcessing ? "분류 중..." : "품목 자동 분류"}
              </button>
              {classifiedRows.length > 0 && (
                <button onClick={exportClassification}>
                  <Download size={17} /> 정산일별 엑셀
                </button>
              )}
            </div>
            {classifiedRows.length > 0 && (
              <div className="nicepay-category-grid">
                {classifiedSummary.slice(0, 12).map(([category, value]) => (
                  <article
                    key={category}
                    className={category === "미분류" ? "unmapped" : ""}
                  >
                    <span>{category}</span>
                    <strong>{formatWon(value.amount)}</strong>
                    <em>{value.count.toLocaleString()}건</em>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!isDepositMode && activeStep === 3 && (
          <section className="nicepay-stage">
            <div className="nicepay-stage-heading">
              <div>
                <span>STEP 02</span>
                <h2>알로 안분·수수료·부가세</h2>
                <p>
                  거래일 기준 상세내역에 상품별 안분 규칙을 적용하고 세무 내역을
                  만듭니다.
                </p>
              </div>
              <ReceiptText size={34} />
            </div>
            <div className="nicepay-allocation-alert">
              <Settings2 size={17} />
              <span>
                안분 합계가 100%인 상품만 세부 항목으로 나뉩니다. 미설정 상품은
                원분류에 100% 반영됩니다.
              </span>
              <button onClick={() => setSettingsOpen(true)}>
                안분 설정 열기
              </button>
            </div>
            <div className="nicepay-upload-grid">
              <UploadBox
                title="거래일 기준 상세내역"
                description="승인일·거래일이 포함된 나이스페이 상세 파일"
                file={transactionFile}
                onFile={setTransactionFile}
              />
            </div>
            <div className="nicepay-action-row">
              <button
                className="primary"
                disabled={isProcessing}
                onClick={handleAllocation}
              >
                <Split size={17} />{" "}
                {isProcessing ? "계산 중..." : "안분·부가세 계산"}
              </button>
              {allocatedRows.length > 0 && (
                <button onClick={exportAllocation}>
                  <Download size={17} /> 수수료·부가세 엑셀
                </button>
              )}
            </div>
            {allocatedRows.length > 0 && (
              <div className="nicepay-category-grid tax">
                {allocationSummary.slice(0, 12).map(([target, value]) => (
                  <article key={target}>
                    <span>{target}</span>
                    <strong>{formatWon(value.amount)}</strong>
                    <em>
                      매출VAT {formatWon(value.vat)} · 수수료{" "}
                      {formatWon(value.fee)}
                    </em>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {message && (
        <div className="nicepay-toast">
          <FileSpreadsheet size={16} /> {message}
        </div>
      )}
    </div>
  );
};

export default NicepaySettlement;
