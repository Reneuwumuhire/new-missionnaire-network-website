# syntax=docker/dockerfile:1.7
# Build context must be the REPO ROOT so we can reach ops/streaming/recorder.
# Deploy with: flyctl deploy --config ops/fly/streaming/fly.toml \
#                            --dockerfile ops/fly/streaming/Dockerfile

# ── Stage 1: compile the recorder (TypeScript → JS) ──
FROM node:22-slim AS recorder-build

WORKDIR /build
COPY ops/streaming/recorder/package.json ops/streaming/recorder/tsconfig.json ./
RUN npm install
COPY ops/streaming/recorder/src ./src
RUN npx tsc

# ── Stage 2: final image with streaming stack + Node runtime ──
FROM debian:bookworm-slim

ARG MEDIAMTX_VERSION=v1.15.5

RUN set -eux; \
	apt-get update; \
	DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
		ca-certificates \
		curl \
		ffmpeg \
		gettext-base \
		gnupg \
		icecast2 \
		jq \
		tini; \
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; \
	apt-get install -y --no-install-recommends nodejs; \
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
	rm -rf /tmp/mediamtx /tmp/mediamtx.tar.gz /var/lib/apt/lists/*

WORKDIR /app

COPY ops/fly/streaming/mediamtx.yml /app/mediamtx.yml
COPY ops/fly/streaming/icecast.xml.template /app/icecast.xml.template
COPY ops/fly/streaming/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Recorder runtime: production deps + compiled JS
COPY ops/streaming/recorder/package.json /app/recorder/package.json
RUN cd /app/recorder && npm install --omit=dev
COPY --from=recorder-build /build/dist /app/recorder/dist

RUN mkdir -p /data/recordings

EXPOSE 1935 8000 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
