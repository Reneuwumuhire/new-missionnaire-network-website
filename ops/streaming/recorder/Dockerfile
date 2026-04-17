FROM node:22-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY recorder/package.json recorder/package-lock.json* ./
RUN npm install --omit=dev

COPY recorder/tsconfig.json ./
COPY recorder/src ./src

RUN npm install --save-dev typescript \
	&& npx tsc \
	&& npm uninstall typescript

RUN mkdir -p /data/recordings
VOLUME ["/data/recordings"]

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
