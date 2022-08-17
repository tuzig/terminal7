

export class PeerbookConnection {
    ws: WebSocket = null
    host = "https://api.peerbook.io"
    peerName: string
    insecure = false
    email: string
    fp: string
    pbSendTask = null
    onUpdate: (r: string) => void
    pending: Array<string>

    constructor(fp, email, peerName, host = "api.peerbook.io", insecure = false) {
        this.fp = fp
        this.email = email
        this.peerName = peerName
        this.host = host
        this.insecure = insecure
        this.pending = []
    }
    connect() {
        return new Promise<void>((resolve) =>{
            if ((this.ws != null) && this.isOpen()) {
                resolve()
                return
            }
            const schema = this.insecure?"ws":"wss",
                  url = encodeURI(`${schema}://${this.host}/ws?fp=${this.fp}&name=${this.peerName}&kind=terminal7&email=${this.email}`)
            this.ws = new WebSocket(url)
            this.ws.onmessage = ev => this.onUpdate(ev.data)
            this.ws.onerror = ev => window.terminal7.log("Peerbook WebSocket Error", ev)
            this.ws.onclose = () => {
                window.terminal7.log("peerbook connection closed")
                // terminal7.notify("\uD83D\uDCD6 Connection closed")
                this.ws = null
            }
            this.ws.onopen = () => {
                // terminal7.notify("\uD83D\uDCD6 Connection opened")
                resolve()
                if ((this.pbSendTask == null) && (this.pending.length > 0))
                    this.pbSendTask = setTimeout(() => {
                        this.pending.forEach(m => {
                            console.log("sending ", m)
                            this.ws.send(JSON.stringify(m))
                        })
                        this.pbSendTask = null
                        this.pending = []
                    }, 10)
            }
        })
    }
    send(m) {
        // null message are used to trigger connection, ignore them
        const state = this.ws ? this.ws.readyState : WebSocket.CLOSED
        if (state == WebSocket.OPEN) {
            this.ws.send(JSON.stringify(m))
        } else
            this.pending.push(m)
    }
    close() {
        this.ws.close()
        this.ws = null
    }
    isOpen() {
        return this.ws ? this.ws.readyState === WebSocket.OPEN : false
    }
}
