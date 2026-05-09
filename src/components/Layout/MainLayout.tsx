import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Sidebar from './Sidebar';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name: string; dept: string } | null>(null);

  const fetchUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserInfo({
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
          dept: user.user_metadata?.department || '부서미지정'
        });
      }
    } catch (err) {
      console.log('Error fetching user info', err);
    }
  };

  useEffect(() => {
    fetchUserInfo();
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
            <button className="logout-btn" onClick={() => supabase.auth.signOut()}>
              로그아웃
            </button>
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
