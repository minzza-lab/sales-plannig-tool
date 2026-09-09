import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { exactProductNamesFromRule, groupProductNames, type ClassificationRule, type ProductNameGroup, type RawRow } from "./nicepayVatEngine";
import "./NicepayProductGrouping.css";

type Props = { rows: RawRow[]; rules: ClassificationRule[]; onAssignExactProducts: (names: string[], standardProductName: string) => void };
type SelectionMap = Record<string, Set<string>>;

const NEW_PRODUCT_OPTION = "__new_product__";

export default function NicepayProductGrouping({ rows, rules, onAssignExactProducts }: Props) {
  const groups = useMemo(() => groupProductNames(rows), [rows]);
  const assignments = useMemo(() => new Map(rules.flatMap((rule) => exactProductNamesFromRule(rule).map((name) => [name, rule.standardProductName]))), [rules]);
  const standardProducts = useMemo(() => [...new Set(rules.map((rule) => rule.standardProductName.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")), [rules]);
  const [search, setSearch] = useState("");
  const [selectedByGroup, setSelectedByGroup] = useState<SelectionMap>({});
  const [selectedTargetByGroup, setSelectedTargetByGroup] = useState<Record<string, string>>({});
  const [newTargetByGroup, setNewTargetByGroup] = useState<Record<string, string>>({});
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const query = search.toLocaleLowerCase("ko-KR");
  const filtered = groups.filter((group) => `${group.prefix} ${group.names.join(" ")}`.toLocaleLowerCase("ko-KR").includes(query));
  const pendingGroups = filtered.filter((group) => !group.names.every((name) => assignments.has(name)));
  const completedGroups = filtered.filter((group) => group.names.every((name) => assignments.has(name)));

  const selectedNames = (group: ProductNameGroup) => selectedByGroup[group.id] || new Set(group.names);
  const setSelectedNames = (group: ProductNameGroup, names: Set<string>) => setSelectedByGroup((current) => ({ ...current, [group.id]: names }));
  const toggleName = (group: ProductNameGroup, name: string, checked: boolean) => {
    const next = new Set(selectedNames(group));
    if (checked) next.add(name); else next.delete(name);
    setSelectedNames(group, next);
  };
  const toggleGroup = (group: ProductNameGroup, checked: boolean) => setSelectedNames(group, checked ? new Set(group.names) : new Set());
  const assignedTarget = (group: ProductNameGroup) => {
    const values = [...new Set(group.names.map((name) => assignments.get(name)).filter(Boolean))] as string[];
    return values.length === 1 ? values[0] : "";
  };
  const selectedTarget = (group: ProductNameGroup) => selectedTargetByGroup[group.id] ?? assignedTarget(group);
  const assignGroup = (group: ProductNameGroup) => {
    const targetChoice = selectedTarget(group);
    const target = targetChoice === NEW_PRODUCT_OPTION ? newTargetByGroup[group.id]?.trim() : targetChoice.trim();
    const names = [...selectedNames(group)];
    if (target && names.length) onAssignExactProducts(names, target);
  };
  const renderGroup = (group: ProductNameGroup, completed: boolean) => {
    const names = selectedNames(group);
    const allSelected = names.size === group.names.length;
    const target = selectedTarget(group);
    const groupAssignments = [...new Set(group.names.map((name) => assignments.get(name)).filter(Boolean))];
    const canApply = names.size > 0 && (target === NEW_PRODUCT_OPTION ? Boolean(newTargetByGroup[group.id]?.trim()) : Boolean(target));
    return <article className={`product-group exact-product-group ${completed ? "is-complete" : ""}`} key={group.id}>
      <div className="product-group-source"><label className="select-group"><input type="checkbox" checked={allSelected} onChange={(event) => toggleGroup(group, event.target.checked)} /> 이 묶음 전체 선택</label><b>앞 5글자: {group.prefix}</b><span>{group.count.toLocaleString()}건 · 실제 상품명 {group.names.length}개</span>{completed && <em>분류완료: {groupAssignments.join(" / ")}</em>}</div>
      <div className="group-assignment"><label>X열 상품명<select value={target} onChange={(event) => setSelectedTargetByGroup((current) => ({ ...current, [group.id]: event.target.value }))}><option value="">X열 상품명 선택</option>{standardProducts.map((name) => <option key={name} value={name}>{name}</option>)}<option value={NEW_PRODUCT_OPTION}>새 X열 상품명 직접 입력</option></select></label>{target === NEW_PRODUCT_OPTION && <input value={newTargetByGroup[group.id] || ""} onChange={(event) => setNewTargetByGroup((current) => ({ ...current, [group.id]: event.target.value }))} placeholder="새 X열 상품명" />}<button disabled={!canApply} onClick={() => assignGroup(group)}><CheckCircle2 size={16} /> {completed ? "변경 적용" : "이 묶음 X열 지정"}</button></div>
      <details open={openGroupId === group.id} onToggle={(event) => setOpenGroupId(event.currentTarget.open ? group.id : null)}><summary>실제 S열 상품명 {group.names.length}개 개별 선택</summary><div className="actual-product-list">{group.names.map((name) => <label key={name}><input type="checkbox" checked={names.has(name)} onChange={(event) => toggleName(group, name, event.target.checked)} /><span>{name}</span>{assignments.get(name) && <em>현재 X: {assignments.get(name)}</em>}</label>)}</div></details>
    </article>;
  };

  if (!rows.length) return <section className="vat-card"><h2>2. 실제 S열 상품명 · X열 지정</h2><p>먼저 파일 업로드에서 MID 대상 거래를 불러오세요.</p></section>;

  return <section className="vat-card product-grouping">
    <div className="vat-section-head"><div><h2>2. 실제 S열 상품명 · X열 지정</h2><p>S열 상품명의 앞 5글자(공백 제외)가 같은 항목을 하나로 묶습니다. 묶음별로 X열 상품명을 한 번에 지정하고, 필요하면 아코디언에서 실제 상품명을 개별 선택하세요.</p></div><b className="group-count">대기 {pendingGroups.length.toLocaleString()}묶음 · 완료 {completedGroups.length.toLocaleString()}묶음</b></div>
    <label className="group-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="앞 5글자 또는 실제 S열 상품명으로 찾기" /></label>
    <section className="group-section"><h3>분류 대기 <span>{pendingGroups.length.toLocaleString()}묶음</span></h3><div className="group-list">{pendingGroups.slice(0, 300).map((group) => renderGroup(group, false))}</div>{pendingGroups.length > 300 && <small>처음 300개 묶음만 표시합니다. 검색해서 찾을 수 있습니다.</small>}</section>
    <details className="completed-groups"><summary>분류완료 <b>{completedGroups.length.toLocaleString()}묶음</b></summary><div className="group-list">{completedGroups.slice(0, 300).map((group) => renderGroup(group, true))}</div>{completedGroups.length > 300 && <small>처음 300개 묶음만 표시합니다. 검색해서 찾을 수 있습니다.</small>}</details>
  </section>;
}
