import React from 'react';
import './ApiKeySettingsModal.css';

interface ApiKeySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeySettingsModal: React.FC<ApiKeySettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
        
        <div className="api-modal-body">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}>
              ✅
            </div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#e2e8f0' }}>
              API 키는 서버에서 안전하게 관리됩니다
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', maxWidth: '360px' }}>
              Gemini API 키와 TTS API 키는 서버 측 환경변수로 안전하게 관리되며,
              클라이언트(브라우저)에 노출되지 않습니다.
              <br /><br />
              별도의 API 키 설정 없이 모든 AI 기능을 바로 사용하실 수 있습니다.
            </p>
          </div>

          <div className="api-modal-actions">
            <div className="api-btn-right-group" style={{ width: '100%', justifyContent: 'center' }}>
              <button type="button" className="api-btn-save" onClick={onClose}>
                확인
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
