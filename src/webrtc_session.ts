import { CapacitorHttp, HttpHeaders } from '@capacitor/core';
import { BaseChannel, BaseSession, Channel, ChannelID, Failure, Marker } from './session';
import { IceServers } from "./terminal7"
import { ServerPayload } from "./gate"

type ChannelOpenedCB = (channel: Channel, id: ChannelID) => void 
type RTCStats = {
    timestamp: number,
    bytesSent: number,
    bytesReceived: number,
    roundTripTime: number,
}

export class WebRTCChannel extends BaseChannel {
    dataChannel: RTCDataChannel
    session: WebRTCSession
    constructor(session: WebRTCSession,
                id: number,
                dc: RTCDataChannel) {
        super()
        this.id = id
        this.session = session
        this.dataChannel = dc
    }
    // readyState can be one of the four underlying states:
    //   "connecting", "open", "closing", closed"
    // or a special case "disconnected" when no associated data channel
    get readyState(): string {
        if (this.dataChannel)
            return this.dataChannel.readyState
        else 
            return "disconnected"
    }
    send(data: ArrayBuffer): void {
        if (!this.dataChannel) {
            this.t7.notify("data channel closed")
            return
        }
        this.dataChannel.send(data)
    }
    resize(sx: number, sy: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.session.sendCTRLMsg({
                type: "resize", 
                args: {
                       pane_id: this.id,
                       sx: sx,
                       sy: sy
                }
            }, resolve, reject)
        })
    }
    close(): void {
        const dc = this.dataChannel
        if (dc) {
            this.disconnect()
            dc.close()
        }
    }
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.onmessage = Function.prototype()
            this.dataChannel.onclose = Function.prototype()
            this.dataChannel = null
        }
    }
}

export class WebRTCSession extends BaseSession {
    channels: Map<number, WebRTCChannel>
    pendingCDCMsgs: Array<object>
    pendingChannels: Map<ChannelID, ChannelOpenedCB>
    msgHandlers: Map<ChannelID, Array<(unknown)=>void>>
    cdc: RTCDataChannel
    pc: RTCPeerConnection
    lastMsgId: number
    constructor() {
        super()
        this.channels = new Map()
        this.pendingCDCMsgs = []
        this.pendingChannels = new Map()
        this.msgHandlers = new Map()
        this.lastMsgId = 0
    }
    // eslint-disable-next-line
    onIceCandidate(e: RTCPeerConnectionIceEvent): void { throw new Error("Unimplemented method onIceCandidate()") }
    // eslint-disable-next-line
    onNegotiationNeeded(ev: Event): void { throw new Error("Unimplemented method onNegotiationNeeded()") }
    public get isSSH() {
        return false
    }

    // eslint-disable-next-line
    async connect(marker?: Marker, noCDC?: boolean | string, privateKey?: string): Promise<void> {
        console.log("in connect", marker, noCDC)

        if (this.t7.iceServers == null) {
            try {
                this.t7.iceServers = await this.getIceServers()
            } catch(e) {
                this.t7.iceServers = []
                terminal7.log("error getting iceservers", e)
            }
        }
        this.t7.log("using ice server", JSON.stringify(this.t7.iceServers))
        try {
            await this.t7.getFingerprint()
        } catch (e) {
            console.log("failed to get fingerprint", e)
            this.t7.certificates = undefined
            return
        }
        this.pc = new RTCPeerConnection({
            iceServers: this.t7.iceServers,
            certificates: this.t7.certificates})
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState
            console.log("new connection state", state, marker)
            if ((state === "connected") && (marker != null)) {
                this.sendCTRLMsg({
                    type: "restore",
                    args: { marker }},
                () => {
                    this.onStateChange("connected")
                },
                () => {
                    this.onStateChange("failed", Failure.BadMarker)
                })
            } else  {
                if (state === 'failed')
                    this.closeChannels()
                if (this.onStateChange)
                    this.onStateChange(state)
            }
        }
        this.pc.onicecandidateerror = (ev: RTCPeerConnectionIceErrorEvent) => {
            console.log("icecandidate error", ev.errorCode, ev.errorText)
        }
        this.pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => this.onIceCandidate(ev)

