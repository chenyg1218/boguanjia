@echo off
REM Rename project folder live_autocomm -> boguanjia
REM Close Cursor / IDE first, then double-click this from parent folder or run:
REM   d:\Code\PythonProject\live_autocomm\scripts\rename_project_folder.bat

setlocal
set "SRC=d:\Code\PythonProject\live_autocomm"
set "DST=d:\Code\PythonProject\boguanjia"

if not exist "%SRC%" (
  echo Source not found: %SRC%
  exit /b 1
)
if exist "%DST%" (
  echo Destination already exists: %DST%
  exit /b 1
)

move "%SRC%" "%DST%"
if errorlevel 1 (
  echo Rename failed. Close Cursor and any python/exe using this folder, then retry.
  exit /b 1
)
echo Renamed to %DST%
echo Re-open that folder in Cursor.
endlocal
