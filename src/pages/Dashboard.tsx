import React from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const tools = [
    {
      id: 'waterpark-sales',
      title: '워터파크 매출 관리',
      description: '일일 영업 실적 데이터를 비교하고 분석하는 대시보드입니다.',
      icon: '🌊',
      path: '/tools/waterpark-sales',
      status: 'active'
    },
    {
      id: 'automation-request',
      title: '자동화 요청 게시판',
      description: '반복적인 업무나 필요한 기능 개발을 요청하는 공간입니다.',
      icon: '⚡',
      path: '/tools/automation-request',
      status: 'active'
    },
    {
      id: 'knowledge-base',
      title: '공유 지식 베이스',
      description: '팀원들과 업무 노하우 및 자료를 공유하는 게시판입니다.',
      icon: '🤝',
      path: '/tools/knowledge-base',
      status: 'active'
    },
    {
      id: 'approvals',
      title: '품의서 보관함',
      description: '부서별 결재 품의서를 체계적으로 관리하고 핵심 내용을 요약합니다.',
      icon: '📄',
      path: '/tools/approvals',
      status: 'active'
    },
    {
      id: 'voc-assistant',
      title: '고객의 소리(VOC) 어시스턴트',
      description: '고객 문의사항을 분석하고 담당자에게 알맞은 답변 초안을 제안합니다.',
      icon: '🎧',
      path: '/tools/voc-assistant',
      status: 'active'
    },
    {
      id: 'season-pass-tracker',
      title: '시즌권 주문 추적 관리',
      description: '시즌권 판매 실적을 분석하고 주문 데이터를 한눈에 관리합니다.',
      icon: '🎟️',
      path: '/tools/season-pass-tracker',
      status: 'active'
    },
    {
      id: 'space-simulator',
      title: '공간 시뮬레이터 (AI)',
      description: 'AI를 활용하여 새로운 공간 기획 및 렌더링 시뮬레이션을 진행합니다.',
      icon: '🪄',
      path: '/tools/space-simulator',
      status: 'active'
    },
    {
      id: 'photo-shorts-maker',
      title: 'AI 숏폼 자동 메이커',
      description: '사진과 텍스트만으로 눈길을 끄는 숏폼 영상 콘텐츠를 자동 생성합니다.',
      icon: '🎬',
      path: '/tools/photo-shorts-maker',
      status: 'active'
    },
    {
      id: 'video-prompt-generator',
      title: '비디오 프롬프트 생성기',
      description: 'AI 비디오 생성에 최적화된 프롬프트를 자동으로 작성해 줍니다.',
      icon: '🤖',
      path: '/tools/video-prompt-generator',
      status: 'active'
    },
    {
      id: 'field-sketch',
      title: '현장 스케치 생성기',
      description: '현장 사진과 소식을 생생하고 매력적인 마케팅 문구로 변환합니다.',
      icon: '📸',
      path: '/tools/field-sketch',
      status: 'active'
    },
    {
      id: 'tts-generator',
      title: '안내방송용 TTS 생성기',
      description: '상황에 맞는 대본을 작성하고 자연스러운 음성 안내방송을 제작합니다.',
      icon: '🎙️',
      path: '/tools/tts-generator',
      status: 'active'
    },
    {
      id: 'thumbnail-generator',
      title: '상품 썸네일 제작기',
      description: '기획 의도에 맞는 홍보 배경 이미지와 마케팅 카피를 한 번에 생성합니다.',
      icon: '🎨',
      path: '/tools/thumbnail-generator',
      status: 'active'
    },
    {
      id: 'qr-generator',
      title: 'QR 코드 생성기',
      description: '인터넷 주소를 QR 코드로 변환하고 이미지로 쉽게 다운로드하세요.',
      icon: '🔍',
      path: '/tools/qr-generator',
      status: 'active'
    },
    {
      id: 'url-shortener',
      title: 'URL 단축기',
      description: '고객에게 발송할 길고 복잡한 인터넷 주소를 짧고 간결하게 줄여줍니다.',
      icon: '🔗',
      path: '/tools/url-shortener',
      status: 'active'
    },
    {
      id: 'barcode-generator',
      title: '바코드 생성기',
      description: '상품 번호나 식별 코드를 스캐너로 읽을 수 있는 바코드로 변환합니다.',
      icon: '📊',
      path: '/tools/barcode-generator',
      status: 'active'
    }
  ];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>영업기획 도구 대시보드</h1>
        <p>업무 효율을 높여주는 다양한 도구들을 확인해보세요.</p>
      </header>

      <div className="tool-grid">
        {tools.map((tool) => (
          <div key={tool.id} className={`tool-card ${tool.status}`}>
            <div className="tool-icon">{tool.icon}</div>
            <div className="tool-info">
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              {tool.status === 'active' ? (
                <Link to={tool.path} className="tool-link">
                  이동하기 <span>→</span>
                </Link>
              ) : (
                <span className="upcoming-badge">준비 중</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
