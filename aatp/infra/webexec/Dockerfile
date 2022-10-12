FROM ubuntu:latest
RUN apt update
RUN apt install -y git bash openssh-server golang
COPY ./aatp/infra/webexec/ssh_config /etc/ssh/
COPY ./aatp/infra/webexec/docker_entry.sh /entrypoint.sh
RUN /etc/init.d/ssh start
RUN useradd --create-home --shell /bin/bash -p VDueK9QTyseeA runner
ENV GOBIN=/usr/local/bin
RUN go install -v github.com/tuzig/webexec@latest
RUN mkdir /auth && chown runner:runner /auth
WORKDIR /home/runner
ENTRYPOINT ["bash", "-x", "/entrypoint.sh"]
