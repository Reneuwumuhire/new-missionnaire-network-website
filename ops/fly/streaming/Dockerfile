FROM debian:bookworm-slim

ARG MEDIAMTX_VERSION=v1.15.5

RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
		ca-certificates \
		curl \
		ffmpeg \
		gettext-base \
		icecast2 \
		jq \
		tini \
	&& rm -rf /var/lib/apt/lists/*

RUN set -eux; \
	arch="$(dpkg --print-architecture)"; \
	case "$arch" in \
	amd64) mtx_arch="amd64" ;; \
	arm64) mtx_arch="arm64" ;; \
	*) echo "Unsupported architecture: ${arch}" && exit 1 ;; \
	esac; \
	curl -fsSL -o /tmp/mediamtx.tar.gz "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${mtx_arch}.tar.gz"; \
	mkdir -p /tmp/mediamtx; \
	tar -xzf /tmp/mediamtx.tar.gz -C /tmp/mediamtx; \
	install -m 0755 /tmp/mediamtx/mediamtx /usr/local/bin/mediamtx; \
	rm -rf /tmp/mediamtx /tmp/mediamtx.tar.gz

WORKDIR /app

RUN cat <<'EOF' > /app/mediamtx.yml
logLevel: info

api: yes

rtmp: yes
rtmpAddress: :1935

hls: no
webrtc: no
rtsp: yes
rtspAddress: :8554
srt: no

paths:
  all_others:
    source: publisher
EOF

RUN cat <<'EOF' > /app/icecast.xml.template
<icecast>
  <location>Fly.io</location>
  <admin>admin@localhost</admin>
  <hostname>${ICECAST_HOSTNAME}</hostname>
  <background>0</background>

  <limits>
    <clients>1000</clients>
    <sources>5</sources>
    <queue-size>524288</queue-size>
    <client-timeout>30</client-timeout>
    <header-timeout>15</header-timeout>
    <source-timeout>10</source-timeout>
    <burst-on-connect>1</burst-on-connect>
    <burst-size>65535</burst-size>
  </limits>

  <authentication>
    <source-password>${ICECAST_SOURCE_PASSWORD}</source-password>
    <relay-password>${ICECAST_SOURCE_PASSWORD}</relay-password>
    <admin-user>${ICECAST_ADMIN_USER}</admin-user>
    <admin-password>${ICECAST_ADMIN_PASSWORD}</admin-password>
  </authentication>

  <listen-socket>
    <bind-address>0.0.0.0</bind-address>
    <port>8000</port>
  </listen-socket>

  <fileserve>1</fileserve>

  <paths>
    <basedir>/usr/share/icecast2</basedir>
    <logdir>/tmp/icecast</logdir>
    <webroot>/usr/share/icecast2/web</webroot>
    <adminroot>/usr/share/icecast2/admin</adminroot>
    <alias source="/" destination="/status.xsl"/>
  </paths>

  <logging>
    <accesslog>access.log</accesslog>
    <errorlog>error.log</errorlog>
    <loglevel>3</loglevel>
    <logsize>10000</logsize>
  </logging>

  <security>
    <chroot>0</chroot>
    <changeowner>
      <user>nobody</user>
      <group>nogroup</group>
    </changeowner>
  </security>
</icecast>
EOF

RUN cat <<'EOF' > /app/entrypoint.sh
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

mkdir -p /tmp/icecast
touch /tmp/icecast/error.log /tmp/icecast/access.log
chown nobody:nogroup /tmp/icecast /tmp/icecast/error.log /tmp/icecast/access.log || true
chmod 775 /tmp/icecast || true
chmod 664 /tmp/icecast/error.log /tmp/icecast/access.log || true
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

start_icecast
start_mediamtx

cleanup() {
	echo "[stream] stopping child processes"
	kill -TERM "$ICECAST_PID" "$MTX_PID" 2>/dev/null || true
	wait || true
	exit 0
}
trap cleanup INT TERM

sleep 2

ICECAST_URL="icecast://source:${ICECAST_SOURCE_PASSWORD}@127.0.0.1:8000/${AUDIO_MOUNT}"

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
			-f mp3 "${ICECAST_URL}"
		;;
	*)
		ffmpeg -nostdin -hide_banner -loglevel warning \
			-reconnect 1 -reconnect_streamed 1 -reconnect_on_network_error 1 -reconnect_delay_max 2 \
			-fflags +genpts+igndts+discardcorrupt \
			-thread_queue_size 1024 \
			-i "${INPUT_URL}" \
			-map 0:a:0? -vn -c:a libmp3lame -b:a "${AUDIO_BITRATE}" -ar 48000 -ac 2 \
			-content_type audio/mpeg \
			-f mp3 "${ICECAST_URL}"
		;;
	esac

	echo "[stream] ffmpeg stopped; retrying in 2s"
	sleep 2
done
EOF

RUN chmod +x /app/entrypoint.sh

EXPOSE 1935 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
