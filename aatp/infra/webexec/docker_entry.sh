#!/usr/bin/env bash

set -x
EXE="/usr/local/bin/webexec"
HOME=/home/runner
CONF=/conf


/etc/init.d/ssh start
rm -f $HOME/.local/run/webexec.*
mkdir -p $HOME/.config/webexec
cp -r $CONF/* /home/runner/.config/webexec
chown -R runner /home/runner
touch /auth/authorized_fingerprints
ln -fs /auth/authorized_fingerprints $HOME/.config/webexec
chown -R runner /home/runner /auth/authorized_fingerprints
sleep 1
su -c "$EXE start --debug" runner &
while true
do
    sleep 10
done
