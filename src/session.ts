export type CallbackType = (e: Event) => void
export type ChannelID = string
export type State = "new" | "connecting" | "connected" | "reconnected" | "disconnected" | "failed"

export interface Event {
    state: string
    data: string
    error: string
}

export interface Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    close(): Promise<void>
    send(data: string): Promise<void>
    resize(sx: number, sy: number): Promise<void>
    get readyState(): string
}

export interface Session {
    onStateChange : CallbackType
    onPayloadUpdate: (payload: string) => void
    // for reconnect
    openChannel(id: ChannelID): Promise<Channel>
    // for new channel
    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
        Promise<Channel>
    close(): Promise<void>
    reconnectChannel(id: ChannelId): Promise<Channel>
    getPayload(): Promise<string>
    setPayload(payload: object): Promise<void>
    disconnect(): Promise<void>
    connect(): void
}

export class BaseChannel implements Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    close(): Promise<void> {
        return new Promise(resolve => resolve())
    }
    send(data: string): Promise<void> {
        return new Promise(resolve => resolve())
    }
    resize(sx: number, sy: number): Promise<void> {
        return new Promise(resolve => resolve())
    }
    get readyState(): string {
        return "open"
    }
}
export class BaseSession implements Session {
    onStateChange : CallbackType
    onPayloadUpdate: (payload: string) => void
    getPayload(): Promise<string | null>{
        return new Promise(resolve=> {
            resolve(null)
        })
    }
    setPayload(payload: string): Promise<void>{
        return new Promise(resolve=> {
            resolve()
        })
    }
    disconnect(): Promise<void>{
        return new Promise(resolve=> {
            resolve()
        })
    }
    send(data: string): Promise<void> {
        return new Promise(resolve => resolve())
    }

}
