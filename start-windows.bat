@echo off
title 소화계 협동 대작전 - 서버
cd /d "%~dp0"

if exist "%~dp0node.exe" goto LOCALNODE

where node >nul 2>nul
if not errorlevel 1 goto RUN

echo.
echo   [알림] 이 컴퓨터에 Node.js 가 설치되어 있지 않습니다.
echo.
echo   방법 1. nodejs.org 에서 LTS 버전을 내려받아 설치하세요.
echo.
echo   방법 2. 설치가 막힌 학교 노트북이라면
echo           nodejs.org 에서 Windows Binary zip 파일을 받아
echo           그 안의 node.exe 파일 하나만 이 폴더에 복사해 넣으세요.
echo           그러면 설치 없이 그대로 실행됩니다.
echo.
pause
exit /b

:LOCALNODE
echo 폴더 안의 node.exe 로 실행합니다.
echo.
"%~dp0node.exe" server.js
pause
exit /b

:RUN
node server.js
pause
