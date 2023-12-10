# Troubleshooting

## Reset the app

When things go south close the app and relaunch it. 
If that didn't help, read on

## WebRTC issues

If you're having problem connecting over WebRTC,
connect over SSH and run `webexec status` to ensure your agent is up.
If it's not, run `webexec start` to get it going.

If it fails to start, there's a log file
at `~/.local/state/webexec/webexec.log`.
To make sense of it, please send us the snippet to `#support`.

If it's already running, use `webexec restart` and keep your fingers crossed.

### PeerBook issues

PeerBook's connection status is displayed in the map's legend, just to the right of `PeerBook`. It can be one of:

- 📡 if solid - all is well, when flashing connection setup is in progress
- 🔒 if you're not subscribed
- 🚱 if there's a version mismatch - ensure you have the latest version

On the map, PeerBook gates should have a small 📖 to the the right of their name.
If the book is greyed out it means the Peer is offline and Terminal7 will use SSH.
If it's not a book but a locked shield it means the peer is unverified.
Tap it to enter an OTP and verify it.

If the gates don't look as expected, you'll need to ensure your peerbook up to date.
Head over to http://peerbook.io and enter your email to 
get a short lived url you can use to review and update your peerbook.

## Further Assistance

There'a `#support` channel at our [discord server](https://discord.com/invite/rDBj8k4tUE),
please free to chat with us there.
