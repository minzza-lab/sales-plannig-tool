import React, { useState } from 'react';
import './VOCAssistant.css';

const VOCAssistant: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [vocContent, setVocContent] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [tone, setTone] = useState<'polite' | 'empathetic' | 'concise'>('polite');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showKeyInput, setShowKeyInput] = useState<boolean>(!localStorage.getItem('gemini_api_key'));

  const saveApiKey = (key: string) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      alert('올바른 API 키를 입력해주세요.');
      return;
    }
    localStorage.setItem('gemini_api_key', trimmedKey);
    setApiKey(trimmedKey);
    setShowKeyInput(false);
    alert('API 키가 안전하게 저장되었습니다.');
  };

  const getSeasonInfo = () => {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return { 
      name: '봄', 
      header: '봄의 싱그러움과 함께하는 웰리힐리파크입니다.', 
      footer: '문의주셔서 감사드리며 고객님의 봄날이 따뜻하기를 바랍니다.' 
    };
    if (month >= 6 && month <= 8) return { 
      name: '여름', 
      header: '시원한 바람과 즐거움이 가득한 웰리힐리파크입니다.', 
      footer: '무더운 여름 건강 유의하시고, 웰리힐리파크에서 시원한 추억 만드시길 바랍니다.' 
    };
    if (month >= 9 && month <= 11) return { 
      name: '가을', 
      header: '단풍의 정취가 물씬 풍기는 웰리힐리파크입니다.', 
      footer: '높고 푸른 가을 하늘처럼 고객님의 하루도 맑고 행복하시길 기원합니다.' 
    };
    return { 
      name: '겨울', 
      header: '은빛 설원의 낭만이 가득한 웰리힐리파크입니다.', 
      footer: '추운 날씨에 감기 조심하시고, 하얀 눈처럼 포근한 겨울 보내시길 바랍니다.' 
    };
  };

  const generateResponse = async () => {
    const currentKey = apiKey || localStorage.getItem('gemini_api_key');
    if (!currentKey) {
      alert('API 키를 먼저 설정하고 저장해주세요.');
      setShowKeyInput(true);
      return;
    }

    if (!vocContent.trim()) {
      alert('고객의 VOC 내용을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    setAiResponse('');

    const season = getSeasonInfo();
    const tonePrompts = {
      polite: "정중하고 전문적인 비즈니스 톤",
      empathetic: "고객의 상황에 깊이 공감하고 위로하는 따뜻한 톤",
      concise: "핵심 해결책 위주로 간결한 톤"
    };

    const prompt = `당신은 '웰리힐리파크'의 숙련된 CS 팀장입니다. 아래 내용을 바탕으로 공식 답변을 작성하세요.
    - 고객 성함: ${customerName || '고객님'}
    - 고객 문의: ${vocContent}
    - 답변 스타일: ${tonePrompts[tone]}
    - 필수 머릿말: "안녕하세요 ${customerName || '고객'}님, ${season.header}"
    - 필수 맺음말: "${season.footer}"
    - 답변은 반드시 한국어로 작성하세요.`;

    try {
      // 2026년 기준 최신 모델 명칭 리스트 (가장 성공 확률 높은 순)
      const modelsToTry = [
        "gemini-2.5-flash",        // 현재 가장 표준적인 고성능 모델
        "gemini-2.5-pro",          // 더욱 정교한 추론 모델
        "gemini-3-flash-preview",  // 최신 차세대 모델
        "gemini-1.5-flash"         // 하위 호환용
      ];
      
      let success = false;
      let lastApiError = "";

      for (const modelName of modelsToTry) {
        try {
          console.log(`[${modelName}] 모델로 호출 시도...`);
          // v1 엔드포인트를 우선 사용 (안정화 버전)
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${currentKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              }),
            }
          );

          let data = await response.json();

          // 만약 v1에서 404가 나면 v1beta로 한 번 더 시도
          if (response.status === 404) {
            console.log(`[${modelName}] v1 실패, v1beta로 재시도...`);
            const betaRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }]
                }),
              }
            );
            data = await betaRes.json();
            if (!betaRes.ok) throw new Error(data.error?.message || `HTTP ${betaRes.status}`);
          } else if (!response.ok) {
            throw new Error(data.error?.message || `HTTP ${response.status}`);
          }

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            setAiResponse(text);
            success = true;
            console.log(`[${modelName}] 생성 성공!`);
            break;
          }
        } catch (innerErr: any) {
          lastApiError = innerErr.message;
          console.warn(`[${modelName}] 최종 실패:`, lastApiError);
          continue;
        }
      }

      if (!success) {
        throw new Error(`최신 AI 모델들이 응답하지 않습니다. (최종 에러: ${lastApiError})`);
      }
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      setError(`오류 발생: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (aiResponse) {
      navigator.clipboard.writeText(aiResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="voc-container">
      <div className="voc-header">
        <h1 className="title">웰리힐리파크 AI VOC 어시스턴트</h1>
        <p className="subtitle">우리 회사 공식 스타일 가이드가 적용된 AI 답변 도구입니다</p>
        <button className="settings-btn" onClick={() => setShowKeyInput(!showKeyInput)}>
          {showKeyInput ? '설정 닫기' : '🔑 API 키 설정'}
        </button>
      </div>

      {showKeyInput && (
        <div className="api-key-config animate-fade-in">
          <h4>Gemini API 키 설정</h4>
          <p>입력하신 키는 브라우저에만 저장되며 외부로 유출되지 않습니다.</p>
          <div className="key-input-row">
            <input
              type="password"
              placeholder="API 키를 입력하세요"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button onClick={() => saveApiKey(apiKey)}>저장</button>
          </div>
        </div>
      )}

      <div className="voc-workspace">
        <div className="voc-input-section">
          <div className="input-field-group">
            <div className="section-label">고객 성함 (선택)</div>
            <input
              type="text"
              placeholder="예: 최민혁"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="name-input"
            />
          </div>

          <div className="input-field-group">
            <div className="section-label">고객 문의 내용 (VOC)</div>
            <textarea
              placeholder="고객의 문의 내용을 여기에 입력하세요..."
              value={vocContent}
              onChange={(e) => setVocContent(e.target.value)}
              className="voc-textarea-new"
            />
          </div>
          
          <div className="tone-selector">
            <div className="section-label">답변 스타일</div>
            <div className="tone-tabs">
              <button className={tone === 'polite' ? 'active' : ''} onClick={() => setTone('polite')}>🤝 정중하게</button>
              <button className={tone === 'empathetic' ? 'active' : ''} onClick={() => setTone('empathetic')}>❤️ 공감하며</button>
              <button className={tone === 'concise' ? 'active' : ''} onClick={() => setTone('concise')}>⚡ 간결하게</button>
            </div>
          </div>

          <button onClick={generateResponse} className="generate-ai-btn" disabled={isLoading}>
            {isLoading ? '답변을 생성하고 있습니다...' : '공식 답변 초안 생성하기'}
          </button>
        </div>

        <div className="voc-output-section">
          <div className="section-label">웰리힐리파크 공식 답변 초안</div>
          <div className={`ai-result-box ${isLoading ? 'loading' : ''}`}>
            {aiResponse ? (
              <textarea
                value={aiResponse}
                onChange={(e) => setAiResponse(e.target.value)}
                className="ai-textarea"
              />
            ) : (
              <div className="ai-placeholder">
                {isLoading ? (
                  <div className="loader-container">
                    <div className="loader"></div>
                    <p>AI가 답변을 작성하고 있습니다...</p>
                  </div>
                ) : (
                  <span>내용 입력 후 버튼을 누르면<br />계절 인사말이 포함된 답변이 나타납니다.</span>
                )}
              </div>
            )}
          </div>
          {aiResponse && (
            <button onClick={copyToClipboard} className={`copy-btn-large ${copied ? 'copied' : ''}`}>
              {copied ? '복사 완료!' : '답변 전체 복사하기'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="voc-error">{error}</div>}

      <div className="info-box-voc">
        <h4>🌸 계절별 자동 인사말 시스템</h4>
        <p>• 현재 날짜를 기준으로 <strong>{getSeasonInfo().name}</strong> 인사말이 자동으로 적용됩니다.</p>
        <p>• 고객 성함을 입력하면 더욱 친근한 맞춤형 답변이 생성됩니다.</p>
        <p>• 웰리힐리파크의 브랜드 이미지에 맞는 정중한 표현을 우선 사용합니다.</p>
      </div>
    </div>
  );
};

export default VOCAssistant;
