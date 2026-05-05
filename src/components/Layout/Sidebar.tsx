import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

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
          <li>
            <NavLink to="/tools/approvals" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">📄</span> 품의서 보관함
            </NavLink>
          </li>
          <hr className="sidebar-divider" />
          <li className="menu-highlight">
            <NavLink to="/tools/waterpark-sales" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🌊</span> 워터파크 매출 관리
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/voc-assistant" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🎧</span> 고객의 소리(VOC) 어시스턴트
            </NavLink>
          </li>
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
            <NavLink to="/tools/thumbnail-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🎨</span> 상품 썸네일 제작기
            </NavLink>
          </li>
          <hr className="sidebar-divider" />
          <li>
            <NavLink to="/tools/qr-generator" className={({ isActive }) => (isActive ? 'active' : '')} onClick={onClose}>
              <span className="icon">🔍</span> QR 코드 생성기
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
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="logout-btn">
          <span className="icon">🚪</span> 로그아웃
        </button>
        <p>© 2026 Sales Tools</p>
      </div>
    </aside>
  );
};

export default Sidebar;
