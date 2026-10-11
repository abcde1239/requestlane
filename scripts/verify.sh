#!/usr/bin/env bash

# Git Bash / WSL / POSIX；不依赖调用者的工作目录。
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/verify.mjs
