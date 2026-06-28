import React, { useState } from 'react';
import { callGeminiWithFallback } from '../utils/apiProxy';
import './FieldSketchWriter.css';

const FieldSketchWriter: React.FC = () => {
  const [episodeNumber, setEpisodeNumber] = useState<string>('');
  const [tone, setTone] = useState<string>('reporter');
  const [contextDescription, setContextDescription] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<{file: File, preview: string, base64: string}[]>([]);
  const [htmlResult, setHtmlResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [thumbnailTopText, setThumbnailTopText] = useState<string>('');
  const [thumbnailBottomText, setThumbnailBottomText] = useState<string>('');
  const [representativeIndex, setRepresentativeIndex] = useState<number>(0);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  // 이미지 압축 및 리사이징 함수
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxWidth = 1080; 
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedBase64);
        };
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setIsLoading(true);
      const filesArray = Array.from(e.target.files);
      const newFiles = await Promise.all(filesArray.map(async (file) => {
        const compressedBase64 = await compressImage(file);
        return {
          file,
          preview: compressedBase64,
          base64: compressedBase64
        };
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setHtmlResult('');
      setIsLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (representativeIndex === index) setRepresentativeIndex(0);
    else if (representativeIndex > index) setRepresentativeIndex(prev => prev - 1);
  };

  const generateThumbnail = () => {
    if (selectedFiles.length === 0) return;
    
    const baseImgData = selectedFiles[representativeIndex]?.base64 || selectedFiles[0].base64;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const targetWidth = 1280;
      const targetHeight = 720;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgRatio = img.width / img.height;
      const targetRatio = targetWidth / targetHeight;
      let drawWidth, drawHeight, drawX, drawY;
      
      if (imgRatio > targetRatio) {
        drawHeight = targetHeight;
        drawWidth = img.width * (targetHeight / img.height);
        drawX = (targetWidth - drawWidth) / 2;
        drawY = 0;
      } else {
        drawWidth = targetWidth;
        drawHeight = img.height * (targetWidth / img.width);
        drawX = 0;
        drawY = (targetHeight - drawHeight) / 2;
      }
      
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      const gradient = ctx.createLinearGradient(0, targetHeight * 0.4, 0, targetHeight);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, targetHeight * 0.4, targetWidth, targetHeight * 0.6);

      const drawText = (text: string, x: number, y: number, fontSize: number) => {
        if (!text) return;
        ctx.font = `900 ${fontSize}px "Pretendard", "Malgun Gothic", sans-serif`;
        ctx.lineJoin = 'round';
        ctx.textAlign = 'left';
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
      };

      const textStartX = 300; 
      const bottomY = targetHeight - 80;

      if (thumbnailTopText && thumbnailBottomText) {
        const topStr = episodeNumber ? `Ep${episodeNumber}. ${thumbnailTopText}` : thumbnailTopText;
        drawText(topStr, textStartX, bottomY - 100, 65);
        drawText(thumbnailBottomText, textStartX, bottomY, 80);
      } else if (thumbnailTopText) {
        const str = episodeNumber ? `Ep${episodeNumber}. ${thumbnailTopText}` : thumbnailTopText;
        drawText(str, textStartX, bottomY, 80);
      } else if (thumbnailBottomText) {
        const str = episodeNumber ? `Ep${episodeNumber}. ${thumbnailBottomText}` : thumbnailBottomText;
        drawText(str, textStartX, bottomY, 80);
      } else if (episodeNumber) {
        drawText(`Ep${episodeNumber}.`, textStartX, bottomY, 80);
      }

      ctx.font = '80px sans-serif';
      ctx.fillText('📸', 100, bottomY - 120);
      ctx.font = '160px sans-serif';
      ctx.fillText('👾', 70, bottomY + 20);
      
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(targetWidth - 280, 40, 240, 70);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('로고 (투명PNG 필요)', targetWidth - 160, 83);

      setThumbnailUrl(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = baseImgData;
  };

  const generateEmbeddedSketch = async () => {
    if (selectedFiles.length === 0) {
      alert('사진을 업로드해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const imageParts = selectedFiles.map(item => ({
        inline_data: {
          data: item.base64.split(',')[1],
          mime_type: 'image/jpeg'
        }
      }));
      
      let toneInstruction = '';
      let personaInstruction = '';
      
      switch (tone) {
        case 'professional':
          personaInstruction = "당신은 '웰리힐리파크'의 전문적인 홍보 담당자입니다.";
          toneInstruction = "말투는 신뢰감을 주면서도 차분하고 정중하게 (예: ~입니다, ~합니다), 사진 상황을 객관적이고 전문적으로 설명하세요.";
          break;
        case 'emotional':
          personaInstruction = "당신은 감수성이 풍부한 여행 에세이 작가입니다.";
          toneInstruction = "말투는 감성적이고 시적인 표현을 활용하여 부드럽게 (예: ~했네요, ~인 것 같아요), 사진 속 분위기와 감정을 깊이 있게 설명하세요.";
          break;
        case 'friendly':
          personaInstruction = "당신은 고객과 소통하는 친근한 웰리힐리파크 가이드입니다.";
          toneInstruction = "말투는 친한 친구에게 말하듯 유쾌하고 친근하게 (예: ~했어요!, ~맞죠?), 사진 상황을 재미있고 위트 있게 설명하세요.";
          break;
        case 'reporter':
        default:
          personaInstruction = "당신은 '웰리힐리파크'의 공식 리포터 '현스girl★'입니다.";
          toneInstruction = "말투는 매우 밝고 명랑하게 (예: 안녕하세요~~~~!, 그랬답니다!), 사진 상황을 구체적이고 생동감 넘치게 설명하세요.";
          break;
      }

      const prompt = `
        ${personaInstruction} [Ep.${episodeNumber}] 현장스케치를 작성하세요.
        
        ${contextDescription ? `[현장 상황 및 추가 설명]\n${contextDescription}\n\n위 내용을 바탕으로 생동감 있고 자연스럽게 스토리를 풀어주세요.\n` : ''}
        [작성 지침 - 필수 준수]
        1. 모든 텍스트는 <h3 style="text-align: center;">내용</h3> 형식을 사용하세요.
        2. 본문 중간중간에 사진을 반드시 순서대로 모두 넣으세요.
        3. 사진 태그 형식: <h3><img src="[IMG_DATA_INDEX]" width="1080" /></h3>
           (예: 첫 번째 사진은 [IMG_DATA_0], 두 번째는 [IMG_DATA_1] 처럼 숫자를 맞춰 0번부터 ${selectedFiles.length - 1}번까지 모두 넣으세요.)
        4. ${toneInstruction}
        
        오직 HTML 결과물만 출력하세요.
      `;

      const parts = [{ text: prompt }, ...imageParts];
      let text = await callGeminiWithFallback(parts, ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"]);

      for (let i = 0; i < selectedFiles.length; i++) {
        const placeholder = `[IMG_DATA_${i}]`;
        if (text.includes(placeholder)) {
          text = text.replaceAll(placeholder, selectedFiles[i].base64);
        } else {
          text += `\n<h3 style="text-align: center;"><img src="${selectedFiles[i].base64}" width="1080" /></h3>`;
        }
      }

      text = text.replace(/```html|```/g, '').trim();
      setHtmlResult(text);
    } catch (err: any) {
      setError(`오류: ${err.message}`);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="sketch-container">
      <div className="sketch-header">
        <h1 className="title">📸 현장 스케치 생성기</h1>
        <p className="subtitle">현장 사진을 분석하여 생동감 넘치는 마케팅 게시물을 즉시 제작합니다</p>
      </div>

      {/* 🚀 상단 사용방법 안내 */}
      <div className="quick-guide-card-sketch animate-fade-in">
        <div className="guide-icon">📖</div>
        <div className="guide-content">
          <h4>현장스케치 이용 가이드</h4>
          <ul>
            <li><strong>STEP 1:</strong> 에피소드 번호와 썸네일 제목, 말투/콘셉트를 선택하세요.</li>
            <li><strong>STEP 2:</strong> '사진 다중 선택하기' 버튼으로 현장 사진들을 한꺼번에 선택하세요.</li>
            <li><strong>STEP 3:</strong> 썸네일에 쓸 '대표사진'을 클릭하여 지정한 후, [썸네일 이미지 만들기]를 클릭하세요.</li>
            <li><strong>STEP 4:</strong> 생성된 썸네일은 우클릭하여 저장하고, [HTML 자동 생성하기]를 눌러 본문 코드를 복사하세요.</li>
          </ul>
        </div>
      </div>

      <div className="sketch-upload-card">
        <div className="input-row-v4">
          <div className="ep-input-wrapper">
            <label className="section-label">에피소드 번호</label>
            <input 
              type="text" 
              placeholder="예: 2026-05"
              value={episodeNumber} 
              onChange={(e) => setEpisodeNumber(e.target.value)} 
              className="ep-input-field"
            />
          </div>
          <div className="tone-select-wrapper">
            <label className="section-label">말투/콘셉트 선택</label>
            <select 
              value={tone} 
              onChange={(e) => setTone(e.target.value)} 
              className="tone-select-field"
            >
              <option value="reporter">🌟 발랄한 리포터 (기본)</option>
              <option value="friendly">🤗 친근한 가이드 (유쾌함)</option>
              <option value="emotional">✍️ 감성적인 작가 (서정적)</option>
              <option value="professional">👔 전문적인 홍보 (차분함)</option>
            </select>
          </div>
          <div className="upload-btn-wrapper">
            <label className="section-label">사진 업로드</label>
            <input type="file" id="sketch-upload" multiple accept="image/*" onChange={handleFileChange} hidden />
            <label htmlFor="sketch-upload" className="custom-upload-btn-v4">📸 사진 다중 선택하기</label>
          </div>
        </div>

        <div className="context-input-wrapper">
          <label className="section-label">현장 상황 설명 (선택사항)</label>
          <textarea
            placeholder="예: 오늘 날씨가 너무 맑아서 야외 파도풀에 사람들이 정말 많았어요. 가족 단위 고객들이 행복해하는 모습을 강조해주세요!"
            value={contextDescription}
            onChange={(e) => setContextDescription(e.target.value)}
            className="context-textarea"
          />
        </div>

        <div className="input-row-v4">
          <div className="thumb-input-wrapper">
            <label className="section-label">썸네일 상단 텍스트</label>
            <input 
              type="text" 
              placeholder="예: 환경을 소중히 하는 웰팍!"
              value={thumbnailTopText} 
              onChange={(e) => setThumbnailTopText(e.target.value)} 
              className="ep-input-field"
            />
          </div>
          <div className="thumb-input-wrapper">
            <label className="section-label">썸네일 하단 텍스트</label>
            <input 
              type="text" 
              placeholder="예: 주천강 정화 ESG 활동"
              value={thumbnailBottomText} 
              onChange={(e) => setThumbnailBottomText(e.target.value)} 
              className="ep-input-field"
            />
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="file-preview-grid-v4">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className={`preview-card-v4 ${representativeIndex === idx ? 'representative' : ''}`}>
                <img src={file.preview} alt="" onClick={() => setRepresentativeIndex(idx)} style={{ cursor: 'pointer' }} />
                <span className="file-name-tag">
                  {representativeIndex === idx ? '⭐️ 대표사진' : `이미지 #${idx}`}
                </span>
                <button onClick={() => removeFile(idx)} className="del-btn-v4">×</button>
              </div>
            ))}
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="thumbnail-generator-section">
            <button onClick={generateThumbnail} className="generate-thumb-btn">
              🖼️ 썸네일 이미지 만들기
            </button>
            {thumbnailUrl && (
              <div className="thumbnail-preview-area animate-fade-in">
                <p>👇 완성된 썸네일 (우클릭하여 '이미지 저장' 하세요)</p>
                <img src={thumbnailUrl} alt="Thumbnail Preview" className="thumbnail-result-img" />
              </div>
            )}
          </div>
        )}

        <button onClick={generateEmbeddedSketch} className="generate-magic-btn" disabled={isLoading || selectedFiles.length === 0}>
          {isLoading ? '이미지 최적화 및 스토리 분석 중...' : '게시물 HTML 자동 생성하기'}
        </button>
      </div>

      {error && <div className="voc-error">{error}</div>}

      {htmlResult && (
        <div className="dual-view-v4 animate-fade-in">
          <div className="panel-v4">
            <div className="panel-header-v4">🖥️ 홈페이지 미리보기</div>
            <div className="preview-scroll-v4">
              <div dangerouslySetInnerHTML={{ __html: htmlResult }} />
            </div>
          </div>

          <div className="panel-v4">
            <div className="panel-header-v4">
              <span>📄 최적화된 코드</span>
              <button onClick={() => { navigator.clipboard.writeText(htmlResult); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="copy-magic-btn">
                {copied ? '복사완료!' : '코드 전체 복사'}
              </button>
            </div>
            <div className="source-info success">이미지 데이터가 내장되었습니다. 그대로 게시판에 붙여넣으세요!</div>
            <textarea readOnly value={htmlResult} className="source-area-v4" />
          </div>
        </div>
      )}

      {/* 💡 하단 팁 및 주의사항 섹션 */}
      <div className="info-box-sketch">
        <h4>💡 현장스케치 제작 팁 및 주의사항</h4>
        <p>• <strong>초경량 최적화:</strong> 사진 용량을 최대 90%까지 자동 압축하여 홈페이지 속도를 저하시키지 않습니다.</p>
        <p>• <strong>반응형 디자인:</strong> 생성된 HTML은 모바일과 PC 화면 모두에 최적화되어 보여집니다.</p>
        <div className="mandatory-review-sketch">
          ⚠️ <strong>최종 검수 필수:</strong> 생성된 멘트가 현장 상황과 일치하는지 반드시 확인 후 업로드해 주세요.
        </div>
      </div>
    </div>
  );
};

export default FieldSketchWriter;
