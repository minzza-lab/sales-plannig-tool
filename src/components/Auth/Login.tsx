import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import './Login.css';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 아이디/사번을 시스템이 인식 가능한 이메일 형식으로 변환 (유효한 TLD 사용)
  const formatEmail = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.includes('@')) return trimmed;
    // .internal 대신 .co.kr 같은 표준 도메인 형식을 사용하여 오류 방지
    return `${trimmed}@wellyhilly.co.kr`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    if (!username.trim() || !password.trim()) {
      setError('사번과 비밀번호를 모두 입력해주세요.');
      setIsLoading(false);
      return;
    }

    const email = formatEmail(username);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          if (error.message.includes('already registered')) {
            setError('이미 등록된 사번입니다. 로그인해주세요.');
          } else {
            setError(`가입 오류: ${error.message}`);
          }
        } else {
          setMessage('계정이 성공적으로 생성되었습니다! 이제 로그인을 진행해주세요.');
          setIsSignUp(false);
          setUsername('');
          setPassword('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError('사번 또는 비밀번호가 일치하지 않습니다.');
        } else {
          onLoginSuccess();
        }
      }
    } catch (err: any) {
      setError('시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: window.location.origin,
        queryParams: { scope: 'profile_nickname', prompt: 'login' }
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
          <p>{isSignUp ? '새로운 계정 만들기' : '웰리힐리파크 영업기획팀 전용 시스템'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>{isSignUp ? '가입할 사번 또는 아이디' : '사번 또는 아이디'}</label>
            <input
              type="text"
              placeholder="예: 20260320"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
          {message && <div className="login-success-msg">{message}</div>}

          <button type="submit" className="login-submit-btn" disabled={isLoading}>
            {isLoading ? '처리 중...' : (isSignUp ? '사번으로 가입하기' : '시스템 접속하기')}
          </button>
        </form>

        <div className="login-mode-toggle">
          {isSignUp ? '이미 사번을 등록하셨나요?' : '아직 사번을 등록하지 않으셨나요?'}
          <button onClick={() => setIsSignUp(!isSignUp)} className="toggle-link-btn">
            {isSignUp ? '로그인으로 돌아가기' : '사번 등록'}
          </button>
        </div>

        {!isSignUp && (
          <>
            <div className="login-divider">
              <span>또는</span>
            </div>
            <button onClick={handleKakaoLogin} className="kakao-login-btn" disabled={isLoading}>
              <span className="kakao-icon">💬</span>
              카카오로 간편 시작
            </button>
          </>
        )}

        <div className="login-footer">
          <p className="copyright">© 2026 WellyHillyPark Sales Planning</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
