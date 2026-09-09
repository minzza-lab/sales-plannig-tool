import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { exactProductNamesFromRule, groupProductNames, type ClassificationRule, type RawRow } from "./nicepayVatEngine";
import "./NicepayProductGrouping.css";

type Props = { rows: RawRow[]; rules: ClassificationRule[]; onAssignExactProducts: (names: string[], standardProductName: string) => void };

export default function NicepayProductGrouping({ rows, rules, onAssignExactProducts }: Props) {
  const groups = useMemo(() => groupProductNames(rows), [rows]);
  const assignments = useMemo(() => new Map(rules.flatMap((rule) => exactProductNamesFromRule(rule).map((name) => [name, rule.standardProductName]))), [rules]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [standardProductName, setStandardProductName] = useState("");
  const filtered = groups.filter((group) => group.names.join(" ").toLocaleLowerCase("ko-KR").includes(search.toLocaleLowerCase("ko-KR")));
  const toggle = (name: string, checked: boolean) => setSelected((current) => { const next = new Set(current); if (checked) next.add(name); else next.delete(name); return next; });
  const toggleGroup = (names: string[], checked: boolean) => setSelected((current) => { const next = new Set(current); names.forEach((name) => checked ? next.add(name) : next.delete(name)); return next; });
  const assign = () => { if (selected.size && standardProductName.trim()) { onAssignExactProducts([...selected], standardProductName.trim()); setSelected(new Set()); setStandardProductName(""); } };

  if (!rows.length) return <section className="vat-card"><h2>2. 실제 S열 상품명 · X열 지정</h2><p>먼저 파일 업로드에서 MID 대상 거래를 불러오세요.</p></section>;

  return <section className="vat-card product-grouping">
    <div className="vat-section-head"><div><h2>2. 실제 S열 상품명 · X열 지정</h2><p>실제 S열 상품명을 그대로 보여드립니다. 유사 표기는 제안 묶음으로 정리했지만, 서로 다른 묶음의 상품도 체크해서 같은 X열 상품명으로 합칠 수 있습니다.</p></div><b className="group-count">{groups.length.toLocaleString()}개 제안 묶음</b></div>
    <div className="exact-mapping-bar"><b>선택한 실제 상품명 <strong>{selected.size}개</strong></b><input value={standardProductName} onChange={(event) => setStandardProductName(event.target.value)} placeholder="X열에 넣을 표준 상품명" /><button disabled={!selected.size || !standardProductName.trim()} onClick={assign}><CheckCircle2 size={16} /> X열로 묶기</button></div>
    <label className="group-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="실제 S열 상품명으로 찾기" /></label>
    <div className="group-list">{filtered.slice(0, 300).map((group) => {
      const allSelected = group.names.length > 0 && group.names.every((name) => selected.has(name));
      return <article className="product-group exact-product-group" key={group.id}>
        <div className="product-group-source"><label className="select-group"><input type="checkbox" checked={allSelected} onChange={(event) => toggleGroup(group.names, event.target.checked)} /> 제안 묶음 전체 선택</label><b>{group.names[0]}</b><span>{group.count.toLocaleString()}건 · 실제 상품명 {group.names.length}개</span></div>
        <div className="actual-product-list">{group.names.map((name) => <label key={name}><input type="checkbox" checked={selected.has(name)} onChange={(event) => toggle(name, event.target.checked)} /><span>{name}</span>{assignments.get(name) && <em>현재 X: {assignments.get(name)}</em>}</label>)}</div>
      </article>;
    })}</div>
    {filtered.length > 300 && <small>처음 300개 제안 묶음만 표시합니다. 검색해서 실제 상품명을 찾을 수 있습니다.</small>}
  </section>;
}
