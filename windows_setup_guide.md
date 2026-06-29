# 웰리힐리파크 매출 대시보드 및 자동 크롤러 윈도우(Windows) 설치 및 구동 가이드

본 가이드는 윈도우 환경에서 깃허브 저장소를 내려받아 웹 대시보드 개발 환경을 구동하고, 백그라운드에서 크롤러들을 자동으로 주기적 실행하여 Supabase DB를 최신 상태로 유지하는 전체 세팅을 안내합니다.

---

## 1. 필수 프로그램 설치

윈도우 컴퓨터에 아래 두 가지 필수 유틸리티가 설치되어 있어야 합니다.

1. **Node.js 설치 (자바스크립트 실행 환경):**
   - [Node.js 공식 홈페이지(https://nodejs.org)](https://nodejs.org)에 접속하여 **"LTS" 버전**을 다운로드하고 기본 설정 그대로 설치합니다.
2. **Git 설치 (소스코드 동기화):**
   - [Git 공식 홈페이지(https://git-scm.com)](https://git-scm.com)에 접속하여 윈도우용 Git을 설치합니다.

---

## 2. 윈도우로 소스코드 내려받기 및 환경변수 설정

1. 윈도우에서 명령 프롬프트(CMD) 또는 Git Bash를 열고 프로젝트를 복사할 폴더로 이동한 뒤, 아래 명령어로 소스코드를 내려받습니다.
   ```bash
   git clone https://github.com/minzza-lab/sales-plannig-tool.git
   cd sales-plannig-tool
   ```
2. 다운로드받은 `sales-plannig-tool` 폴더 내부에 `.env` 파일을 새로 생성하고 아래 환경 변수 값들을 알맞게 세팅합니다.
   ```env
   # Supabase 연동 정보
   VITE_SUPABASE_URL=https://viboxqkurxzmqykoajhj.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_CtT1KpWuvMMWwUsJogC4aw_FLvNujg0

   # 웰리힐리파크 관리자 시스템(WADM) 계정 정보 (크롤러용)
   WADM_ID=your_id
   WADM_PW=your_password
   ```
3. CMD 창에서 아래 패키지 설치 명령을 실행합니다.
   ```bash
   npm install
   ```

---

## 3. 웹 대시보드 개발 서버 실행 방법 (윈도우)

윈도우에서 대시보드 웹페이지 코드를 이어서 수정하거나 로컬에서 테스트 구동하려면 아래 명령을 사용합니다.
```bash
npm run dev
```
실행 후 터미널에 나타나는 주소 `http://localhost:5173` 으로 접속하면 대시보드 화면을 띄워 로컬에서 작업할 수 있습니다.

---

## 4. 크롤러 종류 및 수동 실행 방법

현재 프로젝트에는 총 3가지 성격의 크롤러가 탑재되어 있습니다. 배치 파일(`.bat`)을 더블클릭하면 윈도우에서 바로 수동 실행이 가능합니다.

1. **통합 매출 수집 크롤러 (`unified_crawler.cjs`):**
   - 발권, 식음, 워터파크 등의 전체 매출 데이터를 수집하여 Supabase DB에 밀어 넣습니다.
   - 실행: **`run_unified_crawler_manual.bat`** 더블클릭
2. **시즌권 매출 수집 크롤러 (`season_pass_crawler.cjs`):**
   - 웰리힐리파크 시즌권 판매 실적을 실시간으로 긁어옵니다.
   - 실행: **`run_season_pass_manual.bat`** 더블클릭
3. **고객의 소리(VOC) 수집 크롤러 (`voc_crawler.cjs`):**
   - VOC 피드백 내역을 크롤링해 옵니다.
   - 실행: **`run_crawler.bat`** 더블클릭

---

## 5. 24시간 백그라운드 자동 실행 설정 (CMD 검은창 숨김)

매번 손으로 켜지 않고 윈도우 컴퓨터가 켜져 있는 동안 **배경에서 창 없이 조용히 실행**되도록 세팅합니다. (상대경로 패치가 적용되어 별도의 파일 수정이 필요 없습니다.)

### 방법 A. PM2를 사용한 무중단 백그라운드 실행 (권장)
CMD창을 완전히 끄고 백그라운드 백신 프로그램처럼 상주시키는 기술입니다.

1. CMD 창에 아래 명령을 입력하여 PM2를 글로벌 설치합니다.
   ```bash
   npm install -g pm2
   npm install -g pm2-windows-startup
   ```
2. 크롤러를 PM2 백그라운드 데몬 서비스로 등록하여 구동시킵니다.
   ```bash
   # 시즌권 자동 크롤러 구동 (15분 타이머가 내장되어 24시간 백그라운드 상주)
   pm2 start season_pass_crawler.cjs --name "Welli_Season_Crawler"
   pm2 save
   ```
3. **상태 모니터링 명령어:**
   - 실행 중인 서비스 보기: `pm2 status`
   - 크롤링 동작 실시간 로그 확인: `pm2 logs Welli_Season_Crawler`

---

### 방법 B. 윈도우 작업 스케줄러 + VBS 실행 방식 (CMD 창 숨김)
컴퓨터 사양 문제로 PM2 구동이 무거울 때, 윈도우 기본 탑재 스케줄러를 사용하는 가벼운 방법입니다.

1. **윈도우 시작 키**를 누르고 `작업 스케줄러`를 검색하여 실행합니다.
2. 우측 메뉴에서 `기본 작업 만들기`를 클릭합니다.
   - **이름:** `웰리힐리 VOC 크롤러`
   - **트리거:** `매일` (또는 원하시는 주기)
   - **동작:** `프로그램 시작`
3. 프로그램/스크립트 입력창에 **`찾아보기`**를 눌러 프로젝트 폴더 안에 들어있는 **`run_crawler_silent.vbs`** 파일을 선택해 줍니다.
4. **시작 위치(옵션)** 칸에 프로젝트 폴더의 절대 경로(예: `C:\sales-plannig-tool`)를 따옴표 없이 입력합니다. (필수!)
5. 마침을 누르면 지정한 스케줄 주기마다 **CMD 검은색 창이 전혀 나타나지 않고(Headless)** 크롤러가 조용히 배경에서 돌아가 Supabase DB를 갱신합니다. (시즌권 크롤러의 경우 `run_season_pass_silent.vbs`를 등록하시면 됩니다.)

---

## 💡 윈도우 작업 완료 후 깃(Git) 업로드 가이드
윈도우 환경에서 소스코드를 수정했거나 새로운 데이터를 추가했다면, 다시 아래 명령어로 깃허브에 밀어 넣어 맥북이나 실제 서비스 배포에 바로 반영하세요.
```bash
git add .
git commit -m "윈도우에서 작업 내역 추가 업데이트"
git push origin main
```
