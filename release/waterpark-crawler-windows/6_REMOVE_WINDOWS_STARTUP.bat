@echo off
chcp 65001 >nul
title Remove Welli Waterpark Crawler Startup

echo.
echo  ============================================================
echo      윈도우 자동 실행 등록 해제
echo  ============================================================
echo.

schtasks /delete /tn "WelliWaterparkSalesCrawler" /f
echo.
echo 자동 실행 등록 해제 작업이 끝났습니다.
pause
