@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
set ICON=
set VERFILE=
if exist "assets\icon.ico" set ICON=--icon "assets\icon.ico"
if exist "assets\version.txt" set VERFILE=--version-file "assets\version.txt"
python -m PyInstaller --noconsole --onefile --clean --name MIDWAYEconomyControl --add-data "web;web" --collect-all webview --collect-all pythonnet --collect-all clr_loader %ICON% %VERFILE% desktop.py
echo.
echo Готово: dist\MIDWAYEconomyControl.exe
pause
