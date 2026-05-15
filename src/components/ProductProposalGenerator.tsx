import React from 'react';

const ProductProposalGenerator: React.FC = () => {
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '600px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
      <h1 style={{ fontSize: '28px', color: '#1e293b', marginBottom: '16px', fontWeight: 'bold' }}>🎁 상품안 자동 생성기</h1>
      <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
        <h2 style={{ fontSize: '20px', color: '#334155', marginBottom: '12px' }}>현재 제작 중인 기능입니다! (Step 1 진행 예정)</h2>
        <p style={{ color: '#64748b', lineHeight: '1.6' }}>
          앞으로 이곳에서 <b>판매 채널, 상품 유형, 객실, 식음, 액티비티</b> 등의 항목을<br />
          드롭다운으로 선택하여 레고 블록처럼 손쉽게 <b>상품안(Product Proposal)</b>을 자동 생성하는 도구가 개발될 예정입니다.
        </p>
      </div>
    </div>
  );
};

export default ProductProposalGenerator;
