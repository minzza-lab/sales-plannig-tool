import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { settlementProviders, sidebarEntries, sidebarSections, useNavigationSettings, visibleEntries, type SidebarEntry } from '../../lib/navigationSettings';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiModal: () => void;
  isAdmin: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenApiModal, isAdmin }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useNavigationSettings();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ sales: true, settlement: true, nicepay: true, naver: true, promo: true, util: true });
  const toggleGroup = (group: string) => setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) navigate('/login');
  };
  const renderEntry = (entry: SidebarEntry) => {
    const [pathname, query] = entry.path.split('?');
    const active = location.pathname === pathname && (!query || (new URLSearchParams(location.search).get('step') || '1') === new URLSearchParams(query).get('step'));
    return <li key={entry.id} className={entry.section === 'sales' || entry.provider ? 'menu-highlight' : undefined}>
      <NavLink to={entry.path} className={active ? 'active' : ''} onClick={onClose}>
        {entry.icon && <span className="icon">{entry.icon}</span>}{settings[entry.id]?.title?.trim() || entry.title}
      </NavLink>
    </li>;
  };
  const sectionOrder = (id: string) => sidebarSections.findIndex(section => section.id === id);
  const sections = sidebarSections.filter(section => settings[`section:${section.id}`]?.sidebarVisible !== false)
    .sort((a, b) => (settings[`section:${a.id}`]?.sidebarOrder ?? sectionOrder(a.id)) - (settings[`section:${b.id}`]?.sidebarOrder ?? sectionOrder(b.id)));

  return (<aside className={`sidebar ${isOpen ? 'open' : ''}`}>
    <div className="sidebar-logo"><div className="logo-header"><h2>영업기획 도구</h2><button className="mobile-close-btn" onClick={onClose}>✕</button></div></div>
    <nav className="sidebar-nav"><ul>
      <li><NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} onClick={onClose}><span className="icon">🏠</span> 대시보드</NavLink></li>
      {visibleEntries(sidebarEntries.filter(entry => entry.section === 'top'), settings).map(renderEntry)}
      {sections.map(section => <React.Fragment key={section.id}>
        <hr className="sidebar-divider" />
        <li className="accordion-group">
          <button type="button" className="accordion-header settlement-header" onClick={() => toggleGroup(section.id)} aria-expanded={openGroups[section.id]}>
            <span>{section.icon} {settings[`section:${section.id}`]?.title?.trim() || section.title}</span>
            <span className={`chevron ${openGroups[section.id] ? 'open' : ''}`}>▼</span>
          </button>
          {openGroups[section.id] && <ul className={`accordion-content ${section.id === 'settlement' ? 'settlement-content' : ''}`}>
            {section.id === 'settlement' ? settlementProviders.filter(provider => settings[`provider:${provider.id}`]?.sidebarVisible !== false)
              .sort((a, b) => (settings[`provider:${a.id}`]?.sidebarOrder ?? settlementProviders.indexOf(a)) - (settings[`provider:${b.id}`]?.sidebarOrder ?? settlementProviders.indexOf(b)))
              .map(provider => <li key={provider.id} className="settlement-provider">
                <button type="button" className="settlement-provider-header" onClick={() => toggleGroup(provider.id)} aria-expanded={openGroups[provider.id]}>
                  <span>{provider.icon} {settings[`provider:${provider.id}`]?.title?.trim() || provider.title}</span><span className={`chevron ${openGroups[provider.id] ? 'open' : ''}`}>▼</span>
                </button>
                {openGroups[provider.id] && <ul className="settlement-steps">{visibleEntries(sidebarEntries.filter(entry => entry.provider === provider.id), settings).map(renderEntry)}</ul>}
              </li>) : visibleEntries(sidebarEntries.filter(entry => entry.section === section.id), settings).map(renderEntry)}
          </ul>}
        </li>
      </React.Fragment>)}
    </ul></nav>
      <div className="sidebar-footer">
        <button onClick={onOpenApiModal} className="api-settings-btn" style={{ width: '100%', marginBottom: '8px', padding: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', color: '#818cf8', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}>
          <span className="icon">🔑</span> API 키 설정
        </button>
        {isAdmin && <NavLink to="/tools/admin" onClick={onClose} className="admin-settings-btn"><span className="icon">🛡️</span> 관리자 페이지</NavLink>}
        <button onClick={handleLogout} className="logout-btn">
          <span className="icon">🚪</span> 로그아웃
        </button>
        <p>© 2026 Sales Tools</p>
      </div>
    </aside>
  );
};

export default Sidebar;
