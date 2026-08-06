@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WelliHilli Unified Auto Crawler
node welli-unified-crawler.cjs watch --days 10 --interval 15 --skip-waterpark
pause
