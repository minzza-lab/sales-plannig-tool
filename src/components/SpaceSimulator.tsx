import React, { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './SpaceSimulator.css';

const SpaceSimulator: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [situation, setSituation] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [simulatedImage, setSimulatedImage] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setSimulatedImage(null); // Reset on new upload
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSimulation = async () => {
    if (!selectedImage) {
      alert('먼저 실제 장소의 사진을 업로드해주세요.');
      return;
    }
    if (!situation.trim()) {
      alert('원하는 시뮬레이션 상황을 입력해주세요. (예: 무지개 페인트를 칠해서 포토존을 생성한다)');
      return;
    }

    setIsGenerating(true);
    setSimulatedImage(null);
    setProgressText('사진 분석 및 AI 프롬프트 설계 중...');

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API 키가 없습니다.");

      // 1. Gemini로 원본 이미지 분석 및 합성 프롬프트 생성
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Use flash for speed

      // Extract base64 data correctly
      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1];

      const prompt = `
당신은 최고의 공간 디자이너이자 AI 이미지 생성 프롬프트 전문가입니다.
사용자가 제공한 실제 장소 사진을 바탕으로 다음 시뮬레이션을 적용하려고 합니다.

[적용할 시뮬레이션 상황]
"${situation}"

이 상황이 완벽하게 적용된 최종 결과물 사진을 생성하기 위해, 고품질 Text-to-Image AI(Midjourney 등)에 입력할 **매우 상세한 영문 프롬프트(English Prompt)**를 작성해주세요.

조건:
1. 원본 사진의 주요 배경, 구도, 조명, 계절감, 재질 등을 매우 상세하게 묘사하세요.
2. 사용자가 요청한 [상황]이 자연스럽게 공간에 녹아든 모습을 구체적으로 묘사하세요.
3. "A photorealistic image of..." 와 같이 사진처럼 보이도록 유도하는 키워드(photorealistic, 8k resolution, highly detailed, realistic lighting)를 반드시 포함하세요.
4. 설명이나 서론 없이, 순수하게 영어 프롬프트 텍스트만 출력하세요.
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
      console.log('생성된 영문 프롬프트:', englishPrompt);

      setProgressText('AI 시뮬레이션 이미지 렌더링 중...');

      // 2. Pollinations.ai 무료 이미지 생성 API를 통해 이미지 합성
      const encodedPrompt = encodeURIComponent(englishPrompt);
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;

      // Pre-load image to avoid broken thumbnail during load
      const img = new Image();
      img.onload = () => {
        setSimulatedImage(imageUrl);
        setIsGenerating(false);
      };
      img.onerror = () => {
        throw new Error('이미지 생성 서버 응답 지연');
      };
      img.src = imageUrl;

    } catch (error: any) {
      alert('시뮬레이션 생성 중 오류가 발생했습니다: ' + error.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="simulator-container animate-fade-in">
      <div className="simulator-header">
        <div className="header-titles">
          <h1>🪄 공간 시뮬레이터 (AI)</h1>
          <p>실제 사진을 업로드하고 원하는 변화를 입력하면, AI가 완성된 모습을 미리 보여줍니다.</p>
        </div>
      </div>

      <div className="simulator-workspace">
        <div className="simulator-left-panel">
          <div className="panel-section">
            <h2 className="section-title">1. 실제 현장 사진 업로드</h2>
            <div 
              className="upload-box" 
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedImage ? (
                <img src={selectedImage} alt="Uploaded" className="preview-image" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📸</span>
                  <p>클릭하여 사진을 업로드하세요</p>
                  <span className="upload-hint">JPG, PNG 파일 지원</span>
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
            <h2 className="section-title">2. 원하는 시뮬레이션 상황 입력</h2>
            <textarea
              className="situation-textarea"
              placeholder="예: 산책로 바닥에 무지개 페인트를 칠해서 포토존을 생성하고 주변에 예쁜 조명을 달아줘"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
            />
          </div>

          <button 
            className="generate-sim-btn" 
            onClick={generateSimulation}
            disabled={isGenerating || !selectedImage || !situation.trim()}
          >
            {isGenerating ? '시뮬레이션 렌더링 중...' : '✨ 시뮬레이션 이미지 생성하기'}
          </button>
        </div>

        <div className="simulator-right-panel">
          <div className="panel-section result-section">
            <h2 className="section-title">3. AI 시뮬레이션 결과</h2>
            
            <div className="result-display-area">
              {isGenerating ? (
                <div className="loading-overlay">
                  <div className="loader"></div>
                  <p className="loading-text">{progressText}</p>
                </div>
              ) : simulatedImage ? (
                <div className="result-image-container">
                  <img src={simulatedImage} alt="Simulated Result" className="result-image" />
                  <a href={simulatedImage} download="simulated_result.jpg" className="download-btn-overlay">
                    💾 결과 저장하기
                  </a>
                </div>
              ) : (
                <div className="empty-result-placeholder">
                  <span className="empty-icon">🎨</span>
                  <p>사진과 상황을 입력하고 버튼을 누르면<br />여기에 시뮬레이션 결과가 나타납니다.</p>
                </div>
              )}
            </div>
            
            <div className="info-box-sim">
              <h4>💡 시뮬레이터 활용 팁</h4>
              <p>• 구도가 넓고 빛이 고른 사진일수록 합성이 자연스럽습니다.</p>
              <p>• 요구사항을 구체적으로 적어주세요. (색상, 재질, 조명 등)</p>
              <p>• 결과물이 마음에 들지 않으면 버튼을 다시 눌러 새로운 시안을 뽑아보세요.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceSimulator;
