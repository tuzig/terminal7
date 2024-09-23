import { Terminal7 } from "./terminal7"

export type CallbackType = (e: unknown) => void
export type ChannelID = number
export type State = "new" | "connecting" | "connected" | "reconnected" | "disconnected" | "failed" |
    "unauthorized" | "wrong password" | "closed" | "gotlayout"

export type Marker = number | null

// possible reasons for a failure
export enum Failure {
    NotImplemented='Not Implemented',
    WrongPassword='Wrong Password',
    Unauthorized='Unauthorized',
    BadMarker='Bad Marker',
    BadRemoteDescription='Bad Remote Description',
    NotSupported='Not Supported',
    WebexecNotFound='Webexec Not Found',
    TimedOut='Timeout',
    Aborted='Aborted',
    KeyRejected='Key Rejected',
    NoKey='No Key',
    WrongAddress='Wrong Address',
    DataChannelLost="Data Channel Lost",
    FailedToConnect="Failed To Connect",
    Overrun='Overrun',
    InternalError='Internal Error',
    Exhausted='Exhausted',
}

export interface Event {
    state: string
    data: string
    error: string
}

export interface Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    close(): void
    send(data: ArrayBuffer | string): void
    resize(sx: number, sy: number): Promise<string|void>
    readonly readyState: string
}

export interface Session {
    readonly isSSH: boolean
    lastPayload: string
    onStateChange : (state: State, failure?: Failure) => void
    onCMD: (payload: unknown) => void
    // for reconnect
    openChannel(id: ChannelID | string | string[], parent?: ChannelID, sx?: number, sy?: number): Promise<Channel>
    close(): void
    getPayload(): Promise<string>
    setPayload(payload: string|object): Promise<string>
    reconnect(marker?: Marker, publicKey?: string, privateKey?: string): Promise<unknown | void>
    disconnect(): Promise<number | null>
    connect(marker?: Marker, publicKey?: string, privateKey?: string): Promise<void>
    connect(marker?: Marker, noCDC?: boolean): Promise<void>
    fail(failure?: Failure): void
    isOpen(): boolean
}

export abstract class BaseChannel implements Channel {
    id?: ChannelID
    t7: Terminal7
    onClose : CallbackType
    onMessage : CallbackType
    abstract close(): void
    abstract send(data: ArrayBuffer): void
    abstract resize(sx: number, sy: number): Promise<string | void>

    constructor() {
        this.onMessage = () => void 0
        this.onClose = () => void 0
        this.t7 = terminal7
    }

    get readyState(): string {
        return "open"
    }
}
export abstract class BaseSession implements Session {
    t7: Terminal7
    watchdog: number
    lastPayload: string
    onStateChange : (state: State, failure?: Failure) => void
    onCMD: (payload: string) => void
    protected constructor() {
        this.t7 = terminal7
    }
    get isSSH(): boolean {
        throw new Error("Not implemented")
    }
    async getPayload(): Promise<string> {
        return ""
    }
    // TODO: get it to throw "Not Implemented"
    // eslint-disable-next-line
    async setPayload(payload: string|object): Promise<string>{
        console.log(`ignoring set payload: ${JSON.stringify(payload)}`)
        return ""
    }
    // eslint-disable-next-line
    async reconnect(marker?: Marker, publicKey?: string, privateKey?: string): Promise<unknown | void> {
        throw "Not Implemented"
    }

    // base disconnect is rejected as it's not supported
    disconnect(): Promise<null | number> {
        return new Promise((resolve, reject) => {
            reject()
        })
    }
    // fail function emulates a WebRTC connection failure flow
    fail(failure?: Failure) {
        if (this.onStateChange)
            this.onStateChange("failed", failure)
    }
    abstract close(): void

    // for reconnect
    abstract openChannel(id: number | string | string[], parent?: number, sx?: number, sy?: number): Promise<Channel>

    abstract connect(marker?: Marker, publicKey?: string, privateKey?: string): Promise<void>
    abstract connect(marker?: Marker, noCDC?: boolean): Promise<void>
    isOpen(): boolean {
        return false
    }

}
