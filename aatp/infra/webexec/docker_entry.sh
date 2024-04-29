#!/usr/bin/env bash

set -x

HOME=/home/runner
CONF=/conf
/usr/sbin/sshd
rm -rf $HOME/.local/state/webexec
mkdir -p $HOME/.config/webexec
cp -r $CONF/* /home/runner/.config/webexec
chown -R runner /home/runner
touch /auth/authorized_fingerprints
ln -fs /auth/authorized_fingerprints $HOME/.config/webexec
chown -R runner /home/runner /auth/authorized_fingerprints
# remove this when we solve #83
if [[ $PEERBOOK == "1" ]]
then
    /scripts/wait-for-it.sh -h peerbook -p 17777
fi
trap 'break' SIGTERM
su - runner -c "WEBEXEC_SERVER_URL=$WEBEXEC_SERVER_URL /usr/local/bin/webexec start --debug"
while true
do
    sleep 3
done
