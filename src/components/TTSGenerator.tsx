import React, { useState } from 'react';
import './TTSGenerator.css';

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  description: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'ko-KR-Neural2-A', name: '차분한 여성 (기본)', gender: 'FEMALE', description: '안내 방송, 부드러운 내레이션에 적합' },
  { id: 'ko-KR-Neural2-B', name: '부드러운 남성', gender: 'FEMALE', description: '신뢰감 있는 안내, 홍보 영상' }, // Note: Neural2-B is female, C is male
  { id: 'ko-KR-Neural2-C', name: '신뢰감 있는 남성', gender: 'MALE', description: '격식 있는 안내, 중후한 느낌' },
  { id: 'ko-KR-Standard-A', name: '밝은 여성 (표준)', gender: 'FEMALE', description: '발랄한 이벤트 안내, 쇼츠/릴스' },
  { id: 'ko-KR-Standard-C', name: '명확한 남성 (표준)', gender: 'MALE', description: '명확한 정보 전달' },
];

const PRESET_SITUATIONS = [
  "스키장/워터파크 개장 안내 방송",
  "현장 이벤트/할인 프로모션 홍보 (릴스용)",
  "안전 수칙 안내 (콘도/수영장)",
  "분실물 센터 안내 방송",
  "영업 종료 안내 방송",
  "기상 악화로 인한 운영 변경 안내"
];

const TTSGenerator: React.FC = () => {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICE_OPTIONS[0].id);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [selectedSituation, setSelectedSituation] = useState('');
  const [customSituation, setCustomSituation] = useState('');

  const generateScript = async () => {
    const situation = customSituation || selectedSituation;
    if (!situation) {
      alert("상황을 선택하거나 직접 입력해주세요.");
      return;
    }

    setIsGeneratingScript(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API 키가 없습니다.");

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
당신은 '웰리힐리파크' 리조트(스키장, 워터파크, 콘도)의 전문 카피라이터이자 사내 방송 작가입니다.
사용자가 다음 상황에 대한 음성 안내(또는 홍보 영상) 대본을 요청했습니다: "${situation}"

조건:
1. 실제 성우가 읽을 수 있도록 자연스러운 구어체로 작성하세요.
2. 길이는 3~5문장 내외로, 너무 길지 않게 핵심만 담으세요.
3. 괄호 안의 행동 지시문(예: 웃으며, 사이 쉬고) 등은 넣지 말고, 순수하게 '읽을 텍스트'만 작성하세요.
4. 존댓말과 정중한 톤을 사용하되, 상황에 따라 이벤트는 발랄하게, 안내는 차분하게 작성하세요.
      `;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      setText(response.trim());
      setAudioUrl(null); // 대본이 바뀌면 기존 오디오 초기화
    } catch (error: any) {
      alert("대본 생성 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const generateAudio = async () => {
    if (!text.trim()) {
      alert("변환할 텍스트를 입력해주세요.");
      return;
    }

    setIsGeneratingAudio(true);
    setAudioUrl(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // Google Cloud API Key (usually same as Gemini if enabled)
      if (!apiKey) throw new Error("API 키가 없습니다.");

      // Google Cloud Text-to-Speech API Call
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text },
          voice: { languageCode: "ko-KR", name: selectedVoice },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error && data.error.message.includes('API has not been used')) {
           throw new Error("Google Cloud Console에서 'Cloud Text-to-Speech API'를 먼저 활성화해야 합니다.");
        }
        throw new Error(data.error?.message || "음성 생성 실패");
      }

      if (data.audioContent) {
        // Base64 to Blob URL
        const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      }
    } catch (error: any) {
      alert("음성 생성 중 오류가 발생했습니다:\n\n" + error.message);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const base64ToBlob = (base64: string, type: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: type });
  };

  return (
    <div className="tts-container animate-fade-in">
      <div className="tts-header">
        <div className="header-titles">
          <h1>🎙️ AI 성우 스튜디오</h1>
          <p>리조트 홍보 영상이나 장내 안내 방송용 고품질 음성(MP3)을 생성합니다.</p>
        </div>
      </div>

      <div className="tts-content-grid">
        <div className="tts-left-panel">
          <div className="panel-section">
            <h2 className="section-title">✨ AI 대본 초안 작성기</h2>
            <p className="section-desc">상황을 선택하면 AI가 자연스러운 안내/홍보 멘트를 뚝딱 써줍니다.</p>
            
            <div className="situation-selector">
              <select 
                value={selectedSituation} 
                onChange={(e) => {
                  setSelectedSituation(e.target.value);
                  setCustomSituation('');
                }}
              >
                <option value="">-- 자주 쓰이는 리조트 상황 선택 --</option>
                {PRESET_SITUATIONS.map(sit => (
                  <option key={sit} value={sit}>{sit}</option>
                ))}
              </select>
              
              <div className="custom-situation">
                <input 
                  type="text" 
                  placeholder="또는 원하는 상황을 직접 입력하세요 (예: 셔틀버스 지연 안내)" 
                  value={customSituation}
                  onChange={(e) => {
                    setCustomSituation(e.target.value);
                    setSelectedSituation('');
                  }}
                />
                <button 
                  className="generate-script-btn" 
                  onClick={generateScript}
                  disabled={isGeneratingScript || (!selectedSituation && !customSituation)}
                >
                  {isGeneratingScript ? '작성 중...' : '대본 생성'}
                </button>
              </div>
            </div>
          </div>

          <div className="panel-section">
            <h2 className="section-title">📝 대본 수정 및 텍스트 입력</h2>
            <p className="section-desc">AI가 쓴 대본을 입맛에 맞게 수정하거나, 직접 문구를 입력하세요.</p>
            <textarea
              className="script-textarea"
              placeholder="여기에 읽어줄 텍스트를 입력하세요. 마침표나 쉼표를 적절히 넣으면 더 자연스럽게 읽습니다."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setAudioUrl(null);
              }}
            />
          </div>
        </div>

        <div className="tts-right-panel">
          <div className="panel-section">
            <h2 className="section-title">👤 성우 선택 및 음성 생성</h2>
            
            <div className="voice-selector">
              {VOICE_OPTIONS.map(voice => (
                <div 
                  key={voice.id} 
                  className={`voice-card ${selectedVoice === voice.id ? 'active' : ''}`}
                  onClick={() => setSelectedVoice(voice.id)}
                >
                  <div className="voice-icon">
                    {voice.gender === 'MALE' ? '👨‍💼' : '👩‍💼'}
                  </div>
                  <div className="voice-info">
                    <h4>{voice.name}</h4>
                    <p>{voice.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <button 
              className="generate-audio-btn" 
              onClick={generateAudio}
              disabled={isGeneratingAudio || !text.trim()}
            >
              <span className="icon">🎧</span>
              {isGeneratingAudio ? '고품질 음성 합성 중...' : '이 목소리로 MP3 생성하기'}
            </button>
          </div>

          {audioUrl && (
            <div className="panel-section audio-result-section animate-fade-in">
              <h2 className="section-title">✅ 음성 생성 완료!</h2>
              <div className="audio-player-wrapper">
                <audio controls src={audioUrl} className="custom-audio-player" />
              </div>
              <a 
                href={audioUrl} 
                download={`웰리힐리파크_안내방송_${new Date().getTime()}.mp3`}
                className="download-mp3-btn"
              >
                <span className="icon">💾</span> MP3 파일 다운로드
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TTSGenerator;
