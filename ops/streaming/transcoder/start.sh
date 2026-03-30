#!/bin/sh

RTMP_URL="${RTMP_URL:-rtmp://mediamtx:1935/live/obs}"
ICECAST_URL="${ICECAST_URL:-icecast://source:hackme@icecast:8000/radio.mp3}"

echo "Waiting for OBS stream on ${RTMP_URL}"

while true; do
	ffmpeg -nostdin -hide_banner -loglevel info \
		-i "${RTMP_URL}" \
		-vn -c:a libmp3lame -b:a 128k -ar 48000 -ac 2 \
		-content_type audio/mpeg \
		-f mp3 "${ICECAST_URL}"

	echo "ffmpeg stopped. Retrying in 2s..."
	sleep 2
done
