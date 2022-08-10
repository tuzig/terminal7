

export class PeerbookConnection {
    ws: WebSocket = null
    host: string = "https://api.peerbook.io"
    peerName: string
    insecure: boolean = false
    email: string
    fp: string
    pbSendTask = null
    onUpdate: (r) => void
    pending: Array<string>

    constructor(fp, email, peerName, host = "api.peerbook.io", insecure = false) {
        this.fp = fp
        this.email = email
        this.peerName = peerName
        this.host = host
        this.insecure = insecure
        this.pending = new Array()
    }
    connect() {
        var firstMessage = true
        return new Promise((resolve, reject) =>{
            if (this.ws != null) {
                resolve()
                return
            }
            const schema = this.insecure?"ws":"wss",
                  url = encodeURI(`${schema}://${this.host}/ws?fp=${this.fp}&name=${this.peerName}&kind=terminal7&email=${this.email}`)
            this.ws = new WebSocket(url)
            this.ws.onmessage = ev => {
                var m = JSON.parse(ev.data)
                console.log("got ws message", m)
                this.onMessage(m)
            }
            this.ws.onerror = ev => {
                    // TODO: Add some info avour the error
                this.notify("\uD83D\uDCD6 WebSocket Error")
            }
            this.ws.onclose = ev => {
                this.ws.onclose = undefined
                this.ws.onerror = undefined
                this.ws.onmessage = undefined
                this.ws = null
            }
            this.ws.onopen = ev => {
                resolve()
                if ((this.pbSendTask == null) && (this.pending.length > 0))
                    this.pbSendTask = setTimeout(() => {
                        this.pending.forEach(m => {
                            console.log("sending ", m)
                            this.ws.send(JSON.stringify(m))})
                        this.pbSendTask = null
                        this.pending = []
                    }, 10)
            }
        })
    }
    send(m) {
        // null message are used to trigger connection, ignore them
        if (m != null) {
            if (this.ws != null 
                && this.ws.readyState == WebSocket.OPEN) {
                this.ws.send(JSON.stringify(m))
                return
            }
            this.pending.push(m)
        }
        this.wsConnect()
    }
    onMessage(m) {
        if (m["code"] !== undefined) {
            terminal7.notify(`\uD83D\uDCD6 ${m["text"]}`)
            return
        }
        if (m["peers"] !== undefined) {
            this.onUpdate(m["peers"] || [])
            return
        }
        if (m["verified"] !== undefined) {
            if (!m["verified"])
                this.notify("\uD83D\uDCD6 UNVERIFIED. Please check you email.")
            return
        }
        var g = this.PBGates.get(m.source_fp)
        if (typeof g != "object") {
            this.log("received bad gate", m)
            return
        }
        if (m.peer_update !== undefined) {
            g.online = m.peer_update.online
            return
        }
        if (!g.session) {
            console.log("session is close ignoring message", m)
            return
        }
        if (m.candidate !== undefined) {
            g.session.peerCandidate(m.candidate)
            return
        }
        if (m.answer !== undefined ) {
            var answer = JSON.parse(atob(m.answer))
            g.session.peerAnswer(answer)
            return
        }
    }
    isOpen() {
        return this.ws.readyState === WebSocket.OPEN
    }
}
