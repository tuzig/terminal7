FROM golang:alpine
ARG REF=master
RUN apk update
RUN apk add git bash
RUN addgroup -S peerbook && adduser -S peerbook -G peerbook
USER peerbook
RUN go install github.com/go-delve/delve/cmd/dlv@latest
WORKDIR /home/peerbook
RUN git clone https://github.com/tuzig/peerbook src
WORKDIR /home/peerbook/src
RUN git checkout $REF
RUN go get ./...
ENV REDIS_HOST=redis:6379
ENV PB_STATIC_ROOT=/home/peerbook/src/peerbook/html
EXPOSE 17777
CMD go run . -addr 0.0.0.0:17777
