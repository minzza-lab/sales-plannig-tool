import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import './Login.css';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 일반 이메일 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? '이메일 또는 비밀번호가 일치하지 않습니다.' 
        : error.message);
    } else {
      onLoginSuccess();
    }
    setIsLoading(false);
  };

  // 카카오 소셜 로그인 (KOE205 에러 해결을 위한 강력한 스코프 제한)
  const handleKakaoLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: window.location.origin,
        // Supabase의 기본 요청을 무시하고 카카오가 허용하는 최소 권한만 요청합니다.
        queryParams: {
          scope: 'profile_nickname', // 이메일을 완전히 빼고 닉네임만 요청
          prompt: 'login'
        }
      }
    });

    if (error) {
      setError(`카카오 로그인 오류: ${error.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="logo-icon">🚀</div>
          <h1>Sales Planning Tool</h1>
          <p>웰리힐리파크 영업기획팀 전용 시스템</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>이메일 주소</label>
            <input
              type="email"
              placeholder="name@wellyhillypark.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>비밀번호</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="login-error-msg">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={isLoading}>
            {isLoading ? '인증 중...' : '시스템 접속하기'}
          </button>
        </form>

        <div className="login-divider">
          <span>또는</span>
        </div>

        <button 
          onClick={handleKakaoLogin} 
          className="kakao-login-btn" 
          disabled={isLoading}
        >
          <span className="kakao-icon">💬</span>
          카카오로 시작하기
        </button>

        <div className="login-footer">
          <p>계정이 없으신 경우 관리자에게 문의하세요.</p>
          <p className="copyright">© 2026 WellyHillyPark Sales Planning</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
