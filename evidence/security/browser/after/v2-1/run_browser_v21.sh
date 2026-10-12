#!/usr/bin/env bash
# Usage: run_browser_v21.sh <app-source-dir> <result-file>
# Starts two real app instances from <app-source-dir>/app (v2.1 seed, and v1-shaped records via
# SEED_FILE), runs browser_check_v21.mjs in the pinned Playwright image, writes the output, cleans up.
set -u
SRC="$1"; RESULT="$2"
SP="/c/Users/Moulaye Haidara/AppData/Local/Temp/claude/c--Users-Moulaye-Haidara-healthcare-eks-secops/a05fb6c9-243c-4fb2-b6d3-f27f00d4c5a4/scratchpad"
PYIMG='python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f'
PWIMG='mcr.microsoft.com/playwright@sha256:019b822658965bf5f6d509472802797554360f2940e677b2afb0f17748d0d0e3'
KEY="bt-$(date +%s%N | sha256sum | cut -c1-24)"   # throwaway key for this run only, never saved
SRCW="$(cygpath -m "$SRC")"; SPW="$(cygpath -m "$SP")"
mkdir -p "$SP/out21"
docker rm -f v21app v1shape >/dev/null 2>&1; docker network rm v21net >/dev/null 2>&1
docker network create v21net >/dev/null
START='cp -r /src /app && cd /app && pip install -q --disable-pip-version-check --root-user-action=ignore -r requirements.txt 2>&1 | tail -1'
MSYS_NO_PATHCONV=1 docker run -d --name v21app --network v21net -e API_KEY="$KEY" -v "$SRCW/app:/src:ro" "$PYIMG" sh -c "$START; exec uvicorn src.main:app --host 0.0.0.0 --port 8080" >/dev/null
MSYS_NO_PATHCONV=1 docker run -d --name v1shape --network v21net -e API_KEY="$KEY" -e SEED_FILE=/tmp/v1.json -v "$SRCW/app:/src:ro" "$PYIMG" sh -c "$START; python -c \"import json; d=json.load(open('data/patients.json')); keep=('patient_id','name','age','condition','date_of_birth','admission_date'); json.dump([{k: r[k] for k in keep} for r in d], open('/tmp/v1.json','w'))\"; exec uvicorn src.main:app --host 0.0.0.0 --port 8080" >/dev/null
for c in v21app v1shape; do
  for i in $(seq 1 60); do docker exec "$c" python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8080/ready').status)" 2>/dev/null | grep -q 200 && break; sleep 2; done
done
MSYS_NO_PATHCONV=1 docker run --rm --network v21net -e BROWSER_TEST_KEY="$KEY" -v "$SPW:/w" -w /tmp "$PWIMG" sh -c 'npm init -y >/dev/null 2>&1; npm i playwright@1.49.1 --no-audit --no-fund --silent 2>&1 | tail -2; cp /w/browser_check_v21.mjs ./check.mjs && node check.mjs' > "$RESULT" 2>&1
echo "exit=$?" >> "$RESULT"
docker rm -f v21app v1shape >/dev/null 2>&1; docker network rm v21net >/dev/null 2>&1
grep -c "$KEY" "$RESULT" | sed 's/^/key occurrences in result: /'
