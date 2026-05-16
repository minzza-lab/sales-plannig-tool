@echo off
echo ========================================================
echo ⚡ 시즌권 주문 내역 수동 크롤링 (1회 실행)
echo ========================================================
echo.
cd /d "%~dp0"
node season_pass_crawler.cjs --manual
echo.
pause
