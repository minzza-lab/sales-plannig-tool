@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Register Welli Waterpark Crawler Startup

echo.
echo  ============================================================
echo      윈도우 로그인 시 자동 실행 등록
echo  ============================================================
echo.

set TASK_NAME=WelliWaterparkSalesCrawler
set RUN_FILE=%~dp01_START_ALWAYS_ON.bat

schtasks /create /tn "%TASK_NAME%" /tr "\"%RUN_FILE%\"" /sc onlogon /rl LIMITED /f
if errorlevel 1 (
  echo.
  echo 자동 시작 등록에 실패했습니다. 파일을 관리자 권한으로 다시 실행해보세요.
  pause
  exit /b 1
)

echo.
echo 등록 완료. 다음 윈도우 로그인부터 크롤러가 자동 실행됩니다.
echo 지금 바로 실행하려면 1_START_ALWAYS_ON.bat 을 더블클릭하세요.
echo.
pause
