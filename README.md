# Terminal Seven

![Test](https://github.com/tuzig/terminal7/workflows/Terminal7-Tests/badge.svg)

Welcome!

Terminal 7 is a terminal multiplexer with full gesture support. 
With Terminal 7, you can swipe to split a pane, tap it with two fingers to zoom
and more (gestures for a complete list).  tmux is our inspiration and we strive
to support as many of its functions and features as possible. 

The code here is mainly ES6 with no framworks. We do use the following projects:
- cordova for app packaging
- xterm.js for terminal emulation
- webpack to package the source (do we really need it?)
- karma, mocha & chai for tests. 

For networking we use WebRTC, the web standard protocol for real time
communications. It's a UDP based web-era protocol with wide support and a great
implmentation in go - webrtc - that we use as a base for our server's daemon.

## Installing

Clone this repo and run the commands below. In your server you'll need to install
and run our backend project - [webexec](https://github.com/tuzig/webexec)


```console
gem install ffi -- --enable-system-libffi        # to install the gem manually
bundle config build.ffi --enable-system-libffi   # for bundle install
yarn install
npx cap sync ios
```

## Running

To start terminal 7 in the browser use:

```console
npm start
```

and point your browser at http://localhost:3333

Terminal7 adds a global `window.terminal7` you can use in the debugger.

## Development

We welcome bug reports as well as ideas for new features.
If you are ready to code yourslef, follow these steps:

1. Fork it
2. Clone it
3. `npm i`
4. Create your feature branch (git branch my-new-feature)
5. Commit your changes (git commit -am 'Add some feature')
6. Push to the branch (git push origin my-new-feature)
7. Create new Pull Request

Please run `npm test` before pushing.
