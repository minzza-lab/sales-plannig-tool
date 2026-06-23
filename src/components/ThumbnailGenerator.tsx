import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import './ThumbnailGenerator.css';

interface CopyOption {
  main: string;
  sub: string;
}

const ThumbnailGenerator: React.FC = () => {
  // Input & Generation States
  const [productName, setProductName] = useState('');
  const [keyBenefits, setKeyBenefits] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [vibe, setVibe] = useState('시원하고 청량한');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [copyOptions, setCopyOptions] = useState<CopyOption[]>([]);
  const [selectedCopyIndex, setSelectedCopyIndex] = useState<number>(0);
  
  // Customization States
  const [activeTab, setActiveTab] = useState<'copy' | 'bg' | 'text' | 'badge'>('copy');
  
  // Text content & general styling
  const [mainText, setMainText] = useState('');
  const [subText, setSubText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [textPosition, setTextPosition] = useState<'center' | 'bottom' | 'top'>('center');
  
  // Ratio
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  
  // Advanced Typography
  const [mainFontFamily, setMainFontFamily] = useState('Black Han Sans');
  const [subFontFamily, setSubFontFamily] = useState('Noto Sans KR');
  const [mainFontSize, setMainFontSize] = useState(42);
  const [subFontSize, setSubFontSize] = useState(20);
  const [mainLetterSpacing, setMainLetterSpacing] = useState(0);
  const [subLetterSpacing, setSubLetterSpacing] = useState(0);
  const [mainLineHeight, setMainLineHeight] = useState(1.3);
  const [subLineHeight, setSubLineHeight] = useState(1.5);
  const [shadowPreset, setShadowPreset] = useState<'none' | 'soft' | 'heavy' | 'neon'>('soft');
  
  // Background filters & styles
  const [bgBlur, setBgBlur] = useState(0);
  const [overlayType, setOverlayType] = useState<'solid' | 'gradient' | 'tint'>('solid');
  const [tintColor, setTintColor] = useState('#1e293b');
  const [tintOpacity, setTintOpacity] = useState(20);
  
  // Badge overlay states
  const [selectedBadge, setSelectedBadge] = useState<string>('none'); // 'none', 'logo', 'special', 'best', 'limited', 'new', 'custom'
  const [badgePosition, setBadgePosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [customBadgeText, setCustomBadgeText] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);

  // Helper: Hex color to RGBA
  const hexToRgba = (hex: string, alpha: number) => {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Helper: Get Overlay Background Style
  const getOverlayStyle = () => {
    const opacityVal = overlayOpacity / 100;
    if (overlayType === 'solid') {
      return { backgroundColor: `rgba(0, 0, 0, ${opacityVal})` };
    }
    if (overlayType === 'gradient') {
      return {
        background: `linear-gradient(to top, rgba(0, 0, 0, ${opacityVal}) 0%, rgba(0, 0, 0, 0.1) 70%, rgba(0, 0, 0, 0) 100%)`
      };
    }
    if (overlayType === 'tint') {
      const tintVal = tintOpacity / 100;
      return {
        backgroundColor: hexToRgba(tintColor, tintVal),
        // Add a layer of darkness too
        boxShadow: `inset 0 0 0 2000px rgba(0, 0, 0, ${opacityVal})`
      };
    }
    return {};
  };

  // Helper: Map Font selection to CSS class prefix
  const getFontClass = (family: string) => {
    switch (family) {
      case 'Black Han Sans': return 'font-black-han';
      case 'Noto Sans KR': return 'font-noto-sans';
      case 'Gowun Batang': return 'font-gowun-batang';
      case 'Montserrat': return 'font-montserrat';
      default: return 'font-noto-sans';
    }
  };

  const generateThumbnail = async () => {
    const targetProduct = productName.trim() || "여름시즌 워터파크 시크릿 특가 티켓";

    setIsGenerating(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API 키가 없습니다.");

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

      const prompt = `
당신은 웰리힐리파크 리조트의 전문 마케터이자 디자이너입니다.
사용자가 다음 기획의도로 상품 썸네일(광고 이미지)을 만들려고 합니다:

1. 상품명/메인 키워드: "${targetProduct}"
2. 상세 소구점/혜택: "${keyBenefits.trim() || '제한 없음'}"
3. 타겟 고객층: "${targetAudience.trim() || '일반 대중'}"
4. 디자인 분위기/톤앤매너: "${vibe}"

이 정보를 바탕으로 다음 사항들을 제안해주세요:
1. 썸네일에 어울리는 고품질 배경 이미지 프롬프트 (반드시 영어로, Stable Diffusion 스타일). 
   * 기획의도의 '디자인 분위기/톤앤매너'와 '상품명/메인 키워드'를 조화롭게 시각화하는 배경이어야 합니다.
   * 텍스트를 얹을 수 있도록 여백('blank space, clean background, abstract or realistic blur')이 충분한 상태를 묘사해야 합니다.
2. 기획의도 및 소구점, 타겟층에 딱 맞춰 시선을 사로잡는 마케팅 카피 (메인 카피, 서브 카피) 3가지 제안.
   * 메인 카피는 혜택이나 특성을 임팩트 있게 담아내야 하며, 서브 카피는 소구점과 핵심 혜택을 구체적으로 풀어내어 설명해야 합니다.

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
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
      const parsed = JSON.parse(jsonMatch[0]);

      // Update text details
      setCopyOptions(parsed.copyOptions);
      setMainText(parsed.copyOptions[0].main);
      setSubText(parsed.copyOptions[0].sub);
      setSelectedCopyIndex(0);

      // Generate Image via Pollinations
      const encodedPrompt = encodeURIComponent(parsed.imagePrompt + ", highly detailed, 4k, marketing photography, beautiful lighting, clean blank space, no text");
      const randomSeed = Math.floor(Math.random() * 100000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&seed=${randomSeed}`;

      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error("이미지 생성 서버가 혼잡합니다. 다시 눌러주세요.");
      
      const blob = await imgResponse.blob();
      setBgImageUrl(URL.createObjectURL(blob));

      // Reset design options to defaults on fresh generation
      setBgBlur(0);
      setSelectedBadge('none');

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

  // Local Image Upload Handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setBgImageUrl(reader.result as string);
          // Set copy options dummy to allow editing if empty
          if (copyOptions.length === 0) {
            const dummyCopy = { main: mainText || "메인 타이틀 입력", sub: subText || "서브 설명글 입력" };
            setCopyOptions([dummyCopy]);
            setMainText(dummyCopy.main);
            setSubText(dummyCopy.sub);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    
    try {
      const canvas = await html2canvas(canvasRef.current, {
        scale: 2.5, // Ultra high resolution
        useCORS: true,
        allowTaint: true,
      });
      
      canvas.toBlob((blob) => {
        if (!blob) {
          alert("이미지 저장에 실패했습니다.");
          return;
        }
        
        const safeName = productName.replace(/[^a-zA-Z0-9가-힣]/g, '_') || '썸네일';
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.download = `WHP_썸네일_${safeName}_${new Date().getTime()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
      }, 'image/png');
      
    } catch (err) {
      alert("다운로드 중 오류가 발생했습니다.");
      console.error(err);
    }
  };

  // Render Badge component helper
  const renderBadge = () => {
    if (selectedBadge === 'none') return null;

    if (selectedBadge === 'logo') {
      return (
        <div className={`canvas-badge-container badge-${badgePosition}`}>
          <div className="badge-logo">
            <span className="logo-symbol">🌲</span>
            <span className="logo-text">WELLI HILLI PARK</span>
          </div>
        </div>
      );
    }

    let badgeClass = 'badge-custom';
    let badgeText = customBadgeText || '배너';

    switch (selectedBadge) {
      case 'special':
        badgeClass = 'badge-special';
        badgeText = '시크릿 특가';
        break;
      case 'best':
        badgeClass = 'badge-best';
        badgeText = '★ BEST ★';
        break;
      case 'limited':
        badgeClass = 'badge-limited';
        badgeText = '한정 수량';
        break;
      case 'new':
        badgeClass = 'badge-new';
        badgeText = 'NEW';
        break;
      case 'custom':
        badgeClass = 'badge-custom';
        badgeText = customBadgeText.trim() || '커스텀 뱃지';
        break;
    }

    return (
      <div className={`canvas-badge-container badge-${badgePosition}`}>
        <div className={`badge-item ${badgeClass}`}>{badgeText}</div>
      </div>
    );
  };

  return (
    <div className="thumb-container animate-fade-in">
      <div className="thumb-header">
        <h1>🎨 프리미엄 상품 썸네일 제작기</h1>
        <p>기획 의도만 적으면 배경을 그리고, 찰떡같은 카피와 로고/뱃지까지 입혀 고화질 다운로드해 드립니다.</p>
      </div>

      {/* Planning Form Card */}
      <div className="thumb-planning-card">
        <div className="input-row">
          <label>상품명 / 메인 키워드 <span style={{ color: 'var(--primary)' }}>*</span></label>
          <input 
            type="text" 
            placeholder="예시: 여름시즌 워터파크 시크릿 특가 티켓" 
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="edit-input"
            style={{ margin: 0 }}
          />
        </div>

        <div className="input-row">
          <label>상세 소구점 / 핵심 혜택 (AI가 문구 기획 시 집중 반영됩니다)</label>
          <input 
            type="text" 
            placeholder="예시: 최대 60% 파격 할인, 구명조끼 무료 대여, 선착순 100매 한정" 
            value={keyBenefits}
            onChange={(e) => setKeyBenefits(e.target.value)}
            className="edit-input"
            style={{ margin: 0 }}
          />
        </div>

        <div className="planning-grid">
          <div className="input-row">
            <label>타겟 고객층</label>
            <input 
              type="text" 
              placeholder="예시: 가족 단위 여행객, 커플, 여름방학 대학생" 
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="edit-input"
              style={{ margin: 0 }}
            />
          </div>

          <div className="input-row">
            <label>디자인 분위기 / 톤앤매너</label>
            <select 
              value={vibe} 
              onChange={(e) => setVibe(e.target.value)}
              className="edit-input"
              style={{ margin: 0 }}
            >
              <option value="시원하고 청량한">🌊 시원하고 청량한 (여름/워터풀)</option>
              <option value="고급스럽고 감성적인">✨ 고급스럽고 감성적인 (명조체/힐링/야경)</option>
              <option value="역동적이고 짜릿한">⚡ 역동적이고 짜릿한 (어트랙션/스키/눈)</option>
              <option value="파격적이고 눈에 띄는">🔥 파격적이고 강조하는 (세일/마감/특가)</option>
              <option value="따뜻하고 아늑한">🍂 따뜻하고 아늑한 (가족/온천/객실)</option>
            </select>
          </div>
        </div>

        <button className="generate-btn" onClick={generateThumbnail} disabled={isGenerating}>
          {isGenerating ? '기획안 분석 및 디자인 그리는 중... ✨' : '썸네일 뚝딱 만들기 🚀'}
        </button>
      </div>

      {/* Image Upload Option always accessible at the beginning */}
      {!bgImageUrl && (
        <div style={{ maxWidth: '800px', margin: '0 auto 40px auto' }}>
          <div className="image-upload-area">
            <p>📁 내 컴퓨터에서 직접 사진 올려서 편집하기 (드롭다운 또는 클릭)</p>
            <input type="file" accept="image/*" onChange={handleImageUpload} />
          </div>
        </div>
      )}

      {bgImageUrl && (
        <div className="thumb-editor-grid">
          {/* Left: Preview Canvas */}
          <div className="thumb-preview-panel">
            <div className={`canvas-wrapper ratio-${aspectRatio.replace(':', '-')}`}>
              {/* Separate blurred background */}
              <div 
                className="canvas-bg"
                style={{ 
                  backgroundImage: `url(${bgImageUrl})`,
                  filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none',
                  transform: bgBlur > 0 ? 'scale(1.06)' : 'none' // Prevent white blur boundaries
                }}
              />
              {/* Overlay type & opacity */}
              <div className="canvas-overlay" style={getOverlayStyle()} />
              
              {/* Badges overlay */}
              {renderBadge()}

              {/* Text content positioned & styled */}
              <div className={`canvas-content position-${textPosition}`}>
                <h2 
                  className={`${getFontClass(mainFontFamily)} shadow-${shadowPreset}`}
                  style={{ 
                    color: textColor,
                    fontSize: `${mainFontSize}px`,
                    letterSpacing: `${mainLetterSpacing}px`,
                    lineHeight: mainLineHeight
                  }}
                >
                  {mainText}
                </h2>
                {subText && (
                  <p 
                    className={`${getFontClass(subFontFamily)} shadow-${shadowPreset}`}
                    style={{ 
                      color: textColor,
                      fontSize: `${subFontSize}px`,
                      letterSpacing: `${subLetterSpacing}px`,
                      lineHeight: subLineHeight,
                      marginTop: '12px'
                    }}
                  >
                    {subText}
                  </p>
                )}
              </div>
            </div>
            
            <button className="download-btn" onClick={handleDownload}>
              💾 이 썸네일 다운로드 (초고화질 PNG)
            </button>
          </div>

          {/* Right: Controls Tab Panel */}
          <div className="thumb-controls-panel">
            {/* Tabs Header */}
            <div className="control-tabs">
              <button 
                className={`tab-btn ${activeTab === 'copy' ? 'active' : ''}`}
                onClick={() => setActiveTab('copy')}
              >
                📝 카피/내용
              </button>
              <button 
                className={`tab-btn ${activeTab === 'bg' ? 'active' : ''}`}
                onClick={() => setActiveTab('bg')}
              >
                📐 비율/배경
              </button>
              <button 
                className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                onClick={() => setActiveTab('text')}
              >
                🎨 텍스트 디자인
              </button>
              <button 
                className={`tab-btn ${activeTab === 'badge' ? 'active' : ''}`}
                onClick={() => setActiveTab('badge')}
              >
                🏷️ 뱃지/로고
              </button>
            </div>

            {/* Tab Contents */}
            <div className="tab-content">
              
              {/* Tab 1: Copy Options & Direct Edit */}
              {activeTab === 'copy' && (
                <>
                  {copyOptions.length > 0 && (
                    <div className="control-group">
                      <h3>💡 추천 마케팅 카피</h3>
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
                  )}

                  <div className="control-group">
                    <h3>✏️ 문구 직접 수정</h3>
                    <div className="input-row" style={{ marginBottom: '12px' }}>
                      <label>메인 카피</label>
                      <input 
                        type="text" 
                        value={mainText} 
                        onChange={(e) => setMainText(e.target.value)} 
                        className="edit-input"
                        placeholder="메인 타이틀 문구"
                      />
                    </div>
                    <div className="input-row">
                      <label>서브 카피</label>
                      <input 
                        type="text" 
                        value={subText} 
                        onChange={(e) => setSubText(e.target.value)} 
                        className="edit-input"
                        placeholder="서브 본문 문구"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Tab 2: Aspect Ratios & Background Settings */}
              {activeTab === 'bg' && (
                <>
                  <div className="control-group">
                    <h3>📐 썸네일 비율 선택</h3>
                    <div className="preset-buttons">
                      {(['1:1', '16:9', '9:16'] as const).map(ratio => (
                        <button
                          key={ratio}
                          className={`preset-btn ${aspectRatio === ratio ? 'active' : ''}`}
                          onClick={() => setAspectRatio(ratio)}
                        >
                          {ratio === '1:1' ? '1:1 정사각형' : ratio === '16:9' ? '16:9 와이드' : '9:16 세로형'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>📤 다른 배경 이미지 적용</h3>
                    <div className="image-upload-area" style={{ padding: '16px' }}>
                      <p>📁 내 사진으로 배경 교체하기</p>
                      <input type="file" accept="image/*" onChange={handleImageUpload} />
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>🎛️ 배경 필터 조절</h3>
                    
                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>배경 어둡기 (가독성)</span>
                        <span className="slider-val">{overlayOpacity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="85" 
                        value={overlayOpacity} 
                        onChange={(e) => setOverlayOpacity(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group">
                      <div className="slider-header">
                        <span>배경 흐림 효과 (Blur)</span>
                        <span className="slider-val">{bgBlur}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="15" 
                        value={bgBlur} 
                        onChange={(e) => setBgBlur(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>🕶️ 오버레이 유형</h3>
                    <div className="preset-buttons" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      <button 
                        className={`preset-btn ${overlayType === 'solid' ? 'active' : ''}`}
                        onClick={() => setOverlayType('solid')}
                        style={{ fontSize: '0.78rem', padding: '8px 4px' }}
                      >
                        단색 투명
                      </button>
                      <button 
                        className={`preset-btn ${overlayType === 'gradient' ? 'active' : ''}`}
                        onClick={() => setOverlayType('gradient')}
                        style={{ fontSize: '0.78rem', padding: '8px 4px' }}
                      >
                        그라데이션
                      </button>
                      <button 
                        className={`preset-btn ${overlayType === 'tint' ? 'active' : ''}`}
                        onClick={() => setOverlayType('tint')}
                        style={{ fontSize: '0.78rem', padding: '8px 4px' }}
                      >
                        컬러 틴트
                      </button>
                    </div>
                    
                    {overlayType === 'tint' && (
                      <div className="input-row" style={{ marginTop: '12px' }}>
                        <label>틴트 색상</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="color" 
                            value={tintColor}
                            onChange={(e) => setTintColor(e.target.value)}
                            style={{ width: '40px', height: '40px', padding: '0', border: 'none', cursor: 'pointer' }}
                          />
                          <div className="slider-group" style={{ flex: 1 }}>
                            <div className="slider-header">
                              <span>틴트 농도</span>
                              <span className="slider-val">{tintOpacity}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" max="80" 
                              value={tintOpacity} 
                              onChange={(e) => setTintOpacity(Number(e.target.value))} 
                              className="slider"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Tab 3: Typography and Text Styling */}
              {activeTab === 'text' && (
                <>
                  <div className="control-group">
                    <h3>🔤 폰트 선택</h3>
                    <div className="input-row" style={{ marginBottom: '12px' }}>
                      <label>메인 카피 폰트</label>
                      <select 
                        value={mainFontFamily} 
                        onChange={(e) => setMainFontFamily(e.target.value)}
                        className="edit-input"
                      >
                        <option value="Black Han Sans">Black Han Sans (두껍고 강력함)</option>
                        <option value="Noto Sans KR">Noto Sans KR (깔끔한 기본)</option>
                        <option value="Gowun Batang">Gowun Batang (클래식/감성 명조)</option>
                        <option value="Montserrat">Montserrat (세련된 영문/숫자)</option>
                      </select>
                    </div>
                    <div className="input-row">
                      <label>서브 카피 폰트</label>
                      <select 
                        value={subFontFamily} 
                        onChange={(e) => setSubFontFamily(e.target.value)}
                        className="edit-input"
                      >
                        <option value="Noto Sans KR">Noto Sans KR (깔끔한 기본)</option>
                        <option value="Black Han Sans">Black Han Sans (두껍고 강력함)</option>
                        <option value="Gowun Batang">Gowun Batang (클래식/감성 명조)</option>
                        <option value="Montserrat">Montserrat (세련된 영문/숫자)</option>
                      </select>
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>📏 폰트 크기 및 간격 조절</h3>
                    
                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>메인 폰트 크기</span>
                        <span className="slider-val">{mainFontSize}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="20" max="80" 
                        value={mainFontSize} 
                        onChange={(e) => setMainFontSize(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>메인 자간 (Letter Spacing)</span>
                        <span className="slider-val">{mainLetterSpacing}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="-6" max="15" 
                        value={mainLetterSpacing} 
                        onChange={(e) => setMainLetterSpacing(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>메인 행간 (Line Height)</span>
                        <span className="slider-val">{mainLineHeight}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.8" max="2.5" step="0.05"
                        value={mainLineHeight} 
                        onChange={(e) => setMainLineHeight(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>서브 폰트 크기</span>
                        <span className="slider-val">{subFontSize}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="12" max="40" 
                        value={subFontSize} 
                        onChange={(e) => setSubFontSize(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group" style={{ marginBottom: '16px' }}>
                      <div className="slider-header">
                        <span>서브 자간 (Letter Spacing)</span>
                        <span className="slider-val">{subLetterSpacing}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="-4" max="10" 
                        value={subLetterSpacing} 
                        onChange={(e) => setSubLetterSpacing(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>

                    <div className="slider-group">
                      <div className="slider-header">
                        <span>서브 행간 (Line Height)</span>
                        <span className="slider-val">{subLineHeight}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.8" max="2.5" step="0.05"
                        value={subLineHeight} 
                        onChange={(e) => setSubLineHeight(Number(e.target.value))} 
                        className="slider"
                      />
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>💡 텍스트 효과 프리셋</h3>
                    <div className="preset-buttons" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                      {(['none', 'soft', 'heavy', 'neon'] as const).map(shadow => (
                        <button
                          key={shadow}
                          className={`preset-btn ${shadowPreset === shadow ? 'active' : ''}`}
                          onClick={() => setShadowPreset(shadow)}
                        >
                          {shadow === 'none' ? '그림자 없음' : shadow === 'soft' ? '기본 그림자' : shadow === 'heavy' ? '강한 그림자' : '네온 광채'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>🌈 글씨 색상 선택</h3>
                    <div className="color-presets">
                      {['#ffffff', '#000000', '#fef08a', '#fda4af', '#67e8f9', '#a7f3d0', '#e2e8f0'].map(color => (
                        <button 
                          key={color} 
                          className={`color-btn ${textColor === color ? 'active' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setTextColor(color)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="control-group">
                    <h3>📍 문구 세로 정렬 위치</h3>
                    <div className="preset-buttons" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {(['top', 'center', 'bottom'] as const).map(pos => (
                        <button
                          key={pos}
                          className={`preset-btn ${textPosition === pos ? 'active' : ''}`}
                          onClick={() => setTextPosition(pos)}
                        >
                          {pos === 'top' ? '상단' : pos === 'center' ? '중앙' : '하단'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Tab 4: Badges & Logo settings */}
              {activeTab === 'badge' && (
                <>
                  <div className="control-group">
                    <h3>🏷️ 오버레이 뱃지/스티커 선택</h3>
                    <div className="badge-grid">
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'none' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('none')}
                      >
                        사용 안 함
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'logo' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('logo')}
                      >
                        🌲 회사 로고
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'special' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('special')}
                      >
                        특가 뱃지
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'best' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('best')}
                      >
                        BEST 뱃지
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'limited' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('limited')}
                      >
                        한정수량 뱃지
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'new' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('new')}
                      >
                        NEW 뱃지
                      </button>
                      <button 
                        className={`badge-select-btn ${selectedBadge === 'custom' ? 'active' : ''}`}
                        onClick={() => setSelectedBadge('custom')}
                        style={{ gridColumn: 'span 3' }}
                      >
                        ✏️ 직접 입력 커스텀 뱃지
                      </button>
                    </div>

                    {selectedBadge === 'custom' && (
                      <div className="input-row" style={{ marginTop: '12px' }}>
                        <label>커스텀 뱃지 문구</label>
                        <input 
                          type="text"
                          value={customBadgeText}
                          onChange={(e) => setCustomBadgeText(e.target.value)}
                          className="edit-input"
                          placeholder="예: 마감임박 / 초특가"
                        />
                      </div>
                    )}
                  </div>

                  {selectedBadge !== 'none' && (
                    <div className="control-group">
                      <h3>📍 뱃지/로고 배치 위치</h3>
                      <div className="preset-buttons" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        <button 
                          className={`preset-btn ${badgePosition === 'top-left' ? 'active' : ''}`}
                          onClick={() => setBadgePosition('top-left')}
                        >
                          좌측 상단
                        </button>
                        <button 
                          className={`preset-btn ${badgePosition === 'top-right' ? 'active' : ''}`}
                          onClick={() => setBadgePosition('top-right')}
                        >
                          우측 상단
                        </button>
                        <button 
                          className={`preset-btn ${badgePosition === 'bottom-left' ? 'active' : ''}`}
                          onClick={() => setBadgePosition('bottom-left')}
                        >
                          좌측 하단
                        </button>
                        <button 
                          className={`preset-btn ${badgePosition === 'bottom-right' ? 'active' : ''}`}
                          onClick={() => setBadgePosition('bottom-right')}
                        >
                          우측 하단
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailGenerator;
