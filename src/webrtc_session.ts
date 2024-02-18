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
        terminal7.log("in connect", marker, noCDC)

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
            terminal7.log("failed to get fingerprint", e)
            this.t7.certificates = undefined
            return
        }
        this.pc = new RTCPeerConnection({
            iceServers: this.t7.iceServers,
            certificates: this.t7.certificates})
        this.pc.onconnectionstatechange = () => {
            if (!this.pc)
                return
            const state = this.pc.connectionState
            terminal7.log("new connection state", state, marker)
            if (state === 'failed')
                this.closeChannels()
            if ((state !== "connected") || (marker == null))
                this.onStateChange(state)
        }
        this.pc.onicecandidateerror = (ev: RTCPeerConnectionIceErrorEvent) => {
            terminal7.log("icecandidate error", ev.errorCode, ev.errorText)
        }
        this.pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => this.onIceCandidate(ev)

        this.pc.onnegotiationneeded = e => this.onNegotiationNeeded(e)
        this.pc.ondatachannel = e => {
            terminal7.log(">> opening dc", e.channel.label)
            e.channel.onopen = () => {
                terminal7.log(">> onopen dc", e.channel.label)
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
                        terminal7.log("Go a surprising new channel", e.channel)
                    this.pendingChannels.delete(msgID)
                }
            }
        }
        if (noCDC)
            return

        if (marker != null) {
            this.sendCTRLMsg({ type: "restore", args: { marker }},
                () => this.onStateChange("connected"),
                () => this.onStateChange("failed", Failure.BadMarker)
            )
        }
        await this.openCDC()
    }
    isOpen(): boolean {
        return this.pc != null && this.pc.connectionState == "connected"
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
                terminal7.log("reconnect pane", cmdorid)
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
            terminal7.log("in reconnect", this.cdc, this.cdc.readyState)
            if (marker != null) {
                this.sendCTRLMsg({ type: "restore", args: { marker }}, resolve,
                                 () => reject("Restore failed"))
            }
            if (!this.isOpen())
                return this.connect(marker, publicKey, privateKey)
            else if (!this.cdc || this.cdc.readyState != "open")
                this.openCDC()
            this.getPayload().then(resolve).catch(reject)
            
        })
    }
    openCDC(): Promise<void> {
        // stop listening for messages
       if (this.cdc)
           this.cdc.onmessage = undefined
       // TODO: improve error handling and add a reject
       return new Promise((resolve) => {
           terminal7.log(">>> opening cdc")
            const cdc = this.pc.createDataChannel('%')
            this.cdc = cdc
            cdc.onopen = () => {
                this.t7.log(">>> cdc opened", this.pendingCDCMsgs.length)
                    // This needs a bit of timeout or messages are not sent
                    this.t7.run(() => {
                        while (this.pendingCDCMsgs.length > 0) {    
                            const msg = this.pendingCDCMsgs.shift()
                            this.sendCTRLMsg(msg[0], msg[1], msg[2])
                        }
                    }, 100)
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
                            terminal7.log("A nack is unhandled", msg)
                    } else {
                        if (handlers && (typeof handlers[0] == "function"))
                            handlers[0](msg.args.body)
                        else
                            terminal7.log("an ack is unhandled", msg)
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
        if (!this.cdc || this.cdc.readyState != "open") {
            // message stays frozen when restarting
            terminal7.log("cdc not open, queuing message", msg)
            this.pendingCDCMsgs.push([msg, resolve, reject])
        } else {
            const s = msg.payload || JSON.stringify(msg)
            this.t7.log("cdc open sending msg", msg)
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
    offer: RTCSessionDescriptionInit
    constructor(fp: string) {
        super()
        this.fp = fp
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate && this.t7.pb) {
            try {
                terminal7.log("sending candidate")
                this.t7.pb.adminCommand({type: "candidate",
                                         args: {
                                             target: this.fp,
                                             sdp: ev.candidate
                                        }})
            } catch(e) {
                terminal7.log("failed to send candidate", e)
            }
        } else {
            terminal7.log("ignoring ice candidate", JSON.stringify(ev.candidate))
        }
    }
    async onNegotiationNeeded(e) {
        terminal7.log("on negotiation needed", e)
        let d: RTCSessionDescriptionInit
        try {
            d = await this.pc.createOffer()
        } catch(e) {
            terminal7.log("failed to create offer", e)
            this.onStateChange("failed", Failure.InternalError)
            return
        }
        const pb = terminal7.pb
        if (pb?.session)
            this.pc.setLocalDescription(d)
        else
           this.offer = d

        try {
            terminal7.log("sending offer", Date.now())
            await pb.adminCommand({type: "offer",
                                      args: {
                                          target: this.fp,
                                          sdp: d
                                      }})
        } catch(e) {
            terminal7.log("failed to send offer", e)
            this.onStateChange("failed", e)
            return
        }
    }
    async peerAnswer(offer) {
        const sd = new RTCSessionDescription(offer)
        if (this.pc.signalingState == "stable") {
            terminal7.log("got an answer but we're stable, setting remote description")
            await this.pc.setLocalDescription(this.offer)
            terminal7.log("current signaling state", this.pc.signalingState)
        }
        try {
            await this.pc.setRemoteDescription(sd)
        } catch (e) {
            terminal7.log(`Failed to set remote description: ${e}`)
            this.onStateChange("failed", Failure.BadRemoteDescription)
        }
    }
    peerCandidate(candidate) {
        this.pc.addIceCandidate(candidate).catch(e => {
            terminal7.log(`ICE candidate error: ${e}`)
            if (e.errorCode == 701)
                this.onStateChange("failed", Failure.BadRemoteDescription)
        })
        return
    }
}


// HTTPWebRTCSession is a WebRTCSession that connects to a WHIP server
export class HTTPWebRTCSession extends WebRTCSession {
    address: string
    headers: HttpHeaders = {}
    sessionURL: string | null = null
    pendingCandidates: Array<RTCIceCandidate>
    // storing the setTimeout id so we can cancel it
    constructor(address: string, headers?: Map<string, string>) {
        super()
        this.address = address
        if (headers)
            headers.forEach((v, k) => this.headers[k] =  v)
        terminal7.log("new http webrtc session", address, JSON.stringify(this.headers))
    }

    sendOffer(offer: RTCSessionDescriptionInit) {
        const headers = this.headers
        this.pendingCandidates = []
        headers['Content-Type'] = 'application/sdp'
        CapacitorHttp.post({
            url: this.address, 
            headers: headers,
            readTimeout: 3000,
            connectTimeout: 3000,
            data: offer.sdp,
            // webFetchExtra: { mode: 'no-cors' }
        }).then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                terminal7.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            } else if (response.status == 201) {
                this.sessionURL = response.headers['location'] || response.headers['Location']
                terminal7.log("got a session url", this.sessionURL)
                terminal7.log("--> penfing candidates", this.pendingCandidates)
                this.pendingCandidates.forEach(c => this.sendCandidate(c))
                this.pendingCandidates = []
                return response.data
            }
            return null
        }).then(data => {
            if (!data)
                return
            if (this.pc)
                this.pc.setRemoteDescription({type: "answer", sdp: data})
                    .catch (() => this.fail(Failure.BadRemoteDescription))
        }).catch(error => {
            terminal7.log(`FAILED: POST to ${this.address} with ${JSON.stringify(this.headers)}`, error)
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
    sendCandidate(candidate: RTCIceCandidate) {
        if (this.sessionURL == null) {
            terminal7.log("waiting for session url, queuing candidate")
            this.pendingCandidates.push(candidate)
            return
        }
        const headers = {}
        Object.assign(headers, this.headers)
        headers['Content-Type'] = 'application/json'
        CapacitorHttp.patch({
            url: this.sessionURL, 
            headers: headers,
            readTimeout: 3000,
            connectTimeout: 3000,
            data: candidate.toJSON(),
            // webFetchExtra: { mode: 'no-cors' }
        }).then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                terminal7.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            } else
                return response.data
            return null
        }).catch(error => {
            terminal7.log(`FAILED: PATCH to ${this.address} with ${JSON.stringify(this.headers)}`, error)
            if (error.message == 'unauthorized')
                this.fail(Failure.Unauthorized)
            else
                this.fail(Failure.NotSupported)
        })
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        terminal7.log("got ice candidate", ev)
        if (ev.candidate != null) {
            this.sendCandidate(ev.candidate)
        }
    }
    close(): void {
        super.close()
        this.sessionURL = null
    }
}
