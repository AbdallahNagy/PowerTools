#!/usr/bin/env bash
# Prepares a Claude Code cloud session (Ubuntu 24.04) to build, test, and run
# the desktop client and the API sidecar.
#
# Environment setup script (cloud environment settings -> Setup script):
#   bash PowerTools/scripts/cloud-setup.sh
#
# Safe to re-run. Needs root, npm registry, nuget.org, and the Ubuntu archive.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOTNET_ROOT=/usr/lib/dotnet
NET9_VERSION="${NET9_VERSION:-9.0.22}"

log() { printf '\n==> %s\n' "$*"; }

# ─── .NET ────────────────────────────────────────────────────────────────
# The API targets net9.0. Ubuntu 24.04 ships the .NET 10 SDK (which builds
# net9.0) but not .NET 9, and builds.dotnet.microsoft.com is not reachable
# from cloud sessions. Install the .NET 10 SDK from apt, then add the .NET 9
# shared runtimes from their NuGet runtime packs so the API and its tests
# run on the runtime they target.
if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-sdks | grep -q '^10\.'; then
  log "Installing .NET 10 SDK"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-10.0 >/dev/null
fi

install_runtime_pack() {
  local package="$1" framework="$2"
  local target="$DOTNET_ROOT/shared/$framework/$NET9_VERSION"
  [[ -d "$target" ]] && return
  log "Installing $framework $NET9_VERSION runtime"
  local tmp
  tmp="$(mktemp -d)"
  curl -sSfL -o "$tmp/pack.zip" \
    "https://api.nuget.org/v3-flatcontainer/$package/$NET9_VERSION/$package.$NET9_VERSION.nupkg"
  unzip -qo "$tmp/pack.zip" 'runtimes/*' -d "$tmp/pack"
  mkdir -p "$target"
  cp -a "$tmp/pack/runtimes/linux-x64/lib/net9.0/." "$target/"
  if [[ -d "$tmp/pack/runtimes/linux-x64/native" ]]; then
    cp -a "$tmp/pack/runtimes/linux-x64/native/." "$target/"
  fi
  chmod +x "$target"/createdump 2>/dev/null || true
  rm -rf "$tmp"
}
install_runtime_pack microsoft.netcore.app.runtime.linux-x64 Microsoft.NETCore.App
install_runtime_pack microsoft.aspnetcore.app.runtime.linux-x64 Microsoft.AspNetCore.App

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
log "Restoring API solution"
dotnet restore "$REPO_DIR/api/PowerTools/PowerTools.sln" --verbosity quiet

# ─── Desktop ─────────────────────────────────────────────────────────────
log "Installing desktop npm dependencies"
(cd "$REPO_DIR/desktop" && npm ci --no-audit --no-fund --loglevel=error)

log "Done"
dotnet --list-sdks
dotnet --list-runtimes
node --version
