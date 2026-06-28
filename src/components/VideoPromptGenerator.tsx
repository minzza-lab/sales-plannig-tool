import React, { useState, useRef } from 'react';
import { callGeminiWithFallback } from '../utils/apiProxy';
import './VideoPromptGenerator.css';

interface PromptResult {
  flowPrompt: string;
  korean_translation: string;
}

const VideoPromptGenerator: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  
  // Dropdown Options
  const [shotType, setShotType] = useState('🤖 AI 자동 추천 (상황에 맞게 최적화)');
  const [camera, setCamera] = useState('🤖 AI 자동 추천 (상황에 맞게 최적화)');
  const [lighting, setLighting] = useState('🤖 AI 자동 추천 (상황에 맞게 최적화)');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const generatePrompts = async () => {
    if (!selectedImage) {
      alert('먼저 기준이 될 현장 사진(이미지)을 업로드해주세요.');
      return;
    }
    if (!topic.trim()) {
      alert('사진 위에서 벌어질 핵심 상황을 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1];

      const prompt = `
당신은 Google Flow (또는 최고급 Image-to-Video AI) 영상 생성에 특화된 수석 프롬프트 엔지니어입니다.
사용자가 첨부한 원본 사진을 '첫 프레임(시작 화면)'으로 삼아, 사용자가 지정한 상황과 카메라 옵션이 적용된 완벽한 비디오 생성용 영문 프롬프트를 작성해야 합니다.

[사용자 기획]
- 사진에서 연출할 상황: ${topic}
- 구도 및 화각: ${shotType}
- 카메라 무빙: ${camera}
- 조명 및 분위기: ${lighting}

[필수 절대 조건 ⚠️]
1. 인물이 등장한다면, **반드시 한국인/동양인(Korean/East Asian)**으로 묘사해야 합니다. 서양인이 나오면 안 됩니다.
2. 사용자가 첨부한 원본 사진의 배경(장소)과 자연스럽게 이어지도록 상세히 묘사하세요.
3. 구글 Flow 등의 AI가 정확히 이해할 수 있도록 동작, 카메라 워크, 조명, 인종 정보를 영문으로 전문적이고 구체적으로 작성하세요.
4. 만약 위 사용자 기획 중 'AI 자동 추천'으로 되어 있는 항목이 있다면, 현재 상황(${topic})을 극대화할 수 있는 **가장 영화같고 전문적인 연출(카메라, 조명 등)을 당신이 직접 판단하여 프롬프트에 적용**하세요.

결과는 반드시 아래의 JSON 형식으로만 반환하세요.
{
  "flowPrompt": "Google Flow(Image-to-Video)에 그대로 복사해서 붙여넣을 최상급 영문 프롬프트 (인종 정보, 카메라 앵글, 화각, 조명, 모션 상세 묘사 포함)",
  "korean_translation": "작성된 프롬프트의 한글 번역 및 왜 이렇게 프롬프트를 구성했는지에 대한 전문가의 짧은 코멘트"
}
`;

      const responseText = await callGeminiWithFallback(
        [{ text: prompt }, { inlineData: { data: base64Data, mimeType: mimeType } }]
      );
      
      let parsedData: PromptResult;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsedData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
      } catch (e) {
        throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
      }

      setResult(parsedData);
    } catch (error: any) {
      alert('프롬프트 생성 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('프롬프트가 클립보드에 복사되었습니다! Flow에 붙여넣기 하세요.');
  };

  return (
    <div className="prompt-gen-container animate-fade-in">
      <div className="prompt-gen-header">
        <div className="header-titles">
          <h1>🤖 구글 Flow 전용 비디오 프롬프트 메이커</h1>
          <p>현장 사진을 넣고 상황을 고르면, 한국인 모델이 자연스럽게 등장하는 완벽한 비디오 생성 프롬프트를 뽑아줍니다.</p>
        </div>
      </div>

      <div className="prompt-gen-workspace">
        <div className="prompt-gen-left-panel">
          
          <div className="panel-section">
            <h2 className="section-title">1. 기준 사진(Image) 업로드</h2>
            <div 
              className="upload-box mini" 
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedImage ? (
                <img src={selectedImage} alt="Reference" className="preview-image" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📸</span>
                  <p>비디오의 첫 프레임이 될 현장 사진 업로드</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
            {selectedImage && (
              <button className="clear-image-btn" onClick={() => setSelectedImage(null)}>
                사진 다시 올리기
              </button>
            )}
          </div>

          <div className="panel-section">
            <h2 className="section-title">2. 영상 연출 기획 (한국인 자동 지정)</h2>
            
            <div className="input-group">
              <label>이 사진 위에서 어떤 일이 벌어지나요?</label>
              <textarea
                className="topic-textarea-prompt"
                placeholder="예: 튜브를 탄 가족들이 파도풀에서 즐겁게 웃으며 물장구를 친다."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="options-grid">
              <div className="input-group">
                <label>구도 및 화각 (Shot Type)</label>
                <select value={shotType} onChange={(e) => setShotType(e.target.value)}>
                  <option value="🤖 AI 자동 추천 (상황에 맞게 최적화)">🤖 AI 자동 추천 (알아서 최적화)</option>
                  <option value="Wide Shot (넓은 풍경/전신)">Wide Shot (넓은 풍경/전신)</option>
                  <option value="Medium Shot (상반신 중심)">Medium Shot (상반신 중심)</option>
                  <option value="Close-up (얼굴 표정 집중)">Close-up (얼굴 표정 집중)</option>
                  <option value="Low Angle (아래에서 위로, 웅장하게)">Low Angle (아래에서 위로)</option>
                  <option value="High Angle (위에서 아래로, 조망하듯)">High Angle (위에서 아래로)</option>
                </select>
              </div>

              <div className="input-group">
                <label>카메라 앵글 (Camera Movement)</label>
                <select value={camera} onChange={(e) => setCamera(e.target.value)}>
                  <option value="🤖 AI 자동 추천 (상황에 맞게 최적화)">🤖 AI 자동 추천 (알아서 최적화)</option>
                  <option value="Slow Pan (천천히 옆으로 이동)">Slow Pan (천천히 옆으로 이동)</option>
                  <option value="Slow Zoom In (서서히 다가가기)">Slow Zoom In (서서히 다가가기)</option>
                  <option value="Static & Steady (고정된 시선)">Static & Steady (고정된 시선)</option>
                  <option value="Tracking Shot (인물을 따라가며 촬영)">Tracking Shot (피사체 추적)</option>
                  <option value="Drone Fly-through (드론으로 날아가듯)">Drone Fly-through (드론 항공샷)</option>
                </select>
              </div>

              <div className="input-group full-width">
                <label>조명 및 무드 (Lighting & Mood)</label>
                <select value={lighting} onChange={(e) => setLighting(e.target.value)}>
                  <option value="🤖 AI 자동 추천 (상황에 맞게 최적화)">🤖 AI 자동 추천 (알아서 최적화)</option>
                  <option value="Bright Sunlight (밝고 쨍한 햇빛)">Bright Sunlight (밝고 쨍한 여름 햇빛)</option>
                  <option value="Golden Hour (따뜻하고 낭만적인 노을빛)">Golden Hour (따뜻한 노을빛)</option>
                  <option value="Cinematic Lighting (영화같은 극적인 조명)">Cinematic Lighting (영화같은 조명)</option>
                </select>
              </div>
            </div>

            <button 
              className="generate-prompt-btn" 
              onClick={generatePrompts}
              disabled={isGenerating || !selectedImage || !topic.trim()}
            >
              {isGenerating ? 'AI가 Flow 전용 프롬프트 생성 중...' : '✨ 구글 Flow 프롬프트 짜기'}
            </button>
          </div>
        </div>

        <div className="prompt-gen-right-panel">
          <div className="panel-section result-section">
            <h2 className="section-title">📝 구글 Flow 프롬프트 결과</h2>
            
            {isGenerating ? (
              <div className="loading-container-prompt">
                <div className="loader-prompt"></div>
                <p>업로드된 사진을 분석하여 카메라 구도를 설계하고 있습니다...</p>
              </div>
            ) : result ? (
              <div className="prompts-list">
                
                <div className="prompt-card flow-card">
                  <div className="card-header">
                    <h3>🎬 Google Flow 프롬프트 (Image-to-Video)</h3>
                    <button onClick={() => copyToClipboard(result.flowPrompt)}>복사하기</button>
                  </div>
                  <p className="prompt-text">{result.flowPrompt}</p>
                </div>

                <div className="prompt-card translation-card">
                  <div className="card-header">
                    <h3>🇰🇷 한국어 해석 및 코멘트</h3>
                  </div>
                  <p className="prompt-text translation">{result.korean_translation}</p>
                </div>

              </div>
            ) : (
              <div className="empty-state-prompt">
                <span className="empty-icon-prompt">⌨️</span>
                <p>좌측에서 사진과 상황을 입력하시면<br />동양인(한국인) 모델이 등장하는 완벽한 영문 프롬프트가 생성됩니다.</p>
              </div>
            )}
            
          </div>

          <div className="flow-guide-box">
            <h4>💡 Google Flow (또는 Luma, Runway) 사용 가이드</h4>
            <ol>
              <li>이 앱의 좌측에 올렸던 <b>[원본 사진]</b>을 구글 Flow(비디오 AI)의 이미지 입력칸에 동일하게 업로드합니다.</li>
              <li>위에서 생성된 <b>[Google Flow 프롬프트]</b>를 복사하여 텍스트 프롬프트 창에 그대로 붙여넣습니다.</li>
              <li>생성 버튼을 누르면, 원본 사진의 배경이 유지되면서 <b>한국인 모델</b>이 지시한 카메라 워크에 맞춰 자연스럽게 영상으로 살아납니다!</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPromptGenerator;