        this.pc.onnegotiationneeded = e => this.onNegotiationNeeded(e)
        this.pc.ondatachannel = e => {
            console.log(">> opening dc", e.channel.label)
            e.channel.onopen = () => {
                console.log(">> onopen dc", e.channel.label)
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
                    if (typeof resolve == "function")
                        resolve(e.channel, channelID)
                    else
                        console.log("Go a surprising new channel", e.channel)
                    this.pendingChannels.delete(msgID)
                }
            }
        }
        if (noCDC)
            return
        this.openCDC()
    }

    // dcOpened is called when a data channel has been opened
    onDCOpened(dc: RTCDataChannel, id: number):  WebRTCChannel {
        this.t7.log("dcOpened", dc)
        let channel = this.channels.get(id)
        if (channel) 
            channel.dataChannel = dc
        else {
            channel = new WebRTCChannel(this, id, dc)
            this.channels.set(id, channel)
        }
        // callbacks are set after the resolve as that's 
        // where caller's onMessage & onClose are set
        dc.onmessage = m => {
            if (typeof channel.onMessage == "function") {
                const data = new Uint8Array(m.data)
                channel.onMessage(data)
            }
        }
        dc.onclose = m => {
            this.channels.delete(id)
            channel.onClose(m)
        }
        return channel
    }
    openChannel(cmdorid: number | string | string[], parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            let msgID: number
            if (sx !== undefined) {
                if (typeof cmdorid === "string")
                    cmdorid = [cmdorid] 
                msgID = this.sendCTRLMsg({
                    type: "add_pane", 
                    args: { 
                        command: cmdorid,
                        rows: sy,
                        cols: sx,
                        parent: parent || 0
                    }
                }, Function.prototype(), Function.prototype())
            } else {
                console.log("reconnect pane", cmdorid)
                msgID = this.sendCTRLMsg({
                    type: "reconnect_pane", 
                    args: { id: cmdorid }
                }, Function.prototype(), Function.prototype())
            }
            const watchdog = setTimeout(() => reject("timeout"), this.t7.conf.net.timeout)
            this.pendingChannels[msgID] = (dc: RTCDataChannel, id: ChannelID) => {
                clearTimeout(watchdog)
                const channel = this.onDCOpened(dc, id)
                resolve(channel)
            }
        })
    }
    async reconnect(marker?: Marker , publicKey?: string, privateKey?: string): Promise<void> {
        return new Promise((resolve, reject) => { 
            console.log("in reconnect", this.cdc, this.cdc.readyState)
            if (!this.pc)
                return this.connect(marker, publicKey, privateKey)
            
            if (!this.cdc || this.cdc.readyState != "open")
                this.openCDC()
            if (marker != null) {
                this.sendCTRLMsg({ type: "restore", args: { marker }}, resolve,
                                 () => reject("Restore failed"))
            } else
                this.getPayload().then(resolve).catch(reject)
        })
    }
    openCDC(): Promise<void> {
        // stop listening for messages
       if (this.cdc)
           this.cdc.onmessage = undefined
       // TODO: improve error handling and add a reject
       return new Promise((resolve) => {
           console.log(">>> opening cdc")
            const cdc = this.pc.createDataChannel('%')
            this.cdc = cdc
            cdc.onopen = () => {
                this.t7.log(">>> cdc opened")
                if (this.pendingCDCMsgs.length > 0)
                    // TODO: why the time out? why 100milli?
                    this.t7.run(() => {
                        this.t7.log("sending pending messages")
                        this.pendingCDCMsgs.forEach((m) => this.sendCTRLMsg(m[0], m[1], m[2]))
                        this.pendingCDCMsgs = []
                        resolve()
                    }, 500)
                else
                    resolve()
            }
            cdc.onmessage = m => {
                const d = new TextDecoder("utf-8"),
                      msg = JSON.parse(d.decode(m.data))
                // handle Ack
                if ((msg.type == "ack") || (msg.type == "nack")) {
                    const i = msg.args.ref
                    const handlers = this.msgHandlers.get(i)
                    this.msgHandlers.delete(msg.args.ref)
                    this.t7.log("got cdc message:",  msg)
                    if (msg.type == "nack") {
                        if (handlers && (typeof handlers[1] == "function"))
                            handlers[1](msg.args.desc)
                        else
                            console.log("A nack is unhandled", msg)
                    } else {
                        if (handlers && (typeof handlers[0] == "function"))
                            handlers[0](msg.args.body)
                        else
                            console.log("an ack is unhandled", msg)
                    }
                } else if (this.onCMD)
                    this.onCMD(msg)
            }
       })
    }
    sendCTRLMsg(msg, resolve, reject) {
        // helps us ensure every message gets only one Id
        if (msg.message_id === undefined) 
            msg.message_id = this.lastMsgId++
        // don't change the time if it's a retransmit
        if (msg.time == undefined)
            msg.time = Date.now()
        this.msgHandlers.set(msg.message_id, [resolve, reject])
        if (!this.cdc || this.cdc.readyState != "open")
            // message stays frozen when restarting
            this.pendingCDCMsgs.push([msg, resolve, reject])
        else {
            const s = msg.payload || JSON.stringify(msg)
            this.t7.log("sending ctrl message ", s)
            msg.payload = s

            try {
                this.cdc.send(s)
            } catch(err) {
                this.t7.notify(`Sending ctrl message failed: ${err}`)
            }
        }
        return msg.message_id
    }
    getPayload(): Promise<unknown | void>{
        return new Promise((resolve, reject) => 
            this.sendCTRLMsg({
                type: "get_payload",
                args: {}
            }, resolve, reject)
        )
    }
    setPayload(payload: string | ServerPayload): Promise<void>{
        return new Promise((resolve, reject) =>
            this.sendCTRLMsg({
                type: "set_payload",
                args: {Payload: payload}
            }, resolve, reject)
        )
    }
    closeChannels(): void {
        this.channels.forEach(c => c.close())
        this.channels = new Map()
    }
    // disconnect disconnects from all channels, requests a mark and resolve with
    // the new marker
    disconnect(): Promise<number | null> {
        return new Promise((resolve, reject) => {
            if (!this.pc) {
                resolve(null)
                return
            }
            this.closeChannels()
            this.sendCTRLMsg({
                    type: "mark",
                    args: null
                }, (payload) => {
                const marker = parseInt(payload)

                this.t7.log("got a marker", marker)
                this.closeChannels()
                resolve(marker)
            }, reject)
        })
    }
    close(): void {
        this.closeChannels()
        if (this.pc != null) {
            this.pc.onconnectionstatechange = undefined
            this.pc.onnegotiationneeded = undefined
            this.cdc.close()
            this.pc.close()
            this.pc = null
        }
    }
    getIceServers(): Promise<IceServers[]> {
        return new Promise((resolve, reject) => {
            const ctrl = new AbortController(),
                  tId = setTimeout(() => ctrl.abort(), 1000),
                  insecure = this.t7.conf.peerbook.insecure,
                  schema = insecure?"http":"https"

            fetch(`${schema}://${this.t7.conf.net.peerbook}/turn`,
                  {method: 'POST', signal: ctrl.signal })
            .then(response => {
                if (!response.ok)
                    return null
                else
                    return response.json()
            }).then(servers => {
                clearTimeout(tId)
                if (!servers) {
                    reject("failed to get ice servers")
                    return
                }
                // return an array with the conf's server and subspace's
                const iceServer = this.t7.conf.net.iceServer
                if (iceServer?.length > 0)
                    servers.unshift({ urls: iceServer })
                resolve(servers)

            }).catch(err => {
                clearTimeout(tId)
                reject("failed to get ice servers " + err.toString())
                return
            })
        })
    }
    async getStats(): Promise<RTCStats | null> {
        const stats = await this.pc.getStats()
        let candidatePair
        stats.forEach(s => {
            if (s.type == "candidate-pair" && s.state == "succeeded")
                candidatePair = s
        })
        if (!candidatePair)
            return null
        const res: RTCStats = {
            timestamp: Date.now(),
            bytesSent: candidatePair.bytesSent,
            bytesReceived: candidatePair.bytesReceived,
            roundTripTime: candidatePair.currentRoundTripTime * 1000,
        }
        return res
    }
}

