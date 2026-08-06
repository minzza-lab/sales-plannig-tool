@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Welli Waterpark Sales Crawler - Run Once
color 0A

echo.
echo  ============================================================
echo      최근 10일 워터파크 매출 1회 수집
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org/ LTS 설치 후 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist "node_modules" call npm install --omit=dev
node waterpark-auto-crawler.cjs once --days 10
echo.
pause
