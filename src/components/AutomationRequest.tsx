import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './AutomationRequest.css';

interface Comment {
  id: string;
  request_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface RequestItem {
  id: string;
  user_name: string;
  department: string;
  content: string;
  likes: number;
  created_at: string;
  comments?: Comment[];
}

const AutomationRequest: React.FC = () => {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [newRequest, setNewRequest] = useState('');
  const [commentInputs, setCommentInputs] = useState<{[key: string]: string}>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    fetchRequests();
    getCurrentUser();

    // 실시간 구독
    const subscription = supabase
      .channel('automation_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_requests' }, () => fetchRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_comments' }, () => fetchRequests())
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const fetchRequests = async () => {
    // 요청글과 댓글을 함께 가져옴
    const { data, error } = await supabase
      .from('automation_requests')
      .select(`
        *,
        comments:automation_comments(*)
      `)
      .order('created_at', { ascending: false });

    if (error) console.error('Error:', error);
    else setRequests(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.from('automation_requests').insert([{
      user_name: currentUser?.user_metadata?.full_name || '익명',
      department: currentUser?.user_metadata?.department || '영업부',
      content: newRequest,
      likes: 0
    }]);
    if (!error) { setNewRequest(''); fetchRequests(); }
    setIsLoading(false);
  };

  const handleLike = async (id: string, currentLikes: number) => {
    await supabase.from('automation_requests').update({ likes: (currentLikes || 0) + 1 }).eq('id', id);
    fetchRequests();
  };

  const handleCommentSubmit = async (requestId: string) => {
    const content = commentInputs[requestId];
    if (!content?.trim()) return;

    const { error } = await supabase.from('automation_comments').insert([{
      request_id: requestId,
      user_name: currentUser?.user_metadata?.full_name || '익명',
      content: content.trim()
    }]);

    if (!error) {
      setCommentInputs({ ...commentInputs, [requestId]: '' });
      fetchRequests();
    }
  };

  return (
    <div className="automation-request-container animate-fade-in">
      <div className="tool-header">
        <h1>⚡ 자동화 요청 게시판</h1>
        <p>불편한 업무를 알려주시면 AI 도구로 만들어 드립니다.</p>
      </div>

      <div className="request-input-card">
        <form onSubmit={handleSubmit}>
          <textarea
            placeholder="어떤 업무가 자동화되면 좋을까요? 구체적으로 적어주세요."
            value={newRequest}
            onChange={(e) => setNewRequest(e.target.value)}
            required
          />
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? '등록 중...' : '요청 등록하기'}
          </button>
        </form>
      </div>

      <div className="request-list">
        {requests.map((req) => (
          <div key={req.id} className="request-item-card">
            <div className="item-header">
              <span className="user-info">{req.department} <strong>{req.user_name}</strong></span>
              <span className="date">{new Date(req.created_at).toLocaleDateString()}</span>
            </div>
            <div className="item-content">{req.content}</div>
            <div className="item-actions">
              <button className="like-btn" onClick={() => handleLike(req.id, req.likes)}>
                ❤️ 공감 <span>{req.likes || 0}</span>
              </button>
              <span className="comment-count">💬 댓글 {req.comments?.length || 0}개</span>
            </div>
            
            <div className="comment-section">
              {req.comments?.map(comment => (
                <div key={comment.id} className="comment-item">
                  <span className="comment-user">{comment.user_name}</span>
                  <span className="comment-text">{comment.content}</span>
                </div>
              ))}
              <div className="comment-input">
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
