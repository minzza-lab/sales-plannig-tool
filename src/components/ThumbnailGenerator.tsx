import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { callGeminiWithFallback } from '../utils/apiProxy';
import './ThumbnailGenerator.css';

interface CopyOption {
  main: string;
  sub: string;
}

interface ExportSize {
  id: string;
  name: string;
  width: number;
  height: number;
  category: '상단' | '리스트' | '구매하기' | '기타';
}

const EXPORT_SIZES: ExportSize[] = [
  { id: 'pc-header', name: 'PC 대표 이미지 (상단)', width: 1920, height: 800, category: '상단' },
  { id: 'mo-header', name: 'MO 대표 이미지 (상단)', width: 720, height: 400, category: '상단' },
  { id: 'pc-list', name: 'PC 리스트', width: 364, height: 300, category: '리스트' },
  { id: 'mo-list', name: 'MO 리스트', width: 620, height: 400, category: '리스트' },
  { id: 'purchase-list', name: 'PC/MO 구매 목록', width: 560, height: 200, category: '구매하기' },
  { id: 'square-general', name: '일반 정사각형 (1:1)', width: 1080, height: 1080, category: '기타' },
  { id: 'wide-general', name: '일반 와이드 (16:9)', width: 1920, height: 1080, category: '기타' }
];

