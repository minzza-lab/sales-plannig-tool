import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './AutomationRequest.css';

interface AutomationComment {
  id: string;
  request_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface AutomationRequestItem {
  id: string;
  user_name: string;
  department: string;
  content: string;
  likes: number;
  created_at: string;
  comments?: AutomationComment[];
}

const AutomationRequest: React.FC = () => {
  const [requests, setRequests] = useState<AutomationRequestItem[]>([]);
  const [newRequest, setNewRequest] = useState('');
  const [commentInputs, setCommentInputs] = useState<{[key: string]: string}>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      fetchRequests();
    };
    init();

    const subscription = supabase
      .channel('automation_realtime_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_requests' }, () => fetchRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_comments' }, () => fetchRequests())
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('automation_requests')
      .select(`
        *,
        comments:automation_comments(*)
      `)
      .order('created_at', { ascending: false });

    if (!error) setRequests(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim()) return;
    setIsLoading(true);
    
    const { error } = await supabase.from('automation_requests').insert([{
      user_name: currentUser?.user_metadata?.full_name || '사용자',
      department: currentUser?.user_metadata?.department || '영업팀',
      content: newRequest.trim(),
      likes: 0
    }]);
    
    if (!error) { setNewRequest(''); fetchRequests(); }
    setIsLoading(false);
  };

  const handleLike = async (id: string, currentLikes: number) => {
    await supabase.from('automation_requests').update({ likes: (currentLikes || 0) + 1 }).eq('id', id);
    fetchRequests();
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('이 요청 글을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('automation_requests').delete().eq('id', id);
    if (!error) fetchRequests();
  };

  const handleCommentSubmit = async (requestId: string) => {
    const content = commentInputs[requestId];
    if (!content?.trim()) return;
    await supabase.from('automation_comments').insert([{
      request_id: requestId,
      user_name: currentUser?.user_metadata?.full_name || '사용자',
      content: content.trim()
    }]);
    setCommentInputs({ ...commentInputs, [requestId]: '' });
    fetchRequests();
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('automation_comments').delete().eq('id', commentId);
    if (!error) fetchRequests();
  };

  return (
    <div className="automation-request-container animate-fade-in">
      <div className="tool-header">
        <h1>⚡ 자동화 요청 게시판</h1>
        <p>현장의 불편함을 공유하면 AI 도구로 만들어 드립니다.</p>
      </div>

      <div className="request-input-card">
        <form onSubmit={handleSubmit}>
          <textarea
            placeholder="어떤 업무가 자동화되면 좋을까요? 구체적인 내용을 적어주세요."
            value={newRequest}
            onChange={(e) => setNewRequest(e.target.value)}
            required
          />
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? '등록 중...' : '아이디어 등록하기'}
          </button>
        </form>
      </div>

      <div className="request-list">
        {requests.map((req) => (
          <div key={req.id} className="request-item-card">
            <div className="item-header">
              <div className="user-meta">
                <span className="dept">{req.department}</span>
                <span className="name">{req.user_name}</span>
                <span className="dot">•</span>
                <span className="date">{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <button className="delete-icon-btn" onClick={() => handleDeleteRequest(req.id)}>🗑️</button>
            </div>
            <div className="item-content">{req.content}</div>
            
            <div className="item-actions">
              <button className="action-btn like" onClick={() => handleLike(req.id, req.likes)}>
                ❤️ 공감 <span>{req.likes || 0}</span>
              </button>
              <div className="action-info">💬 댓글 {req.comments?.length || 0}</div>
            </div>
            
            <div className="comment-box">
              {req.comments?.map(comment => (
                <div key={comment.id} className="comment-row">
                  <div className="comment-main">
                    <span className="c-user">{comment.user_name}</span>
                    <span className="c-text">{comment.content}</span>
                  </div>
                  <button className="c-delete" onClick={() => handleDeleteComment(comment.id)}>✕</button>
                </div>
              ))}
              <div className="comment-form">
                <input 
                  type="text" 
                  placeholder="의견을 남겨주세요 (Enter)" 
                  value={commentInputs[req.id] || ''}
                  onChange={(e) => setCommentInputs({...commentInputs, [req.id]: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(req.id)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AutomationRequest;
