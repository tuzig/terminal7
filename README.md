# Terminal7 - A touchable terminal multiplexer running over WebRTC

<img width="1559" alt="Screen Shot 2022-01-06 at 22 31 04"
src="https://user-images.githubusercontent.com/36852/148447779-959c7c92-d542-4737-9161-bfe009dc746a.png">  

![Test](https://github.com/tuzig/terminal7/actions/workflows/validate.yml/badge.svg)
![License](https://img.shields.io/badge/license-GPL-green)
![Platform](https://img.shields.io/badge/platform-web-blue)
![Languages](https://img.shields.io/github/languages/top/tuzig/terminal7)
![Closed
Issue](https://img.shields.io/github/issues-closed/tuzig/terminal7?color=A0A0A0)
![Open Issues](https://img.shields.io/github/issues/tuzig/terminal7)

Terminal7 is a terminal multiplexer re-designed for remote servers and 
hi-res touch screens. A reincaranation of tmux and screen, Terminal7 is a hybrid
app that works best on the iPad.

The code here is in vanilla TypeSctipt. We do use the following projects:

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

We welcome new contributors and are happy to help, talk to us on our
[discord server](https://discord.com/invite/rDBj8k4tUE).

## Getting Started
You can get Terminal7 from the [App Store](https://apps.apple.com/us/app/terminal7/id1581440136) or [Google Play](https://play.google.com/store/apps/details?id=io.terminal7.app).

To run from source, fork the repo, install the dependencies and run the tests:

```console
git clone git@github.com:<yourname>/terminal7.git
cd terminal7
yarn install
yarn test
```
To start terminal7 in the browser use `yarn start` 
then point your browser at the printed URL, usually http://localhost:5173.

## Installing the server

To connect from the browser you'll need the [webexec](https://github.com/tuzig/webexec) agent running.
webexec is an
open source WebRTC server written in go and based on [pion](https://pion.ly).
Terminal7 should offer to install it for you, but if it doesn't,
open TWR and run `install` to ensure your agent is up.

If you have Go installed run:

```console
go install github.com/tuzig/webexec@latest
webecec start
```

If you don't, you can also use our line installer to download the binary for your system and start it:

```console
  bash <(curl -sL https://get.webexec.sh)
```

## Clipboard integration

Terminal7 has a clipboard integration that works over WebRTC.
From the CLI you can:

- `webexec copy < FILE` to get the file into the client's clipboard
- `webexec paste` to print rhe client's clipboard to stdout

If no peer are actives, e.g. you're using a classic terminal, webexec will look for the tools:

- pbcopy, pbpaste on MacOS
- xclip, xsel on Linux

neovim integration will let you use use the `+` and `*` named buffer 
to copy to and from the clipboard. Just 12 lines in your init.lua:

```lua
    vim.g.clipboard = {
        name = 'webexec',
        copy = {
            ["+"] = {'webexec', 'copy'},
            ["*"] = {'webexec', 'copy'},
        },
        paste = {
            ["+"] = {'webexec', 'paste'},
            ["*"] = {'webexec', 'paste'},
        },
        cache_enabled = true,
    }
```

When webexec is not install, neovim will try the default clipboard tools like xclip or pbcopy.

## Running the acceptance tests

 TL;DR: run docker and `./aatp/run` 

Terminal7 has a suite of acceptance tests that run over a docker compose virtual lab.
They include end-to-end tests and run on PRs to ensure the code is solid.
To learn more about the tests, please refer to [./aatp/README.md](./aatp/README.md) documentation.
