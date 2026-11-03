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
rem Pick the interpreter to run the app with:
rem   1. %CONDA_PREFIX%\python.exe         (an activated conda/Anaconda env)
rem   2. .venv\Scripts\python.exe          (README instructions)
rem   3. python.exe found on PATH          (any installed Python)
rem   4. python.exe of a conda env that was created earlier
rem An activated environment wins over a leftover .venv folder, because
rem "conda activate" is an explicit choice and a stale .venv would otherwise
rem hijack the run. If none of them has the requirements, the first supported
rem Python found (3.8 - 3.12) is used and the requirements are installed into it.
rem Python 3.13 and newer are skipped on purpose: rookiepy has no wheel for them,
rem so pip would try to build a Rust extension and fail with a confusing error.
rem ---------------------------------------------------------------------------
set "PYTHON="
set "PYTHON_FALLBACK="
set "PYTHON_TOO_NEW="
set "PYTHON_KIND="

if not defined CONDA_PREFIX goto skip_conda
if not exist "%CONDA_PREFIX%\python.exe" goto skip_conda
call :probe "%CONDA_PREFIX%\python.exe"
if not defined PYTHON goto skip_conda
rem CONDA_DEFAULT_ENV holds the env name ("base", "coursera_env", ...).
if defined CONDA_DEFAULT_ENV (
  set "PYTHON_KIND=conda environment %CONDA_DEFAULT_ENV%"
) else (
  set "PYTHON_KIND=active conda environment"
)
goto have_python
:skip_conda

if exist ".venv\Scripts\python.exe" call :probe ".venv\Scripts\python.exe"
if defined PYTHON set "PYTHON_KIND=.venv"
if defined PYTHON goto have_python

for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYTHON call :probe "%%P"
if defined PYTHON set "PYTHON_KIND=python on PATH"
if defined PYTHON goto have_python

rem The "py" launcher is often available even when python is not on PATH.
for /f "delims=" %%P in ('py -3 -c "import sys;sys.stdout.write(sys.executable)" 2^>nul') do if not defined PYTHON call :probe "%%P"
if defined PYTHON set "PYTHON_KIND=py launcher"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\.conda\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\anaconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%USERPROFILE%\miniconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

for /d %%E in ("%ProgramData%\anaconda3\envs\*") do if not defined PYTHON call :probe "%%~fE\python.exe"
if defined PYTHON goto have_python

rem Base installs, for people who never created a named environment.
for %%B in (
  "%USERPROFILE%\anaconda3\python.exe"
  "%USERPROFILE%\miniconda3\python.exe"
  "%USERPROFILE%\miniforge3\python.exe"
  "%ProgramData%\anaconda3\python.exe"
  "%ProgramData%\miniconda3\python.exe"
  "%LOCALAPPDATA%\anaconda3\python.exe"
) do if not defined PYTHON call :probe "%%~B"
if defined PYTHON goto have_python

if defined PYTHON_FALLBACK set "PYTHON=%PYTHON_FALLBACK%"
if not defined PYTHON goto no_python
if not defined PYTHON_KIND set "PYTHON_KIND=an existing conda environment"

:have_python
if not defined PYTHON_KIND set "PYTHON_KIND=an existing interpreter"
echo Using %PYTHON_KIND%:
echo   %PYTHON%

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
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 7500 -State Listen -ErrorAction SilentlyContinue) { exit 3 } else { exit 0 }"
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
if defined PYTHON_TOO_NEW (
  echo A Python that is too new was found:
  echo   %PYTHON_TOO_NEW%
  echo.
  echo This app needs Python 3.8 to 3.12 because its browser-cookie library
  echo does not support newer versions yet. Use your Anaconda environment:
  echo.
  echo   Start menu -^> Anaconda Prompt
  echo   conda activate coursera_env
  echo   start_web_app.bat
  echo.
  echo If that environment does not exist yet:
  echo   conda create -n coursera_env python=3.10 -y
  echo   conda activate coursera_env
  echo   python -m pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)
echo No usable Python interpreter was found.
echo Install Python 3.8+ from https://www.python.org/downloads/ and tick
echo "Add python.exe to PATH", or create a virtual environment:
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo If you use Anaconda, open the "Anaconda Prompt" from the Start menu,
echo activate your environment and run this file from that window:
echo   conda activate coursera_env
echo   cd /d "%~dp0"
echo   start_web_app.bat
echo.
echo If "conda" is not recognised in a normal cmd window, run this once:
echo   conda init cmd.exe
pause
exit /b 1

rem ---------------------------------------------------------------------------
rem :probe <python path>
rem Sets PYTHON when the interpreter is Python 3.8-3.12 and has the requirements.
rem Otherwise remembers the first usable interpreter as a fallback.
rem
rem The upper bound is not arbitrary: rookiepy (browser cookies) only ships
rem wheels up to Python 3.12, so 3.13+ would try to compile a Rust extension
rem from source and fail. Rejecting it here keeps a stray new Python on PATH
rem from being chosen over a perfectly good Anaconda environment.
rem ---------------------------------------------------------------------------
:probe
if not exist "%~1" exit /b 1
"%~1" -c "import sys; sys.exit(0 if (3, 8) <= sys.version_info[:2] < (3, 13) else 1)" >nul 2>&1
if errorlevel 1 (
  rem Remember a too-new interpreter only to explain the problem later.
  "%~1" -c "import sys; sys.exit(0 if sys.version_info[:2] >= (3, 13) else 1)" >nul 2>&1
  if not errorlevel 1 if not defined PYTHON_TOO_NEW set "PYTHON_TOO_NEW=%~1"
  exit /b 1
)
"%~1" -c "import requests, bs4, rookiepy" >nul 2>&1
if errorlevel 1 (
  if not defined PYTHON_FALLBACK set "PYTHON_FALLBACK=%~1"
  exit /b 1
)
set "PYTHON=%~1"
exit /b 0
