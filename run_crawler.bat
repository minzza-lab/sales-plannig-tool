@echo off
echo 크롤러를 실행합니다...
cd /d "%~dp0"
node voc_crawler.cjs
pause
