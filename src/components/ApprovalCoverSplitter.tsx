import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import './ApprovalCoverSplitter.css';

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const getDownloadName = (fileName: string, lastPage: number) => {
  const baseName = fileName.replace(/\.pdf$/i, '') || '품의서';
  return `${baseName}_앞${lastPage}페이지.pdf`;
};

const ApprovalCoverSplitter = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [lastPage, setLastPage] = useState('');
  const [message, setMessage] = useState('PDF 파일을 선택하면 총 페이지 수를 확인할 수 있습니다.');
  const [isError, setIsError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const reset = () => {
    setFile(null);
    setPageCount(0);
    setLastPage('');
    setMessage('PDF 파일을 선택하면 총 페이지 수를 확인할 수 있습니다.');
    setIsError(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (selectedFile?: File) => {
    reset();
    if (!selectedFile) return;

    if (!isPdfFile(selectedFile)) {
      setIsError(true);
      setMessage('PDF 파일만 선택할 수 있습니다. 파일 형식을 확인해주세요.');
      return;
    }

    try {
      const source = await PDFDocument.load(await selectedFile.arrayBuffer());
      const totalPages = source.getPageCount();
      if (totalPages < 1) throw new Error('empty PDF');
      setFile(selectedFile);
      setPageCount(totalPages);
      setLastPage(String(totalPages));
      setMessage(`총 ${totalPages}페이지를 확인했습니다. 보존할 마지막 페이지를 선택해주세요.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      setIsError(true);
      setMessage(
        errorMessage.includes('encrypt') || errorMessage.includes('password')
          ? '비밀번호가 설정된 PDF는 분리할 수 없습니다. 비밀번호를 해제한 뒤 다시 선택해주세요.'
          : 'PDF를 읽을 수 없습니다. 손상되지 않은 PDF 파일인지 확인해주세요.',
      );
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
  };

  const handleDownload = async () => {
    if (!file || !pageCount) return;
    const selectedLastPage = Number(lastPage);
    if (!Number.isInteger(selectedLastPage) || selectedLastPage < 1 || selectedLastPage > pageCount) {
      setIsError(true);
      setMessage(`보존할 마지막 페이지는 1부터 ${pageCount} 사이의 정수로 입력해주세요.`);
      return;
    }

    setIsProcessing(true);
    setIsError(false);
    setMessage('분리 PDF를 만드는 중입니다...');
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const result = await PDFDocument.create();
      const pages = await result.copyPages(source, Array.from({ length: selectedLastPage }, (_, index) => index));
      pages.forEach((page) => result.addPage(page));

      const pdfBytes = new Uint8Array(await result.save());
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getDownloadName(file.name, selectedLastPage);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`앞 1~${selectedLastPage}페이지 PDF를 저장했습니다. 원본 파일은 변경되지 않았습니다.`);
    } catch {
      setIsError(true);
      setMessage('PDF 분리 중 오류가 발생했습니다. 파일을 다시 선택한 뒤 시도해주세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="approval-cover-splitter">
      <section className="approval-cover-splitter__hero">
        <span className="approval-cover-splitter__eyebrow">PDF 유틸리티</span>
        <h1>📄 품의 갑지 분리기</h1>
        <p>품의서에서 필요한 앞 페이지까지만 새 PDF로 저장합니다. 파일은 브라우저 안에서만 처리되며 외부 서버로 전송되지 않습니다.</p>
      </section>

      <section className="approval-cover-splitter__card" aria-label="PDF 분리 설정">
        <input ref={inputRef} id="approval-cover-pdf" type="file" accept="application/pdf,.pdf" onChange={handleFileChange} hidden />
        <label className="approval-cover-splitter__upload" htmlFor="approval-cover-pdf">
          <span className="approval-cover-splitter__upload-icon">📁</span>
          <strong>{file ? file.name : 'PDF 파일 선택'}</strong>
          <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · 다른 파일을 선택하려면 클릭` : '여기를 눌러 PDF 1개를 업로드하세요.'}</small>
        </label>

        {file && (
          <div className="approval-cover-splitter__details">
            <div className="approval-cover-splitter__page-count"><span>총 페이지 수</span><strong>{pageCount}페이지</strong></div>
            <label className="approval-cover-splitter__page-input">
              <span>보존할 마지막 페이지</span>
              <input type="number" min="1" max={pageCount} step="1" value={lastPage} onChange={(event) => setLastPage(event.target.value)} aria-describedby="page-range-help" />
              <small id="page-range-help">1~{pageCount} 중 선택 · 예: 3을 입력하면 1~3페이지만 저장</small>
            </label>
          </div>
        )}

        <p className={`approval-cover-splitter__message ${isError ? 'is-error' : ''}`} role="status">{message}</p>

        <div className="approval-cover-splitter__actions">
          {file && <button className="approval-cover-splitter__reset" type="button" onClick={reset}>파일 초기화</button>}
          <button className="approval-cover-splitter__download" type="button" disabled={!file || isProcessing} onClick={() => void handleDownload()}>
            {isProcessing ? 'PDF 생성 중...' : '분리 PDF 다운로드'}
          </button>
        </div>
      </section>
    </main>
  );
};

export default ApprovalCoverSplitter;
