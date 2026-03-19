import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './VOCAssistant.css';

const VOCAssistant: React.FC = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [vocContent, setVocContent] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [tone, setTone] = useState<'polite' | 'empathetic' | 'concise'>('polite');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [teamTips, setTeamTips] = useState<string>('');

  // DB에서 팀원들의 지식(팁) 가져오기
  useEffect(() => {
    const fetchTeamKnowledge = async () => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('title, content')
        .limit(10); // 최신 10개만 참고

      if (data && !error) {
        const tipsString = data.map(tip => `• ${tip.title}: ${tip.content}`).join('\n');
        setTeamTips(tipsString);
      }
    };
    fetchTeamKnowledge();
  }, []);

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
      header: '銀빛 설원의 낭만이 가득한 웰리힐리파크입니다.', 
      footer: '추운 날씨에 감기 조심하시고, 하얀 눈처럼 포근한 겨울 보내시길 바랍니다.' 
    };
  };

  const generateResponse = async () => {
    if (!apiKey || apiKey === 'your_key_here') {
      alert('환경 변수에 API 키를 설정해주세요.');
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
      polite: "정중하고 신뢰감 있는 비즈니스 전문 톤",
      empathetic: "고객의 마음을 어루만지는 따뜻하고 깊은 공감 톤",
      concise: "불필요한 수식어를 뺀 핵심 해결 중심의 간결한 톤"
    };

    const prompt = `
    당신은 '웰리힐리파크'의 10년 경력 CS 총괄 팀장입니다.
    아래의 [우리 회사 공식 응대 원칙]과 [팀원 공유 지식]을 바탕으로 최상의 답변을 작성하세요.

    [우리 회사 공식 응대 원칙]
    1. 환대: 첫 문장은 반드시 계절 인사를 포함한 따뜻한 환영 인사를 건넵니다.
    2. 공감: 불만 사항인 경우, 고객의 불편한 마음에 깊이 공감하고 정중히 사과합니다.
    3. 구체성: 실질적인 조치(현장 부서 확인, 당직 기사 배치 등)를 명시합니다.

    [팀원 공유 지식 - 반드시 참고하여 답변에 반영]
    ${teamTips || '현재 등록된 추가 팀 지식이 없습니다.'}

    [현재 고객 데이터]
    - 고객 성함: ${customerName || '고객님'}
    - 고객 문의: ${vocContent}
    - 답변 스타일: ${tonePrompts[tone]}
    - 필수 머릿말: "안녕하세요 ${customerName || '고객'}님, ${season.header}"
    - 필수 맺음말: "${season.footer}"

    작성 시 주의사항: 팀원 공유 지식에 해당 문의와 관련된 정보가 있다면 반드시 그 해결책을 답변에 포함시키세요.`;

    try {
      const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];
      let success = false;
      let lastApiError = "";

      for (const modelName of modelsToTry) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              }),
            }
          );

          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            setAiResponse(text.trim());
            success = true;
            break;
          }
        } catch (innerErr: any) {
          lastApiError = innerErr.message;
          continue;
        }
      }

      if (!success) throw new Error(lastApiError || 'API 호출 실패');
    } catch (err: any) {
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
        <p className="subtitle">우리 회사 공식 가이드와 팀원들의 지식이 결합된 AI입니다</p>
      </div>

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
            {isLoading ? '지식을 검색하여 답변 생성 중...' : '공식 답변 초안 생성하기'}
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
                    <p>등록된 팀 지식을 바탕으로 답변을 작성 중입니다...</p>
                  </div>
                ) : (
                  <span>내용 입력 후 버튼을 누르면<br />우리 팀의 노하우가 담긴 답변이 나타납니다.</span>
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
        <h4>💡 지능형 답변 시스템 가동 중</h4>
        <p>• <strong>팀 지식 연동:</strong> '공유 지식 베이스'에 등록된 최신 정보를 실시간으로 참고합니다.</p>
        <p>• <strong>베테랑 응대:</strong> 검증된 사례를 학습하여 답변의 품격을 높였습니다.</p>
      </div>
    </div>
  );
};

export default VOCAssistant;
