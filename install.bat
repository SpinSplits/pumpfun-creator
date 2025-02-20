@echo off
echo 🚀 Meme Coin Rug Tool Installer
echo ===============================

:: Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Git is not installed. Please download Git from https://git-scm.com/download/win
    echo After installing Git, please run this installer again.
    pause
    exit /b 1
)

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Starting installation...
    echo Downloading Node.js installer...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v16.20.2/node-v16.20.2-x64.msi' -OutFile 'node_installer.msi'"
    if %errorlevel% neq 0 (
        echo Failed to download Node.js installer. Please check your internet connection.
        pause
        exit /b 1
    )
    echo Installing Node.js...
    start /wait msiexec /i node_installer.msi /qn
    if %errorlevel% neq 0 (
        echo Failed to install Node.js. Please try installing it manually from https://nodejs.org
        pause
        exit /b 1
    )
    del node_installer.msi
)

:: Verify Node.js installation
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js installation failed. Please install it manually from https://nodejs.org
    pause
    exit /b 1
)

:: Install Dependencies
echo Installing Dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Failed to install dependencies. Please try running 'npm install' manually.
    pause
    exit /b 1
)

call npm install -D typescript ts-node @types/node
if %errorlevel% neq 0 (
    echo Failed to install dev dependencies. Please try running 'npm install -D typescript ts-node @types/node' manually.
    pause
    exit /b 1
)

:: Create .env file if it doesn't exist
if not exist .env (
    echo Creating configuration file...
    (
        echo # Configuration
        echo RPC_ENDPOINT=https://api.mainnet-beta.solana.com
        echo PRIVATE_KEY=
        echo LOG_LEVEL=info
    ) > .env
    echo Configuration file .env has been created
) else (
    echo Configuration file .env already exists
)

echo.
echo Installation completed successfully! 
echo.
echo Next steps:
echo 1. Open the .env file and add your private key
echo 2. Start the tool with: npm start
echo.
echo Need help? Join our Discord: https://discord.gg/JXgk42xhaH
echo.
pause
