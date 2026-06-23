import React from 'react';
import { LayoutDashboard, PenTool, History, Settings, Sparkles } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const menuItems = [
    { id: 'dashboard', name: '대시보드', icon: LayoutDashboard },
    { id: 'generator', name: 'AI 포스팅 생성', icon: PenTool },
    { id: 'drafts', name: '임시 저장 & 내역', icon: History },
    { id: 'settings', name: '블로그 연동 설정', icon: Settings },
  ];

  return (
    <div className="glass-panel" style={{
      width: '280px',
      margin: '20px 0 20px 20px',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px',
      borderRight: '1px solid var(--border-standard)'
    }}>
      {/* Brand Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '40px',
        padding: '0 8px'
      }}>
        <div style={{
          background: 'var(--grad-primary)',
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)'
        }}>
          <Sparkles size={20} color="#fff" />
        </div>
        <div>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            background: 'var(--grad-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px'
          }}>
            AutoBlog AI
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>자동 블로그 포스팅 솔루션</p>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '14px 16px',
                border: 'none',
                borderRadius: '10px',
                background: isActive ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-primary)',
                fontSize: '0.95rem',
                fontWeight: isActive ? '600' : '400',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
              }}
            >
              <Icon size={18} color={isActive ? 'var(--color-primary)' : 'var(--text-muted)'} />
              {item.name}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div style={{
        marginTop: 'auto',
        padding: '16px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '12px',
        border: '1px solid var(--border-standard)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-success)',
            boxShadow: '0 0 8px var(--color-success)'
          }}></span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Gemini API 연결됨</span>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-dark)' }}>v1.0.0 (Beta Edition)</p>
      </div>
    </div>
  );
};

export default Sidebar;