export class PeerbookSession extends WebRTCSession {
    fp: string
    constructor(fp: string) {
        super()
        this.fp = fp
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate && this.t7.pb) {
            this.t7.pb.adminCommand({type: "candidate",
                                     args: {
                                         target: this.fp,
                                         sdp: ev.candidate
                                    }})
        } else {
            terminal7.log("ignoring ice candidate", JSON.stringify(ev.candidate))
        }
    }
    onNegotiationNeeded(e) {
        terminal7.log("on negotiation needed", e)
        this.pc.createOffer().then(d => {
            this.pc.setLocalDescription(d)
            try {
                terminal7.pb.adminCommand({type: "offer",
                                          args: {
                                              target: this.fp,
                                              sdp: d
                                          }})
            } catch(e) {
                terminal7.log("failed to send offer", e)
                terminal7.notify("Failed to connect, please try again")
            }

        })
    }
    peerAnswer(offer) {
        const sd = new RTCSessionDescription(offer)
        if (this.pc.signalingState == "stable") {
            terminal7.log("got an answer but we're stable")
            return
        }
        this.pc.setRemoteDescription(sd)
            .catch (e => {
                terminal7.log(`Failed to set remote description: ${e}`)
                this.onStateChange("failed", Failure.BadRemoteDescription)
            })
    }
    peerCandidate(candidate) {
        this.pc.addIceCandidate(candidate).catch(e =>
            terminal7.log(`ICE candidate error: ${e}`))
        return
    }
}


