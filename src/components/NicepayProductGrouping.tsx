import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { groupProductNames, type ClassificationRule, type RawRow } from "./nicepayVatEngine";
import "./NicepayProductGrouping.css";

type Draft = { keywords: string; standardProductName: string };
type Props = { rows: RawRow[]; rules: ClassificationRule[]; onUpsertRule: (rule: ClassificationRule) => void };
const ruleIdFor = (groupId: string) => `s-group-${groupId.replace(/[^a-z0-9가-힣]/gi, "-").slice(0, 90)}`;

export default function NicepayProductGrouping({ rows, rules, onUpsertRule }: Props) {
  const groups = useMemo(() => groupProductNames(rows), [rows]);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const filtered = groups.filter((group) => group.names.join(" ").toLocaleLowerCase("ko-KR").includes(search.toLocaleLowerCase("ko-KR")));
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { keywords: current[id]?.keywords ?? "", standardProductName: current[id]?.standardProductName ?? "", ...patch } }));

  if (!rows.length) return <section className="vat-card"><h2>2. S열 상품명 묶음 · X열 지정</h2><p>먼저 파일 업로드에서 MID 대상 거래를 불러오세요.</p></section>;

  return <section className="vat-card product-grouping">
    <div className="vat-section-head"><div><h2>2. S열 상품명 묶음 · X열 지정</h2><p>중복 및 표기만 조금 다른 상품명을 묶었습니다. 묶음을 확인한 뒤, 직접 키워드와 X열에 넣을 표준 상품명을 지정하세요.</p></div><b className="group-count">{groups.length.toLocaleString()}개 묶음</b></div>
    <label className="group-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="S열 상품명으로 묶음 찾기" /></label>
    <div className="group-list">{filtered.slice(0, 300).map((group) => {
      const id = ruleIdFor(group.id);
      const existing = rules.find((rule) => rule.id === id);
      const keywords = drafts[group.id]?.keywords ?? existing?.includeKeywords.join(", ") ?? group.suggestedKeywords.join(", ");
      const standardProductName = drafts[group.id]?.standardProductName ?? existing?.standardProductName ?? "";
      const save = () => {
        const splitKeywords = keywords.split(",").map((item) => item.trim()).filter(Boolean);
        if (!splitKeywords.length || !standardProductName.trim()) return;
        onUpsertRule({ id, priority: -1000, includeKeywords: splitKeywords, excludeKeywords: [], standardProductName: standardProductName.trim(), packageName: standardProductName.trim(), enabled: true, description: `[S_GROUP:${group.id}] ${group.names.join(" | ")}` });
      };
      return <article className="product-group" key={group.id}><div className="product-group-source"><div><b>{group.names[0]}</b><span>{group.count.toLocaleString()}건 · S열 상품명 {group.names.length}개</span></div><details><summary>묶인 상품명 보기</summary><ul>{group.names.map((name) => <li key={name}>{name}</li>)}</ul></details></div><label>분류 키워드<input value={keywords} onChange={(event) => setDraft(group.id, { keywords: event.target.value, standardProductName })} placeholder="예: 워터, 조식" /></label><label>X열 표준 상품명<input value={standardProductName} onChange={(event) => setDraft(group.id, { keywords, standardProductName: event.target.value })} placeholder="예: 워터조식" /></label><button className={existing ? "group-saved" : ""} onClick={save}>{existing ? <><CheckCircle2 size={16} /> 변경 저장</> : "X열 적용"}</button></article>;
    })}</div>
    {filtered.length > 300 && <small>처음 300개 묶음만 표시합니다. 검색해서 원하는 상품명을 찾을 수 있습니다.</small>}
  </section>;
}
