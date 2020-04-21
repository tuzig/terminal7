import "./css/terminal7.css"
import "./css/xterm.css"

// Small helpers you might want to keep

// ----------------------------------------------------------------------------
// Everything below is just to show you how it works. You can delete all of it.
// ----------------------------------------------------------------------------

import { Terminal } from 'xterm'

const term = new Terminal({cols: 60, rows: 20, convertEol: true})
let state = 0
let host = ""
let sendChannel = null

const pane0 = document.getElementById('pane0')
console.log(term)
term.onKey( (keys, ev) => {
    let code = keys.key.charCodeAt(0)
    term.write(keys.key)
    if (state == 2) {
        sendChannel.send(keys.key)
    }
    else if (code == 13) {
        let pc = new RTCPeerConnection({
            iceServers: [
              {
                urls: 'stun:stun.l.google.com:19302'
              }
            ]
        })

        state = 1
        sendChannel = pc.createDataChannel('/bin/bash -i')
        sendChannel.onclose = () => term.write('Data Channel is closed\n')
        sendChannel.onopen = () => {
            term.write('Data Channel is open\n')
            state = 2
        }
        sendChannel.onmessage = m => {
            term.write(m.data)
        }
        pc.oniceconnectionstatechange = e => console.log(pc.iceConnectionState)
        pc.onicecandidate = event => {
        if (event.candidate === null) {
          let offer = btoa(JSON.stringify(pc.localDescription))
          term.write("Signaling server...")
          fetch('http://'+host+'/connect', {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify({Offer: offer}) 
          }).then(response => response.text())
            .then(data => {
              let sd = new RTCSessionDescription(JSON.parse(atob(data)))
                term.write("Got Session Description\n")
              try {
                pc.setRemoteDescription(sd)
              } catch (e) {
                alert(e)
        }})}}
        pc.onnegotiationneeded = e => 
            pc.createOffer().then(d => pc.setLocalDescription(d))
    }
    else
        host += keys.key
})
term.open(document.getElementById('pane0'))
term.write("\tWelcome To Terminal Seven!\r\n")
term.write("\nWhere is your host: ")
term.focus()
