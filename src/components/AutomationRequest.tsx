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
  comments?: Comment[];
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

    // 실시간 업데이트 구독 (선택 사항)
    const subscription = supabase
      .channel('automation_requests_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_requests' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('automation_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching requests:', error);
    } else {
      setRequests(data || []);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim()) return;
    
    setIsLoading(true);
    const { error } = await supabase
      .from('automation_requests')
      .insert([{
        user_name: currentUser?.user_metadata?.full_name || '익명',
        department: currentUser?.user_metadata?.department || '영업부',
        content: newRequest,
        likes: 0
      }]);
    
    if (error) {
      alert(`등록 실패: ${error.message}`);
    } else {
      setNewRequest('');
      fetchRequests(); // 목록 새로고침
    }
    setIsLoading(false);
  };

  const handleLike = async (id: string, currentLikes: number) => {
    const { error } = await supabase
      .from('automation_requests')
      .update({ likes: currentLikes + 1 })
      .eq('id', id);

    if (error) {
      console.error('Error updating like:', error);
    } else {
      // 로컬 상태 즉시 업데이트
      setRequests(requests.map(req => 
        req.id === id ? { ...req, likes: currentLikes + 1 } : req
      ));
    }
  };

  return (
    <div className="automation-request-container animate-fade-in">
      <div className="tool-header">
        <h1>⚡ 자동화 요청 게시판</h1>
        <p>현장의 불편함이나 반복되는 업무를 알려주시면 AI 도구로 만들어 드립니다.</p>
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
        {requests.length === 0 ? (
          <div className="empty-list">
            <p>아직 등록된 요청이 없습니다. 첫 번째 아이디어를 남겨보세요!</p>
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="request-item-card">
              <div className="item-header">
                <span className="user-info">{req.department} <strong>{req.user_name}</strong></span>
                <span className="date">{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div className="item-content">{req.content}</div>
              <div className="item-actions">
                <button className="like-btn" onClick={() => handleLike(req.id, req.likes || 0)}>
                  ❤️ 공감 <span>{req.likes || 0}</span>
                </button>
                <button className="comment-toggle" onClick={() => alert('댓글 기능은 다음 업데이트 예정입니다!')}>
                  💬 댓글 <span>{req.comments?.length || 0}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AutomationRequest;
