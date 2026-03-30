FROM alpine:3.20

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY transcoder/start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENTRYPOINT ["/bin/sh", "/app/start.sh"]
