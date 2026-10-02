@echo off
rem Online Blood Banking System - starts MySQL (XAMPP), the API and the frontend, then opens the browser.
title Online Blood Banking System
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js haijapatikana. Isakinishe kutoka https://nodejs.org kisha jaribu tena.
    pause
    exit /b 1
)

rem 1. MySQL (XAMPP)
netstat -an | find ":3306 " | find "LISTENING" >nul
if errorlevel 1 (
    if exist "C:\xampp\mysql\bin\mysqld.exe" (
        echo Inawasha MySQL...
        start "MySQL" /min "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
        timeout /t 5 /nobreak >nul
    ) else (
        echo MySQL haijapatikana. Washa MySQL kwenye XAMPP Control Panel kisha jaribu tena.
        pause
        exit /b 1
    )
)

rem 2. Install dependencies and prepare the database the first time
if not exist "server\node_modules" (
    pushd server
    call npm install
    if not exist ".env" copy ".env.example" ".env" >nul
    call npm run db:init
    call npm run create-admin
    popd
)
if not exist "node_modules" call npm install
pushd server
call npm run db:migrate >nul
popd

rem 3. API and frontend, each in its own window (close the window to stop it)
start "OBBS API" /D "%~dp0server" cmd /k npm run dev
start "OBBS Frontend" /D "%~dp0." cmd /k npm run dev

echo Inasubiri seva ziwake...
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
echo.
echo Mfumo uko tayari: http://localhost:5173
echo Funga madirisha "OBBS API" na "OBBS Frontend" ili kuuzima.
timeout /t 5 >nul
