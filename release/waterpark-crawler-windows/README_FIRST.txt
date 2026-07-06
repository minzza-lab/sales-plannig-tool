WELLiHILLI WATERPARK SALES AUTO CRAWLER
워터파크 매출 자동 수집기 - 윈도우 실행팩

1. 처음 실행
   - 이 폴더를 윈도우 컴퓨터에 그대로 복사합니다.
   - Node.js LTS가 설치되어 있어야 합니다.
   - https://nodejs.org/ 에서 LTS 버전을 설치하면 됩니다.
   - 그 다음 1_START_ALWAYS_ON.bat 을 더블클릭하세요.

2. 상시 운영
   - 1_START_ALWAYS_ON.bat 창을 계속 켜두면 15분마다 최근 10일 데이터를 다시 확인합니다.
   - 중복 저장이 아니라 같은 날짜는 Supabase에서 업데이트됩니다.
   - 전원을 끄지 않는 컴퓨터라면 이 창만 켜두면 됩니다.

3. 버튼별 기능
   - 1_START_ALWAYS_ON.bat: 상시 자동 수집
   - 2_RUN_ONCE_RECENT_10_DAYS.bat: 최근 10일만 한 번 수집
   - 3_BACKFILL_FROM_2025.bat: 2025-01-01부터 오늘까지 전체 복구 수집
   - 4_CHECK_STATUS.bat: Supabase 저장 상태 확인
   - 5_REGISTER_WINDOWS_STARTUP.bat: 윈도우 로그인 시 자동 실행 등록
   - 6_REMOVE_WINDOWS_STARTUP.bat: 자동 실행 등록 해제

4. 로그
   - logs 폴더 안에 날짜별 로그가 저장됩니다.
   - 문제가 생기면 가장 최근 log 파일을 확인하면 됩니다.

5. 환경설정
   - .env 파일에 Supabase 연결 정보와 실행 주기가 들어 있습니다.
   - 기본값: 최근 10일, 15분마다 수집

권장 운영 방식:
1_START_ALWAYS_ON.bat 을 먼저 실행해서 정상 수집되는지 확인한 뒤,
문제 없으면 5_REGISTER_WINDOWS_STARTUP.bat 으로 자동 실행을 등록하세요.
