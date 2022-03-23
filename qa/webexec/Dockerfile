FROM golang:alpine
ARG BRANCH=master
RUN apk update
RUN apk add git bash
RUN addgroup -S webexec && adduser -S webexec -G webexec
USER webexec
WORKDIR /home/webexec
RUN git clone https://github.com/tuzig/webexec src
WORKDIR /home/webexec/src
RUN git checkout $BRANCH
RUN go get ./...
CMD go run . start --debug
