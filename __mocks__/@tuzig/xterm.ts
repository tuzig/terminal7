import { vi } from "vitest"

export class Terminal {
    keyHandler: (a:any) => void
    loadAddon = vi.fn()
    onSelectionChange = vi.fn()
    onData = vi.fn()
    onBell = vi.fn()
    focus = vi.fn()
    notify = vi.fn()
    open = vi.fn()
    write = vi.fn(s => this.out += s)
    writeln = vi.fn(s => this.write(s + "\n"))
    reset = vi.fn()
    select = vi.fn()
    setOption = vi.fn()
    scrollToBottom = vi.fn()
    onKey = (cb) => {
        this.keyHandler = cb
        return { dispose: vi.fn() }
    }
    buffer = { active: { cursorX: 0, cursorY: 0, viewportY: 0, lines: [""],
        getLine: y => {
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
    getSelectionPosition = () => null
    constructor (props) {
        this.out = ""
        for (const k in props)
            this[k] = props[k]
    }
    pressKey(key) {
        const ev = new KeyboardEvent("keydown", { key })
        this.keyHandler( { domEvent: ev } )
    }
}

