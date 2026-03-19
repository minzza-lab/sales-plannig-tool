import React, { useState } from 'react';
import './FieldSketchWriter.css';

const FieldSketchWriter: React.FC = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [episodeNumber, setEpisodeNumber] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<{file: File, preview: string, base64: string}[]>([]);
  const [htmlResult, setHtmlResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

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
          const maxWidth = 800; 
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
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
  };

  const generateEmbeddedSketch = async () => {
    if (!apiKey || apiKey === 'your_key_here') {
      alert('.env 파일에 API 키를 먼저 설정해주세요.');
      return;
    }
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
      
      const prompt = `
        당신은 '웰리힐리파크'의 공식 리포터 '현스girl★'입니다. [Ep.${episodeNumber}] 현장스케치를 작성하세요.
        
        [작성 지침 - 필수 준수]
        1. 모든 텍스트는 <h3 style="text-align: center;">내용</h3> 형식을 사용하세요.
        2. 본문 중간중간에 사진을 반드시 순서대로 모두 넣으세요.
        3. 사진 태그 형식: <h3><img src="[IMG_DATA_INDEX]" width="1080" /></h3>
           (예: 첫 번째 사진은 [IMG_DATA_0], 두 번째는 [IMG_DATA_1] 처럼 숫자를 맞춰 0번부터 ${selectedFiles.length - 1}번까지 모두 넣으세요.)
        4. 말투는 매우 밝고 명랑하게 (예: 안녕하세요~~~~!, 그랬답니다!), 사진 상황을 구체적으로 설명하세요.
        
        오직 HTML 결과물만 출력하세요.
      `;

      const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];
      let success = false;

      for (const modelName of modelsToTry) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, ...imageParts] }]
              }),
            }
          );

          const data = await response.json();
          if (response.ok) {
            let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
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
            success = true;
            break;
          }
        } catch (inner) { continue; }
      }

      if (!success) throw new Error('AI 모델 응답 실패');
    } catch (err: any) {
      setError(`오류: ${err.message}`);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="sketch-container">
      <div className="sketch-header">
        <h1 className="title">현장스케치 자동 생성기</h1>
        <p className="subtitle">AI가 사진을 분석하여 생동감 넘치는 게시물을 즉시 제작합니다</p>
      </div>

      {/* 🚀 상단 사용방법 안내 */}
      <div className="quick-guide-card-sketch animate-fade-in">
        <div className="guide-icon">📖</div>
        <div className="guide-content">
          <h4>현장스케치 이용 가이드</h4>
          <ul>
            <li><strong>STEP 1:</strong> 이번 회차의 에피소드 번호를 입력하세요.</li>
            <li><strong>STEP 2:</strong> '사진 추가' 버튼을 눌러 현장 사진들을 한꺼번에 선택하세요.</li>
            <li><strong>STEP 3:</strong> 생성 버튼을 누른 후, 미리보기로 AI가 작성한 내용을 확인하세요.</li>
            <li><strong>STEP 4:</strong> 코드를 전체 복사하여 홈페이지 게시판에 붙여넣으면 끝!</li>
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
          <div className="upload-btn-wrapper">
            <label className="section-label">사진 업로드</label>
            <input type="file" id="sketch-upload" multiple accept="image/*" onChange={handleFileChange} hidden />
            <label htmlFor="sketch-upload" className="custom-upload-btn-v4">📸 사진 다중 선택하기</label>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="file-preview-grid-v4">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="preview-card-v4">
                <img src={file.preview} alt="" />
                <span className="file-name-tag">이미지 #{idx}</span>
                <button onClick={() => removeFile(idx)} className="del-btn-v4">×</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={generateEmbeddedSketch} className="generate-magic-btn" disabled={isLoading || selectedFiles.length === 0}>
          {isLoading ? '이미지 최적화 및 AI 분석 중...' : '게시물 HTML 자동 생성하기'}
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
          ⚠️ <strong>최종 검수 필수:</strong> AI가 작성한 멘트가 현장 상황과 일치하는지 반드시 확인 후 업로드해 주세요.
        </div>
      </div>
    </div>
  );
};

export default FieldSketchWriter;
