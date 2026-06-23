import React, { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './SpaceSimulator.css';

const SpaceSimulator: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [situation, setSituation] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  
  // Sticker States
  const [generatedSticker, setGeneratedSticker] = useState<string | null>(null);
  const [stickerX, setStickerX] = useState<number>(50); // percentage
  const [stickerY, setStickerY] = useState<number>(50); // percentage
  const [stickerSize, setStickerSize] = useState<number>(40); // percentage of container
  const [blendMode, setBlendMode] = useState<string>('multiply'); // multiply is good for removing white bg

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setGeneratedSticker(null); // Reset sticker
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSimulation = async () => {
    if (!selectedImage) {
      alert('먼저 실제 장소의 배경 사진을 업로드해주세요.');
      return;
    }
    if (!situation.trim()) {
      alert('추가하고 싶은 요소를 입력해주세요. (예: 예쁜 나무 벤치, 무지개색 페인트)');
      return;
    }

    setIsGenerating(true);
    setGeneratedSticker(null);
    setProgressText('AI 에셋 분석 및 스티커 설계 중...');

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API 키가 없습니다.");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1];

      const prompt = `
당신은 AR 스티커 에셋(Asset) 디자이너입니다.
사용자가 원본 사진에 다음 사물이나 요소를 합성하려고 합니다: "${situation}"

사용자의 텍스트를 분석하여, 사진에 새롭게 '추가'되어야 할 단 하나의 핵심 객체(사물/에셋)를 파악하세요.
그리고 그 객체만 단독으로 그려진 이미지를 생성하기 위한 영문 프롬프트(English Prompt)를 작성하세요.

조건:
1. 배경은 반드시 완전히 퓨어 화이트(pure solid white background)로 지정하여 나중에 투명하게 합성하기 쉽게 만드세요.
2. 피사체는 화면 중앙에 꽉 차게(centered, large, isolated, single object) 그려지도록 묘사하세요.
3. 원본 배경 사진과 어울릴 수 있게 실사(photorealistic, highly detailed, realistic lighting) 스타일로 묘사하세요.
4. 어떤 설명이나 서론도 없이, 오직 영문 프롬프트 한 문장만 출력하세요.
예시: "A photorealistic wooden park bench, highly detailed, isolated on a pure solid white background"
`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        }
      ]);

      const englishPrompt = result.response.text().trim();
      console.log('생성된 스티커 영문 프롬프트:', englishPrompt);

      setProgressText('AI 스티커 에셋 렌더링 중...');

      const encodedPrompt = encodeURIComponent(englishPrompt);
      const seed = Math.floor(Math.random() * 1000000);
      // Generate a square image for the sticker
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;

      const img = new Image();
      img.onload = () => {
        setGeneratedSticker(imageUrl);
        setStickerX(50);
        setStickerY(50);
        setStickerSize(40);
        setIsGenerating(false);
      };
      img.onerror = () => {
        throw new Error('스티커 렌더링 서버 응답 지연');
      };
      img.src = imageUrl;

    } catch (error: any) {
      alert('스티커 생성 중 오류가 발생했습니다: ' + error.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="simulator-container animate-fade-in">
      <div className="simulator-header">
        <div className="header-titles">
          <h1>🪄 공간 시뮬레이터 (AI AR 스티커)</h1>
          <p>원본 사진을 100% 보존하면서, 원하는 사물(AI 스티커)만 쏙 뽑아내어 자유롭게 합성해 보세요.</p>
        </div>
      </div>

      <div className="simulator-workspace">
        <div className="simulator-left-panel">
          <div className="panel-section">
            <h2 className="section-title">1. 배경 사진 업로드 (원본 유지)</h2>
            <div 
              className="upload-box mini" 
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedImage ? (
                <img src={selectedImage} alt="Background" className="preview-image" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📸</span>
                  <p>현장 사진 업로드</p>
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
              <button className="clear-image-btn" onClick={() => { setSelectedImage(null); setGeneratedSticker(null); }}>
                배경 사진 변경하기
              </button>
            )}
          </div>

          <div className="panel-section">
            <h2 className="section-title">2. 추가할 요소 입력</h2>
            <textarea
              className="situation-textarea small"
              placeholder="예: 예쁜 공원 벤치 / 무지개색 파라솔 / 바닥에 그려진 사방치기 선"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
            />
            <button 
              className="generate-sim-btn mt-3" 
              onClick={generateSimulation}
              disabled={isGenerating || !selectedImage || !situation.trim()}
            >
              {isGenerating ? 'AI 스티커 에셋 렌더링 중...' : '✨ 이 요소만 AI로 생성하기'}
            </button>
          </div>

          {generatedSticker && (
            <div className="panel-section sticker-controls animate-fade-in">
              <h2 className="section-title">3. 스티커 조종기 (배치 & 합성)</h2>
              
              <div className="control-group">
                <label>크기 조절 ({stickerSize}%)</label>
                <input type="range" min="10" max="150" value={stickerSize} onChange={(e) => setStickerSize(Number(e.target.value))} />
              </div>
              
              <div className="control-group">
                <label>가로 위치 조절 (좌 ↔ 우)</label>
                <input type="range" min="0" max="100" value={stickerX} onChange={(e) => setStickerX(Number(e.target.value))} />
              </div>

              <div className="control-group">
                <label>세로 위치 조절 (상 ↔ 하)</label>
                <input type="range" min="0" max="100" value={stickerY} onChange={(e) => setStickerY(Number(e.target.value))} />
              </div>

              <div className="control-group">
                <label>합성 모드 (배경색 제거)</label>
                <select value={blendMode} onChange={(e) => setBlendMode(e.target.value)}>
                  <option value="multiply">Multiply (흰색 배경 제거/어둡게 합성)</option>
                  <option value="normal">Normal (배경 유지/일반 스티커)</option>
                  <option value="screen">Screen (검은색 배경 제거/밝게 합성)</option>
                  <option value="overlay">Overlay (자연스러운 겹침)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="simulator-right-panel">
          <div className="panel-section result-section">
            <h2 className="section-title">🖼️ AR 합성 결과 화면</h2>
            
            <div className="result-display-area ar-canvas">
              {isGenerating ? (
                <div className="loading-overlay">
                  <div className="loader"></div>
                  <p className="loading-text">{progressText}</p>
                </div>
              ) : selectedImage ? (
                <div className="ar-container">
                  {/* 배경 사진 */}
                  <img src={selectedImage} alt="Background" className="ar-bg-image" />
                  
                  {/* AI 스티커 오버레이 */}
                  {generatedSticker && (
                    <img 
                      src={generatedSticker} 
                      alt="Sticker" 
                      className="ar-sticker" 
                      style={{
                        left: `${stickerX}%`,
                        top: `${stickerY}%`,
                        width: `${stickerSize}%`,
                        mixBlendMode: blendMode as any
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="empty-result-placeholder">
                  <span className="empty-icon">🖼️</span>
                  <p>왼쪽에서 배경을 업로드하고 요소를 추가하면<br />이곳에 합성된 결과가 실시간으로 나타납니다.</p>
                </div>
              )}
            </div>
            
            <div className="info-box-sim">
              <h4>💡 무과금 AR 스티커 활용법</h4>
              <p>• <b>'합성 모드'</b>를 조작하면 스티커의 하얀 배경을 투명하게 날려버릴 수 있습니다!</p>
              <p>• 슬라이더를 움직여 스티커를 원하는 위치와 크기로 완벽하게 맞춰보세요.</p>
              <p>• 원본 사진은 1px도 훼손되지 않으니 안심하고 여러 객체를 테스트해 보세요.</p>
            </div>

            <div className="adobe-firefly-banner">
              <div className="firefly-content">
                <h4>✨ 더 완벽하고 정교한 합성이 필요하신가요?</h4>
                <p>그림자나 빛 반사까지 계산된 <b>최종 보고서용 고퀄리티 작업</b>은 어도비 파이어플라이의 '생성형 채우기'를 활용해 보세요. (보유하신 어도비 계정으로 무료 이용 가능)</p>
              </div>
              <a href="https://firefly.adobe.com/upload/inpaint" target="_blank" rel="noopener noreferrer" className="firefly-btn">
                <span className="icon">🚀</span> 어도비 파이어플라이 열기
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceSimulator;
