import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { callGeminiWithFallback } from '../utils/apiProxy';
import './ProductProposals.css';

interface ProductProposal {
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
  proposal_id: string;
  content: string;
  author: string;
  created_at: string;
}

const ProductProposals: React.FC = () => {
  const [product_proposals, setProductProposals] = useState<ProductProposal[]>([]);
  const [filteredProductProposals, setFilteredProductProposals] = useState<ProductProposal[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedProductProposal, setSelectedProductProposal] = useState<ProductProposal | null>(null);
  const [groupBy, setGroupBy] = useState<'year' | 'type'>('year');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProductProposal>>({});
  
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
    fetchProductProposals();
  }, []);

  useEffect(() => {
    filterProductProposals();
  }, [product_proposals, searchTerm, selectedYear]);

  useEffect(() => {
    if (selectedProductProposal) {
      fetchComments(selectedProductProposal.id);
    }
  }, [selectedProductProposal]);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser({
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        dept: user.user_metadata?.department || '부서미지정'
      });
    }
  };

  const fetchProductProposals = async () => {
    const { data, error } = await supabase
      .from('product_proposals')
      .select('*')
      .order('doc_date', { ascending: false });
    
    if (data && !error) {
      setProductProposals(data);
    }
  };

  const fetchComments = async (proposalId: string) => {
    const { data, error } = await supabase
      .from('product_proposal_comments')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });
      
    if (data && !error) {
      setComments(data);
    }
  };

  const filterProductProposals = () => {
    let result = product_proposals;
    
    if (selectedYear !== 'all') {
      result = result.filter(a => a.doc_date && a.doc_date.startsWith(selectedYear));
    }
    
    if (searchTerm) {
      // Mac 환경에서 업로드된 파일명의 자음/모음 분리 현상(NFD)을 해결하기 위해 normalize('NFC') 적용
      const terms = searchTerm.normalize('NFC').toLowerCase().split(' ').filter(t => t.trim() !== '');
      result = result.filter(a => {
        const textToSearch = `
          ${a.title || ''} 
          ${a.description || ''} 
          ${a.author || ''} 
          ${a.file_name || ''}
          ${a.department || ''}
        `.normalize('NFC').toLowerCase();
        
        return terms.every(term => textToSearch.includes(term));
      });
    }
    
    setFilteredProductProposals(result);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadFiles(files);

      if (files.length === 1) {
        // 단일 파일인 경우에만 폼에 미리 채워줌
        const file = files[0];
        const parts = file.name.split('_');
        if (parts.length >= 2) {
          const datePart = parts[0];
          if (datePart.length === 6 && !isNaN(Number(datePart))) {
            const year = '20' + datePart.substring(0, 2);
            const month = datePart.substring(2, 4);
            const day = datePart.substring(4, 6);
            setUploadDate(`${year}-${month}-${day}`);
            
            if (parts.length >= 3) {
              const typePart = parts[1];
              let titlePart = parts.slice(2).join('_');
              const extIndex = titlePart.lastIndexOf('.');
              if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
              setUploadTitle(`[${typePart}] ${titlePart}`);
            } else {
              let titlePart = parts[1];
              const extIndex = titlePart.lastIndexOf('.');
              if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
              setUploadTitle(titlePart);
            }
          } else {
            let fileNameWithoutExt = file.name;
            const extIndex = fileNameWithoutExt.lastIndexOf('.');
            if (extIndex > -1) fileNameWithoutExt = fileNameWithoutExt.substring(0, extIndex);
            setUploadTitle(fileNameWithoutExt);
          }
        } else {
          let fileNameWithoutExt = file.name;
          const extIndex = fileNameWithoutExt.lastIndexOf('.');
          if (extIndex > -1) fileNameWithoutExt = fileNameWithoutExt.substring(0, extIndex);
          setUploadTitle(fileNameWithoutExt);
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
        if (parts.length >= 2) {
          const datePart = parts[0];
          if (datePart.length === 6 && !isNaN(Number(datePart))) {
            const year = '20' + datePart.substring(0, 2);
            const month = datePart.substring(2, 4);
            const day = datePart.substring(4, 6);
            finalDate = `${year}-${month}-${day}`;
            
            if (uploadTitle === '대량 업로드 진행 중...' || uploadFiles.length > 1) {
              if (parts.length >= 3) {
                const typePart = parts[1];
                let titlePart = parts.slice(2).join('_');
                const extIndex = titlePart.lastIndexOf('.');
                if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
                finalTitle = `[${typePart}] ${titlePart}`;
              } else {
                let titlePart = parts[1];
                const extIndex = titlePart.lastIndexOf('.');
                if (extIndex > -1) titlePart = titlePart.substring(0, extIndex);
                finalTitle = titlePart;
              }
            }
          } else if (uploadTitle === '대량 업로드 진행 중...' || uploadFiles.length > 1) {
            let fileNameWithoutExt = file.name;
            const extIndex = fileNameWithoutExt.lastIndexOf('.');
            if (extIndex > -1) fileNameWithoutExt = fileNameWithoutExt.substring(0, extIndex);
            finalTitle = fileNameWithoutExt;
          }
        } else if (uploadTitle === '대량 업로드 진행 중...' || uploadFiles.length > 1) {
          let fileNameWithoutExt = file.name;
          const extIndex = fileNameWithoutExt.lastIndexOf('.');
          if (extIndex > -1) fileNameWithoutExt = fileNameWithoutExt.substring(0, extIndex);
          finalTitle = fileNameWithoutExt;
        }

        // 1. Storage에 파일 업로드
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `documents/${finalDate.substring(0,4)}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product_proposals')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('product_proposals')
          .getPublicUrl(filePath);

        // 2. DB에 메타데이터 저장
        const { error: dbError } = await supabase.from('product_proposals').insert({
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

      alert(`총 ${successCount}개의 상품안가 성공적으로 업로드되었습니다!`);
      setIsUploadModalOpen(false);
      setUploadFiles([]);
      setUploadTitle('');
      setUploadDesc('');
      setUploadDate('');
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchProductProposals();

    } catch (error: any) {
      console.error(error);
      alert('업로드 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedProductProposal) return;

    const { error } = await supabase.from('product_proposal_comments').insert({
      proposal_id: selectedProductProposal.id,
      content: newComment.trim(),
      author: `${currentUser?.dept} ${currentUser?.name}`
    });

    if (!error) {
      setNewComment('');
      fetchComments(selectedProductProposal.id);
    } else {
      alert('댓글 등록 실패');
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const openEditModal = () => {
    if (selectedProductProposal) {
      setEditForm(selectedProductProposal);
      setIsEditModalOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!selectedProductProposal) return;
    if (!window.confirm(`'${selectedProductProposal.title}' 문서를 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    await supabase.from('product_proposal_comments').delete().eq('proposal_id', selectedProductProposal.id);
    const { error } = await supabase.from('product_proposals').delete().eq('id', selectedProductProposal.id);
    
    if (error) {
      alert("삭제 실패: " + error.message);
    } else {
      setSelectedProductProposal(null);
      fetchProductProposals();
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id || !editForm.title || !editForm.doc_date) return;
    
    const { error } = await supabase
      .from('product_proposals')
      .update({
        title: editForm.title,
        doc_date: editForm.doc_date,
        department: editForm.department,
        author: editForm.author,
        file_name: editForm.file_name
      })
      .eq('id', editForm.id);
      
    if (error) {
      alert("수정 실패: " + error.message);
    } else {
      setIsEditModalOpen(false);
      fetchProductProposals();
      setSelectedProductProposal({ ...selectedProductProposal, ...editForm } as ProductProposal);
    }
  };

  const handleAiSummarize = async () => {
    if (!selectedProductProposal || !selectedProductProposal.file_url) return;
    
    // Check if the file is a PDF
    if (!selectedProductProposal.file_url.toLowerCase().includes('.pdf')) {
      alert('PDF 파일만 AI 요약이 가능합니다.');
      return;
    }

    setIsSummarizing(true);
    
    try {
      // 1. Fetch PDF Blob
      const response = await fetch(selectedProductProposal.file_url);
      const blob = await response.blob();
      
      // 2. Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64data = (reader.result as string).split(',')[1];
          
          // 3. Call Gemini via proxy
          const prompt = "이 상품안(결재 문서)의 핵심 내용을 2~3줄 분량으로 요약해줘. 글머리 기호(1. 2.)를 사용해서 직관적이고 짧게 작성해.";
          
          const summaryText = await callGeminiWithFallback(
            [{ text: prompt }, { inlineData: { data: base64data, mimeType: 'application/pdf' } }]
          );
          
          // 4. Update DB
          const { error } = await supabase
            .from('product_proposals')
            .update({ description: summaryText })
            .eq('id', selectedProductProposal.id);
            
          if (error) throw error;
          
          // Update Local State
          setSelectedProductProposal({...selectedProductProposal, description: summaryText});
          setProductProposals(prev => prev.map(a => a.id === selectedProductProposal.id ? {...a, description: summaryText} : a));
          
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
    <div className="product_proposals-container animate-fade-in">
      <div className="product_proposals-header">
        <div className="header-titles">
          <h1>상품안 보관함</h1>
          <p>과거의 상품안를 검색하고 다운로드하여 업무에 참고하세요.</p>
        </div>
        <button className="upload-btn" onClick={() => setIsUploadModalOpen(true)}>
          <span className="icon">📄</span> 새 상품안 등록
        </button>
      </div>

      <div className="product_proposals-controls">
        <div className="search-box">
          <span className="icon">🔍</span>
          <input 
            type="text" 
            placeholder="상품안 제목, 키워드, 작성자 검색..." 
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

      <div className="product_proposals-content">
        <div className="product_proposals-list">
          {filteredProductProposals.length === 0 ? (
            <div className="empty-state">조건에 맞는 상품안가 없습니다.</div>
          ) : (
            Object.entries(
              filteredProductProposals.reduce((acc, curr) => {
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
              }, {} as Record<string, ProductProposal[]>)
            )
            .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
            .map(([groupKey, items]) => {
              // 검색 중이거나 사용자가 명시적으로 열어둔 경우에만 확장 (기본값은 닫힘)
              const isExpanded = searchTerm.length > 0 || !!expandedGroups[groupKey];
              
              return (
              <div key={groupKey} className="proposal-group">
                <div 
                  className="group-header accordion-header" 
                  onClick={() => toggleGroup(groupKey)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="group-title">{groupKey}</span>
                    <span className="group-count">{items.length}건</span>
                  </div>
                  <span className="group-arrow" style={{ color: '#94a3b8', fontSize: '12px' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
                
                {isExpanded && (
                  <div className="group-items animate-fade-in">
                    {items.map(approval => (
                      <div 
                        key={approval.id} 
                        className={`proposal-card ${selectedProductProposal?.id === approval.id ? 'active' : ''}`}
                        onClick={() => setSelectedProductProposal(approval)}
                      >
                        <div className="proposal-card-header">
                          <span className="proposal-dept">{approval.department}</span>
                          <span className="proposal-date">{approval.doc_date}</span>
                        </div>
                        <h3 className="proposal-title">{approval.title}</h3>
                        <p className="proposal-desc">{approval.description || '내용 없음'}</p>
                        <div className="proposal-card-footer">
                          <span className="proposal-author">✍️ {approval.author}</span>
                          <span className="proposal-filename">📎 {approval.file_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )})
          )}
        </div>

        {selectedProductProposal && (
          <div className="proposal-detail">
            <div className="detail-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ flex: 1, margin: 0, marginBottom: '10px' }}>{selectedProductProposal.title}</h2>
                <div className="detail-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '15px' }}>
                  <button onClick={openEditModal} className="edit-btn">수정</button>
                  <button onClick={handleDelete} className="delete-btn">삭제</button>
                </div>
              </div>
              <div className="detail-meta">
                <span>{selectedProductProposal.department} {selectedProductProposal.author}</span>
                <span>•</span>
                <span>{selectedProductProposal.doc_date}</span>
              </div>
            </div>
            
            <div className="detail-body">
              <div className="detail-desc-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>상품안 요약 및 배경</h4>
                  <button 
                    onClick={handleAiSummarize} 
                    disabled={isSummarizing || !selectedProductProposal.file_url.toLowerCase().includes('.pdf')}
                    className="ai-summarize-btn"
                  >
                    {isSummarizing ? '✨ 요약 중...' : '✨ AI 자동 요약'}
                  </button>
                </div>
                <p>{selectedProductProposal.description || '등록된 요약이 없습니다. 우측 상단의 AI 자동 요약 버튼을 눌러보세요.'}</p>
              </div>

              {selectedProductProposal.file_url.toLowerCase().includes('.pdf') && (
                <div className="detail-pdf-preview">
                  <iframe 
                    src={
                      window.innerWidth <= 768 
                        ? `https://docs.google.com/gview?url=${encodeURIComponent(selectedProductProposal.file_url)}&embedded=true`
                        : `${selectedProductProposal.file_url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`
                    } 
                    title="PDF Preview"
                  />
                </div>
              )}

              <div className="detail-file-box">
                <div className="file-info">
                  <span className="icon">📎</span>
                  <span className="filename">{selectedProductProposal.file_name}</span>
                </div>
                <a 
                  href={selectedProductProposal.file_url} 
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
                  placeholder="이 상품안에 대한 의견이나 참고할 점을 남겨주세요..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button onClick={handleAddComment} disabled={!newComment.trim()}>등록</button>
              </div>
            </div>
          </div>
        )}
        
        {!selectedProductProposal && filteredProductProposals.length > 0 && (
          <div className="proposal-detail empty-detail">
            <div className="icon">📄</div>
            <h3>상품안를 선택해주세요</h3>
            <p>좌측 목록에서 상품안를 클릭하면 상세 내용과 첨부파일, 팀원들의 의견을 확인할 수 있습니다.</p>
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>새 상품안 등록</h2>
              <button onClick={() => setIsUploadModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>상품안 제목</label>
                <input 
                  type="text" 
                  required
                  placeholder="예: [영업기획] 2025년 여름 성수기 패키지 요금 책정 상품안" 
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
                  placeholder="추후 검색 시 찾기 쉽도록 핵심 키워드나 기획 배경을 적어주세요." 
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

      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>상품안 정보 수정</h2>
              <button onClick={() => setIsEditModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>상품안 제목</label>
                <input 
                  type="text" 
                  required
                  value={editForm.title || ''}
                  onChange={e => setEditForm({...editForm, title: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>문서 일자 (기안일)</label>
                <input 
                  type="date" 
                  required
                  value={editForm.doc_date || ''}
                  onChange={e => setEditForm({...editForm, doc_date: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>기안 부서</label>
                <input 
                  type="text" 
                  required
                  value={editForm.department || ''}
                  onChange={e => setEditForm({...editForm, department: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>작성자 (기안자)</label>
                <input 
                  type="text" 
                  required
                  value={editForm.author || ''}
                  onChange={e => setEditForm({...editForm, author: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>파일 이름 표시 (표시용)</label>
                <input 
                  type="text" 
                  required
                  value={editForm.file_name || ''}
                  onChange={e => setEditForm({...editForm, file_name: e.target.value})}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setIsEditModalOpen(false)}>취소</button>
                <button type="submit" className="submit-btn">수정 저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductProposals;