// SSHSession is an implmentation of a real time session over ssh
export class HTTPWebRTCSession extends WebRTCSession {
    address: string
    headers: HttpHeaders
    sessionUrl: string | null
    constructor(address: string, headers?: Map<string, string>) {
        super()
        this.address = address
        this.headers = { "Content-Type": "application/sdp" }
        if (headers)
            headers.forEach((v, k) => this.headers[k] =  v)
        this.sessionUrl = null
        console.log("new http webrtc session", address, JSON.stringify(this.headers))
    }

    sendOffer(offer: RTCSessionDescriptionInit) {
        let headers = this.headers
        headers['Content-Type'] = 'application/sdp'
        CapacitorHttp.post({
            url: this.address, 
            headers: headers,
            readTimeout: 3000,
            connectTimeout: 3000,
            data: offer
            // webFetchExtra: { mode: 'no-cors' }
        }).then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                console.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            } else if (response.status == 201) {
                this.sessionUrl = response.headers['location']
                return response.data
            }
            return null
        }).then(data => {
            if (!data)
                return
            // TODO move this to the last line of the last then
            const answer = data
            const sd = new RTCSessionDescription(answer)
            if (this.pc)
                this.pc.setRemoteDescription(sd).catch (() => { 
                    this.fail(Failure.BadRemoteDescription)
                })
        }).catch(error => {
            console.log(`FAILED: POST to ${this.address} with ${JSON.stringify(this.headers)}`, error)
            if (error.message == 'unauthorized')
                this.fail(Failure.Unauthorized)
            else
                this.fail(Failure.NotSupported)
        })
    }
    onNegotiationNeeded(e) {
        this.t7.log("over HTTP on negotiation needed", e)
        this.pc.createOffer().then(offer => {
            this.pc.setLocalDescription(offer)
            this.sendOffer(offer)
        })
    }
    sendCandidate(fp: string, ev: RTCPeerConnectionIceEvent) {
        CapacitorHttp.patch({
            url: this.sessionUrl, 
            headers: this.headers,
            readTimeout: 3000,
            connectTimeout: 3000,
            data: ev.candidate,
            // webFetchExtra: { mode: 'no-cors' }
        }).then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                console.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            } else
                return response.data
            return null
        }).then(data => {
            if (!data)
                return
            // TODO move this to the last line of the last then
            const answer = JSON.parse(atob(data))
            const sd = new RTCSessionDescription(answer)
            if (this.pc)
                this.pc.setRemoteDescription(sd).catch (() => { 
                    this.fail(Failure.BadRemoteDescription)
                })
        }).catch(error => {
            console.log(`FAILED: POST to ${this.address} with ${JSON.stringify(this.headers)}`, error)
            if (error.message == 'unauthorized')
                this.fail(Failure.Unauthorized)
            else
                this.fail(Failure.NotSupported)
        })
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        console.log("got ice candidate", ev)
        if (ev.candidate == null) {
            // DELETE the session
            CapacitorHttp.delete({
                url: this.sessionUrl,
                readTimeout: 3000,
                connectTimeout: 3000,
            })
            return
        }
        this.t7.getFingerprint().then(fp => {
            this.sendCandidate(fp, ev)
        })
    }
    isOpen(): boolean {
        return this.pc != null && this.pc.connectionState == "connected"
    }
}

