import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiModal: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenApiModal }) => {
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    sales: true,
    promo: true,
    util: true
  });

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      navigate('/login');
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-header">
          <h2>영업기획 도구</h2>
          <button className="mobile-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🏠</span> 대시보드
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/app-access" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">📲</span> 앱 설치 · 빠른 접속
            </NavLink>
          </li>
          <li className="menu-highlight">
            <NavLink to="/virtual-office" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🏢</span> 가상 사무실
            </NavLink>
          </li>
          <li className="menu-highlight">
            <NavLink to="/tools/automation-request" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">⚡</span> 자동화 요청 게시판
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/knowledge-base" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🤝</span> 공유 지식 베이스
            </NavLink>
          </li>
          <li className="menu-highlight">
            <NavLink to="/tools/team-workspace" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🗓️</span> 공유 스케줄 · 업무 트래커
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/approvals" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">📄</span> 품의서 보관함
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/product-proposals" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">💡</span> 상품안 보관함
            </NavLink>
          </li>
          <li className="menu-highlight">
            <NavLink to="/tools/proposal-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🎁</span> AI 상품 구성안 생성기
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/voc-assistant" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🎧</span> 고객의 소리(VOC) 어시스턴트
            </NavLink>
          </li>
          <hr className="sidebar-divider" />
          
          <li className="accordion-group">
            <div className="accordion-header" onClick={() => toggleGroup('sales')}>
              <span>📊 매출/운영 관리</span>
              <span className={`chevron ${openGroups.sales ? 'open' : ''}`}>▼</span>
            </div>
            {openGroups.sales && (
              <ul className="accordion-content">
                <li className="menu-highlight">
                  <NavLink to="/tools/water-operations" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">📍</span> 워터 운영 통합 현황
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/waterpark-sales" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🌊</span> 워터파크 매출 관리
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/water-operations-analysis" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🛟</span> 워터 권종·대여 분석
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/room-state" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🏨</span> 객실 투숙 현황
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/sports-sales" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🎟️</span> 리조트 발권 현황
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/nicepay-settlement" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">💳</span> 나이스페이 정산 자동화
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/deposit-reconciliation" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🔐</span> 입금 내역 검증 (사내용)
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/season-pass-tracker" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🎟️</span> 시즌권 주문 추적 관리
                  </NavLink>
                </li>
                <li className="menu-highlight">
                  <NavLink to="/tools/package-sales" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">📦</span> 패키지 판매 현황
                  </NavLink>
                </li>
              </ul>
            )}
          </li>
          
          <hr className="sidebar-divider" />
          
          <li className="accordion-group">
            <div className="accordion-header" onClick={() => toggleGroup('promo')}>
              <span>📢 홍보/마케팅 파트</span>
              <span className={`chevron ${openGroups.promo ? 'open' : ''}`}>▼</span>
            </div>
            {openGroups.promo && (
              <ul className="accordion-content">
                <li>
                  <NavLink to="/tools/field-sketch" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">📸</span> 현장 스케치 생성기
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/tts-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🎙️</span> 안내방송용 TTS 생성기
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/sms-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">💬</span> 문자 메시지 생성기
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/thumbnail-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🎨</span> 상품 썸네일 제작기
                  </NavLink>
                </li>
              </ul>
            )}
          </li>
          
          <hr className="sidebar-divider" />
          
          <li className="accordion-group">
            <div className="accordion-header" onClick={() => toggleGroup('util')}>
              <span>🛠️ 유틸리티 모음</span>
              <span className={`chevron ${openGroups.util ? 'open' : ''}`}>▼</span>
            </div>
            {openGroups.util && (
              <ul className="accordion-content">
                <li>
                  <NavLink to="/tools/qr-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🔍</span> QR 코드 생성기
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/qr-verifier" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">📷</span> 대체업장 조회 도구
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/url-shortener" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">🔗</span> URL 단축기
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tools/barcode-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
                    <span className="icon">📊</span> 바코드 생성기
                  </NavLink>
                </li>
              </ul>
            )}
          </li>
        </ul>
      </nav>
      <div className="sidebar-footer">
        <button onClick={onOpenApiModal} className="api-settings-btn" style={{ width: '100%', marginBottom: '8px', padding: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', color: '#818cf8', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}>
          <span className="icon">🔑</span> API 키 설정
        </button>
        <button onClick={handleLogout} className="logout-btn">
          <span className="icon">🚪</span> 로그아웃
        </button>
        <p>© 2026 Sales Tools</p>
      </div>
    </aside>
  );
};

export default Sidebar;
