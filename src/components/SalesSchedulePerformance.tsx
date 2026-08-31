import { BarChart3 } from 'lucide-react'
import SalesScheduler from './SalesScheduler'
import './TeamWorkspace.css'

export default function SalesSchedulePerformance() {
  return <div className="team-workspace animate-fade-in">
    <header className="team-workspace-header">
      <div>
        <p className="workspace-eyebrow"><BarChart3 size={15} /> SALES MANAGEMENT</p>
        <h1>판매 스케줄 · 실적 관리</h1>
        <p>판매 상품의 기간, 업체, 목표와 최종 실적을 한곳에서 관리합니다.</p>
      </div>
    </header>
    <SalesScheduler />
  </div>
}
