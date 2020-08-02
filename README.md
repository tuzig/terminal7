# Terminal Seven

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

Just clone this repo and run `npm i`. In your server you'll need to install
and run our backend project - [webexec](https://github.com/tuzig/webexec)

## Running

To start terminal 7 in the browser use:

```console
cordova run browser
```

and point your browser at http://localhost:8000.


### Remote Develpoment

If you're developing using a remote terminal things are a bit more
complicated as cordova support only localhost. You'll have to use a web server
to proxy the localport. 
For nginx you need to create a file in `/etc/nginx/sites-enabled` and add there:

```
server {
        listen 8000;

        location / {
                # cordova run will use 8001 because nginx has 8000
                proxy_pass http://localhost:8001;
        }

}
```

## Testing

```console
npm test
```
