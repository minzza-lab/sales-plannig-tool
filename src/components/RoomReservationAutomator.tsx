import React, { useState } from 'react';
import './RoomReservationAutomator.css';

interface ReservationData {
  id: string;
  senderName: string;
  senderEmail: string;
  guestName: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  status: 'pending' | 'success' | 'error';
  rawBody: string;
}

const RoomReservationAutomator: React.FC = () => {
  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleFetchEmails = async () => {
    setIsLoading(true);
    // TODO: 백엔드(Naver IMAP 연동) 호출 로직 구현 예정
    setTimeout(() => {
      setReservations([
        {
          id: '1',
          senderName: '홍길동',
          senderEmail: 'test1@naver.com',
          guestName: '홍길동',
          phone: '010-1234-5678',
          checkIn: '2026-05-15',
          checkOut: '2026-05-16',
          roomType: '스탠다드 더블',
          status: 'pending',
          rawBody: '예약자: 홍길동, 연락처: 010-1234-5678...'
        }
      ]);
      setIsLoading(false);
    }, 1500);
  };

  const handleGenerateExcel = async () => {
    // TODO: ExcelJS를 활용한 엑셀 템플릿 생성 및 다운로드/발송 로직
    alert('엑셀 생성 및 발송 로직이 구현될 예정입니다.');
  };

  return (
    <div className="reservation-automator">
      <header className="automator-header">
        <div className="header-title">
          <h1>🏨 객실 예약 메일 자동화</h1>
          <p>네이버 메일로 수신된 수동 예약 요청을 파싱하여 엑셀로 변환하고 발송합니다.</p>
        </div>
        <div className="header-actions">
          <button 
            className="action-btn fetch-btn" 
            onClick={handleFetchEmails}
            disabled={isLoading}
          >
            {isLoading ? '수신 중...' : '📥 새 예약 메일 불러오기'}
          </button>
          <button 
            className="action-btn send-btn" 
            onClick={handleGenerateExcel}
            disabled={reservations.length === 0}
          >
            📊 엑셀 변환 및 자동 발송
          </button>
        </div>
      </header>

      <div className="automator-content">
        <div className="card table-card">
          <div className="card-header">
            <h3>파싱된 예약 데이터 목록</h3>
            <span className="badge">{reservations.length}건 대기 중</span>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>예약자명</th>
                  <th>연락처</th>
                  <th>체크인</th>
                  <th>체크아웃</th>
                  <th>객실타입</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length > 0 ? (
                  reservations.map(res => (
                    <tr key={res.id}>
                      <td>{res.guestName}</td>
                      <td>{res.phone}</td>
                      <td>{res.checkIn}</td>
                      <td>{res.checkOut}</td>
                      <td>{res.roomType}</td>
                      <td>
                        <span className={`status-badge ${res.status}`}>
                          {res.status === 'pending' ? '대기 중' : '완료'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      수신된 예약 메일이 없습니다. '새 예약 메일 불러오기' 버튼을 클릭하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomReservationAutomator;
