export class Terminal {
    loadAddon = vi.fn()
    onSelectionChange = vi.fn()
    onData = vi.fn()
    focus = vi.fn()
    notify = vi.fn()
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
        for (const k in props)
            this[k] = props[k]
    }
}

