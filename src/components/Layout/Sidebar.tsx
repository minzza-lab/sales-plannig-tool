import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h2>영업기획 도구</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">🏠</span> 대시보드
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/qr-generator" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">🔍</span> QR 코드 생성기
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/url-shortener" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">🔗</span> URL 단축기
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/barcode-generator" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">📊</span> 바코드 생성기
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/voc-assistant" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">🤖</span> AI VOC 어시스턴트
            </NavLink>
          </li>
          <li>
            <NavLink to="/tools/field-sketch" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon">📸</span> AI 현장스케치
            </NavLink>
          </li>
          <li className="disabled">
            <span><span className="icon">📈</span> 매출 예측 (준비중)</span>
          </li>
          <li className="disabled">
            <span><span className="icon">🎯</span> 목표 관리 (준비중)</span>
          </li>
        </ul>
      </nav>
      <div className="sidebar-footer">
        <p>© 2026 Sales Tools</p>
      </div>
    </aside>
  );
};

export default Sidebar;
