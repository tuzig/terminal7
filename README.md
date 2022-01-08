# Terminal7
![Test](https://github.com/tuzig/terminal7/workflows/Terminal7-Tests/badge.svg) ![License](https://img.shields.io/badge/license-GPL-green) ![Platform](https://img.shields.io/badge/platform-web-blue) ![Languages](https://img.shields.io/github/languages/top/tuzig/terminal7) ![Closed Issue](https://img.shields.io/github/issues-closed/tuzig/terminal7?color=A0A0A0) ![Open Issues](https://img.shields.io/github/issues/tuzig/terminal7)

<img width="1559" alt="Screen Shot 2022-01-06 at 22 31 04" src="https://user-images.githubusercontent.com/36852/148447779-959c7c92-d542-4737-9161-bfe009dc746a.png">  

# Welcome!

Terminal 7 is a terminal multiplexer with full gesture support. 
With Terminal 7, you can swipe to split a pane, tap it with two fingers to zoom
and more (gestures for a complete list).  tmux is our inspiration and we strive
to support as many of its functions and features as possible. 

The code here is mainly ES6 with no framworks. We do use the following projects:

- capacitorjs for app packaging
- xterm.js for terminal emulation
- webpack to package the source
- karma, mocha & chai for tests.

For networking we use WebRTC, the web standard protocol for real time
communications. It's a UDP based web-era protocol with wide support and a great
implmentation in go - [pion/webrtc](https://github.com/pion/webrtc) - that we use as a base for our server's daemon.

## Installing

Clone this repo and run the commands below. In your server you'll need to install
and run our backend project - [webexec](https://github.com/tuzig/webexec)


```console
yarn install
```

## Running

To start terminal 7 in the browser use:

```console
npm start
```

and point your browser at http://localhost:3333

Terminal7 adds a global `window.terminal7` you can use in the debugger.

## Contribuiting

We welcome bug reports and ideas for new features.
Please feel free to open an issue or if you are ready to code yourself, follow these steps:

1. Fork it
2. Clone it
3. `yarn`
4. Create your feature branch (git branch my-new-feature)
5. `npm test` to test your changes
6. Commit your changes (git commit -am 'Add some feature')
7. Push to the branch (git push origin my-new-feature)
8. Open a new Pull Request
