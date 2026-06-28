import React, { useState, useRef } from 'react';
import { apiKeyManager } from '../utils/apiKeyManager';
import './TTSGenerator.css';

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  description: string;
}

const VOICE_OPTIONS: VoiceOption[] = [
  // 최신 프리미엄 (Chirp3-HD)
  { id: 'ko-KR-Chirp3-HD-Aoede', name: '[NEW] 감성적인 여성 (Chirp3)', gender: 'FEMALE', description: '가장 자연스럽고 감성적인 리조트 내레이션' },
  { id: 'ko-KR-Chirp3-HD-Callirrhoe', name: '[NEW] 맑고 밝은 여성 (Chirp3)', gender: 'FEMALE', description: '경쾌한 이벤트, 프로모션 홍보' },
  { id: 'ko-KR-Chirp3-HD-Charon', name: '[NEW] 차분한 남성 (Chirp3)', gender: 'MALE', description: '고급스럽고 신뢰감 있는 안내 방송' },
  { id: 'ko-KR-Chirp3-HD-Fenrir', name: '[NEW] 묵직한 남성 (Chirp3)', gender: 'MALE', description: '안전 수칙, 주의사항 강조' },
  
  // 기존 고급 성우 (Neural2 / Wavenet)
  { id: 'ko-KR-Neural2-A', name: '차분한 여성 (Neural2)', gender: 'FEMALE', description: '기본적인 안내 방송에 적합' },
  { id: 'ko-KR-Wavenet-A', name: '정통 아나운서 여성 (Wavenet)', gender: 'FEMALE', description: '공식적이고 명확한 전달력' },
  { id: 'ko-KR-Neural2-C', name: '신뢰감 있는 남성 (Neural2)', gender: 'MALE', description: '격식 있는 안내, 중후한 느낌' },
  
  // 외국어 안내방송용
  { id: 'en-US-Neural2-F', name: '미국 영어 여성 (안내용)', gender: 'FEMALE', description: '외국인 고객 대상 영어 안내 방송 (입력도 영어로)' },
  { id: 'en-US-Neural2-J', name: '미국 영어 남성 (안내용)', gender: 'MALE', description: '외국인 고객 대상 영어 안내 방송 (입력도 영어로)' },
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
  
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isPlayingVoice, setIsPlayingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const playPreview = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();

    if (isPlayingVoice === voiceId) {
      previewAudioRef.current?.pause();
      setIsPlayingVoice(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    setIsPlayingVoice(voiceId);

    if (previewUrls[voiceId]) {
      const audio = new Audio(previewUrls[voiceId]);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingVoice(null);
      audio.play();
      return;
    }

    try {
      const apiKey = apiKeyManager.getTTSKey();
      if (!apiKey) throw new Error("Google TTS API 키가 설정되지 않았습니다. 사이드바 하단에서 등록해 주세요.");

      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: "안녕하세요, 웰리힐리파크에 오신 것을 환영합니다. Welcome to Welli Hilli Park." },
          voice: { languageCode: voiceId.substring(0, 5), name: voiceId },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error && data.error.message.includes('API has not been used')) {
           throw new Error("Google Cloud Console에서 'Cloud Text-to-Speech API'를 활성화해야 합니다.");
        }
        throw new Error(data.error?.message || "미리듣기 생성 실패");
      }

      if (data.audioContent) {
        const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
        const url = URL.createObjectURL(audioBlob);
        
        setPreviewUrls(prev => ({ ...prev, [voiceId]: url }));
        
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.onended = () => setIsPlayingVoice(null);
        audio.play();
      }
    } catch (error: any) {
      alert("미리듣기 실패: " + error.message);
      setIsPlayingVoice(null);
    }
  };

  const generateScript = async () => {
    const situation = customSituation || selectedSituation;
    if (!situation) {
      alert("상황을 선택하거나 직접 입력해주세요.");
      return;
    }

    setIsGeneratingScript(true);
    try {
      const apiKey = apiKeyManager.getGeminiKey();
      if (!apiKey) throw new Error("Gemini API 키가 설정되지 않았습니다. 사이드바 하단에서 등록해 주세요.");

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

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
      const apiKey = apiKeyManager.getTTSKey();
      if (!apiKey) throw new Error("Google TTS API 키가 설정되지 않았습니다. 사이드바 하단에서 등록해 주세요.");

      // Google Cloud Text-to-Speech API Call
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text },
          voice: { languageCode: selectedVoice.substring(0, 5), name: selectedVoice },
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
          <h1>🎙️ 안내방송용 TTS 생성기</h1>
          <p>리조트 홍보 영상이나 장내 안내 방송용 고품질 음성(MP3)을 생성합니다.</p>
        </div>
      </div>

      <div className="tts-content-grid">
        <div className="tts-left-panel">
          <div className="panel-section">
            <h2 className="section-title">✨ 대본 초안 작성기</h2>
            <p className="section-desc">상황을 선택하면 자연스러운 안내/홍보 멘트를 뚝딱 써줍니다.</p>
            
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
            <p className="section-desc">자동 생성된 대본을 입맛에 맞게 수정하거나, 직접 문구를 입력하세요.</p>
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
                  <button 
                    className="preview-btn" 
                    onClick={(e) => playPreview(e, voice.id)}
                    title="미리 듣기"
                  >
                    {isPlayingVoice === voice.id ? '⏹️' : '▶️'}
                  </button>
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
