import "./css/terminal7.css"
import "./css/xterm.css"
import { Panes } from "./windows.js"

let panes = new Panes()
let pane = panes.add({id: "p0", sx: 80, sy: 24})
let term = pane.t
let state = 0
let sendChannel = null

term.open(document.getElementById('pane0'))
term.onKey( (keys, ev) => {
    let code = keys.key.charCodeAt(0)
    if (state >= 4) {
        sendChannel.send(keys.key)
        return
    }
    term.write(keys.key)
    if (state<=2 && code == 13) {
        console.log(state+"=>3")
        console.log(host)
        state = 3
        term.write("\n\r\n\r")
        let pc = new RTCPeerConnection({
            iceServers: [
              {
                urls: 'stun:stun.l.google.com:19302'
              }
            ]
        })
        sendChannel = pc.createDataChannel('/bin/bash -i')
        sendChannel.onclose = () => term.write('Data Channel is closed, time to refresh.\n')
        sendChannel.onopen = () => {
            term.write('Connected to remote shell\n')
            state = 4
            setTimeout(() => {
                if (state == 4) {
                    term.write("Sorry, didn't get a prompt from the server.")
                    term.write("Please refresh.")
                }},3000)
        }
        sendChannel.onmessage = m => {
            if (state == 4) state = 5
            term.write(m.data)
        }
        pc.oniceconnectionstatechange = e => console.log(pc.iceConnectionState)
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
term.write("\tWelcome To Terminal Seven!\r\n")
let url=window.location.href
let host= url.substring(7, url.indexOf(":", 7))+":8888"
term.write("\nWhere is your host: ("+host+") ")
state = 1
term.focus()
