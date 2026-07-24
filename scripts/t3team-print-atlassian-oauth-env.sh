#!/usr/bin/env bash
# Print T3Team Atlassian OAuth client credentials from repo-root .env files.
#
# OAuth client ID and secret come from the Atlassian Developer Console:
#   https://developer.atlassian.com/console/myapps/
#
# These are NOT personal API tokens. Basic-auth credentials live separately in
# ~/.t3/dev/secrets/t3team-atlassian-auths.bin (email + API token). This script
# intentionally does NOT read or print basic-auth secrets.
#
# If .env still has placeholders (from t3team-atlassian.env.example), there are
# no real OAuth credentials on disk yet. Colleagues must either:
#   1. Create/share an OAuth 2.0 app in the Developer Console, or
#   2. Use the basic-auth path (each person uses their own API token; never share).
#
# Usage (from repo root):
#   ./scripts/t3team-print-atlassian-oauth-env.sh
#   ./scripts/t3team-print-atlassian-oauth-env.sh --copy-block
#
# After OAuth client ID/secret are set, register callback URLs in the Atlassian
# Developer Console (Authorization > OAuth 2.0 > Callback URL), for example:
#   http://localhost:5733/oauth/callback
#   http://127.0.0.1:5733/oauth/callback
# Desktop Electron cannot use t3code-dev://app/oauth/callback — Atlassian only
# accepts http(s) callbacks. dev:desktop sets VITE_DEV_SERVER_URL automatically.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COPY_BLOCK=0

for arg in "$@"; do
  case "$arg" in
    --copy-block) COPY_BLOCK=1 ;;
    -h | --help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

T3TEAM_ATLASSIAN_CLIENT_ID=""
T3TEAM_ATLASSIAN_CLIENT_SECRET=""
VITE_ATLASSIAN_CLIENT_ID=""

strip_env_value() {
  local value="$1"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

set_known_var() {
  local key="$1"
  local value="$2"
  case "$key" in
    T3TEAM_ATLASSIAN_CLIENT_ID) T3TEAM_ATLASSIAN_CLIENT_ID="$value" ;;
    T3TEAM_ATLASSIAN_CLIENT_SECRET) T3TEAM_ATLASSIAN_CLIENT_SECRET="$value" ;;
    VITE_ATLASSIAN_CLIENT_ID) VITE_ATLASSIAN_CLIENT_ID="$value" ;;
  esac
}

read_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      '' | \#*) continue ;;
    esac

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    case "$key" in
      T3TEAM_ATLASSIAN_CLIENT_ID | T3TEAM_ATLASSIAN_CLIENT_SECRET | VITE_ATLASSIAN_CLIENT_ID)
        set_known_var "$key" "$(strip_env_value "$value")"
        ;;
    esac
  done <"$file"
}

is_placeholder() {
  local key="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    return 0
  fi

  case "$value" in
    your-atlassian-oauth-client-id | your-atlassian-oauth-client-secret | changeme | placeholder | REPLACE_ME)
      return 0
      ;;
  esac

  case "$key" in
    *SECRET*)
      case "$value" in
        your-atlassian-oauth-client-secret*) return 0 ;;
      esac
      ;;
    *)
      case "$value" in
        your-atlassian-oauth-client-id*) return 0 ;;
      esac
      ;;
  esac

  return 1
}

read_env_file "$REPO_ROOT/.env"
read_env_file "$REPO_ROOT/.env.local"

echo "T3Team Atlassian OAuth env (from $REPO_ROOT/.env and .env.local)"
echo

placeholder_count=0
warn_if_placeholder() {
  local key="$1"
  local value="$2"

  if is_placeholder "$key" "$value"; then
    echo "  WARNING: $key looks like a placeholder — not a real OAuth credential." >&2
    placeholder_count=$((placeholder_count + 1))
  fi
}

for key in T3TEAM_ATLASSIAN_CLIENT_ID T3TEAM_ATLASSIAN_CLIENT_SECRET VITE_ATLASSIAN_CLIENT_ID; do
  value=""
  case "$key" in
    T3TEAM_ATLASSIAN_CLIENT_ID) value="$T3TEAM_ATLASSIAN_CLIENT_ID" ;;
    T3TEAM_ATLASSIAN_CLIENT_SECRET) value="$T3TEAM_ATLASSIAN_CLIENT_SECRET" ;;
    VITE_ATLASSIAN_CLIENT_ID) value="$VITE_ATLASSIAN_CLIENT_ID" ;;
  esac

  warn_if_placeholder "$key" "$value"

  if [[ -z "$value" ]]; then
    echo "$key=(not set)"
  else
    echo "$key=$value"
  fi
done

echo

if [[ "$placeholder_count" -gt 0 ]]; then
  echo "No real OAuth client credentials found on disk." >&2
  echo "Create an OAuth 2.0 app at https://developer.atlassian.com/console/myapps/" >&2
  echo "and add the client ID/secret to .env (see t3team-atlassian.env.example)." >&2
  echo >&2
fi

echo "Atlassian OAuth callback URLs to register (Authorization > OAuth 2.0):"
echo "  http://localhost:5733/oauth/callback"
echo "  http://127.0.0.1:5733/oauth/callback"
echo "(Use your dev web port if not 5733. Desktop dev uses 127.0.0.1; browser dev uses localhost.)"
echo

if [[ "$COPY_BLOCK" -eq 1 ]]; then
  if [[ "$placeholder_count" -gt 0 ]]; then
    echo "# Copy-paste block skipped — placeholders detected." >&2
    exit 1
  fi

  cat <<EOF
# Paste into colleagues' repo-root .env (OAuth app creds — safe to share within the team app)
T3TEAM_ATLASSIAN_CLIENT_ID=$T3TEAM_ATLASSIAN_CLIENT_ID
T3TEAM_ATLASSIAN_CLIENT_SECRET=$T3TEAM_ATLASSIAN_CLIENT_SECRET
VITE_ATLASSIAN_CLIENT_ID=$VITE_ATLASSIAN_CLIENT_ID
EOF
fi
