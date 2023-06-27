import { Session, Channel, State, CallbackType } from "../session.ts"

const returnLater = (ret: unknown) => 
    vi.fn(() => new Promise( resolve => setTimeout(() => resolve(ret), 0)))

export class MockChannel implements Channel {
    static id = 1
    static out = ""
    onClose: CallbackType
    onMessage: CallbackType
    close = returnLater(undefined)
    send(msg: string) {
        MockChannel.out += msg
    }
    resize = returnLater(undefined)
    get readyState(): string {
        return "open"
    }
}

export class SSHSession implements Session {
    static fail = false
    static wrongPassword = false

    onStateChange: (state: State) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port?=22) {
        console.log("New mocked SSH seesion", address, username, password, port)
    }
    // eslint-disable-next-line
    openChannel(cmd: string | string[], parent?: ChannelID, sx?: number, sy?: number):
        Promise<MockChannel> {
        return new Promise(resolve => {
            setTimeout(() => {
                const c = new MockChannel()
                vi.stubGlobal('lastSSHChannel', c)
                resolve(c)
            }, 0)
        })
    }

    connect = vi.fn(() => setTimeout(() =>
        SSHSession.fail ? this.onStateChange("failed")
            : this.onStateChange("connected"), 0))
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
        console.log("New mocked hybrid seesion", address, username, password, port)
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
