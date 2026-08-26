FROM node:24-alpine

WORKDIR /app
ENV DEPLOY_TARGET=node

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "build/index.js"]
