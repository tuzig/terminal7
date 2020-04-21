import "./css/terminal7.css"
import "./css/xterm.css"

// Small helpers you might want to keep

// ----------------------------------------------------------------------------
// Everything below is just to show you how it works. You can delete all of it.
// ----------------------------------------------------------------------------

import { Terminal } from 'xterm'

const term = new Terminal({cols: 40, rows: 12})
let state = 0
let lastWord = ""

const pane0 = document.getElementById('pane0')
console.log(term)
term.onKey( (keys, ev) => {
    let code = keys.key.charCodeAt(0)
    term.write(keys.key)
    if (code == 13) {
        let pc = new RTCPeerConnection({
            iceServers: [
              {
                urls: 'stun:stun.l.google.com:19302'
              }
            ]
        })
        let sendChannel = pc.createDataChannel('tmux -c')
        sendChannel.onclose = () => console.log('sendChannel has closed')
        sendChannel.onopen = () => console.log('sendChannel has opened')
        sendChannel.onmessage = e => log(`Message from DataChannel '${sendChannel.label}' payload '${e.data}'`)
        pc.oniceconnectionstatechange = e => log(pc.iceConnectionState)
        pc.onicecandidate = event => {
        if (event.candidate === null) {
          let offer = btoa(JSON.stringify(pc.localDescription))
          term.write("offer: "+offer)
          fetch('http://localhost:8888/connect', {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify({Offer: offer}) 
          }).then(response => response.text())
            .then(data => {
              let sd = new RTCSessionDescription(atob(data))
              term.write("sd: " + sd)
              try {
                pc.setRemoteDescription(sd)
              } catch (e) {
                alert(e)
        }})}}
        pc.onnegotiationneeded = e =>
            pc.createOffer().then(d => pc.setLocalDescription(d))
    }
    else
        lastWord += keys.key
})
term.open(document.getElementById('pane0'))
term.write("\tWelcome To Terminal Seven!\r\n")
term.write("\nWhere is your host: ")

window.sendMessage = () => {
  let message = document.getElementById('message').value
  if (message === '') {
    return alert('Message must not be empty')
  }
  sendChannel.send(message)
}
term.focus()
