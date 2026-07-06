@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Welli Waterpark Sales Crawler - Always On
color 0B

echo.
echo  ============================================================
echo      WELLiHILLI WATERPARK SALES AUTO CRAWLER
echo      워터파크 매출 자동 수집기 - 상시 실행
echo  ============================================================
echo.
echo  이 창을 닫지 않으면 15분마다 최근 10일 매출을 자동 확인합니다.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [필수 설치 필요] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org/ 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [초기 준비] 필요한 실행 파일을 설치합니다. 처음 한 번만 진행됩니다.
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo 설치 실패. 인터넷 연결 또는 Node.js 설치 상태를 확인해주세요.
    pause
    exit /b 1
  )
)

node waterpark-auto-crawler.cjs watch --days 10 --interval 15
echo.
echo 크롤러가 종료되었습니다.
pause
