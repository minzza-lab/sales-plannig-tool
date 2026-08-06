@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title WelliHilli Unified Auto Crawler
color 0B

echo.
echo  ============================================================
echo      WELLiHILLI UNIFIED AUTO CRAWLER
echo      VOC / 시즌권 / 패키지 / 워터파크 매출 자동 수집기
echo  ============================================================
echo.
echo  이 파일 하나만 실행하면 됩니다.
echo.

set "NODE_EXE="
set "NPM_CMD="

for /f "delims=" %%I in ('where node.exe 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)

if not defined NODE_EXE (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
)

if not defined NODE_EXE (
  if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
)

if not defined NODE_EXE (
  echo [설치 필요] Node.js LTS가 설치되어 있지 않거나 윈도우 PATH에 등록되지 않았습니다.
  echo.
  echo 해결 방법:
  echo  1. https://nodejs.org/ko 접속
  echo  2. LTS 버전 설치
  echo  3. 설치 후 이 창을 닫고 START_HERE.cmd 를 다시 실행
  echo.
  start "" "https://nodejs.org/ko"
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
  if not defined NPM_CMD set "NPM_CMD=%%I"
)

if not defined NPM_CMD (
  for %%D in ("%ProgramFiles%\nodejs" "%ProgramFiles(x86)%\nodejs") do (
    if exist "%%~D\npm.cmd" set "NPM_CMD=%%~D\npm.cmd"
  )
)

if not defined NPM_CMD (
  echo [설치 확인 필요] Node.js는 찾았지만 npm.cmd를 찾지 못했습니다.
  echo Node.js LTS를 다시 설치할 때 npm 포함 옵션을 체크해주세요.
  echo.
  echo 감지된 Node 위치: %NODE_EXE%
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [오류] package.json 파일이 없습니다.
  echo 압축을 완전히 푼 뒤, 폴더 안의 START_HERE.cmd 를 실행해주세요.
  echo zip 파일 안에서 바로 실행하면 작동하지 않습니다.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [오류] .env 파일이 없습니다.
  echo 압축을 완전히 푼 뒤 실행해주세요.
  echo.
  pause
  exit /b 1
)

echo 감지된 Node:
echo  %NODE_EXE%
echo.
echo 감지된 npm:
echo  %NPM_CMD%
echo.

if not exist "node_modules" (
  echo [초기 준비] 필요한 실행 파일을 설치합니다.
  echo Puppeteer 브라우저도 함께 내려받기 때문에 인터넷 상태에 따라 몇 분 걸릴 수 있습니다.
  echo.
  call "%NPM_CMD%" install --omit=dev
  if errorlevel 1 (
    echo.
    echo [설치 실패] npm install 중 오류가 발생했습니다.
    echo 인터넷 연결, 회사 보안 프로그램, 방화벽을 확인해주세요.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo [실행 시작] 15분마다 VOC / 시즌권 / 패키지를 자동 수집합니다.
echo 워터파크 매출은 홈페이지 서버가 직접 수집하므로 이 PC에서는 실행하지 않습니다.
echo 이 창을 닫으면 자동 수집이 멈춥니다.
echo.

"%NODE_EXE%" welli-unified-crawler.cjs watch --days 10 --interval 15 --skip-waterpark

echo.
echo 크롤러가 종료되었습니다.
pause
