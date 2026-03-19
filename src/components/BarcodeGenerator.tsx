import React, { useState, useRef } from 'react';
import Barcode from 'react-barcode';
import './BarcodeGenerator.css';

const BarcodeGenerator: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [displayText, setDisplayText] = useState<string>('');
  const barcodeRef = useRef<HTMLDivElement>(null);

  const handleGenerate = () => {
    if (inputText.trim()) {
      setDisplayText(inputText);
    } else {
      alert('바코드로 변환할 내용을 입력해주세요.');
    }
  };

  const downloadBarcode = () => {
    const svg = barcodeRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // 인식률 향상을 위한 초고해상도 설정 (4배 상향)
    const scaleFactor = 4;
    const svgRect = svg.getBoundingClientRect();
    canvas.width = svgRect.width * scaleFactor;
    canvas.height = svgRect.height * scaleFactor;

    img.onload = () => {
      if (ctx) {
        // 안티앨리어싱 제거 (선의 경계를 칼같이 만듦)
        ctx.imageSmoothingEnabled = false;
        
        // 배경을 순백색으로 채움 (대비 극대화)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 고해상도로 드로잉
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `barcode-high-res-${displayText}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    // SVG 데이터를 Base64로 변환하여 로드
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="barcode-container">
      <h1 className="title">고인식 바코드 생성기</h1>
      <p className="subtitle">리더기 인식률을 극대화한 전문가용 바코드 도구입니다</p>
      
      <div className="input-group">
        <input
          type="text"
          placeholder="데이터 입력 (예: ITEM-2026-001)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="url-input"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        />
        <button onClick={handleGenerate} className="generate-btn">
          생성하기
        </button>
      </div>

      <div className="barcode-preview-card">
        <div ref={barcodeRef} className="barcode-preview">
          {displayText ? (
            <Barcode 
              value={displayText} 
              format="CODE128"
              width={2.5}         // 선 굵기 최적화 (인식률 향상)
              height={120}        // 바코드 높이 상향 (리딩 범위 확대)
              displayValue={true}
              font="monospace"    // 가독성 좋은 고정폭 글꼴
              textAlign="center"
              textPosition="bottom"
              textMargin={12}
              fontSize={18}
              background="#ffffff"
              lineColor="#000000"
              margin={20}         // Quiet Zone(여백) 충분히 확보
            />
          ) : (
            <div className="barcode-placeholder">
              <span>내용 입력 후<br />생성하기 버튼을 눌러주세요</span>
            </div>
          )}
        </div>
        
        {displayText && (
          <button onClick={downloadBarcode} className="download-btn-high">
            고해상도 PNG 다운로드 (인식률 최적화)
          </button>
        )}
      </div>

      <div className="info-box-success">
        <h4>✅ 인식률 최적화 적용됨</h4>
        <p>• <strong>선명도:</strong> 다운로드 시 4배 고해상도로 렌더링되어 선이 뭉개지지 않습니다.</p>
        <p>• <strong>대비:</strong> 안티앨리어싱을 제거하여 흑백 대비를 칼같이 분리했습니다.</p>
        <p>• <strong>규격:</strong> 바코드 높이를 높이고 여백을 확보하여 리더기가 찾기 쉽습니다.</p>
      </div>
    </div>
  );
};

export default BarcodeGenerator;
