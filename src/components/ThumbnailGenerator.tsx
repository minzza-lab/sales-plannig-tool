import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import './ThumbnailGenerator.css';

interface CopyOption {
  main: string;
  sub: string;
}

const ThumbnailGenerator: React.FC = () => {
  const [productName, setProductName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [copyOptions, setCopyOptions] = useState<CopyOption[]>([]);
  const [selectedCopyIndex, setSelectedCopyIndex] = useState<number>(0);
  
  // Customization states
  const [mainText, setMainText] = useState('');
  const [subText, setSubText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [textPosition, setTextPosition] = useState<'center' | 'bottom' | 'top'>('center');

  const canvasRef = useRef<HTMLDivElement>(null);

  const generateThumbnail = async () => {
    if (!productName.trim()) {
      alert("상품명이나 기획 의도를 입력해주세요.");
      return;
    }

    setIsGenerating(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API 키가 없습니다.");

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
당신은 웰리힐리파크 리조트의 전문 마케터이자 디자이너입니다.
사용자가 다음 상품에 대한 썸네일(광고 이미지)을 만들려고 합니다: "${productName}"

이 썸네일을 위한 고품질 배경 이미지 프롬프트(반드시 영어로, Stable Diffusion 스타일)와, 시선을 사로잡는 마케팅 카피(메인 카피, 서브 카피) 3가지를 제안해주세요.
배경 이미지 프롬프트는 텍스트를 넣을 수 있도록 'blank space, clean background, abstract or realistic blur' 같은 키워드를 포함하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 출력하지 마세요.
{
  "imagePrompt": "english prompt for background...",
  "copyOptions": [
    { "main": "끌리는 메인 카피 1", "sub": "설명하는 서브 카피 1" },
    { "main": "끌리는 메인 카피 2", "sub": "설명하는 서브 카피 2" },
    { "main": "끌리는 메인 카피 3", "sub": "설명하는 서브 카피 3" }
  ]
}
      `;

      const result = await model.generateContent(prompt);
      let responseText = result.response.text();
      
      // JSON 파싱 (마크다운 코드 블록 제거)
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(responseText);

      // Pollinations AI로 이미지 URL 생성
      const encodedPrompt = encodeURIComponent(parsed.imagePrompt + ", highly detailed, 4k, marketing photography, beautiful lighting");
      // 캐시 방지를 위해 랜덤 시드 추가
      const randomSeed = Math.floor(Math.random() * 100000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&seed=${randomSeed}`;

      setBgImageUrl(imageUrl);
      setCopyOptions(parsed.copyOptions);
      setMainText(parsed.copyOptions[0].main);
      setSubText(parsed.copyOptions[0].sub);
      setSelectedCopyIndex(0);

    } catch (error: any) {
      alert("생성 중 오류가 발생했습니다: " + error.message);
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySelect = (index: number) => {
    setSelectedCopyIndex(index);
    setMainText(copyOptions[index].main);
    setSubText(copyOptions[index].sub);
  };

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    
    try {
      const canvas = await html2canvas(canvasRef.current, {
        scale: 2, // 고해상도 다운로드
        useCORS: true, // 외부 이미지 로드 허용
        allowTaint: true,
      });
      
      const link = document.createElement('a');
      link.download = `썸네일_${productName}_${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      alert("다운로드 중 오류가 발생했습니다.");
      console.error(err);
    }
  };

  return (
    <div className="thumb-container animate-fade-in">
      <div className="thumb-header">
        <h1>🎨 AI 마케팅 썸네일 스튜디오</h1>
        <p>기획 의도만 적으면 AI가 배경 이미지를 그리고 찰떡같은 카피까지 얹어드립니다.</p>
      </div>

      <div className="thumb-input-section">
        <input 
          type="text" 
          placeholder="어떤 상품/이벤트의 썸네일을 만들까요? (예: 겨울 스키장 얼리버드 시즌권)" 
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && generateThumbnail()}
        />
        <button onClick={generateThumbnail} disabled={isGenerating}>
          {isGenerating ? '마법 부리는 중... ✨' : '썸네일 뚝딱 만들기 🚀'}
        </button>
      </div>

      {bgImageUrl && (
        <div className="thumb-editor-grid">
          {/* Left: Preview Canvas */}
          <div className="thumb-preview-panel">
            <div 
              className="canvas-wrapper" 
              ref={canvasRef}
              style={{ backgroundImage: `url(${bgImageUrl})` }}
            >
              <div 
                className="canvas-overlay" 
                style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity / 100})` }}
              ></div>
              <div className={`canvas-content position-${textPosition}`}>
                <h2 style={{ color: textColor }}>{mainText}</h2>
                <p style={{ color: textColor }}>{subText}</p>
              </div>
            </div>
            <button className="download-btn" onClick={handleDownload}>
              💾 이 썸네일 다운로드 (PNG)
            </button>
          </div>

          {/* Right: Controls */}
          <div className="thumb-controls-panel">
            <div className="control-group">
              <h3>📝 AI가 추천하는 카피</h3>
              <div className="copy-options">
                {copyOptions.map((copy, idx) => (
                  <div 
                    key={idx} 
                    className={`copy-card ${selectedCopyIndex === idx ? 'active' : ''}`}
                    onClick={() => handleCopySelect(idx)}
                  >
                    <span className="copy-badge">옵션 {idx + 1}</span>
                    <div className="copy-texts">
                      <strong>{copy.main}</strong>
                      <span>{copy.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="control-group">
              <h3>✏️ 문구 직접 수정</h3>
              <input 
                type="text" 
                value={mainText} 
                onChange={(e) => setMainText(e.target.value)} 
                className="edit-input"
                placeholder="메인 카피"
              />
              <input 
                type="text" 
                value={subText} 
                onChange={(e) => setSubText(e.target.value)} 
                className="edit-input"
                placeholder="서브 카피"
              />
            </div>

            <div className="control-group">
              <h3>🎨 디자인 조정</h3>
              
              <label>문구 색상</label>
              <div className="color-presets">
                {['#ffffff', '#000000', '#fef08a', '#fda4af', '#67e8f9'].map(color => (
                  <button 
                    key={color} 
                    className={`color-btn ${textColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTextColor(color)}
                  />
                ))}
              </div>

              <label>배경 어둡기 (글씨가 잘 보이도록)</label>
              <input 
                type="range" 
                min="0" max="80" 
                value={overlayOpacity} 
                onChange={(e) => setOverlayOpacity(Number(e.target.value))} 
                className="slider"
              />

              <label>문구 위치</label>
              <div className="position-buttons">
                <button 
                  className={textPosition === 'top' ? 'active' : ''} 
                  onClick={() => setTextPosition('top')}
                >상단</button>
                <button 
                  className={textPosition === 'center' ? 'active' : ''} 
                  onClick={() => setTextPosition('center')}
                >중앙</button>
                <button 
                  className={textPosition === 'bottom' ? 'active' : ''} 
                  onClick={() => setTextPosition('bottom')}
                >하단</button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailGenerator;