const ThumbnailGenerator: React.FC = () => {
  // Input & Generation States
  const [productName, setProductName] = useState('');
  const [keyBenefits, setKeyBenefits] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [vibe, setVibe] = useState('시원하고 청량한');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgImageUrlRight, setBgImageUrlRight] = useState<string | null>(null);
  const [copyOptions, setCopyOptions] = useState<CopyOption[]>([]);
  const [selectedCopyIndex, setSelectedCopyIndex] = useState<number>(0);
  
  // Customization States
  const [activeTab, setActiveTab] = useState<'copy' | 'bg' | 'text' | 'badge'>('copy');
  
  // Layout Mode: 'emotional' (sensibility single bg) vs 'package' (slanted title, split left/right bg)
  const [layoutMode, setLayoutMode] = useState<'emotional' | 'package'>('emotional');
  const [headerBarColor, setHeaderBarColor] = useState('#ff9f1c');
  
  // Text content & general styling
  const [mainText, setMainText] = useState('');
  const [subText, setSubText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [textPosition, setTextPosition] = useState<'center' | 'bottom' | 'top'>('center');
  
  // Selected Size from the list
  const [selectedSizeId, setSelectedSizeId] = useState<string>('pc-header');
  
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
  const [selectedBadge, setSelectedBadge] = useState<string>('none');
  const [badgePosition, setBadgePosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');
  const [customBadgeText, setCustomBadgeText] = useState('');

  // AI Generated Multiple Image Options States (3 recommendations)
  const [bgImageOptions, setBgImageOptions] = useState<string[]>([]);
  const [bgImageOptionsRight, setBgImageOptionsRight] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(-1);

  // Uploaded image resolution tracking state
  const [uploadedImageRatio, setUploadedImageRatio] = useState<{ width: number; height: number } | null>(null);

  // Generation loading progress step tracker (0: idle, 1: text/prompt, 2: image rendering, 3: assembling layout)
  const [loadingStep, setLoadingStep] = useState<number>(0);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Compute all available sizes including dynamic uploaded ratio
  const allSizes = [...EXPORT_SIZES];
  if (uploadedImageRatio) {
    // Check if it already exists, if not add it at the top
    if (!allSizes.some(s => s.id === 'uploaded-ratio')) {
      allSizes.unshift({
        id: 'uploaded-ratio',
        name: '📸 업로드 사진 원본 비율',
        width: uploadedImageRatio.width,
        height: uploadedImageRatio.height,
        category: '기타'
      });
    }
  }

  const activeSize = allSizes.find(s => s.id === selectedSizeId) || allSizes[0];

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
    setLoadingStep(1); // 1단계: 기획 의도 분석 및 문구 도출 시작

    try {
      // Modify prompt based on package mode or general mode
      const isPkg = layoutMode === 'package';
      
      const prompt = `
당신은 웰리힐리파크 리조트의 전문 마케터이자 디자이너입니다.
사용자가 다음 기획의도로 상품 썸네일(광고 이미지)을 만들려고 합니다:

1. 상품명/메인 키워드: "${targetProduct}"
2. 상세 소구점/혜택: "${keyBenefits.trim() || '제한 없음'}"
3. 타겟 고객층: "${targetAudience.trim() || '일반 대중'}"
4. 디자인 분위기/톤앤매너: "${vibe}"
5. 이미지 분할 모드: ${isPkg ? '좌우 이미지 2분할 패키지 구성' : '단일 배경 구성'}

이 정보를 바탕으로 다음 사항들을 제안해주세요:
1. 썸네일에 어울리는 고품질 배경 이미지 프롬프트 (반드시 영어로, Stable Diffusion 스타일). 
   * 디자인 분위기/톤앤매너와 키워드를 시각적으로 아름답게 담아내야 합니다.
   * 텍스트를 얹을 수 있도록 여백('blank space, clean background, abstract or realistic blur')이 충분한 상태를 묘사해야 합니다.
   * ${isPkg ? '중요: 좌우 2분할 구조이므로, 반드시 좌측에 들어갈 이미지 프롬프트("imagePrompt")와 우측에 들어갈 이미지 프롬프트("imagePromptRight")를 서로 다르게 분리해 주세요. (예: 좌측은 숙박/리조트 전경, 우측은 조식/수영장 등 패키지 요소를 표현)' : '단일 이미지 프롬프트만 생성하세요.'}
2. 기획의도 및 소구점, 타겟층에 딱 맞춰 시선을 사로잡는 마케팅 카피 (메인 카피, 서브 카피) 3가지 제안.
   * 메인 카피는 혜택이나 특성을 임팩트 있게 담아내야 하며, 서브 카피는 소구점과 핵심 혜택을 구체적으로 풀어내어 설명해야 합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 출력하지 마세요.
{
  "imagePrompt": "english prompt for background...",
  ${isPkg ? '"imagePromptRight": "english prompt for right background...",' : ''}
  "copyOptions": [
    { "main": "끌리는 메인 카피 1", "sub": "설명하는 서브 카피 1" },
    { "main": "끌리는 메인 카피 2", "sub": "설명하는 서브 카피 2" },
    { "main": "끌리는 메인 카피 3", "sub": "설명하는 서브 카피 3" }
  ]
}
      `;

      const responseText = await callGeminiWithFallback([{ text: prompt }]);
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
      const parsed = JSON.parse(jsonMatch[0]);

      // Update text details
      setCopyOptions(parsed.copyOptions);
      setMainText(parsed.copyOptions[0].main);
      setSubText(parsed.copyOptions[0].sub);
      setSelectedCopyIndex(0);

      setLoadingStep(2); // 2단계: AI 추천 배경 이미지 3쌍 병렬 생성 돌입

      // Revoke old object URLs to prevent memory leaks
      bgImageOptions.forEach(url => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      bgImageOptionsRight.forEach(url => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });

      const randomSeed = Math.floor(Math.random() * 100000);
      const encodedPromptLeft = encodeURIComponent(parsed.imagePrompt + ", highly detailed, 4k, marketing photography, beautiful lighting, clean blank space, no text");
      
      const fetchPromises: Promise<string>[] = [];
      const fetchPromisesRight: Promise<string>[] = [];

      // High-quality Unsplash resort fallback URLs for seamless offline experience
      const fallbackLefts = [
        'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=1080&q=80', // Luxury resort pool
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1080&q=80', // Luxury hotel facade
        'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1080&q=80'  // Resort pool sunset
      ];

      const fallbackRights = [
        'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1080&q=80', // Hotel room bed
        'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1080&q=80', // Resort breakfast dining
        'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?auto=format&fit=crop&w=1080&q=80'  // Aqua park water slide
      ];

      // Request 3 options in parallel with individual try/catch & retry & fallback
      for (let i = 0; i < 3; i++) {
        const seedLeft = randomSeed + i * 10;
        const leftUrl = `https://image.pollinations.ai/prompt/${encodedPromptLeft}?width=1080&height=1080&nologo=true&seed=${seedLeft}`;
        
        fetchPromises.push(
          fetch(leftUrl)
            .then(async res => {
              if (!res.ok) {
                // Retry once after 400ms delay
                await new Promise(r => setTimeout(r, 400));
                const retryRes = await fetch(leftUrl);
                if (!retryRes.ok) throw new Error("Retry failed");
                return retryRes.blob();
              }
              return res.blob();
            })
            .then(blob => URL.createObjectURL(blob))
            .catch(err => {
              console.warn(`[Option ${i + 1} Left] AI 생성 실패, 프리미엄 백업 이미지 연동:`, err);
              return fallbackLefts[i]; // Fallback to gorgeous unsplash image on error
            })
        );

        if (isPkg) {
          const seedRight = randomSeed + i * 10 + 5;
          const encodedPromptRight = encodeURIComponent((parsed.imagePromptRight || parsed.imagePrompt) + ", highly detailed, 4k, marketing photography, beautiful lighting, clean blank space, no text");
          const rightUrl = `https://image.pollinations.ai/prompt/${encodedPromptRight}?width=1080&height=1080&nologo=true&seed=${seedRight}`;
          
          fetchPromisesRight.push(
            fetch(rightUrl)
              .then(async res => {
                if (!res.ok) {
                  // Retry once after 400ms delay
                  await new Promise(r => setTimeout(r, 400));
                  const retryRes = await fetch(rightUrl);
                  if (!retryRes.ok) throw new Error("Retry failed");
                  return retryRes.blob();
                }
                return res.blob();
              })
              .then(blob => URL.createObjectURL(blob))
              .catch(err => {
                console.warn(`[Option ${i + 1} Right] AI 생성 실패, 프리미엄 백업 이미지 연동:`, err);
                return fallbackRights[i]; // Fallback to gorgeous unsplash image on error
              })
          );
        }
      }

      const leftResults = await Promise.all(fetchPromises);
      const rightResults = isPkg ? await Promise.all(fetchPromisesRight) : [];

      setLoadingStep(3); // 3단계: 디자인 레이아웃 조립 및 원본 배율 자동 연동
      await new Promise(r => setTimeout(r, 600)); // Visual feel delay

      setBgImageOptions(leftResults);
      setBgImageOptionsRight(rightResults);
      setSelectedImageIndex(0); // 첫번째 제안 기본 적용
      
      setBgImageUrl(leftResults[0]);
      if (isPkg) {
        setBgImageUrlRight(rightResults[0]);
      } else {
        setBgImageUrlRight(null);
      }

      // Reset design options to defaults on fresh generation
      setBgBlur(0);
      setSelectedBadge('none');

    } catch (error: any) {
      alert("생성 중 오류가 발생했습니다: " + error.message);
      console.error(error);
    } finally {
      setIsGenerating(false);
      setLoadingStep(0); // 로딩 해제
    }
  };

  const handleCopySelect = (index: number) => {
    setSelectedCopyIndex(index);
    setMainText(copyOptions[index].main);
    setSubText(copyOptions[index].sub);
  };

  // Image Upload Handlers
  const handleImageUploadLeft = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const img = new Image();
          img.src = reader.result as string;
          img.onload = () => {
            setUploadedImageRatio({ width: img.naturalWidth, height: img.naturalHeight });
            setSelectedSizeId('uploaded-ratio'); // 업로드 시 즉시 원본 비율 프리셋 선택
          };
          setBgImageUrl(reader.result as string);
          setSelectedImageIndex(-1); // 수동 업로드 시 AI 이미지 선택 테두리 해제
          initDummyCopy();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUploadRight = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const img = new Image();
          img.src = reader.result as string;
          img.onload = () => {
            setUploadedImageRatio({ width: img.naturalWidth, height: img.naturalHeight });
            setSelectedSizeId('uploaded-ratio'); // 업로드 시 즉시 원본 비율 프리셋 선택
          };
          setBgImageUrlRight(reader.result as string);
          setSelectedImageIndex(-1); // 수동 업로드 시 AI 이미지 선택 테두리 해제
          initDummyCopy();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const initDummyCopy = () => {
    if (copyOptions.length === 0) {
      const dummyCopy = { main: mainText || "패키지 타이틀 입력", sub: subText || "서브 설명글 입력" };
      setCopyOptions([dummyCopy]);
      setMainText(dummyCopy.main);
      setSubText(dummyCopy.sub);
    }
  };

  // Custom size download logic using exact scale calculation
  const handleDownload = async (targetWidth: number, targetHeight: number, labelName: string) => {
    if (!canvasRef.current) return;
    
    // Create custom overlay spinner since high-res rendering can take 1-2 seconds
    const spinner = document.createElement('div');
    spinner.style.position = 'fixed';
    spinner.style.inset = '0';
    spinner.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
    spinner.style.backdropFilter = 'blur(4px)';
    spinner.style.display = 'flex';
    spinner.style.flexDirection = 'column';
    spinner.style.justifyContent = 'center';
    spinner.style.alignItems = 'center';
    spinner.style.zIndex = '9999';
    spinner.innerHTML = `
      <div style="border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #ff9f1c; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
      <p style="color: #ffffff; margin-top: 16px; font-family: sans-serif; font-size: 14px;">고해상도 이미지 (${targetWidth}x${targetHeight}) 렌더링 중...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(spinner);

    try {
      // 1. Clone the preview container
      const originNode = canvasRef.current;
      const clonedNode = originNode.cloneNode(true) as HTMLDivElement;
      
      // 2. Setup invisible container for render off-screen
      const renderContainer = document.createElement('div');
      renderContainer.style.position = 'fixed';
      renderContainer.style.left = '-99999px';
      renderContainer.style.top = '-99999px';
      renderContainer.style.width = `${targetWidth}px`;
      renderContainer.style.height = `${targetHeight}px`;
      
      // Apply exact target styling to the cloned wrapper
      clonedNode.style.width = '100%';
      clonedNode.style.height = '100%';
      clonedNode.style.aspectRatio = 'none'; // Remove aspectRatio constraint to force target boundaries
      clonedNode.style.borderRadius = '0'; // Clean edges for production image
      
      // Calculate font scale based on ratio (design reference width is 800px)
      const scaleMultiplier = targetWidth / 800;
      
      // Find typography items inside cloned node and adjust font sizes to scale nicely
      const titleEl = clonedNode.querySelector('h2');
      if (titleEl) {
        titleEl.style.fontSize = `${mainFontSize * scaleMultiplier}px`;
        titleEl.style.lineHeight = `${mainLineHeight}`;
      }
      
      const subEl = clonedNode.querySelector('p');
      if (subEl) {
        subEl.style.fontSize = `${subFontSize * scaleMultiplier}px`;
        subEl.style.lineHeight = `${subLineHeight}`;
      }
      
      // Adjust Slanted Header Bar height if package mode
      if (layoutMode === 'package') {
        const headerBar = clonedNode.querySelector('.canvas-header-bar') as HTMLElement;
        if (headerBar) {
          headerBar.style.padding = `${16 * scaleMultiplier}px ${32 * scaleMultiplier}px`;
        }
      }

      renderContainer.appendChild(clonedNode);
      document.body.appendChild(renderContainer);
      
      // 3. Render exact pixels via html2canvas
      const canvas = await html2canvas(clonedNode, {
        width: targetWidth,
        height: targetHeight,
        scale: 1, // Draw 1:1 on the target sizing container
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0f172a'
      });
      
      canvas.toBlob((blob) => {
        // Clean up temporary DOM immediately
        document.body.removeChild(renderContainer);
        document.body.removeChild(spinner);

        if (!blob) {
          alert("이미지 저장에 실패했습니다.");
          return;
        }
        
        const safeName = productName.replace(/[^a-zA-Z0-9가-힣]/g, '_') || '썸네일';
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.download = `WHP_썸네일_${safeName}_${labelName.replace(/\s+/g, '_')}_${targetWidth}x${targetHeight}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
      }, 'image/png');
      
    } catch (err) {
      // Safe clean up in case of crash
      if (document.body.contains(spinner)) document.body.removeChild(spinner);
      const tempContainer = document.querySelector('[style*="left: -99999px"]');
      if (tempContainer) document.body.removeChild(tempContainer);

      alert("다운로드 중 오류가 발생했습니다.");
      console.error(err);
    }
  };

  // Render Badge overlay
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
      {isGenerating && (
        <div className="generation-overlay">
          <div className="overlay-glass-card">
            <div className="overlay-sparkles">✨</div>
            <h2>AI 썸네일 자동 에셋 제작 중</h2>
            <p className="overlay-subtitle">구글 제미나이와 이미지 생성기가 맞물려 리얼타임 디자인을 조립하고 있습니다.</p>
            
            <div className="progress-steps-list">
              {/* 1단계 */}
              <div className={`step-row ${loadingStep >= 1 ? 'active' : ''} ${loadingStep > 1 ? 'completed' : ''}`}>
                <div className="step-icon-wrap">
                  {loadingStep > 1 ? (
                    <span className="step-check">✓</span>
                  ) : loadingStep === 1 ? (
                    <div className="step-loading-spinner"></div>
                  ) : (
                    <span className="step-pending">○</span>
                  )}
                </div>
                <div className="step-text-wrap">
                  <h4>1단계: 기획의도 및 소구점 정밀 분석</h4>
                  <p>제미나이가 마케팅 타겟을 독해하여 3가지 카피와 배경 묘사 프롬프트를 기획합니다.</p>
                </div>
              </div>

              {/* 2단계 */}
              <div className={`step-row ${loadingStep >= 2 ? 'active' : ''} ${loadingStep > 2 ? 'completed' : ''}`}>
                <div className="step-icon-wrap">
                  {loadingStep > 2 ? (
                    <span className="step-check">✓</span>
                  ) : loadingStep === 2 ? (
                    <div className="step-loading-spinner"></div>
                  ) : (
                    <span className="step-pending">○</span>
                  )}
                </div>
                <div className="step-text-wrap">
                  <h4>2단계: AI 추천 배경 3쌍 병렬 렌더링</h4>
                  <p>Pollinations AI 엔진이 실시간으로 3가지 옵션의 이미지를 대조 생성합니다.</p>
                </div>
              </div>

              {/* 3단계 */}
              <div className={`step-row ${loadingStep >= 3 ? 'active' : ''} ${loadingStep > 3 ? 'completed' : ''}`}>
                <div className="step-icon-wrap">
                  {loadingStep > 3 ? (
                    <span className="step-check">✓</span>
                  ) : loadingStep === 3 ? (
                    <div className="step-loading-spinner"></div>
                  ) : (
                    <span className="step-pending">○</span>
                  )}
                </div>
                <div className="step-text-wrap">
                  <h4>3단계: 최적 레이아웃 조립 및 원본비 매핑</h4>
                  <p>타이틀바, 카피 배치, 뱃지 레이어를 완성하고 원본 해상도를 자동 연동합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
            placeholder="예시: 모닝 PKG (또는 워터플래닛 하이시즌 PKG)" 
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
            placeholder="예시: 객실 1박 + 조식 뷔페 2인 + 웰컴 드링크" 
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
              placeholder="예시: 커플, 미식가, 연휴 호캉스족" 
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
              <option value="따뜻하고 아늑한">🍂 따뜻하고 아늑한 (가족/조식/객실)</option>
            </select>
          </div>
        </div>

        {/* Layout Selector directly on the planning card */}
        <div className="input-row">
          <label>레이아웃 스타일 선택</label>
          <div className="preset-buttons" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button 
              className={`preset-btn ${layoutMode === 'emotional' ? 'active' : ''}`}
              onClick={() => setLayoutMode('emotional')}
            >
              📖 감성/일반형 (단일 배경 + 텍스트 자유 조절)
            </button>
            <button 
              className={`preset-btn ${layoutMode === 'package' ? 'active' : ''}`}
              onClick={() => setLayoutMode('package')}
            >
              🎁 패키지형 (좌우 사선 분할 배경 + 상단 타이틀 바)
            </button>
          </div>
        </div>

        <button className="generate-btn" onClick={generateThumbnail} disabled={isGenerating}>
          {isGenerating ? '기획안 분석 및 디자인 그리는 중... ✨' : '썸네일 뚝딱 만들기 🚀'}
        </button>
      </div>

      {/* Image Upload Option (Before first generate) */}
      {!bgImageUrl && (
        <div style={{ maxWidth: '800px', margin: '0 auto 40px auto' }}>
          {layoutMode === 'package' ? (
            <div className="planning-grid">
              <div className="image-upload-area">
                <p>📁 [좌측] 내 컴퓨터 이미지 등록</p>
                <input type="file" accept="image/*" onChange={handleImageUploadLeft} />
              </div>
              <div className="image-upload-area">
                <p>📁 [우측] 내 컴퓨터 이미지 등록</p>
                <input type="file" accept="image/*" onChange={handleImageUploadRight} />
              </div>
            </div>
          ) : (
            <div className="image-upload-area">
              <p>📁 내 컴퓨터에서 직접 사진 올려서 편집하기 (드롭다운 또는 클릭)</p>
              <input type="file" accept="image/*" onChange={handleImageUploadLeft} />
            </div>
          )}
        </div>
      )}

      {bgImageUrl && (
        <div className="thumb-editor-grid">
          {/* Left: Preview Canvas */}
          <div className="thumb-preview-panel">
            <div 
              ref={canvasRef}
              className="canvas-wrapper"
              style={{ aspectRatio: `${activeSize.width} / ${activeSize.height}` }}
            >
              {layoutMode === 'package' ? (
                <>
                  {/* Left BG Slanted */}
                  <div 
                    className="canvas-bg canvas-bg-left"
                    style={{ 
                      backgroundImage: `url(${bgImageUrl})`,
                      filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none',
                      transform: bgBlur > 0 ? 'scale(1.06)' : 'none'
                    }}
                  />
                  {/* Right BG */}
                  <div 
                    className="canvas-bg canvas-bg-right"
                    style={{ 
                      backgroundImage: `url(${bgImageUrlRight || bgImageUrl})`,
                      filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none',
                      transform: bgBlur > 0 ? 'scale(1.06)' : 'none'
                    }}
                  />
                  {/* Slanted Header Bar */}
                  <div 
                    className="canvas-header-bar"
                    style={{ backgroundColor: headerBarColor }}
                  >
                    <h2 
                      className={`${getFontClass(mainFontFamily)}`}
                      style={{ 
                        color: '#ffffff',
                        fontSize: `${mainFontSize}px`,
                        letterSpacing: `${mainLetterSpacing}px`,
                        lineHeight: mainLineHeight,
                        margin: 0,
                        textShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {mainText}
                    </h2>
                  </div>
                </>
              ) : (
                <>
                  {/* Emotional Mode: Single background */}
                  <div 
                    className="canvas-bg"
                    style={{ 
                      backgroundImage: `url(${bgImageUrl})`,
                      filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none',
                      transform: bgBlur > 0 ? 'scale(1.06)' : 'none'
                    }}
                  />
                  {/* Text Container aligned */}
                  <div className={`canvas-content position-${textPosition}`}>
                    <h2 
                      className={`${getFontClass(mainFontFamily)} shadow-${shadowPreset}`}
                      style={{ 
                        color: textColor,
                        fontSize: `${mainFontSize}px`,
                        letterSpacing: `${mainLetterSpacing}px`,
                        lineHeight: mainLineHeight,
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {mainText}
                    </h2>
                  </div>
                </>
              )}
              
              {/* Overlay type & opacity */}
              <div className="canvas-overlay" style={getOverlayStyle()} />
              
              {/* Badges overlay */}
              {renderBadge()}

              {/* SubText (Rendered at the bottom for package, or relative for emotional) */}
              {subText && (
                <div 
                  className="canvas-content position-bottom" 
                  style={{ 
                    zIndex: 5, 
                    pointerEvents: 'none',
                    textAlign: layoutMode === 'package' ? 'right' : 'center',
                    padding: layoutMode === 'package' ? '0 32px 20px 32px' : '40px'
                  }}
                >
                  <p 
                    className={`${getFontClass(subFontFamily)} shadow-${shadowPreset}`}
                    style={{ 
                      color: textColor,
                      fontSize: `${subFontSize}px`,
                      letterSpacing: `${subLetterSpacing}px`,
                      lineHeight: subLineHeight,
                      marginTop: '0px',
                      whiteSpace: 'pre-wrap',
                      display: 'inline-block',
                      backgroundColor: layoutMode === 'package' ? 'rgba(15, 23, 42, 0.5)' : 'transparent',
                      padding: layoutMode === 'package' ? '6px 12px' : '0',
                      borderRadius: layoutMode === 'package' ? '6px' : '0',
                      backdropFilter: layoutMode === 'package' ? 'blur(4px)' : 'none'
                    }}
                  >
                    {subText}
                  </p>
                </div>
              )}
            </div>

            {/* Premium Download Size Buttons */}
            <div className="download-buttons-section">
              <span className="download-title">💾 다운로드 사이즈 선택</span>
              <div className="download-grid">
                {allSizes.map(sz => (
                  <button 
                    key={sz.id}
                    className="download-size-btn"
                    onClick={() => handleDownload(sz.width, sz.height, sz.name)}
                  >
                    <span>{sz.name}</span>
                    <span className="btn-sub">{sz.width} x {sz.height} px ({sz.category})</span>
                  </button>
                ))}
              </div>
            </div>
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
                      <label>메인 카피 (엔터 입력 시 여러 줄로 나뉩니다)</label>
                      <textarea 
                        value={mainText} 
                        onChange={(e) => setMainText(e.target.value)} 
                        className="edit-input"
                        placeholder="메인 타이틀 문구"
                        rows={2}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div className="input-row">
                      <label>서브 카피</label>
                      <textarea 
                        value={subText} 
                        onChange={(e) => setSubText(e.target.value)} 
                        className="edit-input"
                        placeholder="서브 본문 문구"
                        rows={2}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Tab 2: Aspect Ratios & Background Settings */}
              {activeTab === 'bg' && (
                <>
                  <div className="control-group">
                    <h3>📐 편집 중인 미리보기 규격</h3>
                    <div className="preset-buttons" style={{ gridTemplateColumns: '1fr' }}>
                      <select 
                        value={selectedSizeId}
                        onChange={(e) => setSelectedSizeId(e.target.value)}
                        className="edit-input"
                      >
                        {allSizes.map(sz => (
                          <option key={sz.id} value={sz.id}>
                            [{sz.category}] {sz.name} ({sz.width}x{sz.height})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {bgImageOptions.length > 0 && (
                    <div className="control-group">
                      <h3>🖼️ AI 추천 배경 제안 ({bgImageOptions.length}개)</h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        기획 의도에 맞춰 생성된 이미지 조합입니다. 마음에 드는 테마를 선택하세요.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {bgImageOptions.map((opt, idx) => (
                          <div 
                            key={idx}
                            style={{
                              position: 'relative',
                              aspectRatio: '1',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              border: selectedImageIndex === idx ? '3px solid #ff9f1c' : '2px solid rgba(255, 255, 255, 0.1)',
                              transition: 'all 0.2s',
                              transform: selectedImageIndex === idx ? 'scale(1.02)' : 'none',
                              backgroundColor: '#1e293b'
                            }}
                            onClick={() => {
                              setSelectedImageIndex(idx);
                              setBgImageUrl(opt);
                              // AI Generated image is natively 1080x1080 (1:1)
                              setUploadedImageRatio({ width: 1080, height: 1080 });
                              setSelectedSizeId('uploaded-ratio');
                              if (layoutMode === 'package' && bgImageOptionsRight[idx]) {
                                setBgImageUrlRight(bgImageOptionsRight[idx]);
                              }
                            }}
                          >
                            {layoutMode === 'package' && bgImageOptionsRight[idx] ? (
                              // Split background preview
                              <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                                <div style={{ flex: 1, backgroundImage: `url(${opt})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                <div style={{ flex: 1, backgroundImage: `url(${bgImageOptionsRight[idx]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                              </div>
                            ) : (
                              // Single background preview
                              <div style={{ width: '100%', height: '100%', backgroundImage: `url(${opt})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                            )}
                            <div style={{
                              position: 'absolute',
                              bottom: '0',
                              left: '0',
                              width: '100%',
                              backgroundColor: 'rgba(15, 23, 42, 0.75)',
                              color: '#fff',
                              fontSize: '10px',
                              textAlign: 'center',
                              padding: '2px 0',
                              fontWeight: 'bold'
                            }}>
                              제안 {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="control-group">
                    <h3>📤 배경 사진 교체</h3>
                    {layoutMode === 'package' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="image-upload-area" style={{ padding: '12px' }}>
                          <p>📁 [좌측] 배경 교체</p>
                          <input type="file" accept="image/*" onChange={handleImageUploadLeft} />
                        </div>
                        <div className="image-upload-area" style={{ padding: '12px' }}>
                          <p>📁 [우측] 배경 교체</p>
                          <input type="file" accept="image/*" onChange={handleImageUploadRight} />
                        </div>
                      </div>
                    ) : (
                      <div className="image-upload-area" style={{ padding: '14px' }}>
                        <p>📁 배경 사진 올리기</p>
                        <input type="file" accept="image/*" onChange={handleImageUploadLeft} />
                      </div>
                    )}
                  </div>

                  {layoutMode === 'package' && (
                    <div className="control-group">
                      <h3>🎨 상단 타이틀 바 색상</h3>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input 
                          type="color" 
                          value={headerBarColor}
                          onChange={(e) => setHeaderBarColor(e.target.value)}
                          style={{ width: '48px', height: '48px', padding: '0', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                        />
                        <div className="color-presets" style={{ flex: 1 }}>
                          {['#ff9f1c', '#0066cc', '#10b981', '#ef4444', '#1e293b'].map(color => (
                            <button 
                              key={color} 
                              className={`color-btn ${headerBarColor === color ? 'active' : ''}`}
                              style={{ backgroundColor: color, width: '28px', height: '28px' }}
                              onClick={() => setHeaderBarColor(color)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

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
                        min="16" max="80" 
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

                  {layoutMode === 'emotional' && (
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
                  )}
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
