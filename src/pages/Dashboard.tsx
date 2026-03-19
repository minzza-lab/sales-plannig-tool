import React from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const tools = [
    {
      id: 'qr-generator',
      title: 'QR 코드 생성기',
      description: 'URL을 QR 코드로 변환하고 PNG로 다운로드하세요.',
      icon: '🔍',
      path: '/tools/qr-generator',
      status: 'active'
    },
    {
      id: 'url-shortener',
      title: 'URL 단축기',
      description: '긴 URL 주소를 짧고 간결하게 줄여보세요.',
      icon: '🔗',
      path: '/tools/url-shortener',
      status: 'active'
    },
    {
      id: 'barcode-generator',
      title: '바코드 생성기',
      description: '상품 번호나 식별 코드를 1차원 바코드로 변환합니다.',
      icon: '📊',
      path: '/tools/barcode-generator',
      status: 'active'
    },
    {
      id: 'voc-assistant',
      title: 'AI VOC 어시스턴트',
      description: '고객의 문의사항에 최적화된 답변 초안을 생성합니다.',
      icon: '🤖',
      path: '/tools/voc-assistant',
      status: 'active'
    },
    {
      id: 'field-sketch',
      title: 'AI 현장스케치 작성기',
      description: '현장 소식을 생생하고 매력적인 홍보 글로 변환합니다.',
      icon: '📸',
      path: '/tools/field-sketch',
      status: 'active'
    },
    {
      id: 'sales-forecast',
      title: '매출 예측',
      description: '과거 데이터를 기반으로 향후 매출을 시뮬레이션합니다.',
      icon: '📈',
      path: '#',
      status: 'upcoming'
    },
    {
      id: 'target-mgmt',
      title: '목표 관리',
      description: '팀별, 개인별 영업 목표 및 달성률을 추적합니다.',
      icon: '🎯',
      path: '#',
      status: 'upcoming'
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
