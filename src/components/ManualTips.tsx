import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './ManualTips.css';

interface Tip {
  id: string;
  created_at: string;
  title: string;
  content: string;
  category: string;
  author: string;
}

const ManualTips: React.FC = () => {
  const [tips, setTips] = useState<Tip[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('CS꿀팁');
  const [author, setAuthor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // 팁 목록 가져오기
  const fetchTips = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tips:', error);
      setMessage({ type: 'error', text: '데이터를 가져오는데 실패했습니다.' });
    } else {
      setTips(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTips();
  }, []);

  // 새로운 팁 등록하기
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase
      .from('knowledge_base')
      .insert([
        { title, content, category, author: author || '익명팀원' }
      ]);

    if (error) {
      console.error('Error saving tip:', error);
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } else {
      setMessage({ type: 'success', text: '새로운 팁이 성공적으로 등록되었습니다!' });
      setTitle('');
      setContent('');
      setAuthor('');
      fetchTips(); // 목록 새로고침
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
    setIsLoading(false);
  };

  return (
    <div className="tips-container">
      <div className="tips-header">
        <h1 className="title">공유 지식 베이스 (Knowledge Base)</h1>
        <p className="subtitle">팀원들의 노하우가 모여 AI를 더 똑똑하게 만듭니다</p>
      </div>

      <div className="tips-grid">
        {/* 입력 폼 */}
        <div className="tip-form-card">
          <h3>📘 새로운 지식 등록</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="CS꿀팁">CS 꿀팁 (답변 가이드)</option>
                <option value="영업비결">영업 비결 (세일즈 노하우)</option>
                <option value="시설안내">시설 안내 (객실/부대시설)</option>
                <option value="기타">기타 정보</option>
              </select>
            </div>
            <div className="form-group">
              <label>제목</label>
              <input 
                type="text" 
                placeholder="예: 셔틀버스 위치 문의 시 대응법" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>상세 내용 (AI가 학습할 핵심 내용)</label>
              <textarea 
                placeholder="구체적인 상황과 해결책을 적어주세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>등록자 (선택)</label>
              <input 
                type="text" 
                placeholder="예: 홍길동 과장" 
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
            <button type="submit" className="submit-tip-btn" disabled={isLoading}>
              {isLoading ? '등록 중...' : '우리 팀 지식으로 등록하기'}
            </button>
          </form>
          {message.text && (
            <div className={`message-banner ${message.type}`}>
              {message.text}
            </div>
          )}
        </div>

        {/* 공유 목록 */}
        <div className="tip-list-section">
          <div className="list-header">
            <h3>🤝 실시간 공유 목록 ({tips.length})</h3>
            <button onClick={fetchTips} className="refresh-btn">🔄 새로고침</button>
          </div>
          
          <div className="tips-list-scroll">
            {tips.length === 0 ? (
              <div className="empty-state">아직 등록된 지식이 없습니다. 첫 번째 꿀팁을 공유해 보세요!</div>
            ) : (
              tips.map((tip) => (
                <div key={tip.id} className="tip-item-card animate-slide-up">
                  <div className="tip-item-header">
                    <span className={`tag ${tip.category}`}>{tip.category}</span>
                    <span className="author">By {tip.author}</span>
                  </div>
                  <h4>{tip.title}</h4>
                  <p>{tip.content}</p>
                  <div className="tip-date">{new Date(tip.created_at).toLocaleDateString()} 등록</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualTips;
