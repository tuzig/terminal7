import { BaseSession, BaseChannel, Channel, ChannelID }  from './session' 
import { PeerbookSession,  PeerbookChannel }  from './peerbook_session' 

// SSHSession is an implmentation of a real time session over ssh
export class WSSession extends PeerbookSession {
    constructor(address: string, username: string) {
        super()
        this.addr = address
        this.username = username
    }
    async connect() {
        console.log("in connect")
        this.disengagePC()
        if ((!this.t7.iceServers) && (!this.t7.conf.peerbook.insecure)) {
            try {
                this.t7.iceServers = await this.getIceServers()
            } catch(e) {
                console.log("Faield to get ice servers", e.toString())
            }
        }
        console.log("got ice server")
        this.pc = new RTCPeerConnection({
            iceServers: this.t7.iceServer,
            certificates: this.t7.certificates})
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState
            console.log("new connection state", state, this.lastMarker)
            if ((state == "connected") && (this.lastMarker != -1)) {
                this.sendCTRLMsg({
                    type: "restore",
                    args: { marker: this.lastMarker }},
                () => {
                    this.onStateChange(state)
                }, error => {
                    this.t7.notify("Failed to restore from marker")
                    this.onStateChange("failed")
                })
            } else 
                this.onStateChange(state)
        }
        let offer = ""
        this.pc.onicecandidateerror = (ev: RTCPeerConnectionIceErrorEvent) => {
            console.log("icecandidate error", ev.errorCode)
            if (ev.errorCode == 401) {
                this.t7.notify("Getting fresh ICE servers")
                this.connect()
            }
        }
        this.pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => this.onIceCandidate(ev)

        this.pc.onnegotiationneeded = e => {
            this.t7.log("on negotiation needed", e)
            this.pc.createOffer().then(d => {
                this.pc.setLocalDescription(d)
                offer = btoa(JSON.stringify(d))
                this.t7.log("got offer", offer)
                this.t7.pbSend({target: this.fp, offer: offer})
            })
        }
        this.pc.ondatachannel = e => {
            e.channel.onopen = () => {
                const l = e.channel.label,
                      m = l.split(":"),
                      msgID = parseInt(m[0]),
                      channelID = parseInt(m[1])
                if (isNaN(channelID) || isNaN(msgID)) {
                    this.t7.notify("Failed to open pane")
                    this.t7.log(`got a channel with a bad label: ${l}`)
                    this.close()
                } else {
                    const resolve = this.pendingChannels[msgID]
                    if (typeof resolve == "function") {
                        resolve(e.channel, channelID)
                        delete this.pendingChannels[msgID]
                    } else
                        console.log("Go a surprising new channel", e.channel)
                }
            }
        }
        this.openCDC()
    }

    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate)
            return
        const offer = btoa(JSON.stringify(this.pc.localDescription))
        this.t7.getFingerprint().then(fp =>
            fetch('http://'+this.addr+'/connect', {
                headers: {"Content-Type": "application/json"},
                method: 'POST',
                body: JSON.stringify({api_version: 0,
                    offer: offer,
                    fingerprint: fp
                })
            }).then(response => {
                if (response.status == 401)
                    throw new Error('unautherized');
                if (!response.ok)
                    throw new Error(
                      `HTTP POST failed with status ${response.status}`)
                return response.text()
            }).then(data => {
                if (!this.verified) {
                    this.verified = true
                    this.t7.storeGates()
                }
                const answer = JSON.parse(atob(data))
                let sd = new RTCSessionDescription(answer)
                this.pc.setRemoteDescription(sd)
                .catch (e => {
                    this.notify(`Failed to set remote description: ${e}`)
                    this.stopBoarding()
                    this.setIndicatorColor(FAILED_COLOR)
                    this.t7.onDisconnect(this)
                })
            }).catch(error => {
                if (error.message == 'unautherized') 
                    this.copyFingerprint()
                else
                    this.t7.onNoSignal(this, error)
            })
        )
    }
}
