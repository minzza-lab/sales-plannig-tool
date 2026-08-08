import { Link } from 'react-router-dom'
import './Dashboard.css'

interface Tool {
  id: string
  title: string
  description: string
  icon: string
  path: string
}

interface ToolCategory {
  id: string
  eyebrow: string
  title: string
  description: string
  tools: Tool[]
}

const categories: ToolCategory[] = [
  {
    id: 'work',
    eyebrow: 'WORKSPACE',
    title: '핵심 업무와 협업',
    description: '팀의 요청, 지식, 문서와 고객 응대를 한곳에서 관리합니다.',
    tools: [
      { id: 'automation-request', title: '자동화 요청 게시판', description: '반복 업무와 필요한 기능을 등록하고 함께 검토합니다.', icon: '⚡', path: '/tools/automation-request' },
      { id: 'knowledge-base', title: '공유 지식 베이스', description: '업무 노하우와 참고 자료를 팀원들과 축적합니다.', icon: '🤝', path: '/tools/knowledge-base' },
      { id: 'approvals', title: '품의서 보관함', description: '품의서를 보관하고 Gemini로 핵심 내용을 요약합니다.', icon: '📄', path: '/tools/approvals' },
      { id: 'product-proposals', title: '상품안 보관함', description: '상품안과 의견을 관리하고 AI 요약을 확인합니다.', icon: '💡', path: '/tools/product-proposals' },
      { id: 'voc-assistant', title: 'VOC 어시스턴트', description: '고객 문의를 분석해 답변 초안을 빠르게 작성합니다.', icon: '🎧', path: '/tools/voc-assistant' },
    ],
  },
  {
    id: 'sales',
    eyebrow: 'SALES & OPERATION',
    title: '매출과 운영 관리',
    description: '현장 판매 데이터를 비교하고 운영 현황을 빠르게 파악합니다.',
    tools: [
      { id: 'waterpark-sales', title: '워터파크 매출 관리', description: '일별 실적과 날씨, 전년 데이터를 함께 분석합니다.', icon: '🌊', path: '/tools/waterpark-sales' },
      { id: 'nicepay-settlement', title: '나이스페이 정산 자동화', description: '입금 대사부터 품목 분류, 안분·부가세 엑셀까지 한 번에 처리합니다.', icon: '💳', path: '/tools/nicepay-settlement' },
      { id: 'season-pass-tracker', title: '시즌권 주문 추적', description: '목표 대비 판매 실적과 권종별 주문을 관리합니다.', icon: '🎟️', path: '/tools/season-pass-tracker' },
      { id: 'package-sales', title: '패키지 판매 현황', description: '월별·일별 패키지 판매와 주문 상세를 조회합니다.', icon: '📦', path: '/tools/package-sales' },
    ],
  },
  {
    id: 'marketing',
    eyebrow: 'AI MARKETING',
    title: '홍보 콘텐츠 제작',
    description: 'Gemini를 활용해 현장 콘텐츠와 홍보물을 제작합니다.',
    tools: [
      { id: 'field-sketch', title: '현장 스케치 생성기', description: '현장 사진을 블로그와 SNS용 콘텐츠로 변환합니다.', icon: '📸', path: '/tools/field-sketch' },
      { id: 'tts-generator', title: '안내방송 TTS', description: '상황에 맞는 안내 대본과 음성을 제작합니다.', icon: '🎙️', path: '/tools/tts-generator' },
      { id: 'thumbnail-generator', title: '상품 썸네일 제작기', description: '홍보 배경과 카피를 조합해 썸네일을 만듭니다.', icon: '🎨', path: '/tools/thumbnail-generator' },
    ],
  },
  {
    id: 'utility',
    eyebrow: 'QUICK TOOLS',
    title: '빠른 현장 도구',
    description: '자주 쓰는 코드 생성과 현장 조회 기능을 모았습니다.',
    tools: [
      { id: 'qr-generator', title: 'QR 코드 생성기', description: '단일 또는 대량 QR 코드를 생성하고 내려받습니다.', icon: '🔍', path: '/tools/qr-generator' },
      { id: 'qr-verifier', title: '대체업장 조회', description: 'QR을 스캔해 사용 가능한 업장과 혜택을 확인합니다.', icon: '📷', path: '/tools/qr-verifier' },
      { id: 'url-shortener', title: 'URL 단축기', description: '긴 인터넷 주소를 고객 전달용 주소로 줄입니다.', icon: '🔗', path: '/tools/url-shortener' },
      { id: 'barcode-generator', title: '바코드 생성기', description: '상품 번호와 식별 코드를 바코드로 변환합니다.', icon: '▥', path: '/tools/barcode-generator' },
    ],
  },
]

const toolCount = categories.reduce((total, category) => total + category.tools.length, 0) + 1

export default function Dashboard() {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">WELLIHILLI SALES PLANNING</p>
          <h1>오늘의 업무를<br />한곳에서 시작하세요.</h1>
          <p>매출 관리부터 AI 콘텐츠 제작까지, 실제 사용하는 도구만 보기 쉽게 정리했습니다.</p>
        </div>
        <div className="dashboard-summary">
          <strong>{toolCount}</strong>
          <span>사용 가능한 도구</span>
        </div>
      </header>

      <Link to="/ai-studio/project" className="studio-spotlight">
        <div className="spotlight-mark">✦</div>
        <div className="spotlight-copy">
          <span>FEATURED · GEMINI CONNECTED</span>
          <h2>AI Video Studio</h2>
          <p>캐릭터와 현장 사진을 기반으로 콘티를 설계하고 Higgsfield용 영상 프롬프트를 완성합니다.</p>
          <div className="spotlight-tags">
            <em>Character Library</em>
            <em>Image Analysis</em>
            <em>Higgsfield Prompt</em>
          </div>
        </div>
        <div className="spotlight-action">스튜디오 열기 <b>→</b></div>
      </Link>

      <div className="dashboard-sections">
        {categories.map((category) => (
          <section key={category.id} className={`dashboard-section category-${category.id}`}>
            <div className="section-heading">
              <div>
                <span>{category.eyebrow}</span>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
              </div>
              <em>{category.tools.length} tools</em>
            </div>
            <div className="tool-grid">
              {category.tools.map((tool) => (
                <Link key={tool.id} to={tool.path} className="tool-card">
                  <div className="tool-icon">{tool.icon}</div>
                  <div className="tool-info">
                    <h3>{tool.title}</h3>
                    <p>{tool.description}</p>
                  </div>
                  <span className="tool-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
