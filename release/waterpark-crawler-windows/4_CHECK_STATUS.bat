@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Welli Waterpark Sales Crawler - Status
color 0F

echo.
echo  ============================================================
echo      Supabase 저장 상태 확인
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org/ LTS 설치 후 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist "node_modules" call npm install --omit=dev
node waterpark-auto-crawler.cjs status
echo.
pause
