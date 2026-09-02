#!/usr/bin/env bash
# Blocks a commit or CI run that would put credential material into a public repo.
# Dependency-free by design: a judge cloning cold must not need to install a scanner.
# Two modes:
#   (default / no args): scans staged content only (pre-commit hook)
#   --all-tracked: scans complete contents of all tracked text files (CI)
set -euo pipefail

mode="staged"
if [ "$#" -eq 0 ]; then
  mode="staged"
elif [ "$#" -eq 1 ] && [ "$1" = "--all-tracked" ]; then
  mode="all-tracked"
else
  printf 'Usage: %s [--all-tracked]\n' "$0" >&2
  exit 1
fi

fail=0
report() { printf '  %s: %s\n' "$1" "$2"; fail=1; }

empty_tree=""
if [ "$mode" = "all-tracked" ]; then
  empty_tree=$(git hash-object -t tree /dev/null)
fi

while IFS= read -r -d '' file; do
  [ -z "$file" ] && continue

  case "$file" in
    scripts/scan-secrets.sh|pnpm-lock.yaml) continue ;;
  esac

  # A filename alone can be disqualifying, whatever the contents.
  case "$file" in
    .env.example) ;;
    .env|*/.env|.env.*|*/.env.*|*.pem|*.key|*.p12|*.pfx|*service-account*.json|*sa-key*.json|*gcp-key*.json|*application_default_credentials.json|*gha-creds-*.json)
      if [ "$mode" = "staged" ]; then
        report "$file" "credential file staged for commit"
      else
        report "$file" "credential file tracked in repository"
      fi
      continue
      ;;
  esac

  if [ "$mode" = "staged" ]; then
    content=$(git diff --cached -U0 -- "$file" | grep '^+' | grep -v '^+++' || true)
  else
    # Skip binary files safely
    numstat=$(git diff --numstat "$empty_tree" -- "$file")
    case "$numstat" in
      "-"*) continue ;;
    esac

    [ ! -f "$file" ] && continue
    content=$(cat "$file")
  fi

  [ -z "$content" ] && continue

  # The example file is public and must still be scanned. Remove only the exact,
  # documented local-development defaults so a newly added real value cannot hide
  # behind a blanket file exemption. The optional '+' covers staged diff lines.
  if [ "$file" = ".env.example" ]; then
    content=$(printf '%s\n' "$content" | grep -vE '^\+?(CLICKHOUSE_ADMIN_PASSWORD=ghostslate_admin_local_dev|CLICKHOUSE_AGENT_PASSWORD=ghostslate_agent_local_dev|CLICKHOUSE_MCP_AUTH_TOKEN=ghostslate_mcp_local_dev_only|RUN_KEY_SECRET=local_run_key_secret_change_me)$' || true)
  fi

  [ -z "$content" ] && continue

  echo "$content" | grep -qE 'BEGIN [A-Z ]*PRIVATE KEY' && report "$file" "private key block"
  echo "$content" | grep -qE '"type"[[:space:]]*:[[:space:]]*"service_account"' && report "$file" "GCP service-account key"
  echo "$content" | grep -qE 'AIza[0-9A-Za-z_-]{35}' && report "$file" "Google API key"
  echo "$content" | grep -qE 'ya29\.[0-9A-Za-z_-]{20,}' && report "$file" "Google OAuth token"
  echo "$content" | grep -qE 'sk-(ant-)?[0-9A-Za-z_-]{24,}' && report "$file" "model provider API key"
  # Installation tokens can now be JWT-shaped and roughly 520 characters long.
  echo "$content" \
    | grep -qE '(github_pat_[0-9A-Za-z_]{20,}|ghs_[0-9A-Za-z._-]{36,}|gh[pour]_[0-9A-Za-z_]{36,})' \
    && report "$file" "GitHub token"
  echo "$content" | grep -qE 'glpat-[0-9A-Za-z_-]{20,}' && report "$file" "GitLab token"
  echo "$content" | grep -qE '(AKIA|ASIA)[0-9A-Z]{16}' && report "$file" "AWS access key id"
  echo "$content" | grep -qE 'xox[baprs]-[0-9A-Za-z-]{20,}' && report "$file" "Slack token"
  echo "$content" | grep -qE '(sk|rk)_live_[0-9A-Za-z]{16,}' && report "$file" "Stripe live key"
  echo "$content" | grep -qE '(npm_[0-9A-Za-z]{20,}|pypi-[0-9A-Za-z_-]{20,}|hf_[0-9A-Za-z]{20,})' && report "$file" "package or model registry token"
  echo "$content" | grep -qE 'eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}' && report "$file" "JWT"
  echo "$content" | grep -iE "authorization[[:space:]\"']*:[[:space:]\"']*bearer[[:space:]]+[0-9A-Za-z._~+/-]{20,}" \
    | grep -qviE 'example|placeholder|redacted|<[^>]+>|\$\{' \
    && report "$file" "hardcoded bearer token"
  echo "$content" | grep -E 'clickhouse\.cloud' | grep -qE '://[^:/[:space:]]+:[^@[:space:]]{8,}@' && report "$file" "ClickHouse connection string with password"
  # Assignment of a real-looking literal. Placeholders and env lookups are allowed.
  echo "$content" | grep -iE '(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)[[:space:]]*[:=][[:space:]]*.{0,3}[A-Za-z0-9/+_-]{12,}' \
    | grep -qviE 'process\.env|os\.environ|import\.meta\.env|\$\{|<[a-z-]+>|your[_-]|example|placeholder|xxx|changeme|redacted' \
    && report "$file" "hardcoded credential literal"
done < <(
  if [ "$mode" = "staged" ]; then
    git diff --cached -z --name-only --diff-filter=ACM
  else
    git ls-files -z
  fi
)

if [ "$fail" -ne 0 ]; then
  if [ "$mode" = "staged" ]; then
    cat >&2 <<'MSG'

Commit blocked: possible credential material in staged changes (listed above).

This repo is public and OSI-licensed — a pushed secret is not recoverable.
Move the value into .env (git-ignored) and read it from the server, per AGENTS.md.
MSG
  else
    cat >&2 <<'MSG'

Secret scan failed: possible credential material in tracked files (listed above).

This repo is public and OSI-licensed — a pushed secret is not recoverable.
Move the value into .env (git-ignored) and read it from the server, per AGENTS.md.
MSG
  fi
  exit 1
fi
