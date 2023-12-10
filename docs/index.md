# Getting Started

Welcome to Terminal7's docs.
Terminal7 is an open source terminal emulator and touchable multiplexer running over SSH & WebRTC.
You can run Terminal7 either as an android/iOS app or in the browser.


## Getting Started
We welcome bug reports, ideas for new features and pull requests.
Please feel free to open an issue or if you are ready to code yourself fork
the repo, close it and:

```console
cd terminal7
yarn install
yarn test
```

To run the acceptance tests you'll need to have docker installed.
`./aatp/run` will use docker-compose, playwright, mailhog, mockserver and a few
more to setup a virtual lab and test complex scenarios.

To start terminal7 in the browser use:

```console
yarn start
```

and point your browser at http://localhost:5173 or similiar. 

### Installing the server

To connect from the browser you'll need the `webexec` agent running.
webexec is an
open source WebRTC server written in go and based on [pion](https://pion.ly). 
You can install it using the one line installer or from the [source](https://github.com/tuzig/webexec).

```console
  bash <(curl -sL https://get.webexec.sh)
```

