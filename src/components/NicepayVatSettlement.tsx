import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CheckCircle2, Download, FileSpreadsheet, Plus, Save, Trash2, UploadCloud, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { DEFAULT_CLASSIFICATION_RULES, DEFAULT_FACILITIES, DEFAULT_PACKAGE_COMPONENTS } from "./nicepayVatDefaults";
import { buildVatSettlementWorkbook } from "./nicepayVatWorkbook";
import NicepayProductGrouping from "./NicepayProductGrouping";
import { exactProductMappingDescription, exactProductNamesFromRule, isNicepayTargetMid, summarizeStandardProducts, type ClassificationRule, type Facility, type PackageComponent, type RawRow, processVatSettlement, valueByHeaders } from "./nicepayVatEngine";
import "./NicepayVatSettlement.css";

type Tab = "upload" | "group" | "summary" | "rules" | "components" | "facilities" | "classified" | "result" | "errors";
type ManualOverride = { standardProductName: string; packageName: string };
const newId = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const splitKeywords = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const toDateValue = (value: unknown) => value ? String(value).slice(0, 10) : "";

const detectHeaderRow = (sheet: XLSX.WorkSheet) => {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  let best = 0; let score = -1;
  for (let row = range.s.r; row <= Math.min(range.e.r, 30); row += 1) {
    const values = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => String(sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + index })]?.v ?? "").replace(/\s/g, ""));
    const next = ["상품명", "거래금액", "결제수수료", "정산일", "MID"].filter((term) => values.some((value) => value.includes(term))).length;
    if (next > score) { score = next; best = row; }
  }
  return best + 1;
};

type ParsedSheetRows = { rows: RawRow[]; sourceRowCount: number; excludedMidCount: number };

const parseSheetRows = (workbook: XLSX.WorkBook, sheetName: string, headerRow: number): ParsedSheetRows => {
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const headerIndex = headerRow - 1;
  const headers = Array.from({ length: range.e.c + 1 }, (_, column) => String(sheet[XLSX.utils.encode_cell({ r: headerIndex, c: column })]?.v ?? `열${column + 1}`).trim());
  const midHeader = headers.find((header) => header.replace(/[\n\r\s]/g, "").toUpperCase() === "MID");
  const identifiers = /승인번호|계좌번호|휴대폰번호|주문번호|TID|MID|원거래/i;
  const rows: RawRow[] = [];
  let sourceRowCount = 0;
  let excludedMidCount = 0;
  for (let row = headerIndex + 1; row <= range.e.r; row += 1) {
    const record: RawRow = {};
    let hasValue = false;
    headers.forEach((header, column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      const value = cell ? (identifiers.test(header) ? String(cell.w ?? cell.v ?? "") : cell.v ?? "") : "";
      record[header] = value;
      if (value !== "" && value !== undefined && value !== null) hasValue = true;
    });
    if (hasValue) {
      sourceRowCount += 1;
      if (midHeader && isNicepayTargetMid(record[midHeader])) {
        record.__sourceRowNumber = row + 1;
        rows.push(record);
      } else excludedMidCount += 1;
    }
  }
  return { rows, sourceRowCount, excludedMidCount };
};

