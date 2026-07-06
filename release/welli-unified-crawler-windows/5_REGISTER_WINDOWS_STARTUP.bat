@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TASK_NAME=WelliHilli Unified Auto Crawler"
set "TASK_CMD=%~dp01_START_ALWAYS_ON.bat"

schtasks /Create /TN "%TASK_NAME%" /TR "\"%TASK_CMD%\"" /SC ONLOGON /RL LIMITED /F

if errorlevel 1 (
  echo.
  echo [등록 실패] 관리자 권한으로 다시 실행해보세요.
  echo.
  pause
  exit /b 1
)

echo.
echo [등록 완료] 윈도우 로그인 시 통합 크롤러가 자동 실행됩니다.
echo.
pause
