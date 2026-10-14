#!/usr/bin/env bash
set -euo pipefail

# Build the Apple Silicon FFmpeg shipped with Studio from pinned source.
# The installer and updater carry the result; end users need no build tools.
root="$(cd "$(dirname "$0")/.." && pwd)"
output="$root/src-tauri/binaries"
binary="$output/ffmpeg-aarch64"
marker="$output/ffmpeg-aarch64.BUILD"
recipe_hash="$(shasum -a 256 "$0" | cut -d ' ' -f 1)"

if [[ -f "$binary" && -f "$marker" && "$(cat "$marker")" == "$recipe_hash" ]]; then
  version="$("$binary" -version)"
  if [[ "$version" == *'ffmpeg version 6.1.1'* && "$version" != *--enable-nonfree* &&
        "$(otool -L "$binary")" != */opt/homebrew/* ]]; then
    exit 0
  fi
fi

command -v pkg-config >/dev/null || { echo 'Install pkgconf to build Studio on macOS' >&2; exit 1; }
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
prefix="$temporary/deps"
mkdir -p "$prefix" "$output"
jobs="$(sysctl -n hw.ncpu)"

download() {
  local url="$1" file="$2" expected="$3"
  curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$file"
  printf '%s  %s\n' "$expected" "$file" | shasum -a 256 -c -
}

download 'https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz' \
  "$temporary/ffmpeg.tar.xz" \
  '8684f4b00f94b85461884c3719382f1261f0d9eb3d59640a1f4ac0873616f968'
download 'https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz' \
  "$temporary/x264.tar.gz" \
  'cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9'
download 'https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz' \
  "$temporary/lame.tar.gz" \
  'ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e'
tar -xf "$temporary/ffmpeg.tar.xz" -C "$temporary"
tar -xf "$temporary/x264.tar.gz" -C "$temporary"
tar -xf "$temporary/lame.tar.gz" -C "$temporary"

export MACOSX_DEPLOYMENT_TARGET=12.0
(
  cd "$temporary/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55"
  ./configure --enable-static --disable-cli --disable-opencl --prefix="$prefix" \
    > "$temporary/x264-configure.log" 2>&1 || { tail -n 100 "$temporary/x264-configure.log" >&2; exit 1; }
  make -j "$jobs" > "$temporary/x264-build.log" 2>&1 || { tail -n 100 "$temporary/x264-build.log" >&2; exit 1; }
  make install > "$temporary/x264-install.log" 2>&1 || { tail -n 100 "$temporary/x264-install.log" >&2; exit 1; }
)
(
  cd "$temporary/lame-3.100"
  ./configure --disable-dependency-tracking --disable-shared --enable-static \
    --disable-frontend --prefix="$prefix" > "$temporary/lame-configure.log" 2>&1 || \
    { tail -n 100 "$temporary/lame-configure.log" >&2; exit 1; }
  make -j "$jobs" > "$temporary/lame-build.log" 2>&1 || { tail -n 100 "$temporary/lame-build.log" >&2; exit 1; }
  make install > "$temporary/lame-install.log" 2>&1 || { tail -n 100 "$temporary/lame-install.log" >&2; exit 1; }
)
(
  cd "$temporary/ffmpeg-6.1.1"
  export PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig"
  ./configure \
    --disable-debug --disable-doc --disable-ffplay --disable-ffprobe \
    --disable-shared --enable-static --disable-autodetect \
    --enable-gpl --disable-nonfree --enable-libx264 --enable-libmp3lame \
    --enable-videotoolbox --enable-securetransport --pkg-config-flags=--static \
    --extra-cflags="-I$prefix/include -mmacosx-version-min=12.0" \
    --extra-ldflags="-L$prefix/lib -Wl,-search_paths_first -mmacosx-version-min=12.0" \
    > "$temporary/ffmpeg-configure.log" 2>&1 || \
    { tail -n 100 "$temporary/ffmpeg-configure.log" >&2; exit 1; }
  make -j "$jobs" ffmpeg > "$temporary/ffmpeg-build.log" 2>&1 || \
    { tail -n 100 "$temporary/ffmpeg-build.log" >&2; exit 1; }

  encoders="$(./ffmpeg -hide_banner -encoders)"
  protocols="$(./ffmpeg -hide_banner -protocols)"
  [[ "$encoders" == *libx264* && "$encoders" == *libmp3lame* && "$encoders" == *h264_videotoolbox* ]]
  [[ "$protocols" == *rtmp* && "$protocols" == *rtmps* ]]
  [[ "$(./ffmpeg -version)" != *--enable-nonfree* ]]
  [[ "$(otool -L ffmpeg)" != */opt/homebrew/* && "$(otool -L ffmpeg)" != */usr/local/* ]]
  cp COPYING.GPLv2 "$output/ffmpeg-aarch64.LICENSE"
  cp ffmpeg "$binary"
)
cp "$temporary/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55/COPYING" \
  "$output/ffmpeg-aarch64.x264.LICENSE"
cp "$temporary/lame-3.100/COPYING" "$output/ffmpeg-aarch64.lame.LICENSE"
chmod 755 "$binary"
cat > "$output/ffmpeg-aarch64.README" <<'EOF'
FFmpeg 6.1.1: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
x264 b35605ace3ddf7c1a5d67a2eb553f034aef41d55:
https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz
LAME 3.100: https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
The exact build recipe and archive hashes are in studio/scripts/build-macos-ffmpeg.sh.
This GPLv2+ build targets macOS 12+, links x264 and LAME statically, and uses
macOS SecureTransport for RTMPS. It has no nonfree or Homebrew runtime dependency.
EOF
printf '%s\n' "$recipe_hash" > "$marker"
