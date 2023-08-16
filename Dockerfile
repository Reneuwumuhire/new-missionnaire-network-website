FROM node:20-alpine

RUN mkdir /app
COPY . /app
RUN cd /app && \
    npm i && \
    npm run build

WORKDIR /app
CMD [ "node", "build/index.js" ]

