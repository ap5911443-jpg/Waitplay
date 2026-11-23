#!/usr/bin/env bash
# Turns the interesting part of a failed command's log into a workflow annotation, so the failure is readable from the run's
# check annotations without downloading logs.   annotate.sh <logfile> <title>
log="$1"; title="$2"
msg="$(grep -E -B1 -A14 '^(error|warning: unused)|panicked at|^test .* FAILED|^failures:|^---- ' "$log" | head -120 | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{printf "%s%%0A", $0}')"
[ -n "$msg" ] || msg="$(tail -40 "$log" | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{printf "%s%%0A", $0}')"
echo "::error title=${title}::${msg}"
