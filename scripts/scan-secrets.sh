#!/usr/bin/env sh
# Blocks a commit that would put credential material into a public repo.
# Dependency-free by design: a judge cloning cold must not need to install a scanner.
# Scans staged content only, so an unstaged local .env is never a false positive.
set -eu

staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

fail=0
report() { printf '  %s: %s\n' "$1" "$2"; fail=1; }

for file in $staged; do
  case "$file" in
    scripts/scan-secrets.sh|.env.example|pnpm-lock.yaml) continue ;;
  esac

  # A filename alone can be disqualifying, whatever the contents.
  case "$file" in
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*service-account*.json|*sa-key*.json|gcp-key*.json)
      report "$file" "credential file staged for commit" ; continue ;;
  esac

  added=$(git diff --cached -U0 -- "$file" | grep '^+' | grep -v '^+++' || true)
  [ -z "$added" ] && continue

  echo "$added" | grep -qE 'BEGIN [A-Z ]*PRIVATE KEY' && report "$file" "private key block"
  echo "$added" | grep -qE '"type"[[:space:]]*:[[:space:]]*"service_account"' && report "$file" "GCP service-account key"
  echo "$added" | grep -qE 'AIza[0-9A-Za-z_-]{35}' && report "$file" "Google API key"
  echo "$added" | grep -qE 'ya29\.[0-9A-Za-z_-]{20,}' && report "$file" "Google OAuth token"
  echo "$added" | grep -qE 'sk-(ant-)?[0-9A-Za-z_-]{24,}' && report "$file" "model provider API key"
  echo "$added" | grep -qE 'gh[pousr]_[0-9A-Za-z]{36}' && report "$file" "GitHub token"
  echo "$added" | grep -qE '(AKIA|ASIA)[0-9A-Z]{16}' && report "$file" "AWS access key id"
  echo "$added" | grep -E 'clickhouse\.cloud' | grep -qE '://[^:/[:space:]]+:[^@[:space:]]{8,}@' && report "$file" "ClickHouse connection string with password"
  # Assignment of a real-looking literal. Placeholders and env lookups are allowed.
  echo "$added" | grep -iE '(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)[[:space:]]*[:=][[:space:]]*.{0,3}[A-Za-z0-9/+_-]{12,}' \
    | grep -qviE 'process\.env|os\.environ|import\.meta\.env|\$\{|<[a-z-]+>|your[_-]|example|placeholder|xxx|changeme|redacted' \
    && report "$file" "hardcoded credential literal"
done

if [ "$fail" -ne 0 ]; then
  cat >&2 <<'MSG'

Commit blocked: possible credential material in staged changes (listed above).

This repo is public and OSI-licensed — a pushed secret is not recoverable.
Move the value into .env (git-ignored) and read it from the server, per AGENTS.md.
If this is a genuine false positive, re-run with: SKIP_SECRET_SCAN=1 git commit ...
MSG
  exit 1
fi
