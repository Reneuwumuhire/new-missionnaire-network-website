#!/bin/sh
set -u

ICECAST_SOURCE_PASSWORD="${ICECAST_SOURCE_PASSWORD:-hackme}"
ICECAST_ADMIN_USER="${ICECAST_ADMIN_USER:-admin}"
ICECAST_ADMIN_PASSWORD="${ICECAST_ADMIN_PASSWORD:-hackme}"
ICECAST_HOSTNAME="${ICECAST_HOSTNAME:-localhost}"
STREAM_KEY="${STREAM_KEY:-obs}"
RTMP_PATH="${RTMP_PATH:-live}"
AUDIO_MOUNT="${AUDIO_MOUNT:-radio.mp3}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"
INPUT_PROTOCOL="${INPUT_PROTOCOL:-rtsp}"
ICECAST_PID=""
MTX_PID=""
RECORDER_PID=""

mkdir -p /tmp/icecast
touch /tmp/icecast/error.log /tmp/icecast/access.log
chown nobody:nogroup /tmp/icecast /tmp/icecast/error.log /tmp/icecast/access.log || true
chmod 775 /tmp/icecast || true
chmod 664 /tmp/icecast/error.log /tmp/icecast/access.log || true
mkdir -p /data/recordings
export ICECAST_SOURCE_PASSWORD ICECAST_ADMIN_USER ICECAST_ADMIN_PASSWORD ICECAST_HOSTNAME
envsubst < /app/icecast.xml.template > /app/icecast.xml

start_icecast() {
	echo "[stream] starting Icecast on :8000"
	chown nobody:nogroup /tmp/icecast /tmp/icecast/error.log /tmp/icecast/access.log || true
	icecast2 -c /app/icecast.xml &
	ICECAST_PID=$!
}

start_mediamtx() {
	echo "[stream] starting MediaMTX on :1935"
	mediamtx /app/mediamtx.yml &
	MTX_PID=$!
}

start_recorder() {
	if [ -z "${RECORDER_TOKEN:-}" ] || [ -z "${MONGODB_URI:-}" ] || [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
		echo "[recorder] skipping — RECORDER_TOKEN / MONGODB_URI / AWS_ACCESS_KEY_ID not set"
		return
	fi
	echo "[recorder] starting Node recorder on :8080"
	ICECAST_URL="${ICECAST_URL:-http://127.0.0.1:8000/${AUDIO_MOUNT}}" \
	RECORDINGS_DIR="${RECORDINGS_DIR:-/data/recordings}" \
	PORT="${RECORDER_PORT:-8080}" \
	MAX_RECORDING_SECONDS="${MAX_RECORDING_SECONDS:-14400}" \
	node /app/recorder/dist/server.js &
	RECORDER_PID=$!
}

start_icecast
start_mediamtx
start_recorder

cleanup() {
	echo "[stream] stopping child processes"
	kill -TERM "$ICECAST_PID" "$MTX_PID" ${RECORDER_PID:-} 2>/dev/null || true
	wait || true
	exit 0
}
trap cleanup INT TERM

sleep 2

ICECAST_URL_INGEST="icecast://source:${ICECAST_SOURCE_PASSWORD}@127.0.0.1:8000/${AUDIO_MOUNT}"

get_active_path() {
	api_payload="$(curl -fsS http://127.0.0.1:9997/v3/paths/list 2>/dev/null || true)"
	if [ -z "$api_payload" ]; then
		return 1
	fi

	if [ -n "$STREAM_KEY" ]; then
		preferred_path="${RTMP_PATH}/${STREAM_KEY}"
		preferred_ready="$(printf '%s' "$api_payload" | jq -r --arg p "$preferred_path" '.items[]? | select(.name == $p) | (.ready // false)')"
		if [ "$preferred_ready" = "true" ]; then
			printf '%s\n' "$preferred_path"
			return 0
		fi
	fi

	printf '%s' "$api_payload" | jq -r --arg prefix "${RTMP_PATH}/" '.items[]? | select((.ready // false) == true and (.name | startswith($prefix))) | .name' | head -n 1
}

echo "[stream] waiting for OBS stream on path prefix ${RTMP_PATH}/"

while true; do
	if [ -z "$ICECAST_PID" ] || ! kill -0 "$ICECAST_PID" 2>/dev/null; then
		echo "[stream] Icecast process exited, restarting"
		start_icecast
		sleep 1
	fi
	if [ -z "$MTX_PID" ] || ! kill -0 "$MTX_PID" 2>/dev/null; then
		echo "[stream] MediaMTX process exited, restarting"
		start_mediamtx
		sleep 1
	fi
	if [ -n "${RECORDER_TOKEN:-}" ] && { [ -z "$RECORDER_PID" ] || ! kill -0 "$RECORDER_PID" 2>/dev/null; }; then
		echo "[recorder] recorder process exited, restarting"
		start_recorder
		sleep 1
	fi

	ACTIVE_PATH="$(get_active_path || true)"
	if [ -z "$ACTIVE_PATH" ]; then
		echo "[stream] no active publisher yet on ${RTMP_PATH}/..., retrying in 2s"
		sleep 2
		continue
	fi

	case "$INPUT_PROTOCOL" in
	rtmp)
		INPUT_URL="rtmp://127.0.0.1:1935/${ACTIVE_PATH}"
		;;
	rtsp)
		INPUT_URL="rtsp://127.0.0.1:8554/${ACTIVE_PATH}"
		;;
	*)
		INPUT_URL="http://127.0.0.1:8888/${ACTIVE_PATH}/index.m3u8"
		;;
	esac
	echo "[stream] transcoding from ${INPUT_URL}"

	case "$INPUT_PROTOCOL" in
	rtsp)
		ffmpeg -nostdin -hide_banner -loglevel warning \
			-fflags +genpts+igndts+discardcorrupt \
			-thread_queue_size 1024 \
			-rtsp_transport tcp \
			-allowed_media_types audio \
			-i "${INPUT_URL}" \
			-map 0:a:0? -vn -c:a libmp3lame -b:a "${AUDIO_BITRATE}" -ar 48000 -ac 2 \
			-content_type audio/mpeg \
			-f mp3 "${ICECAST_URL_INGEST}"
		;;
	*)
		ffmpeg -nostdin -hide_banner -loglevel warning \
			-reconnect 1 -reconnect_streamed 1 -reconnect_on_network_error 1 -reconnect_delay_max 2 \
			-fflags +genpts+igndts+discardcorrupt \
			-thread_queue_size 1024 \
			-i "${INPUT_URL}" \
			-map 0:a:0? -vn -c:a libmp3lame -b:a "${AUDIO_BITRATE}" -ar 48000 -ac 2 \
			-content_type audio/mpeg \
			-f mp3 "${ICECAST_URL_INGEST}"
		;;
	esac

	echo "[stream] ffmpeg stopped; retrying in 2s"
	sleep 2
done
