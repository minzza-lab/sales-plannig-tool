import React, { useState } from 'react';
import './URLShortener.css';

const URLShortener: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'simple' | 'custom'>('simple');
  const [longUrl, setLongUrl] = useState<string>('');
  const [customAlias, setCustomAlias] = useState<string>('');
  const [shortUrl, setShortUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const shortenUrlWithJSONP = (targetUrl: string, alias: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const callbackName = `isgd_cb_${Math.round(Math.random() * 1000000)}`;
      const script = document.createElement('script');
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('서버 응답 시간이 초과되었습니다.'));
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        delete (window as any)[callbackName];
      };

      (window as any)[callbackName] = (data: any) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('네트워크 연결에 실패했습니다.'));
      };

      let apiUrl = `https://is.gd/create.php?format=json&callback=${callbackName}&url=${encodeURIComponent(targetUrl)}`;
      if (activeTab === 'custom' && alias.trim()) {
        apiUrl += `&shorturl=${encodeURIComponent(alias.trim())}`;
      }

      script.src = apiUrl;
      document.body.appendChild(script);
    });
  };

  const shortenUrl = async () => {
    let targetUrl = longUrl.trim();
    if (!targetUrl) {
      setError('원본 URL을 입력해주세요.');
      return;
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    if (activeTab === 'custom') {
      if (!customAlias.trim()) {
        setError('사용할 맞춤 이름을 입력해주세요.');
        return;
      }
      if (customAlias.trim().length < 5) {
        setError('맞춤 이름은 최소 5자 이상이어야 합니다.');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(customAlias.trim())) {
        setError('영문, 숫자, 언더바(_)만 사용 가능합니다.');
        return;
      }
    }

    setIsLoading(true);
    setError('');
    setShortUrl('');
    setCopied(false);

    try {
      const data = await shortenUrlWithJSONP(targetUrl, customAlias);

      if (data.shorturl) {
        setShortUrl(data.shorturl);
      } else if (data.errormessage) {
        if (data.errorcode === 2) {
          setError('이미 다른 사람이 사용 중인 이름입니다.');
        } else {
          setError(`오류: ${data.errormessage}`);
        }
      } else {
        throw new Error('알 수 없는 응답 형식입니다.');
      }
    } catch (err: any) {
      setError(err.message || '단축 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (shortUrl) {
      navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="shortener-container">
      <h1 className="title">URL 단축 서비스</h1>
      <p className="subtitle">상황에 맞는 단축 방식을 선택해보세요</p>

      <div className="tab-menu">
        <button 
          className={activeTab === 'simple' ? 'active' : ''} 
          onClick={() => { setActiveTab('simple'); setError(''); setShortUrl(''); }}
        >
          ⚡ 일반 단축 (무작위)
        </button>
        <button 
          className={activeTab === 'custom' ? 'active' : ''} 
          onClick={() => { setActiveTab('custom'); setError(''); setShortUrl(''); }}
        >
          🏷️ 맞춤 단축 (이름 지정)
        </button>
      </div>

      <div className="shortener-form">
        <div className="input-field">
          <label>원본 URL 주소</label>
          <input
            type="text"
            placeholder="https://example.com"
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
            className="url-input-large"
            onKeyDown={(e) => e.key === 'Enter' && shortenUrl()}
          />
        </div>

        {activeTab === 'custom' && (
          <div className="input-field animate-fade-in">
            <label>지정할 이름 (최소 5자)</label>
            <div className="alias-input-wrapper">
              <span className="domain-prefix">is.gd/</span>
              <input
                type="text"
                placeholder="wellihilli"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value)}
                className="alias-input"
                onKeyDown={(e) => e.key === 'Enter' && shortenUrl()}
              />
            </div>
          </div>
        )}

        <button onClick={shortenUrl} className="shorten-btn-large" disabled={isLoading}>
          {isLoading ? '연결 중...' : (activeTab === 'simple' ? '빠른 단축 실행' : '맞춤 주소 생성하기')}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {shortUrl && (
        <div className="result-card animate-slide-up">
          <div className="result-label">
            {activeTab === 'simple' ? '무작위 주소가 생성되었습니다' : '맞춤 주소가 생성되었습니다'}
          </div>
          <div className="result-box">
            <span className="short-url">{shortUrl}</span>
            <button onClick={copyToClipboard} className={`copy-btn ${copied ? 'copied' : ''}`}>
              {copied ? '복사 완료' : '주소 복사'}
            </button>
          </div>
        </div>
      )}

      <div className="info-box">
        <h4>💡 팁</h4>
        {activeTab === 'simple' ? (
          <p>• 별도의 입력 없이 시스템이 자동으로 가장 짧은 무작위 주소를 만들어줍니다.</p>
        ) : (
          <p>• <strong>wellihilli</strong>라고 입력하면 <strong>is.gd/wellihilli</strong> 주소가 생깁니다.</p>
        )}
        <p>• 생성된 주소는 전 세계 어디서든 영구적으로 접속 가능합니다.</p>
      </div>
    </div>
  );
};

export default URLShortener;
