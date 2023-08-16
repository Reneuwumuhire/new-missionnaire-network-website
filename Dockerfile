FROM node:20-alpine

RUN mkdir /app
COPY . /app
ARG YOUTUBE_API_KEY $YOUTUBE_API_KEY
ENV YOUTUBE_API_KEY $YOUTUBE_API_KEY
RUN echo "Value of YOUTUBE_API_KEY: $YOUTUBE_API_KEY"
RUN cd /app && \
    npm i && \
    npm run build

WORKDIR /app
CMD [ "node", "build/index.js" ]

