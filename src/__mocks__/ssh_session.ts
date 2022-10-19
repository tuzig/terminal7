import { Session, Channel, State, CallbackType } from "../session.ts"

const returnLater = (ret: unknown) => 
    vi.fn(() => new Promise( resolve => setTimeout(() => resolve(ret), 0)))

class MockChannel implements Channel {
    id = 1
    onClose: CallbackType
    onMessage: CallbackType
    close = returnLater(undefined)
    send = vi.fn()
    resize = returnLater(undefined)
    get readyState(): string {
        return "open"
    }
}

export class SSHSession implements Session {
    onStateChange: (state: State) => void
    onPayloadUpdate: (payload: string) => void
    static fail = false
    static wrongPassword = false
    constructor(address: string, username: string, password: string, port?=22) {
        console.log("New seesion", address, username, password, port)
    }
    connect = vi.fn(() => setTimeout(() =>
        SSHSession.fail ? this.onStateChange("failed")
            : this.onStateChange("connected"), 0))
    openChannel = vi.fn(
        (cmd: string, parent: ChannelID, sx?: number, sy?: number) => // eslint-disable-line
        new Promise(resolve => {
            setTimeout(() => {
                const c = new MockChannel()
                resolve(c)
            }, 0)
        })
    )
    close = returnLater(undefined)
    getPayload = returnLater(null)
    setPayload = returnLater(null)
    disconnect = returnLater(null)
    public get isSSH() {
        return true
    }
}

export class HybridSession implements Session {
    onStateChange: (state: State) => void
    onPayloadUpdate: (payload: string) => void
    static fail = false
    static wrongPassword = false
    constructor(address: string, username: string, password: string, port?=22) {
        console.log("New seesion", address, username, password, port)
    }
    connect = vi.fn(() => setTimeout(() =>
        SSHSession.fail ? this.onStateChange("failed")
            : this.onStateChange("connected"), 0))
    openChannel = vi.fn(
        (cmd: string, parent: ChannelID, sx?: number, sy?: number) => // eslint-disable-line
        new Promise(resolve => {
            setTimeout(() => {
                const c = new MockChannel()
                resolve(c)
            }, 0)
        })
    )
    close = returnLater(undefined)
    getPayload = returnLater(null)
    setPayload = returnLater(null)
    disconnect = returnLater(null)
    public get isSSH() {
        return false
    }
}
