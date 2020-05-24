import "./css/terminal7.css"
import "./css/xterm.css"
import { Terminal7 } from "./terminal7.js"

var host, pc
var terminal7 = new Terminal7({paneMargin: 0.01})
terminal7.open(document.getElementById('terminal7'))
let pane = terminal7.panes[0]
let term = pane.openTerminal()
let state = 0
let sendChannel = null

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
        pc = new RTCPeerConnection({
            iceServers: [
              {
                urls: 'stun:stun.l.google.com:19302'
              }
            ]
        })

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
        Terminal7.openDC(pc)
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
    if (!term)
        return
    host = window.location.href.substring(7, window.location.href.indexOf(":", 7))+":8888"
    term.write("\nWhere is your host: ("+host+") ")
    state = 1
    term.focus()
}
if (term)
    term.write("\tWelcome To Terminal Seven!\r\n")
let p2 = pane.split("rightleft")
p2.openTerminal()
p2.t.write("Another pane")
let p3 = p2.split("topbottom")
p3.openTerminal()
p3.t.write("\tLast pane")
Connect()
