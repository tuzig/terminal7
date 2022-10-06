import { SSH, SSHSessionID, SSHSessionByPass} from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, Failure, Session, State }  from './session' 
import { WebRTCSession }  from './webrtc_session'

export class SSHChannel extends BaseChannel {
    id: number
    close(): Promise<void> {
        console.log("trying to close ssh channel")
        return new Promise((resolve, reject) => {
            SSH.closeChannel({channel: this.id})
               .then(() => {
                   this.onClose("Shell closed")
                   resolve()
                })
                .catch(e => {
                    console.log("error from close SSH channel", e)
                    reject(e)
                })
        })
    }
    send(data: string): void {
        SSH.writeToChannel({channel: this.id, message: data})
           .catch(e => console.log("error from writeToChannel", e))
    }
    resize(sx: number, sy: number): Promise<void> {
        return SSH.setPtySize({channel: this.id, width: sx, height: sy})
           .catch(e => console.log("error from setPtySize", e))
    }
}
// SSHSession is an implmentation of a real time session over ssh
export class SSHSession extends BaseSession {
    isSSH: boolean
    id: SSHSessionID
    byPass: SSHSessionByPass;
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port=22) {
        super()
        this.byPass = {address: address,
                       username: username,
                       password: password,
                       port: port,
                      }
    }
    connect() {
        this.startWatchdog()
        SSH.startSessionByPasswd(this.byPass)
           .then(({ session }) => {
                this.clearWatchdog()
                console.log("Got ssh session", session)
                this.id = session
                this.onStateChange("connected")
           }).catch(e => {
                this.clearWatchdog()
                console.log("SSH startSession failed", e)
                if (e.toString().startsWith("Error: Not imp"))
                    this.onStateChange("failed", Failure.NotImplemented)
                else
                    this.onStateChange("failed", Failure.WrongPassword)

           })
    }

    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            const channel = new SSHChannel()
            SSH.newChannel({session: this.id})
               .then(({ id }) => {
                   console.log("got new channel with id ", id)
                channel.id = id
                SSH.startShell({channel: id, command: cmd},
                    m => {
                        if ('data' in m)
                            channel.onMessage(m.data)
                        else {
                            console.log("ssh read got error ", m.error)
                            channel.onClose(m.error)
                        }
                    })
                   .then(callbackID => {
                        console.log("got from startShell: ", callbackID)
                        resolve(channel, id)
                        SSH.setPtySize({channel: id, width: sx, height: sy})
                           .then(() => {
                            console.log("after setting size")
                            resolve(channel, id)
                           })

                    }).catch(e => {
                        console.log("failed startshell", e)
                        reject(e) 
                    })
                })
        })
    }
}
// SSHSession is an implmentation of a real time session over ssh
export class HybridSession extends SSHSession {
    candidate: string
    webrtcSession: WebRTCSession
    pc: RTCPeerConnection
    id: SSHSessionID
    byPass: SSHSessionByPass;
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    wSession: Session
    constructor(address: string, username: string, password: string, port=22) {
        super(address, username, password, port)
        this.candidate = ""
        this.wSession = null
        this.byPass = {address: address,
                       username: username,
                       password: password,
                       port: port,
                      }
    }
    connect() {
        this.startWatchdog()
        SSH.startSessionByPasswd(this.byPass)
           .then(({ session }) => {
                this.clearWatchdog()
                console.log("Got ssh session", session)
                this.id = session
                this.onStateChange("connected")
           }).catch(e => {
                this.clearWatchdog()
                console.log("SSH startSession failed", e)
                if (e.toString().startsWith("Error: Not imp"))
                    this.onStateChange("failed", Failure.NotImplemented)
                else
                    this.onStateChange("failed", Failure.WrongPassword)

           })
    }
    async onAcceptData(data: string) {
        let c
        console.log("accepted: ", data)
        this.candidate += data
        // remove the CR & LF in the end
        if (this.candidate.slice(-1) == "\n")
            this.candidate = this.candidate.slice(0, -2)
        try {
            c = JSON.parse(this.candidate)
        } catch(e) { return }
        this.candidate = ""
        if (c.candidate)
            try {
                await this.webrtcSession.pc.addIceCandidate(c)
            } catch(e) { 
                terminal7.log("failed the add ice candidate", c)
                return
            }
        else
            try {
                await this.webrtcSession.pc.setRemoteDescription(c)
            } catch(e) { expect(e).toBeNull() }
    }

    async newWebRTC(id: number): WebRTCSession | null {
        let callbackID
        try {
            callbackID = await SSH.startShell({channel: id, command: "/Users/daonb/go/bin/webexec accept"},
                m => {
                    if ('data' in m)
                        this.onAcceptData(m.data)
                    else {
                        console.log("got somwthing weird from accept", m)
                    }
                }
            )
        } catch (e) { 
            console.log("Failed starting webexec", e)
            this.isSSH = true
        }
        console.log("got from webexec ID: ", callbackID)
        if (callbackID != "") {
            const webrtcSession = new WebRTCSession()
            try {
                return await new Promise<WebRTCSession?>((resolve, reject) => {
                    webrtcSession.onStateChange = (state, failure?: Failure) => {
                        console.log("State changed", state)
                        if (state == "connected") {
                            resolve()
                        }
                        if (state == "failed")
                            terminal7.log("Failed to open session")
                            reject()
                    }
                    webrtcSession.onIceCandidate = e => {
                        const candidate = JSON.stringify(e.candidate)
                        SSH.writeToChannel({channel: id, s: candidate})
                    }
                    webrtcSession.onNegotiationNeeded = () => {
                        terminal7.log("on negotiation needed")
                        webrtcSession.pc.createOffer().then(d => {
                            const offer = JSON.stringify(d)
                            webrtcSession.pc.setLocalDescription(d)
                            terminal7.log("got offer", offer)
                            SSH.writeToChannel({channel: id, s: offer})
                        })
                    }
                    return webrtcSession
                })
            } catch (e) {
                terminal7.log("signaling over ssh failed", e)
            }
        }
    }
    async openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number) {
        if (this.webrtcSession) 
            return this.webrtcSession.openChannel(cmd, parent, sx, sy)

        const channel = new SSHChannel()
        let callbackID = ""
        const { id } = await SSH.newChannel({session: this.id})
        console.log("got new channel with id ", id)
        channel.id = id
        if (!this.isSSH) {
            // try opening a WebRTC connection
            this.webrtcSession = this.newWebRTC(id)
            if (this.webrtcSession) {
                return this.webrtcSession.openChannel(cmd, parent, sx, sy)
            }
        } 
        try {
            callbackID = await SSH.startShell({channel: id, command: cmd},
                m => {
                    if ('data' in m)
                        this.onAcceptData(m.data)
                    else {
                        console.log("ssh read got error ", m.error)
                    }
                }
            )
        } catch (e) { reject(e) }
        console.log("got from startShell: ", callbackID)
        await SSH.setPtySize({channel: id, width: sx, height: sy})
        return channel, id
    }
} 
