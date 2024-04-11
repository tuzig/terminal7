import { vi } from "vitest"

export class Terminal {
    options = {
        selectionStyle: "plain",
        cursorBlink: false,
        scrollback: 1000,
        tabStopWidth: 4,
    }
    element = {
        addEventListener: vi.fn(),
        parentElement: {
            clientHeight: 480,
            clientWidth: 640
        }
    }
    constructor (props) {
        this.out = ""
        for (const k in props)
            this[k] = props[k]
    }
    clear = vi.fn()
    focus = vi.fn()
    getSelectionPosition = () => null
    keyHandler: (a:any) => void
    loadAddon = vi.fn()
    notify = vi.fn()
    onBell = vi.fn()
    onData = vi.fn()
    onSelectionChange = vi.fn()
    open = vi.fn()
    reset = vi.fn()
    scrollToBottom = vi.fn()
    select = vi.fn()
    registerMarker = vi.fn()
    registerDecoration = vi.fn(() => ({
        dispose: vi.fn()
    }))
    writeln = vi.fn(s => this.write(s + "\n"))
    write = vi.fn(s => this.out += s)
    onKey = (cb) => {
        this.keyHandler = cb
        return { dispose: vi.fn() }
    }
    buffer = {
        active: {
            cursorX: 0, cursorY: 0, viewportY: 0, lines: [""],
            getLine: (y: number) => {
                return { translateToString: () => this.buffer.active.lines[y] || '' }
        }
    }
    }
    attachCustomKeyEventHandler = vi.fn()
    loadWebfontAndOpen = vi.fn(e => new Promise(resolve => {
        setTimeout(_ => {
            if (e) {
                this.textarea = document.createElement('textarea')
                e.appendChild(this.textarea)
            }
            resolve()
        }, 0)
    }))
    setBuffer(lines : string[]) {
        this.buffer.active.lines = lines
    }
    pressKey(key) {
        const ev = new KeyboardEvent("keydown", { key })
        this.keyHandler( { domEvent: ev } )
    }
    resize:(columns: number, rows: number) => void = vi.fn();
    _core = {
        _renderService: {
            dimensions: {
                css: {
                    cell: {
                        width: 5,
                        height: 11
                    }
                }
            }
        }
    };
}

