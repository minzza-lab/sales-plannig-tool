@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WelliHilli Unified Crawler - Run Once
node welli-unified-crawler.cjs once --days 10
pause
