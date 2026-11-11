@echo off
title WaitPlay Codex Watcher
cd /d "%~dp0..\.."
echo Starting WaitPlay Companion Watcher for OpenAI Codex...
node integrations\codex\codex-watcher.cjs
pause
