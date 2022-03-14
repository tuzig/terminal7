export type CallbackType = (e: Event) => void
export type RTChannelID = string
export type RTState = "new" | "connecting" | "connected" | "disconnected" | "failed"

type RTMarker = number

export interface Event {
    state: string
    data: string
    error: string
}

export interface RTChannel {
    id?: RTChannelID
    onClose : CallbackType
    onData : CallbackType
    close(): Promise<void>
    send(data: string): Promise<void>
    resize(sx: number, sy: number): Promise<void>; 
}

export interface RTSession {
    onStateChange : CallbackType
    onPayloadUpdate: (payload: string) => void
    // for reconnect
    openChannel(id: RTChannelID): Promise<RTChannel>
    // for new channel
    openChannel(cmd: string, parent?: RTChannelID, sx?: number, sy?: number):
        Promise<RTChannel>
    close(): Promise<void>
    reconnectChannel(id: ChannelId): Promise<RTChannel>
    getPayload?(): Promise<string>
    setPayload?(payload: object): Promise<void>
    disconnect(): Promise<RTMarker>
    open(): void
}

export class RTBaseSession implements RTSession {
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
    disconnect(): Promise<RTMarker>{
        return new Promise(resolve=> {
            resolve(0)
        })
    }
}
