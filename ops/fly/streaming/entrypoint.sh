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
SILENCE_PID=""
HLS_PID=""

mkdir -p /tmp/icecast
touch /tmp/icecast/error.log /tmp/icecast/access.log
chown nobody:nogroup /tmp/icecast /tmp/icecast/error.log /tmp/icecast/access.log || true
chmod 775 /tmp/icecast || true
chmod 664 /tmp/icecast/error.log /tmp/icecast/access.log || true
mkdir -p /data/recordings
export ICECAST_SOURCE_PASSWORD ICECAST_ADMIN_USER ICECAST_ADMIN_PASSWORD ICECAST_HOSTNAME AUDIO_MOUNT
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

# Always-on silence source feeding the /silence.mp3 fallback mount. Icecast
# moves ${AUDIO_MOUNT} listeners here whenever the real source drops (OBS
# reconnect, transcoder restart) and moves them back when it returns, so
# their connections survive instead of being torn down. Runs in its own
# supervisor subshell because the main loop below blocks inside the live
# transcoder while a broadcast is running and couldn't restart it.
# Same codec parameters as the live encode so the splice decodes cleanly.
start_silence_loop() {
	(
		sleep 3
		while true; do
			ffmpeg -nostdin -hide_banner -loglevel error \
				-re -f lavfi -i "anullsrc=r=48000:cl=stereo" \
				-c:a libmp3lame -b:a "${AUDIO_BITRATE}" -ar 48000 -ac 2 \
				-content_type audio/mpeg \
				-f mp3 "icecast://source:${ICECAST_SOURCE_PASSWORD}@127.0.0.1:8000/silence.mp3"
			echo "[silence] ffmpeg exited; retrying in 2s"
			sleep 2
		done
	) &
	SILENCE_PID=$!
}

start_icecast
start_mediamtx
start_recorder
start_silence_loop

cleanup() {
	echo "[stream] stopping child processes"
	kill -TERM "$ICECAST_PID" "$MTX_PID" ${RECORDER_PID:-} ${SILENCE_PID:-} ${HLS_PID:-} 2>/dev/null || true
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

# ── Live DVR: HLS packager ─────────────────────────────────────────
# Writes a rolling window of AAC/MPEG-TS segments to HLS_DIR; the recorder
# serves them read-only at :8443/hls/*. This is what gives listeners
# YouTube-style pause/resume + seek-back + jump-to-live: unlike the Icecast
# byte stream, the DVR window lives on the server, so a paused/rewound
# position stays valid for HLS_DVR_SEGMENTS × HLS_SEGMENT_SECONDS (~3h).
# Runs in its own supervisor subshell with its own publisher polling —
# independent from the Icecast transcode loop below.
#
# Codec: `-c:a copy` — OBS publishes AAC, which goes straight into MPEG-TS
# segments with ZERO encoding cost. This matters: the shared-cpu machine
# already runs the MP3 transcoder + silence encoder continuously, and a
# second full encode starved every service (stream stuttered at <1KB/s).
# hls.js and Apple's native player both accept AAC (and even MP3) in TS.
#
# Flag notes: omit_endlist keeps the playlist "live" across ffmpeg restarts
# (an ENDLIST would make players treat the stream as finished on every OBS
# blip); append_list+discont_start resumes the same playlist after a restart
# with a discontinuity marker; program_date_time stamps wall-clock on every
# segment, which the player uses for exact transcript sync; temp_file stops
# partially-written segments from ever being served; delete_segments +
# hls_delete_threshold bounds disk while keeping a grace margin for players
# parked at the window's tail.
HLS_DIR="${HLS_DIR:-/data/hls}"
HLS_SEGMENT_SECONDS="${HLS_SEGMENT_SECONDS:-6}"
HLS_DVR_SEGMENTS="${HLS_DVR_SEGMENTS:-1800}"
# Publisher gap (seconds) beyond which the next publisher counts as a NEW
# broadcast: the previous DVR window is wiped so listeners get a fresh
# timeline instead of one polluted with hours of a past broadcast (and so
# the playlist doesn't keep growing across sessions). Short gaps (OBS blip,
# transcoder restart) stay well under this and keep appending.
HLS_NEW_SESSION_GAP_SECONDS="${HLS_NEW_SESSION_GAP_SECONDS:-300}"

start_hls_loop() {
	(
		mkdir -p "${HLS_DIR}"
		sleep 3
		while true; do
			HLS_ACTIVE_PATH="$(get_active_path || true)"
			if [ -z "$HLS_ACTIVE_PATH" ]; then
				sleep 2
				continue
			fi
			# Freshness check via the playlist's mtime (persisted on the /data
			# volume, so this survives machine restarts): a playlist last
			# written more than the gap ago belongs to a previous broadcast.
			if [ -f "${HLS_DIR}/live.m3u8" ]; then
				m3u8_age=$(( $(date +%s) - $(stat -c %Y "${HLS_DIR}/live.m3u8" 2>/dev/null || echo 0) ))
				if [ "$m3u8_age" -gt "$HLS_NEW_SESSION_GAP_SECONDS" ]; then
					echo "[hls] new broadcast session (playlist ${m3u8_age}s old) — clearing previous DVR window"
					rm -f "${HLS_DIR}/live.m3u8" "${HLS_DIR}"/live-*.ts
				fi
			fi
			echo "[hls] packaging from rtsp://127.0.0.1:8554/${HLS_ACTIVE_PATH}"
			ffmpeg -nostdin -hide_banner -loglevel warning \
				-fflags +genpts+igndts+discardcorrupt \
				-rtsp_transport tcp \
				-allowed_media_types audio \
				-timeout 10000000 \
				-i "rtsp://127.0.0.1:8554/${HLS_ACTIVE_PATH}" \
				-map 0:a:0? -vn -c:a copy \
				-f hls \
				-hls_time "${HLS_SEGMENT_SECONDS}" \
				-hls_list_size "${HLS_DVR_SEGMENTS}" \
				-hls_delete_threshold 20 \
				-hls_flags delete_segments+append_list+omit_endlist+program_date_time+independent_segments+discont_start+temp_file \
				-hls_segment_filename "${HLS_DIR}/live-%08d.ts" \
				"${HLS_DIR}/live.m3u8"
			echo "[hls] ffmpeg exited; retrying in 1s"
			sleep 1
		done
	) &
	HLS_PID=$!
}

start_hls_loop

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
		# -timeout (µs): RTSP socket read timeout. Without it a half-dead TCP
		# session wedges this process silently — the Icecast source then sits
		# idle until source-timeout (60s) kicks it, i.e. up to a minute of dead
		# air. 10s makes a wedged read die fast so the loop restarts cleanly.
		ffmpeg -nostdin -hide_banner -loglevel warning \
			-fflags +genpts+igndts+discardcorrupt \
			-thread_queue_size 1024 \
			-rtsp_transport tcp \
			-allowed_media_types audio \
			-timeout 10000000 \
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

	echo "[stream] ffmpeg stopped; retrying in 1s"
	sleep 1
done
