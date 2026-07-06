@echo off
chcp 65001 >nul
set "TASK_NAME=WelliHilli Unified Auto Crawler"

schtasks /Delete /TN "%TASK_NAME%" /F

echo.
echo [해제 완료] 자동 실행 등록을 해제했습니다.
echo.
pause
