WELLiHILLI UNIFIED AUTO CRAWLER
VOC / 시즌권 / 패키지 / 워터파크 매출 자동 수집기 - 윈도우 실행팩

수집 대상
1. VOC
   - 관리자 VOC 게시판 최근 목록
   - Supabase voc_inquiries 저장
   - 마지막 동기화 시각은 knowledge_base 의 [SYSTEM] LAST_SYNC 로 저장

2. 시즌권 주문
   - 관리자 시즌권 주문관리
   - 최근 90일 엑셀 다운로드 후 파싱
   - 2026-04-15 이후, 취소/환불/0원/MTB/1차판매 제외
   - Supabase season_pass_orders 저장

3. 패키지 주문
   - 관리자 패키지 주문관리
   - 상시 실행은 최근 일주일, 수동 실행은 90일 기준
   - 결제완료/예약완료 주문만 Supabase package_orders 저장

4. 워터파크 일일 실시간 매출
   - WAPI 포털 API 기반
   - 최근 10일 또는 2025-01-01부터 과거 복구
   - Supabase daily_reports 의 REALTIME_SALES 저장


처음 실행
1. 이 폴더를 윈도우 컴퓨터에 그대로 복사합니다.
2. zip 파일 안에서 바로 실행하지 말고 반드시 압축을 먼저 풉니다.
3. Node.js LTS가 설치되어 있어야 합니다.
   - https://nodejs.org/ 에서 LTS 버전을 설치하면 됩니다.
4. .env.example 파일을 복사해서 .env 파일을 만들고 Supabase 연결 정보를 입력합니다.
5. START_HERE.cmd 를 더블클릭하세요.
   - 필요한 실행 파일이 없으면 자동으로 npm install 을 실행합니다.
   - Puppeteer 브라우저도 설치되므로 처음에는 몇 분 걸릴 수 있습니다.


상시 운영
- START_HERE.cmd 또는 1_START_ALWAYS_ON.bat 창을 계속 켜두면 됩니다.
- 기본값: 15분마다 최근 10일 워터파크 매출 + 관리자 데이터(VOC/시즌권/패키지)를 다시 확인합니다.
- 중복 저장이 아니라 같은 주문번호/날짜는 Supabase에서 업데이트됩니다.
- 웹 대시보드의 "최신 매출 동기화", "최신 시즌권 동기화" 요청을 4초마다 확인해 즉시 실행합니다.
- 어느 컴퓨터에서 버튼을 눌러도 이 전용 PC의 상시 실행 창이 켜져 있으면 처리됩니다.


버튼별 기능
- START_HERE.cmd
  가장 권장하는 실행 파일입니다. Node/npm 확인, 의존성 설치, 상시 실행까지 처리합니다.

- 1_START_ALWAYS_ON.bat
  상시 자동 수집을 바로 시작합니다.

- 2_RUN_ONCE_RECENT_10_DAYS.bat
  최근 10일 워터파크 매출과 관리자 데이터 수집을 한 번 실행합니다.

- 3_BACKFILL_WATERPARK_FROM_2025.bat
  워터파크 일일매출만 2025-01-01부터 오늘까지 복구 수집합니다.
  관리자 페이지 데이터(VOC/시즌권/패키지)는 관리자 화면의 기간 버튼 제약이 있어 once/watch 모드에서 최신 범위로 수집합니다.

- 4_CHECK_STATUS.bat
  Supabase 저장 상태를 확인합니다.

- 5_REGISTER_WINDOWS_STARTUP.bat
  윈도우 로그인 시 자동 실행되도록 등록합니다.

- 6_REMOVE_WINDOWS_STARTUP.bat
  자동 실행 등록을 해제합니다.


환경설정
- .env.example 파일을 복사해 .env 파일을 만든 뒤 Supabase 연결 정보를 넣어주세요.
- GitHub 업로드용 압축파일에는 보안상 실제 .env 파일을 포함하지 않습니다.
- 관리자 로그인 정보는 기존 크롤러에서 쓰던 기본값으로 실행됩니다.
- 변경이 필요하면 .env 파일에 WELLI_ADMIN_ID, WELLI_ADMIN_PASSWORD 값을 추가하세요.


로그
- logs 폴더 안에 날짜별 로그가 저장됩니다.
- 문제가 생기면 가장 최근 log 파일을 확인하면 됩니다.


권장 운영 방식
1. START_HERE.cmd 를 먼저 실행해서 정상 수집되는지 확인합니다.
2. 정상 확인 후 5_REGISTER_WINDOWS_STARTUP.bat 으로 자동 실행을 등록합니다.
3. 전용 PC에서는 크롤러 창을 닫지 않고 유지합니다.
