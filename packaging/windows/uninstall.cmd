@echo off
rem Windows "Apps & features" runs this. Pass /data to also delete settings and web sign-ins.
if /I "%~1"=="/data" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" -RemoveData
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
)
