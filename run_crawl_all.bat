@echo off
echo 초기 데이터 수집(최대 10페이지) 크롤러를 실행합니다...
cd /d "%~dp0"
node crawl_all_voc.cjs
pause
