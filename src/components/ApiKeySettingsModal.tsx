import React, { useState, useEffect } from 'react';
import { apiKeyManager } from '../utils/apiKeyManager';
import './ApiKeySettingsModal.css';

interface ApiKeySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeySettingsModal: React.FC<ApiKeySettingsModalProps> = ({ isOpen, onClose }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [ttsKey, setTtsKey] = useState('');
  const [showGemini, setShowGemini] = useState(false);
  const [showTts, setShowTts] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGeminiKey(apiKeyManager.getGeminiKey());
      setTtsKey(apiKeyManager.getTTSKey());
      setStatusMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      apiKeyManager.setGeminiKey(geminiKey);
      apiKeyManager.setTTSKey(ttsKey);
      
      setIsSuccess(true);
      setStatusMessage('API 키가 로컬 저장소에 안전하게 저장되었습니다.');
      
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setIsSuccess(false);
      setStatusMessage('저장 중 오류가 발생했습니다.');
    }
  };

  const handleClear = () => {
    if (window.confirm('저장된 모든 API 키를 삭제하시겠습니까?')) {
      apiKeyManager.removeGeminiKey();
      apiKeyManager.removeTTSKey();
      setGeminiKey('');
      setTtsKey('');
      setIsSuccess(true);
      setStatusMessage('API 키가 로컬 저장소에서 완전히 삭제되었습니다.');
    }
  };

  return (
    <div className="api-modal-overlay" onClick={onClose}>
      <div className="api-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="api-modal-header">
          <div className="api-modal-title-wrapper">
            <span className="api-modal-icon">🔑</span>
            <h3>API 자격 증명 설정</h3>
          </div>
          <button className="api-modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSave} className="api-modal-body">
          <p className="api-modal-description">
            보안 유출 방지를 위해 API 키는 브라우저 내부의 <strong>로컬 저장소(localStorage)</strong>에만 암호화/저장되며, 외부 서버나 깃허브 빌드 파일에 포함되지 않습니다.
          </p>

          <div className="api-input-group">
            <label htmlFor="gemini-key">Gemini API Key</label>
            <div className="api-input-wrapper">
              <input
                id="gemini-key"
                type={showGemini ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AQ.Ab8..."
                className="api-input-field"
              />
              <button
                type="button"
                className="api-toggle-visibility"
                onClick={() => setShowGemini(!showGemini)}
              >
                {showGemini ? '숨기기' : '보기'}
              </button>
            </div>
            <span className="api-input-hint">Google AI Studio에서 발급받은 Gemini 모델용 API 키를 입력하세요.</span>
          </div>

          <div className="api-input-group">
            <label htmlFor="tts-key">Google TTS API Key</label>
            <div className="api-input-wrapper">
              <input
                id="tts-key"
                type={showTts ? 'text' : 'password'}
                value={ttsKey}
                onChange={(e) => setTtsKey(e.target.value)}
                placeholder="AIzaSy..."
                className="api-input-field"
              />
              <button
                type="button"
                className="api-toggle-visibility"
                onClick={() => setShowTts(!showTts)}
              >
                {showTts ? '숨기기' : '보기'}
              </button>
            </div>
            <span className="api-input-hint">Google Cloud Platform에서 발급받은 Text-to-Speech API 키를 입력하세요.</span>
          </div>

          {statusMessage && (
            <div className={`api-status-banner ${isSuccess ? 'success' : 'error'}`}>
              {statusMessage}
            </div>
          )}

          <div className="api-modal-actions">
            <button type="button" className="api-btn-clear" onClick={handleClear}>
              키 전체 삭제
            </button>
            <div className="api-btn-right-group">
              <button type="button" className="api-btn-cancel" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="api-btn-save">
                저장하기
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
