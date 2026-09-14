import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { groupProductSummariesByMajorCategory, type MajorCategory, type ProductAmountSummary } from "./nicepayVatEngine";

type Props = {
  summaries: ProductAmountSummary[];
  categories: MajorCategory[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<MajorCategory>) => void;
  onRemove: (id: string) => void;
  onToggleProduct: (categoryId: string, productName: string, selected: boolean) => void;
  printControls: ReactNode;
};

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

const NicepayProductSummary = ({ summaries, categories, onAdd, onUpdate, onRemove, onToggleProduct, printControls }: Props) => {
  const groups = groupProductSummariesByMajorCategory(summaries, categories);
  const selectableProducts = summaries.filter((item) => item.standardProductName !== "미분류");
  const total = (key: keyof ProductAmountSummary) => summaries.reduce((sum, item) => sum + Number(item[key] || 0), 0);

  return <section className="vat-card"><div className="vat-section-head"><div><h2>3. 키워드별 상품 금액 합계</h2><p>X열 표준 상품을 대분류로 묶을 수 있습니다. 대분류를 지정하지 않은 상품은 왼쪽 두 칸을 병합해 단독 상품으로 표시합니다.</p></div><b className="group-count">{summaries.length.toLocaleString()}개 상품</b></div>
    <section className="vat-major-category"><div className="vat-section-head"><div><h3>대분류 관리</h3><p>대분류명을 만들고 포함할 X열 상품을 선택하세요. 한 상품은 하나의 대분류에만 넣을 수 있습니다.</p></div><button onClick={onAdd}><Plus size={16} /> 대분류 추가</button></div>
      {categories.length === 0 ? <p className="vat-major-category-empty">아직 대분류가 없습니다. 예: 워터파크에 워터플래닛입장권·웰팍코인·선베드·카바나를 선택하세요.</p> : <div className="vat-major-category-list">{[...categories].sort((a, b) => a.displayOrder - b.displayOrder).map((category) => <details className="vat-major-category-item" key={category.id} open><summary><b>{category.name || "대분류명 입력"}</b><span>{category.productNames.length}개 상품 · {won(summaries.filter((item) => category.productNames.includes(item.standardProductName)).reduce((sum, item) => sum + item.transactionAmount, 0))}</span></summary><div className="vat-major-category-body"><label>대분류명<input value={category.name} placeholder="예: 워터파크" onChange={(event) => onUpdate(category.id, { name: event.target.value })} /></label><div className="vat-major-product-options">{selectableProducts.map((item) => <label key={item.standardProductName}><input type="checkbox" checked={category.productNames.includes(item.standardProductName)} onChange={(event) => onToggleProduct(category.id, item.standardProductName, event.target.checked)} /> <span>{item.standardProductName}</span><small>{won(item.transactionAmount)}</small></label>)}</div><button className="icon-danger" onClick={() => onRemove(category.id)}><Trash2 size={16} /> 대분류 삭제</button></div></details>)}</div>}
    </section>
    {printControls}
    <div className="vat-table-scroll vat-major-summary-table"><table><thead><tr><th>대분류</th><th>X열 표준 상품명</th><th>거래금액 합계</th><th>분류 키워드</th><th>거래 건수</th><th>거래금액</th><th>결제수수료</th><th>VAT</th><th>수수료계</th><th>실입금액</th></tr></thead><tbody>{groups.flatMap((group) => group.items.map((item, index) => <tr key={`${group.key}-${item.standardProductName}`} className={item.standardProductName === "미분류" ? "error-row" : ""}>{group.kind === "major" && index === 0 && <td rowSpan={group.items.length}>{group.name}</td>}{group.kind === "single" ? <td colSpan={2}>{item.standardProductName}</td> : <td>{item.standardProductName}</td>}{group.kind === "major" && index === 0 && <td className="number" rowSpan={group.items.length}>{won(group.transactionAmount)}</td>}{group.kind === "single" && <td className="number">{won(item.transactionAmount)}</td>}<td>{item.keywords}</td><td className="number">{item.transactionCount.toLocaleString()}</td><td className="number">{won(item.transactionAmount)}</td><td className="number">{won(item.paymentFee)}</td><td className="number">{won(item.vat)}</td><td className="number">{won(item.feeTotal)}</td><td className="number">{won(item.settlementAmount)}</td></tr>))}<tr><td colSpan={3}>합계</td><td>-</td><td className="number">{total("transactionCount").toLocaleString()}</td><td className="number">{won(total("transactionAmount"))}</td><td className="number">{won(total("paymentFee"))}</td><td className="number">{won(total("vat"))}</td><td className="number">{won(total("feeTotal"))}</td><td className="number">{won(total("settlementAmount"))}</td></tr></tbody></table></div>
  </section>;
};

export default NicepayProductSummary;
