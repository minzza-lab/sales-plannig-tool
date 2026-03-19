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
  const [category, setCategory] = useState('답변 학습');
  const [author, setAuthor] = useState('');
  const [activeTab, setActiveTab] = useState('전체');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const categories = ['답변 학습', '시설 안내', '운영 시간', '기타 정보'];

  // 팁 목록 가져오기
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

  useEffect(() => {
    fetchTips();
  }, []);

  // 지식 삭제하기
  const handleDelete = async (id: string) => {
    if (!window.confirm('이 정보를 삭제하시겠습니까?')) return;

    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', id);

    if (error) {
      alert('삭제에 실패했습니다.');
    } else {
      setTips(tips.filter(tip => tip.id !== id));
    }
  };

  // 새로운 지식 등록하기
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
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } else {
      setMessage({ type: 'success', text: '성공적으로 등록되었습니다!' });
      setTitle('');
      setContent('');
      setAuthor('');
      fetchTips();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
    setIsLoading(false);
  };

  // 필터링된 목록
  const filteredTips = activeTab === '전체' 
    ? tips 
    : tips.filter(tip => tip.category === activeTab);

  return (
    <div className="tips-container">
      <div className="tips-header">
        <h1 className="title">웰리 지식 백과</h1>
        <p className="subtitle">정확한 정보 공유가 팀의 경쟁력입니다</p>
      </div>

      <div className="quick-guide-card animate-fade-in">
        <div className="guide-icon">💡</div>
        <div className="guide-content">
          <h4>지식 백과 관리 가이드</h4>
          <ul>
            <li><strong>답변 학습:</strong> AI가 고객 응대 시 참고할 모범 문구와 노하우를 등록합니다.</li>
            <li><strong>시설/운영:</strong> 최신화된 객실 정보와 영업 시간을 공유하여 정확한 안내를 돕습니다.</li>
            <li><strong>유지 관리:</strong> 잘못된 정보는 우측 상단의 삭제 버튼을 눌러 관리할 수 있습니다.</li>
          </ul>
        </div>
      </div>

      <div className="tips-grid">
        {/* 입력 폼 */}
        <div className="tip-form-card">
          <h3>📘 지식 등록</h3>
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
              />
            </div>
            <div className="form-group">
              <label>상세 내용</label>
              <textarea 
                placeholder="구체적인 내용을 입력하세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>등록자</label>
              <input 
                type="text" 
                placeholder="이름/직함" 
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
            <button type="submit" className="submit-tip-btn" disabled={isLoading}>
              {isLoading ? '등록 중...' : '지식 자산화하기'}
            </button>
          </form>
          {message.text && <div className={`message-banner ${message.type}`}>{message.text}</div>}
        </div>

        {/* 공유 목록 및 필터 */}
        <div className="tip-list-section">
          <div className="list-header-complex">
            <h3>🤝 실시간 지식 공유</h3>
            <div className="category-tabs">
              <button className={activeTab === '전체' ? 'active' : ''} onClick={() => setActiveTab('전체')}>전체</button>
              {categories.map(cat => (
                <button 
                  key={cat} 
                  className={activeTab === cat ? 'active' : ''} 
                  onClick={() => setActiveTab(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          <div className="tips-list-scroll">
            {filteredTips.length === 0 ? (
              <div className="empty-state">선택한 카테고리에 정보가 없습니다.</div>
            ) : (
              filteredTips.map((tip) => (
                <div key={tip.id} className="tip-item-card animate-slide-up">
                  <div className="tip-item-header">
                    <div className="header-left">
                      <span className={`tag ${tip.category.replace(' ', '')}`}>{tip.category}</span>
                      <span className="author">By {tip.author}</span>
                    </div>
                    <button className="delete-tip-btn" onClick={() => handleDelete(tip.id)} title="삭제">
                      🗑️
                    </button>
                  </div>
                  <h4>{tip.title}</h4>
                  <p>{tip.content}</p>
                  <div className="tip-date">{new Date(tip.created_at).toLocaleDateString()}</div>
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
