import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { createRoot } from 'react-dom/client';
import './QRCodeGenerator.css';

const QRCodeGenerator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'url' | 'data' | 'batch'>('url');
  const [inputText, setInputText] = useState<string>('');
  const [displayData, setDisplayData] = useState<string>('');
  const [batchData, setBatchData] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const qrRef = useRef<HTMLDivElement>(null);
  const hiddenQrRef = useRef<HTMLDivElement>(null);

  const handleGenerate = () => {
    if (inputText.trim()) {
      setDisplayData(inputText);
    } else {
      alert(activeTab === 'url' ? 'URL을 입력해주세요.' : '난수 또는 데이터를 입력해주세요.');
    }
  };

  const downloadQRCode = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    saveSvgAsPng(svg, `qrcode-high-res-${activeTab}.png`);
  };

  const saveSvgAsPng = (svg: SVGSVGElement, fileName: string): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      const scaleFactor = 4;
      const size = 256 * scaleFactor;
      canvas.width = size;
      canvas.height = size;

      img.onload = () => {
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            if (fileName && blob) {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = fileName;
              if (!isProcessing) {
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }
            resolve(blob);
          }, 'image/png');
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        const parsed = data.map(row => String(row[0] || '').trim()).filter(Boolean);
        setBatchData(parsed);
      };
      reader.readAsBinaryString(file);
    } else if (fileName.endsWith('.txt')) {
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        const parsed = content.split('\n').map(line => line.trim()).filter(Boolean);
        setBatchData(parsed);
      };
      reader.readAsText(file);
    }
  };

  const processBatchDownload = async () => {
    if (batchData.length === 0 || !hiddenQrRef.current) return;
    setIsProcessing(true);
    setProgress(0);

    const zip = new JSZip();
    const folder = zip.folder("qr_codes");
    
    // 숨겨진 컨테이너에 임시로 렌더링하기 위한 root 생성
    const tempDiv = document.createElement('div');
    hiddenQrRef.current.appendChild(tempDiv);
    const root = createRoot(tempDiv);

    for (let i = 0; i < batchData.length; i++) {
      const data = batchData[i];
      
      // 동적으로 QRCodeSVG 렌더링 및 대기
      await new Promise<void>((resolve) => {
        root.render(<QRCodeSVG value={data} size={256} level="H" includeMargin={true} />);
        // 렌더링 완료 대기를 위해 약간의 지연 (React 18 동시성 대응)
        setTimeout(resolve, 50);
      });

      const svg = tempDiv.querySelector('svg');
      if (svg && folder) {
        const blob = await saveSvgAsPng(svg as unknown as SVGSVGElement, "");
        if (blob) {
          const safeName = data.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
          folder.file(`${i + 1}_${safeName}.png`, blob);
        }
      }
      setProgress(Math.round(((i + 1) / batchData.length) * 100));
    }

    // 정리
    root.unmount();
    hiddenQrRef.current.removeChild(tempDiv);

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "batch_qr_codes.zip");
    setIsProcessing(false);
    setProgress(0);
  };

  const resetForm = (tab: 'url' | 'data' | 'batch') => {
    setActiveTab(tab);
    setInputText('');
    setDisplayData('');
    setBatchData([]);
    setProgress(0);
  };

  return (
    <div className="qr-container">
      <h1 className="title">고인식 QR 생성기</h1>
      <p className="subtitle">상황에 맞는 데이터를 입력하여 QR 코드를 생성하세요</p>

      <div className="tab-menu">
        <button className={activeTab === 'url' ? 'active' : ''} onClick={() => resetForm('url')}>🔗 URL → QR</button>
        <button className={activeTab === 'data' ? 'active' : ''} onClick={() => resetForm('data')}>🔢 쿠폰난수 → QR</button>
        <button className={activeTab === 'batch' ? 'active' : ''} onClick={() => resetForm('batch')}>📁 일괄 생성 (파일)</button>
      </div>
      
      {activeTab !== 'batch' ? (
        <div className="input-group-vertical">
          <div className="input-row">
            <input
              type="text"
              placeholder={activeTab === 'url' ? "https://example.com" : "난수 또는 식별 코드를 입력하세요"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="url-input"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button onClick={handleGenerate} className="generate-btn">생성하기</button>
          </div>
        </div>
      ) : (
        <div className="input-group-vertical">
          <div className="file-upload-box">
            <input type="file" id="file-upload" accept=".xlsx, .xls, .txt" onChange={handleFileUpload} hidden />
            <label htmlFor="file-upload" className="file-label">
              <span>📂 파일 업로드 (Excel, TXT)</span>
            </label>
            {batchData.length > 0 && (
              <div className="batch-info">
                총 <strong>{batchData.length}</strong>개의 데이터를 불러왔습니다.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="qr-preview-card">
        {activeTab !== 'batch' ? (
          <>
            <div ref={qrRef} className="qr-code">
              {displayData ? (
                <QRCodeSVG value={displayData} size={256} level={"H"} includeMargin={true} />
              ) : (
                <div className="qr-placeholder">
                  <span>{activeTab === 'url' ? 'URL 입력 후' : '난수 입력 후'}<br />생성하기 버튼을 눌러주세요</span>
                </div>
              )}
            </div>
            {displayData && <div className="qr-info-text"><strong>입력된 데이터:</strong> {displayData}</div>}
            {displayData && <button onClick={downloadQRCode} className="download-btn-high-qr">고해상도 QR 다운로드</button>}
          </>
        ) : (
          <div className="batch-preview">
            {batchData.length > 0 ? (
              <>
                <div className="batch-list-scroll">
                  {batchData.slice(0, 10).map((item, idx) => <div key={idx} className="batch-item">{idx + 1}. {item}</div>)}
                  {batchData.length > 10 && <div className="batch-more">외 {batchData.length - 10}건...</div>}
                </div>
                {isProcessing ? (
                  <div className="progress-container">
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="progress-text">QR 코드 생성 및 압축 중... {progress}%</div>
                  </div>
                ) : (
                  <button onClick={processBatchDownload} className="download-btn-batch">
                    전체 QR 일괄 다운로드 (ZIP)
                  </button>
                )}
              </>
            ) : (
              <div className="qr-placeholder"><span>파일을 업로드하면<br />목록이 여기에 표시됩니다</span></div>
            )}
          </div>
        )}
      </div>

      <div className="info-box-success">
        <h4>💡 활용 안내</h4>
        {activeTab === 'batch' ? (
          <>
            <p>• <strong>엑셀:</strong> 첫 번째 열의 데이터를 한 행씩 읽어 각각 QR로 만듭니다.</p>
            <p>• <strong>텍스트:</strong> 한 줄에 하나씩 데이터를 입력한 파일을 업로드하세요.</p>
            <p>• <strong>일괄 처리:</strong> 생성된 모든 QR 코드는 ZIP 압축 파일로 다운로드됩니다.</p>
          </>
        ) : (
          <>
            <p>• <strong>URL 변환:</strong> 웹사이트 주소를 연결할 때 사용하세요.</p>
            <p>• <strong>난수/데이터:</strong> 상품 일련번호, 사번, 보안 코드 등을 입력하세요.</p>
            <p>• <strong>고화질 저장:</strong> 4배 고해상도로 출력 시에도 선명함을 유지합니다.</p>
          </>
        )}
      </div>
      
      {/* 백그라운드 처리를 위한 숨겨진 QR 영역 */}
      <div ref={hiddenQrRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}></div>
    </div>
  );
};

export default QRCodeGenerator;
