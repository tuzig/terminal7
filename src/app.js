import "./stylesheets/main.css"
import "./stylesheets/xterm.css"

// Small helpers you might want to keep
import "./helpers/context_menu.js"
import "./helpers/external_links.js"

// ----------------------------------------------------------------------------
// Everything below is just to show you how it works. You can delete all of it.
// ----------------------------------------------------------------------------

import jetpack from "fs-jetpack"
import env from "env"
// import Peer from "peerjs"

import { Terminal } from 'xterm'

const term = new Terminal()

const pane0 = document.getElementById('pane0')
term.open(document.getElementById('pane0'))
term.write("Starting Connection\r\n")

term.focus()

/*
let peer = new Peer('ttmux', {host: 'localhost', port: 9000, path: '/'})

peer.on('connection', function (conn) {
    conn.on('data', function (data) {
        term.write(data)
    })
})
*/
let pc = new RTCPeerConnection({
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    }
  ]
})
let log = msg => {
  term.write(msg + '\r\n')
}

let sendChannel = pc.createDataChannel('tmux -v')
sendChannel.onclose = () => console.log('sendChannel has closed')
sendChannel.onopen = () => {
    console.log('sendChannel has opened')
    sendChannel.send("password")
}
sendChannel.onmessage = e => term.write(e.data)
term.onData(d =>  sendChannel.send(d))

pc.oniceconnectionstatechange = e => log(pc.iceConnectionState)
pc.onicecandidate = event => {
  if (event.candidate === null) {
      term.write(btoa(JSON.stringify(pc.localDescription)))
  }
}

pc.onnegotiationneeded = e =>
  pc.createOffer().then(d => pc.setLocalDescription(d)).catch(log)

window.sendMessage = () => {
  let message = document.getElementById('message').value
  if (message === '') {
    return alert('Message must not be empty')
  }
}

window.startSession = (sd) => {
  try {
    pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(atob(sd))))
  } catch (e) {
    alert(e)
  }
}
