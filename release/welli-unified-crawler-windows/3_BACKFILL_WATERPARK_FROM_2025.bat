@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WelliHilli Unified Crawler - Waterpark Backfill
node welli-unified-crawler.cjs backfill --from 2025-01-01
pause
