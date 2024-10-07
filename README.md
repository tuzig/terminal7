# Terminal7 - A touchable terminal multiplexer running over WebRTC

<img width="1559" alt="Screen Shot 2022-01-06 at 22 31 04"
src="https://user-images.githubusercontent.com/36852/148447779-959c7c92-d542-4737-9161-bfe009dc746a.png">  

![Tests](https://github.com/tuzig/terminal7/actions/workflows/validate.yml/badge.svg)
![License](https://img.shields.io/badge/license-GPL-green)
![Platform](https://img.shields.io/badge/platform-web-blue)
![Languages](https://img.shields.io/github/languages/top/tuzig/terminal7)
![Closed
Issue](https://img.shields.io/github/issues-closed/tuzig/terminal7?color=A0A0A0)
![Open Issues](https://img.shields.io/github/issues/tuzig/terminal7)

Terminal7 is a terminal that includes a terminal multiplexer made for modern
web clients and real time communications over WebRTC. 
A reincaranation of screen and tmux, Terminal7 is a hybrid
app that designed for smart clients.

The code here is in vanilla TypeSctipt, relying chiefly on the following projects:

- CapacitorJS for app packaging & plugins
- Xterm.js for terminal emulation
- noble-ed25519 for key generation
- pion.ly for the WebRTC backend
- Vite for packaging
- Vitest for testing
- Docker compose for acceptance tests
- Playwright for end-to-end tests
- MailHog for an SMRP test double

For networking on native clients, we support SSH as a fallback.
On the web, only WebRTC servers are supported.
Our WebRTC server is writtten in go and is based on 
[pion/webrtc](https://github.com/pion/webrtc).
It supports both direct and relayed connections, and can be used with or without a TURN server.

If you're having problems with your first connection, please refer to our 
[troubleshooting guide](https://github.com/tuzig/terminal7/blob/master/docs/troubleshooting.md).

## Installation
For web platforms, Terminal7 is packaged as a Progressive Web App (PWA) and can be installed from the browser.
Click [here](https://pwa.terminal7.dev) for the latest version.

For tablers, you can get Terminal7 for free from the 
[App Store](https://apps.apple.com/il/app/terminal7/id1532882447) or
[Google Play](https://play.google.com/store/apps/details?id=dev.terminal).

## Installing the server

To connect from the browser you'll need the [webexec](https://github.com/tuzig/webexec) agent running.
webexec is an
open source WebRTC server written in go and based on [pion](https://pion.ly).
Terminal7 should offer to install it for you, but if it doesn't,
open TWR and run `install` to ensure your agent is up.

If you that doesn't work you can install webexec using go:

```console
go install github.com/tuzig/webexec@latest
webexec start
```

If you don't have go, you can use our line installer to download the binary for your system and start it:

```console
  bash <(curl -sL https://get.webexec.sh)
```

webexec will start an HTTP WHIP server on port 7777, waiting for the client to connect.
If pperbook user is set, webexec will also connect to peerbook.io so it can accept connections
even when behind-the-NAT.

webexec's CLI has a growing set of commands, use `webexec` to get help on the current set.

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

## Contributing

We are looking for contributors to help us improve Terminal7.
Please read our [contributing guide](./CONTRIBUTING.md) before rolling your sleeves.
