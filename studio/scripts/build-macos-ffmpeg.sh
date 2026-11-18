#!/usr/bin/env bash
set -euo pipefail

# Build the macOS FFmpeg shipped with Studio from pinned source.
# The installer and updater carry the result; end users need no build tools.
root="$(cd "$(dirname "$0")/.." && pwd)"
output="$root/src-tauri/binaries"
arch="${1:-$(uname -m)}"
[[ "$arch" != arm64 ]] || arch=aarch64
case "$arch" in
  aarch64) clang_arch=arm64 ;;
  x86_64) clang_arch=x86_64 ;;
  *) echo "Unsupported macOS FFmpeg architecture: $arch" >&2; exit 1 ;;
esac
binary="$output/ffmpeg-$arch"
marker="$binary.BUILD"
tls_patch="$root/scripts/ffmpeg-securetransport-nonblocking.patch"
recipe_hash="$(cat "$0" "$tls_patch" | shasum -a 256 | cut -d ' ' -f 1)"
host_arch="$(uname -m)"
if [[ "$arch" == aarch64 && "$host_arch" != arm64 ]]; then
  echo 'Apple Silicon FFmpeg must be built on an Apple Silicon Mac' >&2
  exit 1
fi

if [[ -f "$binary" && -f "$marker" && "$(cat "$marker")" == "$recipe_hash" ]]; then
  if lipo "$binary" -verify_arch "$clang_arch" &&
     [[ "$(otool -L "$binary")" != */usr/local/* &&
        "$(otool -L "$binary")" != */opt/homebrew/* ]]; then
    exit 0
  fi
fi

command -v pkg-config >/dev/null || { echo 'Install pkgconf to build Studio on macOS' >&2; exit 1; }
if [[ "$arch" == x86_64 ]]; then
  command -v nasm >/dev/null || { echo 'Install nasm to build Intel FFmpeg' >&2; exit 1; }
fi
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
download 'https://codeload.github.com/mirror/x264/tar.gz/b35605ace3ddf7c1a5d67a2eb553f034aef41d55' \
  "$temporary/x264.tar.gz" \
  'cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9'
download 'https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz' \
  "$temporary/lame.tar.gz" \
  'ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e'
tar -xf "$temporary/ffmpeg.tar.xz" -C "$temporary"
tar -xf "$temporary/x264.tar.gz" -C "$temporary"
tar -xf "$temporary/lame.tar.gz" -C "$temporary"
patch -d "$temporary/ffmpeg-6.1.1" -p1 < "$tls_patch"

x264_target=()
lame_target=()
ffmpeg_target=()
if [[ "$clang_arch" != "$host_arch" ]]; then
  x264_target=(--host="$arch-apple-darwin")
  lame_target=(--build=arm-apple-darwin --host="$arch-apple-darwin")
  ffmpeg_target=(--arch="$arch" --enable-cross-compile --target-os=darwin)
fi

export MACOSX_DEPLOYMENT_TARGET=12.0
(
  cd "$temporary/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55"
  ./configure --enable-static --disable-cli --disable-opencl --prefix="$prefix" \
    --extra-cflags="-arch $clang_arch" --extra-ldflags="-arch $clang_arch" \
    ${x264_target[@]+"${x264_target[@]}"} \
    > "$temporary/x264-configure.log" 2>&1 || { tail -n 100 "$temporary/x264-configure.log" >&2; exit 1; }
  make -j "$jobs" > "$temporary/x264-build.log" 2>&1 || { tail -n 100 "$temporary/x264-build.log" >&2; exit 1; }
  make install > "$temporary/x264-install.log" 2>&1 || { tail -n 100 "$temporary/x264-install.log" >&2; exit 1; }
)
(
  cd "$temporary/lame-3.100"
  CFLAGS="-arch $clang_arch -O2" LDFLAGS="-arch $clang_arch" \
    ./configure --disable-dependency-tracking --disable-shared --enable-static \
    --disable-frontend --prefix="$prefix" ${lame_target[@]+"${lame_target[@]}"} \
    > "$temporary/lame-configure.log" 2>&1 || \
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
    --extra-cflags="-arch $clang_arch -I$prefix/include -mmacosx-version-min=12.0" \
    --extra-ldflags="-arch $clang_arch -L$prefix/lib -Wl,-search_paths_first -mmacosx-version-min=12.0" \
    ${ffmpeg_target[@]+"${ffmpeg_target[@]}"} \
    > "$temporary/ffmpeg-configure.log" 2>&1 || \
    { tail -n 100 "$temporary/ffmpeg-configure.log" >&2; exit 1; }
  make -j "$jobs" ffmpeg > "$temporary/ffmpeg-build.log" 2>&1 || \
    { tail -n 100 "$temporary/ffmpeg-build.log" >&2; exit 1; }

  lipo ffmpeg -verify_arch "$clang_arch"
  if [[ "$clang_arch" == "$host_arch" ]]; then
    encoders="$(./ffmpeg -hide_banner -encoders)"
    protocols="$(./ffmpeg -hide_banner -protocols)"
    [[ "$encoders" == *libx264* && "$encoders" == *libmp3lame* && "$encoders" == *h264_videotoolbox* ]]
    [[ "$protocols" == *rtmp* && "$protocols" == *rtmps* ]]
    [[ "$(./ffmpeg -version)" != *--enable-nonfree* ]]
  fi
  [[ "$(otool -L ffmpeg)" != */opt/homebrew/* && "$(otool -L ffmpeg)" != */usr/local/* ]]
  cp COPYING.GPLv2 "$binary.LICENSE"
  cp ffmpeg "$binary"
)
cp "$temporary/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55/COPYING" \
  "$binary.x264.LICENSE"
cp "$temporary/lame-3.100/COPYING" "$binary.lame.LICENSE"
chmod 755 "$binary"
cat > "$binary.README" <<'EOF'
FFmpeg 6.1.1: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
x264 b35605ace3ddf7c1a5d67a2eb553f034aef41d55:
https://codeload.github.com/mirror/x264/tar.gz/b35605ace3ddf7c1a5d67a2eb553f034aef41d55
LAME 3.100: https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
The build recipe and hashes are in studio/scripts/build-macos-ffmpeg.sh.
The RTMPS patch is in studio/scripts/ffmpeg-securetransport-nonblocking.patch.
This GPLv2+ build targets macOS 12+, links x264 and LAME statically, and uses
macOS SecureTransport for RTMPS. It has no nonfree or Homebrew runtime dependency.
EOF
printf '%s\n' "$recipe_hash" > "$marker"
