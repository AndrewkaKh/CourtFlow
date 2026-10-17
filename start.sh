#!/usr/bin/env bash
# Установка и запуск на macOS и Linux: ./start.sh
cd "$(dirname "$0")" || exit 1

fail() {
  echo "Не получилось. Проверьте, что установлен Python 3.10+ (на маке: brew install python)."
  exit 1
}

if [ ! -x .venv/bin/python ]; then
  PY=$(command -v python3 || command -v python) || fail
  # Системный python3 на маке бывает 3.9 — с ним приложение не запустится.
  "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 10))' || fail
  echo "Создаю виртуальное окружение..."
  "$PY" -m venv .venv || fail
  # Если установка оборвалась, удаляем окружение, чтобы следующий запуск начал заново.
  .venv/bin/python -m pip install -r requirements-dev.txt || { rm -rf .venv; fail; }
fi
[ -f .env ] || cp .env.example .env
exec .venv/bin/python run.py
