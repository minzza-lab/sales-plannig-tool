@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Welli Waterpark Sales Crawler - Backfill
color 0E

echo.
echo  ============================================================
echo      전체 복구 수집: 2025-01-01부터 오늘까지
echo  ============================================================
echo.
echo  오래 걸릴 수 있습니다. 중간에 끄지 않는 것을 권장합니다.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org/ LTS 설치 후 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist "node_modules" call npm install --omit=dev
node waterpark-auto-crawler.cjs backfill --from 2025-01-01
echo.
pause
