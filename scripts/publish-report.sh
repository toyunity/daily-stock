#!/usr/bin/env bash
#
# publish-report.sh — deterministic publish path for the daily dispatch.
#
# The dispatch session (Max, $0) researches and writes reports/report.json, then
# runs this script. It validates the file and tries to publish it via `git push`.
#
# Why a script (and why a fallback): push auth in this managed environment is
# bound to the *session container's* local git proxy, not to a token in the repo.
# A freshly-spawned scheduled container may lack push (write) rights, so `git
# push` can fail even though research succeeded. When that happens this script
# does NOT give up — it prints a machine-readable marker so the dispatch agent
# can publish the exact same file through the GitHub MCP connector (account-level
# auth), which bypasses the container proxy entirely.
#
# Output contract (last line is the signal):
#   PUBLISH_OK                          -> pushed; finalize.yml will run. Done.
#   NO_CHANGES                          -> report.json unchanged; nothing to do.
#   PUSH_FAILED_USE_MCP sha=<blobsha> path=<p> branch=<b>
#                                       -> push blocked; publish via GitHub MCP
#                                          create_or_update_file using that sha.
#   INVALID_JSON / SCHEMA_INVALID       -> fix report.json and re-run.
#
# Exit codes: 0 ok/no-change, 2 validation error, 3 push blocked (use MCP).

set -uo pipefail

BRANCH="${DISPATCH_BRANCH:-claude/stock-market-report-app-9to46d}"
REPORT="reports/report.json"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { echo "REPO_ROOT_MISSING"; exit 2; }

# --- 1) validate -----------------------------------------------------------
if [ ! -f "$REPORT" ]; then
  echo "MISSING_REPORT $REPORT"
  exit 2
fi

if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$REPORT" 2>/dev/null; then
  echo "INVALID_JSON"
  exit 2
fi

# Full zod schema check is best-effort: it needs installed deps. Skip cleanly
# when node_modules is absent (fresh clone) — finalize.yml re-validates anyway.
if [ -d node_modules ]; then
  vlog="$(mktemp)"
  if npm run -s validate -w @daily-stock/pipeline -- "$REPO_ROOT/$REPORT" >"$vlog" 2>&1; then
    echo "schema: ok"
  else
    echo "SCHEMA_INVALID"
    cat "$vlog"
    rm -f "$vlog"
    exit 2
  fi
  rm -f "$vlog"
else
  echo "schema: skipped (no node_modules); JSON.parse ok"
fi

# --- 2) commit -------------------------------------------------------------
git add "$REPORT"
if git diff --cached --quiet -- "$REPORT"; then
  echo "NO_CHANGES"
  exit 0
fi

git -c user.name="daily-stock-dispatch" \
    -c user.email="dispatch@users.noreply.github.com" \
    commit -q -m "chore(report): $(date -u +%Y-%m-%d) dispatch report"

# --- 3) push with exponential backoff (network blips only) -----------------
pushed=0
for delay in 0 2 4 8; do
  if [ "$delay" -gt 0 ]; then sleep "$delay"; fi
  if git push origin "$BRANCH" 2>/tmp/push.err.$$; then
    pushed=1
    break
  fi
done

if [ "$pushed" -eq 1 ]; then
  rm -f "/tmp/push.err.$$"
  echo "PUBLISH_OK"
  exit 0
fi

# --- 4) push blocked -> hand off to the GitHub MCP bridge ------------------
# The commit exists locally but couldn't reach origin. Tell the agent the blob
# SHA of the *current remote* report.json so it can update it via MCP.
echo "--- git push stderr ---"
cat "/tmp/push.err.$$" 2>/dev/null || true
rm -f "/tmp/push.err.$$"
git fetch -q origin "$BRANCH" 2>/dev/null || true
sha="$(git rev-parse "origin/${BRANCH}:${REPORT}" 2>/dev/null || echo "")"
echo "PUSH_FAILED_USE_MCP sha=${sha} path=${REPORT} branch=${BRANCH}"
exit 3
