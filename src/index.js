import "./css/terminal7.css"
import "./css/xterm.css"
import { Panes } from "./windows.js"

var host
window.panes = new Panes()
let pane = window.panes.add({id: "p0", sx: 20, sy: 20})
let term = pane.t
let state = 0
let sendChannel = null
/*
});
*/
window.pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      }
    ]
})
window.onresize = () => pane.onresize()
pane.createElement("full")
pane.openTerminal()
pane.fit()
pane.t.onKey( (keys, ev) => {
    let code = keys.key.charCodeAt(0)
    if (pane.state == 3) {
        pane.d.send(keys.key)
        return
    }
    term.write(keys.key)
    if (state<=2 && code == 13) {
        console.log(state+"=>3")
        console.log(host)
        state = 3
        term.write("\n\r\n\r")
        pc.oniceconnectionstatechange = e => {
            console.log(pc.iceConnectionState)
            if (pc.iceConnectionState == 'disconnected') {
                term.write("\nServer disconnected.\n.\n")
                Connect()
            }
        }
        pc.onicecandidate = event => {
        if (event.candidate === null) {
          let offer = btoa(JSON.stringify(pc.localDescription))
          term.write("Signaling server...\n")
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
        pane.openDC()
    }
    else if (state == 1) {
        console.log("1=>2")
        console.log(host)
        host = keys.key
        state = 2
    } else if (state == 2)
        console.log("2")
        host += keys.key
})

function Connect() {
    host = window.location.href.substring(7, window.location.href.indexOf(":", 7))+":8888"
    term.write("\nWhere is your host: ("+host+") ")
    state = 1
    term.focus()
}
term.write("\tWelcome To Terminal Seven!\r\n")
Connect()
