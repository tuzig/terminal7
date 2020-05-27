# Terminal Seven

Welcome!

Terminal 7 is made for developers using tablets with full gestures support.
With Terminal 7, you can swipe to split a pane, tap it with two-fingers to zoom
and more (gestures for a complete list).  tmux is our inspiration and we 
strive to support as many of its functions as possible. 

The code here is mainly ES6 with no framworks. We use xterm.js for terminal
emulation, webpack to package the source and karma-mocha-chai for tests. 

For networking we use WebRTC, the
web standard protocol for real time communications. It's a UDP based web-era 
protocol with wide support and a great implmentation in go - webrtc - that we
use as a base for our server's daemon.

To use terminal 7 you'll need a server with ssh access. 
On first connection to the server Terminal 7 will download the `webexec` binary
and launch it to start WebRTC signalling, handle the connection, 
open pseaudo terminals, execute commands and pipe it all to Terminal 7.

## Installing

```console
npm i
```

## Running

```console
npm run start
```

## Testing

```console
npm test
```

