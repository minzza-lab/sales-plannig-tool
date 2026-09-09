import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Facility, PackageComponent } from "./nicepayVatEngine";
import "./NicepayAllocationSetup.css";

type Props = {
  productNames: string[];
  facilities: Facility[];
  components: PackageComponent[];
  onAdd: (component: PackageComponent) => void;
  onUpdate: (id: string, patch: Partial<PackageComponent>) => void;
  onRemove: (id: string) => void;
};

export default function NicepayAllocationSetup({ productNames, facilities, components, onAdd, onUpdate, onRemove }: Props) {
  const options = useMemo(() => {
    const mappedProducts = productNames.filter((name) => name && name !== "미분류");
    const names = mappedProducts.length ? mappedProducts : components.map((item) => item.packageName).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
  }, [productNames, components]);
  const [selectedProduct, setSelectedProduct] = useState("");
  useEffect(() => { if (!options.includes(selectedProduct)) setSelectedProduct(options[0] || ""); }, [options, selectedProduct]);
  const rows = components.filter((item) => item.packageName === selectedProduct).sort((a, b) => a.facilityName.localeCompare(b.facilityName, "ko"));
  const total = rows.filter((item) => item.enabled).reduce((sum, item) => sum + item.baseAmount, 0);
  const add = () => {
    if (!selectedProduct) return;
    const used = new Set(rows.map((item) => item.facilityName));
    const facility = facilities.find((item) => !used.has(item.name));
    if (!facility) return;
    onAdd({ id: globalThis.crypto?.randomUUID?.() || `component-${Date.now()}`, packageName: selectedProduct, facilityName: facility.name, baseAmount: 0, enabled: true });
  };

  return <section className="vat-card allocation-setup">
    <div className="vat-section-head"><div><h2>4. 업장별 구성금액 · 수수료 배분</h2><p>X열 상품명을 선택한 뒤, 정해진 업장 목록에서 구성 업장과 금액만 넣으세요. 배분율과 수수료 배분금액은 자동 계산됩니다.</p></div></div>
    {!options.length ? <p>먼저 ‘실제 S열 상품명 · X열 지정’에서 X열 상품명을 만들어 주세요.</p> : <><div className="allocation-product-select"><label>X열 상품명<select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}>{options.map((name) => <option key={name}>{name}</option>)}</select></label><button onClick={add} disabled={rows.length >= facilities.length}><Plus size={16} /> 구성 업장 추가</button></div>
      <div className="allocation-table"><div className="allocation-row header"><span>이용업장</span><span>구성금액</span><span>배분율</span><span /></div>{rows.map((item) => { const usedByOther = new Set(rows.filter((other) => other.id !== item.id).map((other) => other.facilityName)); return <div className="allocation-row" key={item.id}><select value={item.facilityName} onChange={(event) => onUpdate(item.id, { facilityName: event.target.value })}>{facilities.map((facility) => <option key={facility.id} disabled={usedByOther.has(facility.name)}>{facility.name}</option>)}</select><label><input type="number" min="0" value={item.baseAmount || ""} onChange={(event) => onUpdate(item.id, { baseAmount: Number(event.target.value) || 0 })} />원</label><output>{total > 0 ? `${Math.round((item.baseAmount / total) * 100)}%` : "-"}</output><button className="icon-danger" onClick={() => onRemove(item.id)}><Trash2 size={16} /></button></div>; })}</div>
      <div className="allocation-total"><b>구성금액 합계</b><strong>{Math.round(total).toLocaleString("ko-KR")}원</strong><span>표시 비율은 원 단위 반올림이며, 실제 수수료 배분은 정확한 구성금액 비율로 계산합니다.</span></div>
    </>}</section>;
}
