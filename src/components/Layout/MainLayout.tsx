import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Sidebar from './Sidebar';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string; dept: string } | null>(null);

  const fetchUserInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.user_metadata) {
      setUserInfo({
        name: user.user_metadata.full_name || user.user_metadata.name || '사용자',
        dept: user.user_metadata.department || '영업부'
      });
    }
  };

  useEffect(() => {
    fetchUserInfo();

    // 인증 상태 변경 감지 (로그인/로그아웃 시 즉시 반영)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserInfo();
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className={`layout-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={toggleSidebar}>
              ☰
            </button>
            <div className="search-bar">
              <span>🔍</span>
              <input type="text" placeholder="도구 검색..." />
            </div>
          </div>
          <div className="user-info">
            <span className="user-badge">
              {userInfo ? `${userInfo.dept} ${userInfo.name}` : '정보 불러오는 중...'}
            </span>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
