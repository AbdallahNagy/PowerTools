#!/usr/bin/env bash
# Installs a .NET SDK in Claude Code cloud sessions so the pipeline can build
# and run the sidecar for live Dataverse checks. Does nothing on a developer
# machine or when dotnet is already installed. The API targets net9.0;
# scripts/dataverse-live.mjs runs it on a newer runtime with roll forward.
set -u

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] || command -v dotnet >/dev/null 2>&1; then
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "ensure-dotnet: apt-get not found; install the .NET 9 SDK or newer by hand." >&2
  exit 0
fi

SUDO=""
if [ "$(id -u)" != "0" ]; then SUDO="sudo"; fi

if $SUDO apt-get update -qq >/dev/null 2>&1 \
  && $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-10.0 >/dev/null 2>&1; then
  echo "ensure-dotnet: installed $(dotnet --version)."
else
  echo "ensure-dotnet: could not install dotnet-sdk-10.0; live sidecar checks will be unavailable." >&2
fi
exit 0
