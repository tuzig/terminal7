import { vi } from "vitest"

export class Terminal {
    loadAddon = vi.fn()
    onSelectionChange = vi.fn()
    onData = vi.fn()
    focus = vi.fn()
    notify = vi.fn()
    select = vi.fn()
    setOption = vi.fn()
    buffer = { active: { cursorX: 0, cursorY: 0, viewportY: 0, lines: [""],
        getLine: y => {
            return { translateToString: () => this.buffer.active.lines[y] || '' }
        }
    }
    }
    attachCustomKeyEventHandler = vi.fn()
    loadWebfontAndOpen = vi.fn(e => new Promise(resolve => {
        setTimeout(_ => {
            this.textarea = document.createElement('textarea')
            e.appendChild(this.textarea)
            resolve()
        }, 0)
    }))
    setBuffer(lines : string[]) {
        this.buffer.active.lines = lines
    }
    getSelectionPosition = () => null
    constructor (props) {
        for (const k in props)
            this[k] = props[k]
    }
}