const NicepayVatSettlement = () => {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("upload");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook>();
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(3);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [sourceRowCount, setSourceRowCount] = useState(0);
  const [excludedMidCount, setExcludedMidCount] = useState(0);
  const [rules, setRules] = useState<ClassificationRule[]>(DEFAULT_CLASSIFICATION_RULES);
  const [components, setComponents] = useState<PackageComponent[]>(DEFAULT_PACKAGE_COMPONENTS);
  const [facilities, setFacilities] = useState<Facility[]>(DEFAULT_FACILITIES);
  const [manualOverrides, setManualOverrides] = useState<Record<number, ManualOverride>>({});
  const [message, setMessage] = useState("기준 설정을 불러오는 중입니다.");
  const [settingsMode, setSettingsMode] = useState<"database" | "browser">("browser");
  const [includeSettings, setIncludeSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const stored = localStorage.getItem("nicepay_vat_step3_settings_v1");
      if (stored) try {
        const saved = JSON.parse(stored) as { rules: ClassificationRule[]; components: PackageComponent[]; facilities: Facility[] };
        if (saved.rules?.length) setRules(saved.rules);
        if (saved.components?.length) setComponents(saved.components);
        if (saved.facilities?.length) setFacilities(saved.facilities);
      } catch { /* defaults remain */ }
      const [rulesResult, componentsResult, facilitiesResult] = await Promise.all([
        supabase.from("nicepay_vat_classification_rules").select("*").order("priority"),
        supabase.from("nicepay_vat_package_components").select("*").order("package_name"),
        supabase.from("nicepay_vat_facilities").select("*").order("display_order"),
      ]);
      if (rulesResult.error || componentsResult.error || facilitiesResult.error) {
        setMessage("DB 설정표가 아직 없습니다. 기본 기준을 검토한 뒤 ‘설정 저장’을 눌러 초기화하세요. 원본 파일은 브라우저 밖으로 전송되지 않습니다.");
        return;
      }
      if (rulesResult.data?.length || componentsResult.data?.length || facilitiesResult.data?.length) {
        if (rulesResult.data?.length) setRules(rulesResult.data.map((item) => { const rule = { id: item.id, priority: item.priority, includeKeywords: item.include_keywords || [], excludeKeywords: item.exclude_keywords || [], standardProductName: item.standard_product_name, packageName: item.package_name, enabled: item.enabled, description: item.description || "" }; return { ...rule, exactProductNames: exactProductNamesFromRule(rule) }; }));
        if (componentsResult.data?.length) setComponents(componentsResult.data.map((item) => ({ id: item.id, packageName: item.package_name, facilityName: item.facility_name, baseAmount: Number(item.base_amount), startDate: toDateValue(item.start_date), endDate: toDateValue(item.end_date), enabled: item.enabled })));
        if (facilitiesResult.data?.length) setFacilities(facilitiesResult.data.map((item) => ({ id: item.id, name: item.name, excelColumn: item.excel_column, displayOrder: item.display_order, enabled: item.enabled })));
        setSettingsMode("database"); setMessage("공유 설정표를 불러왔습니다.");
      } else setMessage("DB 설정표가 비어 있습니다. 기준 파일에서 추출한 기본값을 검토한 뒤 저장하세요.");
    };
    void loadSettings();
  }, []);

  useEffect(() => { localStorage.setItem("nicepay_vat_step3_settings_v1", JSON.stringify({ rules, components, facilities })); }, [rules, components, facilities]);

  const effectiveRules = useMemo(() => [
    ...Object.entries(manualOverrides).map(([rowNumber, override]) => ({ id: `manual-${rowNumber}`, priority: -10000, includeKeywords: [String(valueByHeaders(rawRows.find((row) => Number(row.__sourceRowNumber) === Number(rowNumber)) || {}, ["원본 상품명", "상품명"]))], excludeKeywords: [], standardProductName: override.standardProductName, packageName: override.packageName, enabled: true, description: "사용자 수동 수정" })),
    ...rules,
  ], [manualOverrides, rawRows, rules]);
  const result = useMemo(() => processVatSettlement(rawRows, effectiveRules, components, facilities), [rawRows, effectiveRules, components, facilities]);
  const productAmountSummaries = useMemo(() => summarizeStandardProducts(result.rows), [result.rows]);
  const activeFacilities = useMemo(() => facilities.filter((item) => item.enabled).sort((a, b) => a.displayOrder - b.displayOrder), [facilities]);
  const componentsByPackage = useMemo(() => Array.from(new Set(components.map((item) => item.packageName))).sort((a, b) => a.localeCompare(b, "ko")), [components]);

  const loadFile = async (file: File) => {
    const nextWorkbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: true });
    const firstSheet = nextWorkbook.SheetNames[0] || "";
    setWorkbook(nextWorkbook); setFileName(file.name); setSheetName(firstSheet);
    const nextHeader = detectHeaderRow(nextWorkbook.Sheets[firstSheet]);
    const parsed = parseSheetRows(nextWorkbook, firstSheet, nextHeader);
    setHeaderRow(nextHeader); setRawRows(parsed.rows); setSourceRowCount(parsed.sourceRowCount); setExcludedMidCount(parsed.excludedMidCount); setManualOverrides({}); setTab("group");
    setMessage(`${file.name}에서 ${nextWorkbook.SheetNames.length}개 시트를 확인했습니다. ${nextHeader}행 헤더 기준으로 MID 1M·4M·5M ${parsed.rows.length.toLocaleString()}행만 불러왔습니다. (${parsed.excludedMidCount.toLocaleString()}행 제외)`);
  };
  const applySheet = () => { if (!workbook || !sheetName) return; const parsed = parseSheetRows(workbook, sheetName, headerRow); setRawRows(parsed.rows); setSourceRowCount(parsed.sourceRowCount); setExcludedMidCount(parsed.excludedMidCount); setManualOverrides({}); setMessage(`${sheetName} 시트 ${headerRow}행을 헤더로 적용했습니다. MID 1M·4M·5M ${parsed.rows.length.toLocaleString()}행만 반영합니다.`); };
  const saveSettings = async () => {
    setIsSaving(true);
    const toRule = (item: ClassificationRule) => ({ priority: item.priority, include_keywords: item.includeKeywords, exclude_keywords: item.excludeKeywords, standard_product_name: item.standardProductName, package_name: item.packageName, enabled: item.enabled, description: item.exactProductNames?.length ? exactProductMappingDescription(item.exactProductNames) : item.description });
    const toFacility = (item: Facility) => ({ name: item.name, excel_column: item.excelColumn, display_order: item.displayOrder, enabled: item.enabled });
    const toComponent = (item: PackageComponent) => ({ package_name: item.packageName, facility_name: item.facilityName, base_amount: item.baseAmount, start_date: item.startDate || null, end_date: item.endDate || null, enabled: item.enabled });
    const failed = await supabase.from("nicepay_vat_package_components").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (!failed.error) {
      await supabase.from("nicepay_vat_classification_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("nicepay_vat_facilities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const response = await supabase.from("nicepay_vat_facilities").insert(facilities.map(toFacility));
      if (!response.error) {
        const componentsResponse = components.length ? await supabase.from("nicepay_vat_package_components").insert(components.map(toComponent)) : { error: null };
        const rulesResponse = rules.length ? await supabase.from("nicepay_vat_classification_rules").insert(rules.map(toRule)) : { error: null };
        if (!componentsResponse.error && !rulesResponse.error) { setSettingsMode("database"); setMessage("상품 분류·PKG 구성·이용업장 설정을 DB에 저장했습니다."); setIsSaving(false); return; }
      }
    }
    setSettingsMode("browser"); setMessage("DB 저장에 실패했습니다. SQL 스키마 적용과 권한을 확인하세요. 현재 설정은 이 브라우저에 안전하게 보관됩니다."); setIsSaving(false);
  };
  const download = async () => {
    if (!rawRows.length) { setMessage("먼저 로우데이터를 업로드하세요."); return; }
    const ExcelJS = await import("exceljs"); const { saveAs } = await import("file-saver"); const output = new ExcelJS.Workbook();
    buildVatSettlementWorkbook(output, rawRows, result, rules, components, facilities, includeSettings);
    const buffer = await output.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${fileName.replace(/\.(xlsx|xlsm|xls)$/i, "")}_부가세정산_STEP3.xlsx`);
    setMessage(`검증 결과를 포함한 ${result.rows.length.toLocaleString()}건 Excel 파일을 생성했습니다.`);
  };

  const updateRule = (id: string, patch: Partial<ClassificationRule>) => setRules((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const assignExactProducts = (productNames: string[], standardProductName: string) => {
    const selected = new Set(productNames);
    const remainingRules = rules.flatMap((rule) => {
      const exactNames = exactProductNamesFromRule(rule);
      if (!exactNames.length) return [rule];
      const remaining = exactNames.filter((name) => !selected.has(name));
      return remaining.length ? [{ ...rule, exactProductNames: remaining, includeKeywords: remaining }] : [];
    });
    setRules([...remainingRules, { id: `exact-${Date.now()}`, priority: -2000, includeKeywords: productNames, excludeKeywords: [], exactProductNames: productNames, standardProductName, packageName: standardProductName, enabled: true, description: exactProductMappingDescription(productNames) }]);
    setMessage(`${productNames.length}개 실제 상품명을 X열 ‘${standardProductName}’으로 묶었습니다.`);
  };
  const updateComponent = (id: string, patch: Partial<PackageComponent>) => setComponents((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateFacility = (id: string, patch: Partial<Facility>) => setFacilities((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const tabs: Array<[Tab, string]> = [["upload", "파일 업로드"], ["group", "S열 묶음 · X열 지정"], ["summary", "상품별 금액 합계"], ["rules", "고급 규칙"], ["components", "PKG 구성 관리"], ["facilities", "이용업장 관리"], ["classified", "분류 결과"], ["result", "집계·배분 결과"], ["errors", "오류·미분류"]];

  return <div className="vat-step3">
    <header className="vat-hero"><div><span>NICEPAY VAT SETTLEMENT · STEP 3</span><h1>상품 분류·수수료 배분</h1><p>원본 거래 파일은 이 브라우저 안에서만 계산하고 저장하지 않습니다.</p></div><button onClick={() => void saveSettings()} disabled={isSaving}><Save size={17} /> {isSaving ? "저장 중" : "설정 저장"}</button></header>
    <div className="vat-notice"><b>{settingsMode === "database" ? "공유 DB 설정 사용" : "브라우저 임시 설정"}</b><span>{message}</span></div>
    <nav className="vat-tabs">{tabs.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>

    {tab === "upload" && <section className="vat-card"><h2>1. 로우데이터 업로드</h2><p>원본 파일은 수정하지 않습니다. 업로드 뒤 시트와 헤더 행을 변경해 전체 행을 다시 읽을 수 있습니다. <b>MID 1M·4M·5M 외의 거래는 분류·집계·Excel 출력에서 제외됩니다.</b></p><label className="vat-dropzone"><UploadCloud size={30} /><b>{fileName || "나이스페이 상세 거래일 파일 선택"}</b><small>.xls, .xlsx, .xlsm 지원</small><input ref={uploadRef} type="file" accept=".xls,.xlsx,.xlsm" onChange={(event) => event.target.files?.[0] && void loadFile(event.target.files[0])} /></label>{workbook && <div className="vat-upload-options"><label>시트<select value={sheetName} onChange={(event) => setSheetName(event.target.value)}>{workbook.SheetNames.map((name) => <option key={name}>{name}</option>)}</select></label><label>헤더 행<input type="number" min="1" value={headerRow} onChange={(event) => setHeaderRow(Number(event.target.value) || 1)} /></label><button onClick={applySheet}>적용</button></div>}{sourceRowCount > 0 && <><div className="vat-kpis"><b>원본 데이터 행 <strong>{sourceRowCount.toLocaleString()}</strong></b><b>MID 대상 행 <strong>{result.report.inputCount.toLocaleString()}</strong></b><b>MID 제외 <strong>{excludedMidCount.toLocaleString()}</strong></b><b>미분류 <strong className={result.report.unclassifiedCount ? "bad" : ""}>{result.report.unclassifiedCount.toLocaleString()}</strong></b></div>{rawRows.length > 0 && <div className="vat-preview"><table><thead><tr>{Object.keys(rawRows[0]).filter((header) => !header.startsWith("__")).slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rawRows.slice(0, 8).map((row, index) => <tr key={index}>{Object.keys(rawRows[0]).filter((header) => !header.startsWith("__")).slice(0, 8).map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div>}</>}</section>}

    {tab === "group" && <NicepayProductGrouping rows={rawRows} rules={rules} onAssignExactProducts={assignExactProducts} />}

    {tab === "summary" && <section className="vat-card"><div className="vat-section-head"><div><h2>3. 키워드별 상품 금액 합계</h2><p>S열 상품명을 X열 표준 상품명으로 묶은 뒤, 거래금액·수수료·VAT·수수료계·실입금액을 합산합니다.</p></div><b className="group-count">{productAmountSummaries.length.toLocaleString()}개 상품</b></div>{productAmountSummaries.length ? <div className="vat-table-scroll"><table><thead><tr><th>분류 키워드</th><th>X열 표준 상품명</th><th>거래 건수</th><th>거래금액</th><th>결제수수료</th><th>VAT</th><th>수수료계</th><th>실입금액</th></tr></thead><tbody>{productAmountSummaries.map((item) => <tr key={item.standardProductName} className={item.standardProductName === "미분류" ? "error-row" : ""}><td>{item.keywords}</td><td>{item.standardProductName}</td><td>{item.transactionCount.toLocaleString()}</td><td>{won(item.transactionAmount)}</td><td>{won(item.paymentFee)}</td><td>{won(item.vat)}</td><td>{won(item.feeTotal)}</td><td>{won(item.settlementAmount)}</td></tr>)}<tr><td>합계</td><td>-</td><td>{productAmountSummaries.reduce((sum, item) => sum + item.transactionCount, 0).toLocaleString()}</td><td>{won(productAmountSummaries.reduce((sum, item) => sum + item.transactionAmount, 0))}</td><td>{won(productAmountSummaries.reduce((sum, item) => sum + item.paymentFee, 0))}</td><td>{won(productAmountSummaries.reduce((sum, item) => sum + item.vat, 0))}</td><td>{won(productAmountSummaries.reduce((sum, item) => sum + item.feeTotal, 0))}</td><td>{won(productAmountSummaries.reduce((sum, item) => sum + item.settlementAmount, 0))}</td></tr></tbody></table></div> : <p>먼저 S열 묶음에서 X열 표준 상품명을 지정하세요.</p>}</section>}

    {tab === "rules" && <section className="vat-card"><div className="vat-section-head"><div><h2>2. 상품 분류 기준</h2><p>작은 우선순위부터 적용됩니다. 포함 키워드는 모두 포함되어야 하고, 제외 키워드가 하나라도 있으면 제외됩니다.</p></div><button onClick={() => setRules((items) => [...items, { id: newId(), priority: (Math.max(0, ...items.map((item) => item.priority)) + 1), includeKeywords: [], excludeKeywords: [], standardProductName: "", packageName: "", enabled: true, description: "" }])}><Plus size={16} /> 규칙 추가</button></div><div className="vat-grid-table rules"><div className="row header"><span>우선순위</span><span>포함 키워드</span><span>제외 키워드</span><span>표준 상품명</span><span>PKG 분류명</span><span>사용</span><span>설명</span><span /></div>{rules.sort((a, b) => a.priority - b.priority).map((rule) => <div className="row" key={rule.id}><input type="number" value={rule.priority} onChange={(event) => updateRule(rule.id, { priority: Number(event.target.value) || 0 })} /><input value={rule.includeKeywords.join(", ")} onChange={(event) => updateRule(rule.id, { includeKeywords: splitKeywords(event.target.value) })} placeholder="워터, 조식" /><input value={rule.excludeKeywords.join(", ")} onChange={(event) => updateRule(rule.id, { excludeKeywords: splitKeywords(event.target.value) })} /><input value={rule.standardProductName} onChange={(event) => updateRule(rule.id, { standardProductName: event.target.value })} /><input value={rule.packageName} onChange={(event) => updateRule(rule.id, { packageName: event.target.value })} /><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} /><input value={rule.description} onChange={(event) => updateRule(rule.id, { description: event.target.value })} /><button className="icon-danger" onClick={() => setRules((items) => items.filter((item) => item.id !== rule.id))}><Trash2 size={16} /></button></div>)}</div></section>}

    {tab === "components" && <section className="vat-card"><div className="vat-section-head"><div><h2>3. PKG 구성 관리</h2><p>각 PKG의 구성 기준금액 합계를 분모로 배분율을 자동 계산합니다. 기준금액이 0원이거나 이용업장 출력 열이 없으면 배분이 차단됩니다.</p></div><button onClick={() => setComponents((items) => [...items, { id: newId(), packageName: "", facilityName: activeFacilities[0]?.name || "", baseAmount: 0, enabled: true }])}><Plus size={16} /> 구성 추가</button></div>{componentsByPackage.map((packageName) => { const group = components.filter((item) => item.packageName === packageName); const total = group.filter((item) => item.enabled).reduce((sum, item) => sum + item.baseAmount, 0); return <details className="vat-package" key={packageName} open><summary><b>{packageName || "PKG명 미입력"}</b><span className={total > 0 ? "valid" : "invalid"}>배분율 {total > 0 ? "100.000000%" : "기준금액 필요"}</span></summary><div className="vat-grid-table components"><div className="row header"><span>PKG명</span><span>이용업장</span><span>구성 기준금액</span><span>자동 배분율</span><span>시작일</span><span>종료일</span><span>사용</span><span /></div>{group.map((item) => <div className="row" key={item.id}><input value={item.packageName} onChange={(event) => updateComponent(item.id, { packageName: event.target.value })} /><select value={item.facilityName} onChange={(event) => updateComponent(item.id, { facilityName: event.target.value })}>{activeFacilities.map((facility) => <option key={facility.id}>{facility.name}</option>)}</select><input type="number" value={item.baseAmount} onChange={(event) => updateComponent(item.id, { baseAmount: Number(event.target.value) || 0 })} /><output>{total ? `${((item.baseAmount / total) * 100).toFixed(6)}%` : "-"}</output><input type="date" value={item.startDate || ""} onChange={(event) => updateComponent(item.id, { startDate: event.target.value })} /><input type="date" value={item.endDate || ""} onChange={(event) => updateComponent(item.id, { endDate: event.target.value })} /><input type="checkbox" checked={item.enabled} onChange={(event) => updateComponent(item.id, { enabled: event.target.checked })} /><button className="icon-danger" onClick={() => setComponents((items) => items.filter((other) => other.id !== item.id))}><Trash2 size={16} /></button></div>)}</div></details>; })}</section>}

    {tab === "facilities" && <section className="vat-card"><div className="vat-section-head"><div><h2>4. 이용업장 관리</h2><p>기준 시트의 AE:BJ 출력 열을 분석해 기본값으로 등록했습니다. 이 화면에서 순서·열·사용 여부를 관리합니다.</p></div><button onClick={() => setFacilities((items) => [...items, { id: newId(), name: "", excelColumn: "", displayOrder: items.length + 1, enabled: true }])}><Plus size={16} /> 업장 추가</button></div><div className="vat-grid-table facilities"><div className="row header"><span>이용업장명</span><span>Excel 출력 열</span><span>표시 순서</span><span>사용</span><span /></div>{facilities.sort((a, b) => a.displayOrder - b.displayOrder).map((facility) => <div className="row" key={facility.id}><input value={facility.name} onChange={(event) => updateFacility(facility.id, { name: event.target.value })} /><input value={facility.excelColumn} maxLength={3} onChange={(event) => updateFacility(facility.id, { excelColumn: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /><input type="number" value={facility.displayOrder} onChange={(event) => updateFacility(facility.id, { displayOrder: Number(event.target.value) || 0 })} /><input type="checkbox" checked={facility.enabled} onChange={(event) => updateFacility(facility.id, { enabled: event.target.checked })} /><button className="icon-danger" onClick={() => setFacilities((items) => items.filter((item) => item.id !== facility.id))}><Trash2 size={16} /></button></div>)}</div></section>}

    {tab === "classified" && <section className="vat-card"><h2>5. 분류 결과</h2><p>미분류이거나 오분류된 행은 표준 상품명과 PKG 분류명을 직접 고쳐 즉시 재계산할 수 있습니다.</p><div className="vat-table-scroll"><table><thead><tr><th>행</th><th>원본 상품명</th><th>적용 키워드</th><th>표준 상품명</th><th>PKG 분류명</th><th>수수료계</th><th>상태</th></tr></thead><tbody>{result.rows.slice(0, 500).map((row) => { const override = manualOverrides[row.rowNumber] || { standardProductName: row.standardProductName, packageName: row.packageName }; return <tr key={row.rowNumber} className={row.classificationStatus === "미분류" ? "error-row" : ""}><td>{row.rowNumber}</td><td>{row.productName}</td><td>{row.appliedKeywords || "-"}</td><td><input value={override.standardProductName} onChange={(event) => setManualOverrides((items) => ({ ...items, [row.rowNumber]: { ...override, standardProductName: event.target.value } }))} /></td><td><input value={override.packageName} onChange={(event) => setManualOverrides((items) => ({ ...items, [row.rowNumber]: { ...override, packageName: event.target.value } }))} /></td><td>{won(row.feeTotal)}</td><td>{row.classificationStatus}</td></tr>; })}</tbody></table></div>{result.rows.length > 500 && <small>화면에는 처음 500행만 표시합니다. 내려받는 Excel에는 전체 {result.rows.length.toLocaleString()}행이 포함됩니다.</small>}</section>}

    {tab === "result" && <section className="vat-card"><div className="vat-section-head"><div><h2>6. 집계 및 배분 결과</h2><p>각 PKG의 마지막 이용업장에 반올림 차액을 반영해 배분 합계가 원 수수료와 반드시 일치합니다.</p></div><button className="download" onClick={() => void download()}><Download size={17} /> Excel 다운로드</button></div><label className="vat-checkbox"><input type="checkbox" checked={includeSettings} onChange={(event) => setIncludeSettings(event.target.checked)} /> 설정표 시트를 결과 Excel에 포함</label><div className="vat-kpis"><b>배분 전 <strong>{won(result.report.feeBeforeAllocation)}</strong></b><b>배분 후 <strong>{won(result.report.feeAfterAllocation)}</strong></b><b>차이 발생 <strong className={result.report.allocationDifferenceCount ? "bad" : ""}>{result.report.allocationDifferenceCount}건</strong></b><b>기준 없는 PKG <strong className={result.report.missingAllocationPackageCount ? "bad" : ""}>{result.report.missingAllocationPackageCount}건</strong></b></div><div className="vat-table-scroll"><table><thead><tr><th>PKG명</th><th>거래</th><th>승인</th><th>취소</th><th>수수료계</th>{activeFacilities.map((item) => <th key={item.id}>{item.name}</th>)}<th>배분 합계</th><th>차이</th><th>검증</th></tr></thead><tbody>{result.summaries.map((summary) => { const allocation = Object.fromEntries(summary.allocations.map((item) => [item.facilityName, item.allocatedFee])); return <tr key={summary.key} className={summary.validation === "오류" ? "error-row" : ""}><td>{summary.packageName}</td><td>{summary.transactionCount}</td><td>{summary.approvedCount}</td><td>{summary.cancelledCount}</td><td>{won(summary.feeTotal)}</td>{activeFacilities.map((facility) => <td key={facility.id}>{allocation[facility.name] ? won(allocation[facility.name]) : "-"}</td>)}<td>{won(summary.allocatedTotal)}</td><td>{won(summary.difference)}</td><td>{summary.validation}</td></tr>; })}</tbody></table></div></section>}

    {tab === "errors" && <section className="vat-card"><h2>7. 오류 및 미분류</h2><div className="vat-error-list">{result.unclassified.length === 0 && result.errors.length === 0 ? <p className="ok"><CheckCircle2 size={18} /> 미분류·배분 오류가 없습니다.</p> : <>{result.unclassified.map((item) => <p key={item.rowNumber}><XCircle size={16} /><b>미분류</b> {item.productName} <small>원본 {item.rowNumber}행 · {won(item.feeTotal)}</small></p>)}{result.errors.map((error) => <p key={error}><XCircle size={16} /><b>배분 오류</b> {error}</p>)}</>}</div><div className="vat-download-bottom"><FileSpreadsheet size={20} /><span>정상 항목은 배분 차이 0원으로 검증됩니다.</span><button onClick={() => void download()}>결과 Excel 생성</button></div></section>}
  </div>;
};

export default NicepayVatSettlement;
