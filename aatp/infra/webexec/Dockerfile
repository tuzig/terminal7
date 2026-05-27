FROM golang:alpine

ARG REF=master

RUN apk update && apk add --no-cache git bash openssh-server

RUN mkdir /scripts
COPY ./aatp/infra/wait-for-it.sh /scripts/

RUN adduser -D -s /bin/bash -h /home/runner runner
RUN echo "runner:webexec" | chpasswd
ENV GOBIN=/usr/local/bin

RUN go install -v github.com/tuzig/webexec@${REF}
RUN mkdir /auth && chown runner:runner /auth
RUN ssh-keygen -A

WORKDIR /home/runner
COPY ./aatp/infra/webexec/docker_entry.sh /scripts/
COPY ./aatp/infra/webexec/ssh_config /etc/ssh/
ENTRYPOINT ["bash", "/scripts/docker_entry.sh"]
