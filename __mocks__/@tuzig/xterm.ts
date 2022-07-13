import { vi } from "vitest"

export class Terminal {
    loadAddon = vi.fn()
    onSelectionChange = vi.fn()
    onData = vi.fn()
    focus = vi.fn()
    notify = vi.fn()
    open = vi.fn()
    write = vi.fn(s => this.out += s)
    onKey = (cb) => {
        this.pressKey = key => cb({ domEvent: { key } })
        return { dispose: vi.fn() }
    }
    reset = vi.fn()
    buffer = { active: {cursorX: 1, cursorY: 1}}
    attachCustomKeyEventHandler = vi.fn()
    loadWebfontAndOpen = vi.fn(e => new Promise(resolve => {
        setTimeout(_ => {
            this.textarea = document.createElement('textarea')
            e.appendChild(this.textarea)
            resolve()
        }, 0)
    }))
    constructor (props) {
        this.out = ""
        for (const k in props)
            this[k] = props[k]
    }
}

