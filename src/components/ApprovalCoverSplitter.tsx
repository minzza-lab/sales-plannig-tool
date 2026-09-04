import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '../lib/supabase';
import './ApprovalCoverSplitter.css';

interface StoredApproval {
  id: string;
  title: string;
  doc_date: string;
  file_name: string;
  file_url: string;
}

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
  const [previewUrl, setPreviewUrl] = useState('');
  const [storedApprovals, setStoredApprovals] = useState<StoredApproval[]>([]);
  const [isLoadingStored, setIsLoadingStored] = useState(true);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  useEffect(() => {
    const loadStoredApprovals = async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('id, title, doc_date, file_name, file_url')
        .order('doc_date', { ascending: false });
      if (!error && data) {
        setStoredApprovals(data.filter((approval) => approval.file_name?.toLowerCase().endsWith('.pdf') || approval.file_url?.toLowerCase().includes('.pdf')));
      }
      setIsLoadingStored(false);
    };
    void loadStoredApprovals();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const reset = () => {
    setFile(null);
    setPageCount(0);
    setLastPage('');
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return '';
    });
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
      setPreviewUrl(URL.createObjectURL(selectedFile));
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

  const selectStoredApproval = async (approvalId: string) => {
    const approval = storedApprovals.find((item) => item.id === approvalId);
    if (!approval) return;
    setIsLoadingFile(true);
    setIsError(false);
    setMessage('품의서 보관함에서 PDF를 불러오는 중입니다...');
    try {
      const response = await fetch(approval.file_url);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      await handleFile(new File([blob], approval.file_name, { type: 'application/pdf' }));
    } catch {
      setIsError(true);
      setMessage('보관함의 PDF를 불러오지 못했습니다. 접근 권한 또는 파일 상태를 확인해주세요.');
    } finally {
      setIsLoadingFile(false);
    }
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

      <section className="approval-cover-splitter__workspace" aria-label="PDF 분리 설정">
        <div className="approval-cover-splitter__controls">
          <input ref={inputRef} id="approval-cover-pdf" type="file" accept="application/pdf,.pdf" onChange={handleFileChange} hidden />
          <label className="approval-cover-splitter__upload" htmlFor="approval-cover-pdf">
            <span className="approval-cover-splitter__upload-icon">📁</span>
            <strong>{file ? file.name : '내 컴퓨터에서 PDF 선택'}</strong>
            <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · 다른 파일을 선택하려면 클릭` : '외부 서버 업로드 없이 이 브라우저에서만 처리합니다.'}</small>
          </label>

          <label className="approval-cover-splitter__stored-select">
            <span>또는 품의서 보관함 PDF 선택</span>
            <select defaultValue="" disabled={isLoadingStored || isLoadingFile} onChange={(event) => { if (event.target.value) void selectStoredApproval(event.target.value); event.currentTarget.value = ''; }}>
              <option value="">{isLoadingStored ? '보관함 목록을 불러오는 중...' : '저장된 PDF를 선택하세요'}</option>
              {storedApprovals.map((approval) => <option key={approval.id} value={approval.id}>{approval.doc_date} · {approval.title} ({approval.file_name})</option>)}
            </select>
            <small>이미 보관함에 저장된 PDF를 읽어와 분리합니다. 새로 업로드하거나 원본을 수정하지 않습니다.</small>
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
            <button className="approval-cover-splitter__download" type="button" disabled={!file || isProcessing || isLoadingFile} onClick={() => void handleDownload()}>
              {isProcessing ? 'PDF 생성 중...' : '분리 PDF 다운로드'}
            </button>
          </div>
        </div>

        <div className="approval-cover-splitter__preview">
          <div className="approval-cover-splitter__preview-heading"><strong>PDF 미리보기</strong><span>{file ? '첫 페이지부터 내용을 확인하세요' : '파일을 선택하면 여기에 표시됩니다'}</span></div>
          {previewUrl ? <iframe src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`} title={`${file?.name || 'PDF'} 미리보기`} /> : <div className="approval-cover-splitter__preview-empty"><span>📄</span><strong>PDF 미리보기</strong><small>내 컴퓨터의 PDF 또는 품의서 보관함 문서를 선택해주세요.</small></div>}
        </div>
      </section>
    </main>
  );
};

export default ApprovalCoverSplitter;
