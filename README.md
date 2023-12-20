# Terminal7 - A touchable terminal multiplexer running over WebRTC

<img width="1559" alt="Screen Shot 2022-01-06 at 22 31 04"
src="https://user-images.githubusercontent.com/36852/148447779-959c7c92-d542-4737-9161-bfe009dc746a.png">  

![Test](https://github.com/tuzig/terminal7/workflows/Terminal7-Tests/badge.svg)
![License](https://img.shields.io/badge/license-GPL-green)
![Platform](https://img.shields.io/badge/platform-web-blue)
![Languages](https://img.shields.io/github/languages/top/tuzig/terminal7)
![Closed
Issue](https://img.shields.io/github/issues-closed/tuzig/terminal7?color=A0A0A0)
![Open Issues](https://img.shields.io/github/issues/tuzig/terminal7)

Terminal7 is a terminal multiplexer re-designed for remote servers and 
hi-res touch screens. A reincaranation of tmux and screen, Terminal7 is a hybrid
app that works best on the iPad.

The code here is mainly ES6 with no framworks. We do use the following projects:

- capacitorjs for app packaging & plugins
- xterm.js for terminal emulation
- noble-ed25519 for key generation
- pion.ly for the WebRTC backend
- vite for packaging
- vitest for testing

For networking we use SSH or WebRTC, the web standard for real time
communications. WebRTC is UDP based with wide support and a great
implmentation in go - [pion/webrtc](https://github.com/pion/webrtc) -
that we use as a base for our server's agent.

If you're having problems with your first connection, please refer to our 
[troubleshooting guide](https://github.com/tuzig/terminal7/blob/master/docs/troubleshooting.md)

We welcome new contributors and happy to help, talk to us on our
[discord server](https://discord.com/invite/rDBj8k4tUE).
Onboarding is pretty simple and well documented at https://dev.terminal7.dev .

## WebRTC

Terminal7 can use WebRTC data channels to stream standard i/o, providing secure, fast communication.
Designed by the W3C for the mobile web, WebRTC let's T7 work well in bad internet weather and 
use a control data channel for advanced features like the clipboard integration
and file sharing (soon...). 

Terminal7's open source WebRTC server is written in go and is based on the pion server. 
You can install it using the one line installer or from the [source](https://github.com/tuzig/webexec)

```console
  bash <(curl -sL https://get.webexec.sh)
```

