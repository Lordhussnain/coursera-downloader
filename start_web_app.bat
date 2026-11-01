@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Administrator rights are not required to start the app. They are only
rem requested when a leftover app instance is still holding port 7500.
set "ELEVATED="
if /I "%~1"=="--elevated" (
  set "ELEVATED=1"
  shift
)

rem ---------------------------------------------------------------------------
rem Pick the first interpreter that already has the requirements installed:
rem   1. .venv\Scripts\python.exe          (README instructions)
rem   2. %CONDA_PREFIX%\python.exe         (activated conda environment)
rem   3. python.exe found on PATH          (any installed Python)
rem   4. python.exe of a conda env that was created earlier
rem If none of them has the requirements, the first Python 3.8+ found is used
rem and the requirements are installed into it.
rem ---------------------------------------------------------------------------
set "PYTHON="
set "PYTHON_FALLBACK="

if exist ".venv\Scripts\python.exe" call :probe ".venv\Scripts\python.exe"
if defined PYTHON goto have_python

if not defined CONDA_PREFIX goto skip_conda
if not exist "%CONDA_PREFIX%\python.exe" goto skip_conda
call :probe "%CONDA_PREFIX%\python.exe"
if defined PYTHON goto have_python
:skip_conda

for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYTHON call :probe "%%P"
if defined PYTHON goto have_python

rem The "py" launcher is often available even when python is not on PATH.
for /f "delims=" %%P in ('py -3 -c "import sys;sys.stdout.write(sys.executable)" 2^>nul') do if not defined PYTHON call :probe "%%P"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\.conda\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\anaconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\miniconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%ProgramData%\anaconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

if defined PYTHON_FALLBACK set "PYTHON=%PYTHON_FALLBACK%"
if not defined PYTHON goto no_python

:have_python
echo Using: %PYTHON%

"%PYTHON%" -c "import requests, bs4, rookiepy" >nul 2>&1
if not errorlevel 1 goto deps_ok

echo Installing Python requirements with:
echo   %PYTHON%
"%PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Could not install the requirements. Fix the error above, then run this file again.
  pause
  exit /b 1
)

:deps_ok
echo Checking for an old web app on port 7500...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 7500 -State Listen -ErrorAction SilentlyContinue; foreach ($connection in $connections) { if ($connection.OwningProcess) { Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 500; if (Get-NetTCPConnection -LocalPort 7500 -State Listen -ErrorAction SilentlyContinue) { exit 3 } else { exit 0 }"
if not errorlevel 3 goto collect_args

if defined ELEVATED (
  echo Port 7500 is still busy. Close the program using it, then run this file again.
  pause
  exit /b 1
)

echo Port 7500 is held by a program this window is not allowed to stop.
echo Restarting with administrator permission...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--elevated %*' -WorkingDirectory '%~dp0' -Verb RunAs"
if errorlevel 1 (
  echo Could not request administrator permission.
  echo Close the program that uses port 7500, then run this file again.
  pause
)
exit /b

:collect_args
rem Rebuild the argument list without --elevated. "%*" is not affected by
rem "shift", so passing it through would forward the internal flag to argparse.
set PW_ARGS=
:collect_loop
if "%~1"=="" goto start_app
set PW_ARGS=%PW_ARGS% "%~1"
shift
goto collect_loop

:start_app
"%PYTHON%" web_app.py %PW_ARGS%

if errorlevel 1 (
  echo.
  echo Web app stopped with an error.
  pause
)
exit /b

:no_python
echo No Python interpreter was found.
echo.
echo Install Python 3.8+ from https://www.python.org/downloads/ and tick
echo "Add python.exe to PATH", or create a virtual environment:
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo If you use conda, open "Anaconda Prompt", activate your environment
echo   conda activate coursera_env
echo and run this file from that window.
pause
exit /b 1

rem ---------------------------------------------------------------------------
rem :probe <python path>
rem Sets PYTHON when the interpreter is Python 3.8+ and has the requirements.
rem Otherwise remembers the first Python 3.8+ interpreter as a fallback.
rem ---------------------------------------------------------------------------
:probe
if not exist "%~1" exit /b 1
"%~1" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
if errorlevel 1 exit /b 1
"%~1" -c "import requests, bs4, rookiepy" >nul 2>&1
if errorlevel 1 (
  if not defined PYTHON_FALLBACK set "PYTHON_FALLBACK=%~1"
  exit /b 1
)
set "PYTHON=%~1"
exit /b 0
