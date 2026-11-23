@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 goto nopython

:menu
echo.
echo  FITL ultrasonic bridge  (UltraTest BP-700 Pro)
echo  ------------------------------------------------
echo   1  Instrument over USB (live readings)
echo   2  Watch the UltraTestLab export folder
echo   3  Demo with simulated readings (testing only)
echo   4  Open saved records only
echo   5  Find the USB protocol (logs raw bytes)
echo   6  Install required packages (first time only)
echo.
set /p choice=Choose 1-6:
if "%choice%"=="1" goto serial
if "%choice%"=="2" goto watch
if "%choice%"=="3" python bridge.py --source sim
if "%choice%"=="4" python bridge.py --source none
if "%choice%"=="5" goto sniff
if "%choice%"=="6" python -m pip install -r requirements.txt
goto end

:serial
python bridge.py --list-ports
set /p port=Type the COM port from the list above (for example COM5):
python bridge.py --source serial --port %port%
goto end

:sniff
python bridge.py --list-ports
set /p port=Type the COM port from the list above (for example COM5):
python bridge.py --source serial --port %port% --sniff
goto end

:watch
set /p folder=Folder where UltraTestLab saves its exports:
python bridge.py --source watch --folder "%folder%"
goto end

:nopython
echo Python 3 was not found. Install it from python.org and tick "Add python.exe to PATH", then run this again.

:end
pause
