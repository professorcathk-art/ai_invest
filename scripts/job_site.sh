# Resolve the public origin iMac jobs should POST to.
# INVESTMOUSE_SITE_URL is often the local Next server — never send launchd traffic there.
investmouse_job_site() {
  local api="${INVESTMOUSE_API_URL:-}"
  if [[ -n "$api" ]]; then
    printf '%s\n' "${api%/api/*}"
    return
  fi
  local site="${INVESTMOUSE_JOB_URL:-}"
  if [[ -n "$site" ]]; then
    printf '%s\n' "${site%/}"
    return
  fi
  site="${INVESTMOUSE_SITE_URL:-}"
  case "$site" in
    http://127.*|http://localhost*|https://localhost*|http://[::1]*|"")
      printf '%s\n' "https://ai-invest-dvxh.vercel.app"
      ;;
    *)
      printf '%s\n' "${site%/}"
      ;;
  esac
}
