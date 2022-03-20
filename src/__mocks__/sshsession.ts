import { Session, Channel } from "../src/session.ts"

class MockChannel implements Channel {
    id = 1
    onClose: CallbackType
    onData: CallbackType
    close = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(), 0)))
    send = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(), 0)))
    resize = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(), 0)))
}

export class SSHSession implements Session {
    onStateChange: (state: State) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port?: number=22) {
    }
    connect = vi.fn(() => setTimeout(_ => this.onStateChange("connected"), 0))
    openChannel = vi.fn((cmd: string, parent: ChannelID, sx?: number, sy?: number) => {
        return new Promise(resolve => {
            setTimeout(_ => {
                let c = new MockChannel()
                resolve(c)
            }, 0)
        })
    })
    close = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(), 0)))
    getPayload = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(null), 0)))
    setPayload = vi.fn(s => new Promise(resolve => setTimeout(_ => resolve(null), 0)))
    disconnect = vi.fn(_ => new Promise(resolve => setTimeout(_ => resolve(null), 0)))
}
