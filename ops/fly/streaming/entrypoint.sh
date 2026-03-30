#!/bin/sh
set -eu

ICECAST_SOURCE_PASSWORD="${ICECAST_SOURCE_PASSWORD:-hackme}"
ICECAST_ADMIN_USER="${ICECAST_ADMIN_USER:-admin}"
ICECAST_ADMIN_PASSWORD="${ICECAST_ADMIN_PASSWORD:-hackme}"
STREAM_KEY="${STREAM_KEY:-obs}"
RTMP_PATH="${RTMP_PATH:-live}"
AUDIO_MOUNT="${AUDIO_MOUNT:-radio.mp3}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"

mkdir -p /tmp/icecast
export ICECAST_SOURCE_PASSWORD ICECAST_ADMIN_USER ICECAST_ADMIN_PASSWORD
envsubst < /app/icecast.xml.template > /app/icecast.xml

echo "[stream] starting Icecast on :8000"
icecast2 -c /app/icecast.xml &
ICECAST_PID=$!

echo "[stream] starting MediaMTX on :1935"
mediamtx /app/mediamtx.yml &
MTX_PID=$!

cleanup() {
	echo "[stream] stopping child processes"
	kill -TERM "$ICECAST_PID" "$MTX_PID" 2>/dev/null || true
	wait || true
	exit 0
}
trap cleanup INT TERM

sleep 2

RTMP_URL="rtmp://127.0.0.1:1935/${RTMP_PATH}/${STREAM_KEY}"
ICECAST_URL="icecast://source:${ICECAST_SOURCE_PASSWORD}@127.0.0.1:8000/${AUDIO_MOUNT}"

echo "[stream] waiting for OBS stream on ${RTMP_URL}"

while true; do
	if ! kill -0 "$ICECAST_PID" 2>/dev/null; then
		echo "[stream] Icecast process exited"
		exit 1
	fi
	if ! kill -0 "$MTX_PID" 2>/dev/null; then
		echo "[stream] MediaMTX process exited"
		exit 1
	fi

	ffmpeg -nostdin -hide_banner -loglevel info \
		-i "${RTMP_URL}" \
		-vn -c:a libmp3lame -b:a "${AUDIO_BITRATE}" -ar 48000 -ac 2 \
		-content_type audio/mpeg \
		-f mp3 "${ICECAST_URL}"

	echo "[stream] ffmpeg stopped; retrying in 2s"
	sleep 2
done
