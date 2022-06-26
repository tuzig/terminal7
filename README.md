# Terminal7 - A touchable terminal multiplexer running over WebRTC

<img width="1559" alt="Screen Shot 2022-01-06 at 22 31 04" src="https://user-images.githubusercontent.com/36852/148447779-959c7c92-d542-4737-9161-bfe009dc746a.png">  

![Test](https://github.com/tuzig/terminal7/workflows/Terminal7-Tests/badge.svg) ![License](https://img.shields.io/badge/license-GPL-green) ![Platform](https://img.shields.io/badge/platform-web-blue) ![Languages](https://img.shields.io/github/languages/top/tuzig/terminal7) ![Closed Issue](https://img.shields.io/github/issues-closed/tuzig/terminal7?color=A0A0A0) ![Open Issues](https://img.shields.io/github/issues/tuzig/terminal7)

Terminal7 is a terminal multiplexer designed for remote server and 
touch screens. A reincaranation of tmux and screen, Terminal7 supports
a smart client, a simple server with WebRTC data channels conencting them.
Thanks to WebRTC Terminal7 can connect to behind-the-NAT servers
letting you work on your desktop from anywhere.

The code here is mainly ES6 with no framworks. We do use the following projects:

- capacitorjs for app packaging
- xterm.js for terminal emulation
- yarn for package management
- vite for packaging
- vitest for testing

For networking we use SSH or WebRTC, the web standard protocol for real time
communications. It's a UDP based web-era protocol with wide support and a great
implmentation in go - [pion/webrtc](https://github.com/pion/webrtc) - that we use as a base for our server's daemon.

## Installing


```console
yarn install
```

## Running

To start terminal 7 in the browser use:

```console
yarn start
```

and point your browser at http://localhost:3000. use `npm run` for the list of
commands available

## WebRTC


Terminal7 can use WebRTC data channels to stream standard i/o, providing secure, fast communication.
Designed by the W3C for the mobile web, WebRTC let's T7 work well in bad internet weather and 
use a control data channel for advanced features like the clipboard integration
and file sharing (soon...). 

Our open source WebRTC server is written in go and is based on the pion server. 
You can install it using the one line installer or from the [source](https://github.com/tuzig/webexec)

```console
$(curl -sL https://get.webexec.sh)
```
## Contribuiting

We welcome bug reports, ideas for new features and pull requests.
Please feel free to open an issue or if you are ready to code yourself, follow these steps:

1. Fork it
2. Clone it
3. `yarn install`
4. Create your feature branch (git branch my-new-feature)
5. `yarn test` to test your changes
6. Commit your changes (git commit -am 'Add some feature')
7. Push to the branch (git push origin my-new-feature)
8. Open a new pull request
