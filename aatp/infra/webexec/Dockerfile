FROM ubuntu:latest
RUN apt update
RUN apt install -y git bash openssh-server golang
COPY ./aatp/infra/webexec/ssh_config /etc/ssh/
RUN mkdir /scripts
COPY ./aatp/infra/webexec/docker_entry.sh /scripts/
COPY ./aatp/infra/wait-for-it.sh /scripts/
RUN useradd --create-home --shell /bin/bash -p VDueK9QTyseeA runner
ENV GOBIN=/usr/local/bin
RUN go install -v github.com/tuzig/webexec@latest
RUN mkdir /auth && chown runner:runner /auth
WORKDIR /home/runner
ENTRYPOINT ["bash", "-x", "/scripts/docker_entry.sh"]
