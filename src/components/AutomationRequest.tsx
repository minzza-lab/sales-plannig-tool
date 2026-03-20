import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './AutomationRequest.css';

interface Comment {
  id: string;
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
  comments: Comment[];
  created_at: string;
}

const AutomationRequest: React.FC = () => {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [newRequest, setNewRequest] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    fetchRequests();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const fetchRequests = async () => {
    // 실제 구현 시 Supabase에서 가져오는 로직 (임시 데이터 포함)
    const mockData: RequestItem[] = [
      {
        id: '1',
        user_name: '최민혁',
        department: '영업기획팀',
        content: '매일 아침 수기로 작성하는 실적 보고서를 엑셀 업로드만으로 자동 요약해주는 기능이 필요합니다!',
        likes: 12,
        comments: [
          { id: 'c1', user_name: '김철수', content: '진짜 필요합니다 이거!', created_at: '2026-03-20' }
        ],
        created_at: '2026-03-20'
      }
    ];
    setRequests(mockData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim()) return;
    
    setIsLoading(true);
    // 임시 추가 로직 (실제로는 supabase.from('automation_requests').insert(...) 사용)
    const newItem: RequestItem = {
      id: Date.now().toString(),
      user_name: currentUser?.user_metadata?.full_name || '익명',
      department: currentUser?.user_metadata?.department || '영업부',
      content: newRequest,
      likes: 0,
      comments: [],
      created_at: new Date().toISOString()
    };
    
    setRequests([newItem, ...requests]);
    setNewRequest('');
    setIsLoading(false);
    alert('요청이 등록되었습니다!');
  };

  const handleLike = (id: string) => {
    setRequests(requests.map(req => 
      req.id === id ? { ...req, likes: req.likes + 1 } : req
    ));
  };

  return (
    <div className="automation-request-container animate-fade-in">
      <div className="tool-header">
        <h1>⚡ 자동화 요청 게시판</h1>
        <p>우리 팀의 업무 효율을 높일 아이디어를 공유해 주세요!</p>
      </div>

      <div className="request-input-card">
        <form onSubmit={handleSubmit}>
          <textarea
            placeholder="어떤 업무가 자동화되면 좋을까요? 팀원들과 아이디어를 나누어 보세요."
            value={newRequest}
            onChange={(e) => setNewRequest(e.target.value)}
            required
          />
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? '등록 중...' : '아이디어 올리기'}
          </button>
        </form>
      </div>

      <div className="request-list">
        {requests.map((req) => (
          <div key={req.id} className="request-item-card">
            <div className="item-header">
              <span className="user-info">{req.department} <strong>{req.user_name}</strong></span>
              <span className="date">{req.created_at.split('T')[0]}</span>
            </div>
            <div className="item-content">{req.content}</div>
            <div className="item-actions">
              <button className="like-btn" onClick={() => handleLike(req.id)}>
                ❤️ 공감 <span>{req.likes}</span>
              </button>
              <button className="comment-toggle">
                💬 댓글 <span>{req.comments.length}</span>
              </button>
            </div>
            
            <div className="comment-section">
              {req.comments.map(comment => (
                <div key={comment.id} className="comment-item">
                  <strong>{comment.user_name}</strong>: {comment.content}
                </div>
              ))}
              <div className="comment-input">
                <input type="text" placeholder="의견을 남겨주세요..." onKeyDown={(e) => {
                  if (e.key === 'Enter') alert('댓글 기능 구현 중!');
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AutomationRequest;
