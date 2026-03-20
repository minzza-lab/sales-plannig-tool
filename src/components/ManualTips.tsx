import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './ManualTips.css';

interface Comment {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface Tip {
  id: string;
  created_at: string;
  title: string;
  content: string;
  category: string;
  author: string;
  author_dept?: string;
  likes: number;
  comments?: Comment[];
}

const ManualTips: React.FC = () => {
  const [tips, setTips] = useState<Tip[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('답변 학습');
  const [activeTab, setActiveTab] = useState('전체');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentUser, setCurrentUser] = useState<any>(null);

  const categories = ['답변 학습', '시설 안내', '운영 시간', '기타 정보'];

  useEffect(() => {
    fetchTips();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const fetchTips = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setTips(data || []);
    setIsLoading(false);
  };

  const handleLike = async (id: string, currentLikes: number) => {
    await supabase.from('knowledge_base').update({ likes: (currentLikes || 0) + 1 }).eq('id', id);
    setTips(tips.map(tip => tip.id === id ? { ...tip, likes: (currentLikes || 0) + 1 } : tip));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 정보를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
    if (!error) setTips(tips.filter(tip => tip.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsLoading(true);
    const { error } = await supabase
      .from('knowledge_base')
      .insert([{ 
        title: title.trim(), 
        content: content.trim(), 
        category, 
        author: currentUser?.user_metadata?.full_name || '사용자',
        author_dept: currentUser?.user_metadata?.department || '영업팀',
        likes: 0
      }]);

    if (!error) {
      setMessage({ type: 'success', text: '지식 자산화 완료!' });
      setTitle(''); setContent('');
      fetchTips();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
    setIsLoading(false);
  };

  const filteredTips = activeTab === '전체' 
    ? tips 
    : tips.filter(tip => tip.category === activeTab);

  return (
    <div className="tips-container animate-fade-in">
      <div className="tips-header">
        <h1 className="title">📚 영업 지식 커뮤니티</h1>
        <p className="subtitle">우리 팀의 소중한 노하우가 쌓이는 공간입니다</p>
      </div>

      <div className="tips-grid">
        <div className="tip-form-card">
          <h3>📘 새로운 지식 등록</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>제목</label>
              <input 
                type="text" 
                placeholder="정보를 한눈에 알 수 있는 제목" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required
              />
            </div>
            <div className="form-group">
              <label>상세 내용</label>
              <textarea 
                placeholder="팀원들에게 공유할 상세 노하우를 적어주세요..." 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                required
              />
            </div>
            <button type="submit" className="submit-tip-btn" disabled={isLoading}>
              {isLoading ? '등록 중...' : '지식 저장하기'}
            </button>
          </form>
          {message.text && <div className={`message-banner ${message.type}`}>{message.text}</div>}
        </div>

        <div className="tip-list-section">
          <div className="list-header-complex">
            <div className="category-tabs">
              <button className={activeTab === '전체' ? 'active' : ''} onClick={() => setActiveTab('전체')}>전체</button>
              {categories.map(cat => (
                <button key={cat} className={activeTab === cat ? 'active' : ''} onClick={() => setActiveTab(cat)}>{cat}</button>
              ))}
            </div>
          </div>
          
          <div className="tips-list-scroll">
            {filteredTips.map((tip) => (
              <div key={tip.id} className="tip-item-card animate-slide-up">
                <div className="tip-item-header">
                  <div className="header-left">
                    <span className={`tag ${tip.category.replace(' ', '')}`}>{tip.category}</span>
                    <span className="author-info">
                      <strong>{tip.author}</strong>
                      {tip.author_dept && <span className="author-dept">({tip.author_dept})</span>}
                    </span>
                  </div>
                  <button className="delete-tip-btn" onClick={() => handleDelete(tip.id)}>🗑️</button>
                </div>
                <h4>{tip.title}</h4>
                <p>{tip.content}</p>
                
                <div className="tip-social-actions">
                  <button className="tip-like-btn" onClick={() => handleLike(tip.id, tip.likes)}>
                    ❤️ 도움돼요 <span>{tip.likes || 0}</span>
                  </button>
                  <div className="tip-date">{new Date(tip.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualTips;
