@echo off
chcp 65001 >nul
title 웰리힐리 통합 크롤러 (수동 실행)
echo ========================================================
echo 🚀 웰리힐리 파크 통합 데이터 수집 수동 파이프라인
echo ========================================================
echo.
cd /d "%~dp0"
node unified_crawler.cjs --manual
echo.
pause
