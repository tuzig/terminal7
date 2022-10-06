FROM ubuntu:latest
RUN apt update
RUN apt install -y git bash openssh-server golang
COPY ./aatp/infra/webexec/config/ssh_config /etc/ssh/
COPY ./aatp/infra/webexec/docker_entry.sh /usr/local/bin
RUN /etc/init.d/ssh start
RUN useradd --create-home --shell /bin/bash -p VDueK9QTyseeA runner
ENV GOBIN=/usr/local/bin
RUN go install -v github.com/tuzig/webexec@latest
USER runner
WORKDIR /home/runner
CMD mkdir -p $HOME/.config/webexec && \
    cp -r /conf/*  $HOME/.config/webexec && \
    find . && \
    /usr/local/bin/webexec start --debug
