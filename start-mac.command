#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  [!] Node.js 가 설치되어 있지 않습니다. nodejs.org 에서 LTS 버전을 설치해 주세요."
  echo ""
  read -n 1 -s -r -p "아무 키나 누르면 닫힙니다..."
  exit 1
fi
node server.js
