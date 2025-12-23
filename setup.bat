@echo off
SETLOCAL EnableDelayedExpansion

echo ====================================
echo   Trackable NZ - Automatic Setup
echo ====================================
echo.

:: Check if Node.js is installed
echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    echo After installation, restart your computer and run this script again.
    pause
    exit /b 1
)
echo ✓ Node.js is installed
echo.

:: Check if npm is available
echo [2/5] Checking npm installation...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not available!
    echo Please reinstall Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ npm is installed
echo.

:: Install Mobile App Dependencies
echo [3/5] Installing Mobile App dependencies...
echo This may take several minutes. Please wait...
cd mobile
if errorlevel 1 (
    echo ERROR: mobile folder not found!
    echo Make sure you're running this script from the timetrack-nz folder.
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo ERROR: Failed to install mobile app dependencies!
    pause
    exit /b 1
)
echo ✓ Mobile app dependencies installed
cd ..
echo.

:: Install Web Dashboard Dependencies
echo [4/5] Installing Web Dashboard dependencies...
echo This may take several minutes. Please wait...
cd web-dashboard
if errorlevel 1 (
    echo ERROR: web-dashboard folder not found!
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo ERROR: Failed to install web dashboard dependencies!
    pause
    exit /b 1
)
echo ✓ Web dashboard dependencies installed
cd ..
echo.

:: Success message
echo [5/5] Setup Complete!
echo ====================================
echo.
echo ✓ Setup completed successfully!
echo.
echo NEXT STEPS:
echo.
echo 1. To run the MOBILE APP:
echo    cd mobile
echo    npm run dev
echo    Then open: http://localhost:3000
echo.
echo 2. To run the WEB DASHBOARD (in a new terminal):
echo    cd web-dashboard
echo    npm run dev
echo    Then open: http://localhost:5173
echo.
echo 3. Or use VS Code:
echo    - Open this folder in VS Code
echo    - Open 2 terminals
echo    - Run each app in separate terminals
echo.
echo See SETUP-WINDOWS.md for detailed instructions.
echo ====================================
echo.
pause
