@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv (
  echo Создаю виртуальное окружение...
  python -m venv .venv || goto :error
  .venv\Scripts\python -m pip install -r requirements-dev.txt || goto :error
)
if not exist .env copy .env.example .env >nul
.venv\Scripts\python run.py
goto :eof
:error
echo Не получилось. Проверьте, что установлен Python 3.10+ и он есть в PATH.
pause
