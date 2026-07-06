@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WelliHilli Unified Crawler - Status
node welli-unified-crawler.cjs status
pause
