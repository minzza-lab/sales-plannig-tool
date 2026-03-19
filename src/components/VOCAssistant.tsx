import React, { useState } from 'react';
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

    // 전문가 수준의 강화된 프롬프트 (학습 데이터 포함)
    const prompt = `
    당신은 '웰리힐리파크'의 10년 경력 CS 총괄 팀장 '마스터 어시스턴트'입니다.
    아래의 [우리 회사 공식 응대 원칙]과 [모범 사례]를 바탕으로 고객 문의에 대한 공식 답변 초안을 작성하세요.

    [우리 회사 공식 응대 원칙]
    1. 환대(Hospitality): 첫 문장은 반드시 계절 인사를 포함한 따뜻한 환영 인사를 건넵니다.
    2. 공감(Empathy): 불만 사항인 경우, 사실 관계 확인 전이라도 고객의 불편한 마음에 깊이 공감하고 정중히 사과합니다.
    3. 구체성(Specificity): "노력하겠다"는 말보다는 "현장 부서 확인 후 조치하겠다", "당직 기사를 배치하겠다" 등 실질적인 단어를 사용합니다.
    4. 품격(Dignity): 과도한 이모티콘은 지양하고, 격식 있는 한국어 높임말(하십시오체)을 주로 사용합니다.

    [모범 응대 사례 - 학습 데이터]
    - 질문: "방이 너무 추워서 잠을 설쳤어요."
    - 답변: "안녕하세요 ${customerName || '고객'}님, ${season.header} 우선 즐거운 휴식을 기대하셨을 텐데 객실 난방 문제로 불편을 드려 진심으로 송구스럽습니다. 즉시 시설팀 당직 기사를 배치하여 난방 시스템을 점검하고 보완하도록 조치하겠습니다. 고객님의 소중한 휴식 시간이 더는 방해받지 않도록 최선을 다하겠습니다. 다시 한번 사과의 말씀을 올립니다. ${season.footer}"

    - 질문: "셔틀버스 시간표가 궁금해요."
    - 답변: "반갑습니다 ${customerName || '고객'}님, ${season.header} 셔틀버스 이용에 대해 안내해 드리겠습니다. 현재 홈페이지 '고객센터 > 교통안내' 메뉴에서 가장 최신화된 노선과 시간표를 확인하실 수 있습니다. 혹시 추가로 궁금한 점이 있으시면 24시간 프런트 데스크(내선 100번)로 연락 부탁드립니다. 안전한 여행 되시길 기원합니다. ${season.footer}"

    [현재 고객 데이터]
    - 고객 성함: ${customerName || '고객님'}
    - 고객 문의 내용: ${vocContent}
    - 요청 답변 스타일: ${tonePrompts[tone]}
    - 필수 머릿말: "안녕하세요 ${customerName || '고객'}님, ${season.header}"
    - 필수 맺음말: "${season.footer}"

    위 가이드라인을 엄격히 준수하여 답변 초안을 작성하세요.`;

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
        <p className="subtitle">우리 회사 공식 스타일 가이드가 적용된 AI 답변 도구입니다</p>
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
            {isLoading ? '베테랑의 답변을 가져오는 중...' : '공식 답변 초안 생성하기'}
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
                    <p>전문가가 답변을 정교하게 다듬고 있습니다...</p>
                  </div>
                ) : (
                  <span>내용 입력 후 버튼을 누르면<br />베테랑 팀장의 노하우가 담긴 답변이 나타납니다.</span>
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
        <h4>🌸 고도화된 응대 학습 시스템</h4>
        <p>• <strong>원칙 기반:</strong> 단순 답변이 아닌 우리 회사만의 4대 응대 원칙을 따릅니다.</p>
        <p>• <strong>모범 사례 학습:</strong> 검증된 베스트 사례를 바탕으로 답변 품질을 보장합니다.</p>
        <p>• <strong>유연한 대응:</strong> 불만에는 사과를, 문의에는 정확한 정보 안내를 우선합니다.</p>
      </div>
    </div>
  );
};

export default VOCAssistant;
