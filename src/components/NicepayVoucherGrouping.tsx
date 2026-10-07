import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import type { ProductAmountSummary } from "./nicepayVatEngine.ts";
import type { VoucherGroup } from "./nicepayVatVoucherSheet.ts";
import "./NicepayVoucherGrouping.css";

type Props = {
  groups: VoucherGroup[];
  products: ProductAmountSummary[];
  onChange: (groups: VoucherGroup[]) => void;
  onSave: () => void;
  saving: boolean;
};

const makeId = () => globalThis.crypto?.randomUUID?.() || `voucher-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function NicepayVoucherGrouping({ groups, products, onChange, onSave, saving }: Props) {
  const sorted = [...groups].sort((a, b) => a.displayOrder - b.displayOrder);
  const assigned = new Map(groups.flatMap((group) => group.productNames.map((name) => [name, group.id] as const)));
  const setProductGroup = (productName: string, groupId: string) => onChange(groups.map((group) => ({
    ...group,
    productNames: group.id === groupId
      ? [...new Set([...group.productNames, productName])]
      : group.productNames.filter((name) => name !== productName),
  })));
  const move = (id: string, direction: -1 | 1) => {
    const index = sorted.findIndex((group) => group.id === id);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= sorted.length) return;
    [sorted[index], sorted[other]] = [sorted[other], sorted[index]];
    onChange(sorted.map((group, order) => ({ ...group, displayOrder: order + 1 })));
  };
  return <section className="vat-card vat-voucher-grouping">
    <div className="vat-section-head"><div><h2>전표제출용 구분 설정</h2><p>상품별로 AN·AO열에 표시할 구분을 지정하세요. 같은 구분에 지정한 상품은 제출용 시트에서 연달아 배치되고 구분 셀이 병합됩니다.</p></div><button className="download" onClick={onSave} disabled={saving}><Save size={16} /> {saving ? "저장 중" : "공유 설정 저장"}</button></div>
    <div className="vat-voucher-group-head"><b>구분 이름과 순서</b><button onClick={() => onChange([...groups, { id: makeId(), name: "", productNames: [], displayOrder: groups.length + 1 }])}><Plus size={16} /> 구분 추가</button></div>
    <div className="vat-voucher-group-list">{sorted.map((group, index) => <div className="vat-voucher-group-row" key={group.id}>
      <span className="order">{index + 1}</span>
      <input aria-label={`${index + 1}번째 구분 이름`} value={group.name} placeholder="예: 워터파크" onChange={(event) => onChange(groups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))} />
      <small>{products.filter((product) => group.productNames.includes(product.standardProductName)).length}개 상품</small>
      <button aria-label={`${group.name || "구분"} 위로`} disabled={index === 0} onClick={() => move(group.id, -1)}><ArrowUp size={15} /></button>
      <button aria-label={`${group.name || "구분"} 아래로`} disabled={index === sorted.length - 1} onClick={() => move(group.id, 1)}><ArrowDown size={15} /></button>
      <button className="icon-danger" aria-label={`${group.name || "구분"} 삭제`} onClick={() => onChange(groups.filter((item) => item.id !== group.id))}><Trash2 size={15} /></button>
    </div>)}</div>
    <div className="vat-voucher-group-head"><b>수집된 표준 상품별 구분</b><small>지정하지 않은 상품은 상품명으로 별도 행에 표시됩니다.</small></div>
    {products.length ? <div className="vat-table-scroll"><table><thead><tr><th>표준 상품명</th><th>거래 건수</th><th>전표제출용 구분</th></tr></thead><tbody>{products.map((product) => <tr key={product.standardProductName}>
      <td>{product.standardProductName}</td><td>{product.transactionCount.toLocaleString("ko-KR")}</td><td><select value={assigned.get(product.standardProductName) || ""} onChange={(event) => setProductGroup(product.standardProductName, event.target.value)}><option value="">별도 행</option>{sorted.map((group) => <option key={group.id} value={group.id}>{group.name || "이름 없는 구분"}</option>)}</select></td>
    </tr>)}</tbody></table></div> : <p>먼저 원본 파일을 올리고 상품 분류를 완료하면 표준 상품 목록이 나타납니다.</p>}
    <small className="vat-voucher-group-note">변경 내용은 이 브라우저에 자동 보관됩니다. 다른 기기에서도 사용하려면 ‘공유 설정 저장’을 눌러 주세요.</small>
  </section>;
}
