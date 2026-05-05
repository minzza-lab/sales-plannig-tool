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
  const [unansweredList, setUnansweredList] = useState<any[]>([]);
  const [answeredList, setAnsweredList] = useState<any[]>([]);
  
  const [draftAnswer, setDraftAnswer] = useState<string>('');
  const [expandedVocId, setExpandedVocId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  // DB에서 팀원들의 지식(팁) 가져오기
  useEffect(() => {
    const fetchTeamKnowledge = async () => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('title, content')
        .limit(10);

      if (data && !error) {
        const tipsString = data.map(tip => `• ${tip.title}: ${tip.content}`).join('\n');
        setTeamTips(tipsString);
      }
    };
    fetchTeamKnowledge();
    
    // URL 파라미터에서 데이터 파싱 (크롬 확장프로그램 연동용)
    const params = new URLSearchParams(window.location.search);
    const urlName = params.get('name');
    const urlContent = params.get('content');
    if (urlName) setCustomerName(urlName);
    if (urlContent) setVocContent(urlContent);
    
    // 크롤러로 수집된 미답변 VOC 리스트 가져오기
    const fetchUnansweredVocList = async () => {
      const { data, error } = await supabase
        .from('voc_inquiries')
        .select('*')
        .eq('status', 'unanswered')
        .order('created_at', { ascending: false });
        
      if (data && !error) {
        setUnansweredList(data);
      }
    };
    
    // 답변 완료된 VOC 리스트 가져오기 (학습 자료용)
    const fetchAnsweredVocList = async () => {
      const { data, error } = await supabase
        .from('voc_inquiries')
        .select('*')
        .eq('status', 'answered')
        .order('created_at', { ascending: false })
        .limit(5); // 최근 5개만
        
      if (data && !error) {
        setAnsweredList(data);
      }
    };
    
    // 마지막 동기화 기록 가져오기
    const fetchSyncStatus = async () => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('content')
        .eq('title', '[SYSTEM] LAST_SYNC')
        .single();
        
      if (data && !error) {
        try {
          setSyncStatus(JSON.parse(data.content));
        } catch(e) {}
      }
    };
    
    fetchUnansweredVocList();
    fetchAnsweredVocList();
    fetchSyncStatus();
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
    아래의 [우리 회사 공식 응대 원칙], [팀원 공유 지식], 그리고 [담당자 답변 초안]을 바탕으로 최상의 답변을 작성하세요.

    [우리 회사 공식 응대 원칙]
    1. 환대: 첫 문장은 반드시 계절 인사를 포함한 따뜻한 환영 인사를 건넵니다.
    2. 공감: 불만 사항인 경우, 고객의 불편한 마음에 깊이 공감하고 정중히 사과합니다.
    3. 구체성: 실질적인 조치(현장 부서 확인, 당직 기사 배치 등)를 명시합니다.

    [팀원 공유 지식 - 반드시 참고하여 답변에 반영]
    ${teamTips || '현재 등록된 추가 팀 지식이 없습니다.'}

    [담당자 답변 초안 - 이 내용을 핵심 메시지로 삼아 문맥을 부드럽게 다듬어주세요]
    ${draftAnswer ? draftAnswer : '담당자가 별도 초안을 주지 않았습니다. 문의 내용에 맞게 공식 가이드에 따라 답변을 생성하세요.'}

    [현재 고객 데이터]
    - 고객 성함: ${customerName || '고객님'}
    - 고객 문의: ${vocContent}
    - 답변 스타일: ${tonePrompts[tone]}
    - 필수 머릿말: "안녕하세요 ${customerName || '고객'}님, ${season.header}"
    - 필수 맺음말: "${season.footer}"

    작성 시 주의사항: 팀원 공유 지식에 해당 문의와 관련된 정보가 있다면 반드시 그 해결책을 답변에 포함시키세요.`;

    try {
      const modelsToTry = ["gemini-flash-latest", "gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite"];
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

  const saveToKnowledgeBase = async (voc: any) => {
    const title = `[VOC 사례] ${voc.title || '무제'}`;
    const content = `Q. ${voc.content}\n\nA. ${voc.answer}`;
    
    const { error } = await supabase.from('knowledge_base').insert({
      title,
      content,
      category: '답변 학습',
      author: '시스템 자동수집',
    });
    
    if (error) {
      alert('학습자료 저장 중 오류가 발생했습니다.');
    } else {
      alert('성공적으로 지식 백과에 추가되었습니다!');
    }
  };

  return (
    <div className="voc-container">
      <div className="voc-header">
        <h1 className="title">웰리 AI VOC 어시스턴트</h1>
        <p className="subtitle">공식 가이드와 팀의 지능이 결합된 스마트 CS 도구입니다</p>
        <div className="sync-status-bar">
          <div className="sync-auto-indicator">
            <span className="sync-icon">🤖</span>
            <span className="sync-text">크롤러가 15분마다 최신 데이터를 자동으로 수집 중입니다.</span>
            {syncStatus && (
              <span className="sync-info-highlight">
                (마지막 업데이트: {syncStatus.synced_at} | 업데이트자: {syncStatus.synced_by_name})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="quick-guide-card-voc animate-fade-in">
        <div className="guide-icon">🤖</div>
        <div className="guide-content">
          <h4>AI VOC 어시스턴트 활용 가이드</h4>
          <ul>
            <li><strong>목표:</strong> 고객의 불편함을 빠르게 해소하고 품격 있는 브랜드 이미지를 전달합니다.</li>
            <li><strong>데이터 연동:</strong> '웰리 지식 백과'에 등록된 최신 정보가 답변에 자동으로 반영됩니다.</li>
            <li><strong>작성 팁:</strong> 고객의 성함을 입력하면 더욱 친근한 맞춤형 답변이 생성됩니다.</li>
          </ul>
        </div>
      </div>

      <div className="voc-workspace">
        <div className="voc-input-section">
          {unansweredList.length > 0 && (
            <div className="unanswered-voc-list">
              <div className="section-label">🚨 새로 수집된 미답변 VOC ({unansweredList.length}건)</div>
              <div className="voc-cards-container">
                {unansweredList.map((voc) => (
                  <div 
                    key={voc.id} 
                    className="voc-card"
                    onClick={() => {
                      setCustomerName(voc.customer_name);
                      setVocContent(`제목: ${voc.title}\n카테고리: ${voc.category}\n\n${voc.content}`);
                    }}
                  >
                    <div className="voc-card-header">
                      <span className="voc-category">{voc.category}</span>
                      <span className="voc-name">{voc.customer_name}님</span>
                    </div>
                    <div className="voc-card-title">{voc.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {answeredList.length > 0 && (
            <div className="answered-voc-list">
              <div className="section-label">📚 최근 완료된 VOC (학습 자료용)</div>
              <div className="voc-cards-container">
                {answeredList.map((voc) => (
                  <div 
                    key={voc.id} 
                    className={`voc-card answered-card ${expandedVocId === voc.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedVocId(expandedVocId === voc.id ? null : voc.id)}
                  >
                    <div className="voc-card-header">
                      <span className="voc-category">{voc.category}</span>
                      <span className="voc-name">{voc.customer_name}님</span>
                    </div>
                    <div className="voc-card-title">{voc.title}</div>
                    
                    {expandedVocId === voc.id && (
                      <div className="voc-card-expanded-content">
                        <div className="expanded-section">
                          <div className="expanded-label">문의 내용</div>
                          <div className="expanded-text">{voc.content}</div>
                        </div>
                        <div className="expanded-section">
                          <div className="expanded-label">답변 내용</div>
                          <div className="expanded-text answer-text">{voc.answer}</div>
                        </div>
                        <div className="expanded-actions">
                          <button 
                            className="save-knowledge-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveToKnowledgeBase(voc);
                            }}
                          >
                            ⭐ 이 답변을 학습자료로 저장
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="input-field-group">
            <div className="section-label">고객 성함 (선택)</div>
            <input
              type="text"
              placeholder="예: 홍길동"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="name-input"
            />
          </div>

          <div className="input-field-group">
            <div className="section-label">고객 문의 내용 (VOC)</div>
            <textarea
              placeholder="고객의 문의 내용을 복사하여 붙여넣으세요..."
              value={vocContent}
              onChange={(e) => setVocContent(e.target.value)}
              className="voc-textarea-new"
            />
          </div>

          <div className="input-field-group">
            <div className="section-label">답변 초안 (선택 사항)</div>
            <textarea
              placeholder="직접 작성하고 싶은 답변의 핵심 내용이나 방향을 적어주시면 AI가 참고하여 문장을 다듬어줍니다."
              value={draftAnswer}
              onChange={(e) => setDraftAnswer(e.target.value)}
              className="voc-textarea-new draft-textarea"
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
                  <span>내용 입력 후 버튼을 누르면<br />최적의 공식 답변이 생성됩니다.</span>
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
        <h4>💡 스마트 답변 시스템 가이드</h4>
        <p>• <strong>실시간 정보 반영:</strong> '웰리 지식 백과'에 등록된 최신 시설 및 운영 정보를 자동으로 참고합니다.</p>
        <p>• <strong>계절별 자동 인사:</strong> 현재 날짜를 인식하여 계절에 맞는 품격 있는 인사말이 포함됩니다.</p>
        <p>• <strong>개인화 서비스:</strong> 고객 성함 입력 시 더욱 정중하고 친근한 맞춤형 응대가 가능합니다.</p>
        <p>• <strong>유연한 스타일:</strong> 상황에 맞춰 3가지 답변 톤(정중/공감/간결)을 자유롭게 선택할 수 있습니다.</p>
        <div className="mandatory-review">
          ⚠️ <strong>최종 검수 필수:</strong> 생성된 답변은 반드시 담당자가 내용의 정확성을 재검토한 후 사용하시기 바랍니다.
        </div>
      </div>
    </div>
  );
};

export default VOCAssistant;
