import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import './Approvals.css';

interface Approval {
  id: string;
  title: string;
  doc_date: string;
  department: string;
  author: string;
  file_url: string;
  file_name: string;
  description: string;
  created_at: string;
}

interface Comment {
  id: string;
  approval_id: string;
  content: string;
  author: string;
  created_at: string;
}

const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filteredApprovals, setFilteredApprovals] = useState<Approval[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [groupBy, setGroupBy] = useState<'year' | 'type'>('year');
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  const [newComment, setNewComment] = useState('');
  const [currentUser, setCurrentUser] = useState<{name: string; dept: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUser();
    fetchApprovals();
  }, []);

  useEffect(() => {
    filterApprovals();
  }, [approvals, searchTerm, selectedYear]);

  useEffect(() => {
    if (selectedApproval) {
      fetchComments(selectedApproval.id);
    }
  }, [selectedApproval]);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser({
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        dept: user.user_metadata?.department || '부서미지정'
      });
    }
  };

  const fetchApprovals = async () => {
    const { data, error } = await supabase
      .from('approvals')
      .select('*')
      .order('doc_date', { ascending: false });
    
    if (data && !error) {
      setApprovals(data);
    }
  };

  const fetchComments = async (approvalId: string) => {
    const { data, error } = await supabase
      .from('approval_comments')
      .select('*')
      .eq('approval_id', approvalId)
      .order('created_at', { ascending: true });
      
    if (data && !error) {
      setComments(data);
    }
  };

  const filterApprovals = () => {
    let result = approvals;
    
    if (selectedYear !== 'all') {
      result = result.filter(a => a.doc_date.startsWith(selectedYear));
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a => 
        a.title.toLowerCase().includes(term) || 
        a.description?.toLowerCase().includes(term) ||
        a.author.toLowerCase().includes(term) ||
        a.file_name.toLowerCase().includes(term)
      );
    }
    
    setFilteredApprovals(result);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadFiles(files);

      if (files.length === 1) {
        // 단일 파일인 경우에만 폼에 미리 채워줌
        const file = files[0];
        const parts = file.name.split('_');
        
        if (parts.length >= 3) {
          const datePart = parts[0];
          const typePart = parts[1];
          let titlePart = parts.slice(2).join('_');
          const extIndex = titlePart.lastIndexOf('.');
          if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
          
          if (datePart.length === 6 && !isNaN(Number(datePart))) {
            const year = '20' + datePart.substring(0, 2);
            const month = datePart.substring(2, 4);
            const day = datePart.substring(4, 6);
            setUploadDate(`${year}-${month}-${day}`);
          }
          setUploadTitle(`[${typePart}] ${titlePart}`);
        }
      } else {
        // 대량 업로드 시 폼을 초기화 (각 파일마다 개별 파싱됨)
        setUploadTitle('대량 업로드 진행 중...');
        setUploadDate(new Date().toISOString().split('T')[0]);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) {
      alert('파일을 선택해주세요.');
      return;
    }

    setIsUploading(true);
    let successCount = 0;

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress(i + 1);

        // 개별 파일 파싱
        let finalTitle = uploadTitle;
        let finalDate = uploadDate;
        
        const parts = file.name.split('_');
        if (parts.length >= 3) {
          const datePart = parts[0];
          const typePart = parts[1];
          let titlePart = parts.slice(2).join('_');
          const extIndex = titlePart.lastIndexOf('.');
          if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
          
          if (datePart.length === 6 && !isNaN(Number(datePart))) {
            const year = '20' + datePart.substring(0, 2);
            const month = datePart.substring(2, 4);
            const day = datePart.substring(4, 6);
            finalDate = `${year}-${month}-${day}`;
          }
          finalTitle = `[${typePart}] ${titlePart}`;
        }

        // 1. Storage에 파일 업로드
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `documents/${finalDate.substring(0,4)}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('approvals')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('approvals')
          .getPublicUrl(filePath);

        // 2. DB에 메타데이터 저장
        const { error: dbError } = await supabase.from('approvals').insert({
          title: finalTitle,
          doc_date: finalDate,
          department: currentUser?.dept || '기획팀',
          author: currentUser?.name || '사용자',
          file_url: urlData.publicUrl,
          file_name: file.name,
          description: uploadDesc
        });

        if (dbError) throw dbError;
        successCount++;
      }

      alert(`총 ${successCount}개의 품의서가 성공적으로 업로드되었습니다!`);
      setIsUploadModalOpen(false);
      setUploadFiles([]);
      setUploadTitle('');
      setUploadDesc('');
      setUploadDate('');
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchApprovals();

    } catch (error: any) {
      console.error(error);
      alert('업로드 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedApproval) return;

    const { error } = await supabase.from('approval_comments').insert({
      approval_id: selectedApproval.id,
      content: newComment.trim(),
      author: `${currentUser?.dept} ${currentUser?.name}`
    });

    if (!error) {
      setNewComment('');
      fetchComments(selectedApproval.id);
    } else {
      alert('댓글 등록 실패');
    }
  };

  const handleAiSummarize = async () => {
    if (!selectedApproval || !selectedApproval.file_url) return;
    
    // Check if the file is a PDF
    if (!selectedApproval.file_url.toLowerCase().includes('.pdf')) {
      alert('PDF 파일만 AI 요약이 가능합니다.');
      return;
    }

    setIsSummarizing(true);
    
    try {
      // 1. Fetch PDF Blob
      const response = await fetch(selectedApproval.file_url);
      const blob = await response.blob();
      
      // 2. Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64data = (reader.result as string).split(',')[1];
          
          // 3. Call Gemini
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
          if (!apiKey || apiKey === 'your_key_here') {
             throw new Error("환경 변수에 VITE_GEMINI_API_KEY가 설정되지 않았습니다.");
          }
          
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
          
          const prompt = "이 품의서(결재 문서)의 핵심 내용을 2~3줄 분량으로 요약해줘. 글머리 기호(1. 2.)를 사용해서 직관적이고 짧게 작성해.";
          
          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                data: base64data,
                mimeType: 'application/pdf'
              }
            }
          ]);
          
          const summaryText = result.response.text();
          
          // 4. Update DB
          const { error } = await supabase
            .from('approvals')
            .update({ description: summaryText })
            .eq('id', selectedApproval.id);
            
          if (error) throw error;
          
          // Update Local State
          setSelectedApproval({...selectedApproval, description: summaryText});
          setApprovals(prev => prev.map(a => a.id === selectedApproval.id ? {...a, description: summaryText} : a));
          
          setIsSummarizing(false);
        } catch (e: any) {
          console.error(e);
          alert("요약 처리 중 오류가 발생했습니다: " + e.message);
          setIsSummarizing(false);
        }
      };
    } catch (e: any) {
      console.error(e);
      alert("파일 다운로드 중 오류가 발생했습니다: " + e.message);
      setIsSummarizing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="approvals-container animate-fade-in">
      <div className="approvals-header">
        <div className="header-titles">
          <h1>팀 결재 품의서 보관함</h1>
          <p>과거의 품의서를 검색하고 다운로드하여 업무에 참고하세요.</p>
        </div>
        <button className="upload-btn" onClick={() => setIsUploadModalOpen(true)}>
          <span className="icon">📄</span> 새 품의서 등록
        </button>
      </div>

      <div className="approvals-controls">
        <div className="search-box">
          <span className="icon">🔍</span>
          <input 
            type="text" 
            placeholder="품의서 제목, 키워드, 작성자 검색..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="view-mode-toggle">
          <button 
            className={`toggle-btn ${groupBy === 'year' ? 'active' : ''}`}
            onClick={() => setGroupBy('year')}
          >
            연도별 보기
          </button>
          <button 
            className={`toggle-btn ${groupBy === 'type' ? 'active' : ''}`}
            onClick={() => setGroupBy('type')}
          >
            종류별 보기
          </button>
        </div>
        <div className="year-filter">
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
            <option value="all">전체 연도</option>
            <option value="2026">2026년</option>
            <option value="2025">2025년</option>
            <option value="2024">2024년</option>
          </select>
        </div>
      </div>

      <div className="approvals-content">
        <div className="approvals-list">
          {filteredApprovals.length === 0 ? (
            <div className="empty-state">조건에 맞는 품의서가 없습니다.</div>
          ) : (
            Object.entries(
              filteredApprovals.reduce((acc, curr) => {
                let key = '기타';
                if (groupBy === 'year') {
                  key = curr.doc_date.substring(0, 4) + '년';
                } else if (groupBy === 'type') {
                  const match = curr.title.match(/\[(.*?)\]/);
                  if (match && match[1]) {
                    key = match[1];
                  }
                }
                
                if (!acc[key]) acc[key] = [];
                acc[key].push(curr);
                return acc;
              }, {} as Record<string, Approval[]>)
            )
            .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
            .map(([groupKey, items]) => (
              <div key={groupKey} className="approval-group">
                <div className="group-header">
                  <span className="group-title">{groupKey}</span>
                  <span className="group-count">{items.length}건</span>
                </div>
                {items.map(approval => (
                  <div 
                    key={approval.id} 
                    className={`approval-card ${selectedApproval?.id === approval.id ? 'active' : ''}`}
                    onClick={() => setSelectedApproval(approval)}
                  >
                    <div className="approval-card-header">
                      <span className="approval-dept">{approval.department}</span>
                      <span className="approval-date">{approval.doc_date}</span>
                    </div>
                    <h3 className="approval-title">{approval.title}</h3>
                    <p className="approval-desc">{approval.description || '내용 없음'}</p>
                    <div className="approval-card-footer">
                      <span className="approval-author">✍️ {approval.author}</span>
                      <span className="approval-filename">📎 {approval.file_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {selectedApproval && (
          <div className="approval-detail">
            <div className="detail-header">
              <h2>{selectedApproval.title}</h2>
              <div className="detail-meta">
                <span>{selectedApproval.department} {selectedApproval.author}</span>
                <span>•</span>
                <span>{selectedApproval.doc_date}</span>
              </div>
            </div>
            
            <div className="detail-body">
              <div className="detail-desc-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>품의 요약 및 배경</h4>
                  <button 
                    onClick={handleAiSummarize} 
                    disabled={isSummarizing || !selectedApproval.file_url.toLowerCase().includes('.pdf')}
                    className="ai-summarize-btn"
                  >
                    {isSummarizing ? '✨ 요약 중...' : '✨ AI 자동 요약'}
                  </button>
                </div>
                <p>{selectedApproval.description || '등록된 요약이 없습니다. 우측 상단의 AI 자동 요약 버튼을 눌러보세요.'}</p>
              </div>

              {selectedApproval.file_url.toLowerCase().includes('.pdf') && (
                <div className="detail-pdf-preview">
                  <iframe 
                    src={`${selectedApproval.file_url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`} 
                    title="PDF Preview"
                  />
                </div>
              )}

              <div className="detail-file-box">
                <div className="file-info">
                  <span className="icon">📎</span>
                  <span className="filename">{selectedApproval.file_name}</span>
                </div>
                <a 
                  href={selectedApproval.file_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="download-btn"
                  download
                >
                  새 창에서 열기 / 다운로드
                </a>
              </div>
            </div>

            <div className="detail-comments">
              <h3>의견 및 피드백 ({comments.length})</h3>
              <div className="comments-list">
                {comments.length === 0 ? (
                  <p className="no-comments">아직 등록된 의견이 없습니다.</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="comment-item">
                      <div className="comment-meta">
                        <span className="comment-author">{c.author}</span>
                        <span className="comment-date">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="comment-content">{c.content}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="comment-input-box">
                <textarea 
                  placeholder="이 품의서에 대한 의견이나 참고할 점을 남겨주세요..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button onClick={handleAddComment} disabled={!newComment.trim()}>등록</button>
              </div>
            </div>
          </div>
        )}
        
        {!selectedApproval && filteredApprovals.length > 0 && (
          <div className="approval-detail empty-detail">
            <div className="icon">📄</div>
            <h3>품의서를 선택해주세요</h3>
            <p>좌측 목록에서 품의서를 클릭하면 상세 내용과 첨부파일, 팀원들의 의견을 확인할 수 있습니다.</p>
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>새 품의서 등록</h2>
              <button onClick={() => setIsUploadModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>품의서 제목</label>
                <input 
                  type="text" 
                  required
                  placeholder="예: [영업기획] 2025년 여름 성수기 패키지 요금 책정 품의" 
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>문서 일자 (기안일)</label>
                <input 
                  type="date" 
                  required
                  value={uploadDate}
                  onChange={e => setUploadDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>배경 및 요약 (검색 키워드)</label>
                <textarea 
                  placeholder="추후 검색 시 찾기 쉽도록 핵심 키워드나 품의 배경을 적어주세요." 
                  value={uploadDesc}
                  onChange={e => setUploadDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>PDF 스캔본 첨부 (여러 개 선택 가능)</label>
                <input 
                  type="file" 
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  multiple
                  required
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                {uploadFiles.length > 1 && (
                  <p style={{ fontSize: '12px', color: '#10b981', marginTop: '5px' }}>
                    ✅ 총 {uploadFiles.length}개의 파일이 일괄 업로드됩니다. (파일명으로 자동 분류됨)
                  </p>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setIsUploadModalOpen(false)}>취소</button>
                <button type="submit" className="submit-btn" disabled={isUploading}>
                  {isUploading ? `업로드 중... (${uploadProgress}/${uploadFiles.length})` : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
