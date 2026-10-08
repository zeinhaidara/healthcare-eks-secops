#!/usr/bin/env bash
# Usage: smoke-test.sh <namespace> <public-hostname>
# Finds the ALB through the ingress, then calls /health and /ready over HTTPS with
# curl --connect-to, so the test needs no DNS record (the certificate still matches the hostname).
set -euo pipefail

namespace="$1"
host="$2"

alb=""
for _ in $(seq 1 30); do
  alb=$(kubectl get ingress -n "$namespace" \
    -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
  [ -n "$alb" ] && break
  sleep 10
done
[ -n "$alb" ] || { echo "No load balancer hostname on the ingress in $namespace"; exit 1; }

for path in /health /ready; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    --retry 5 --retry-delay 5 --retry-all-errors \
    --connect-to "${host}:443:${alb}:443" "https://${host}${path}")
  if [ "$code" != "200" ]; then
    echo "${path} returned ${code}"
    exit 1
  fi
  echo "${path} OK"
done
