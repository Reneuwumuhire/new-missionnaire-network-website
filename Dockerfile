FROM node:20-alpine

RUN mkdir /app
COPY . /app
ENV YOUTUBE_API_KEY $YOUTUBE_API_KEY
RUN cd /app && \
    npm i && \
    npm run build

WORKDIR /app
CMD [ "node", "build/index.js" ]

