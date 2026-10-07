import { FileSpreadsheet, Landmark, ListChecks } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import './NaverSettlement.css'

const sourceItems = [
  { icon: FileSpreadsheet, title: '네이버 정산내역', description: '정산 기간 한 달치 엑셀 원본' },
  { icon: Landmark, title: '입금전표·계좌 입금내역', description: '같은 기간의 실제 입금액을 확인할 수 있는 파일' },
  { icon: ListChecks, title: '완성한 결과 예시', description: '현재 수작업으로 제출하는 엑셀 또는 전표 양식' },
]

export default function NaverSettlement() {
  const [searchParams] = useSearchParams()
  const step = searchParams.get('step') === '2' ? 2 : searchParams.get('step') === '3' ? 3 : 1
  const stepTitles = ['입금 내역 검증', '정산내역 시트 분리', '부가세 정산']
  return <main className="naver-settlement">
    <header className="naver-settlement-hero">
      <span>NAVER SETTLEMENT</span>
      <h1>네이버 정산</h1>
      <p>정산내역과 입금전표를 대조하는 작업을 준비하고 있습니다. 실제 파일의 금액 기준을 확인한 뒤 자동 계산 기능을 연결합니다.</p>
    </header>
    <nav className="naver-settlement-steps" aria-label="네이버 정산 단계">
      {stepTitles.map((title, index) => <Link key={title} to={`/tools/naver-settlement?step=${index + 1}`} className={step === index + 1 ? 'active' : ''} aria-current={step === index + 1 ? 'step' : undefined}>
        <small>STEP {index + 1} · 준비 중</small><strong>{title}</strong>
      </Link>)}
    </nav>
    <section className="naver-settlement-card" aria-labelledby="naver-source-title">
      <h2 id="naver-source-title">STEP {step} · {stepTitles[step - 1]} — 준비 중</h2>
      <p>아래 자료를 이 대화에 첨부해 주세요. 계좌번호와 개인정보는 가려도 됩니다.</p>
      <div className="naver-settlement-sources">
        {sourceItems.map(({ icon: Icon, title, description }) => <div key={title} className="naver-settlement-source">
          <Icon size={20} aria-hidden="true" />
          <div><strong>{title}</strong><small>{description}</small></div>
        </div>)}
      </div>
    </section>
  </main>
}
