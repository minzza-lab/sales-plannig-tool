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
  likes: number;
  comments?: Comment[];
}

const ManualTips: React.FC = () => {
  const [tips, setTips] = useState<Tip[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('답변 학습');
  const [author, setAuthor] = useState('');
  const [activeTab, setActiveTab] = useState('전체');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const categories = ['답변 학습', '시설 안내', '운영 시간', '기타 정보'];

  useEffect(() => {
    fetchTips();
    const setupUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.full_name) {
        setAuthor(user.user_metadata.full_name);
      }
    };
    setupUser();
  }, []);

  const fetchTips = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tips:', error);
    } else {
      setTips(data || []);
    }
    setIsLoading(false);
  };

  const handleLike = async (id: string, currentLikes: number) => {
    const { error } = await supabase
      .from('knowledge_base')
      .update({ likes: (currentLikes || 0) + 1 })
      .eq('id', id);

    if (error) {
      console.error('Error updating like:', error);
    } else {
      setTips(tips.map(tip => 
        tip.id === id ? { ...tip, likes: (currentLikes || 0) + 1 } : tip
      ));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 정보를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
    if (error) alert('삭제에 실패했습니다.');
    else setTips(tips.filter(tip => tip.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    setIsLoading(true);
    const { error } = await supabase
      .from('knowledge_base')
      .insert([{ 
        title, 
        content, 
        category, 
        author: author || '익명',
        likes: 0
      }]);

    if (error) {
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } else {
      setMessage({ type: 'success', text: '지식 자산화 완료!' });
      setTitle('');
      setContent('');
      fetchTips();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
    setIsLoading(false);
  };

  const filteredTips = activeTab === '전체' 
    ? tips 
    : tips.filter(tip => tip.category === activeTab);

  return (
    <div className="tips-container">
      <div className="tips-header">
        <h1 className="title">📚 영업 지식 커뮤니티</h1>
        <p className="subtitle">현장의 노하우를 공유하고 팀원들과 소통해 보세요</p>
      </div>

      <div className="tips-grid">
        <div className="tip-form-card">
          <h3>📘 지식 공유하기</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>제목</label>
              <input type="text" placeholder="공유할 지식의 핵심 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>상세 노하우</label>
              <textarea placeholder="다른 팀원들에게 도움이 될 내용을 적어주세요..." value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <button type="submit" className="submit-tip-btn" disabled={isLoading}>
              {isLoading ? '등록 중...' : '지식 자산화하기'}
            </button>
          </form>
          {message.text && <div className={`message-banner ${message.type}`}>{message.text}</div>}
        </div>

        <div className="tip-list-section">
          <div className="list-header-complex">
            <h3>🤝 실시간 지식 공유</h3>
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
                    <span className="author">By {tip.author}</span>
                  </div>
                  <button className="delete-tip-btn" onClick={() => handleDelete(tip.id)}>🗑️</button>
                </div>
                <h4>{tip.title}</h4>
                <p>{tip.content}</p>
                
                <div className="tip-social-actions">
                  <button className="tip-like-btn" onClick={() => handleLike(tip.id, tip.likes)}>
                    ❤️ 도움돼요 <span>{tip.likes || 0}</span>
                  </button>
                  <button className="tip-comment-btn" onClick={() => alert('댓글 기능은 다음 업데이트 예정입니다!')}>
                    💬 의견 <span>{tip.comments?.length || 0}</span>
                  </button>
                </div>

                <div className="tip-date">{new Date(tip.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualTips;
