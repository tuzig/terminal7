import { Terminal } from "@tuzig/xterm"
import { FitAddon } from "xterm-addon-fit"
import XtermWebfont from 'xterm-webfont'

export type Fields = Array<{
    prompt:string,
    default?:string,
    values?:Array<string>,
    validator?:(field: string) => string,
    password?: boolean,
}>

export type Results = Array<string>

export function openFormsTerminal(e: HTMLElement) {
    const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        theme: window.terminal7.conf.theme,
        fontFamily: "FiraCode",
        fontSize: 14,
        rendererType: "canvas",
        convertEol: true,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new XtermWebfont())
    const resizeObserver = new window.ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(e);
    terminal.loadWebfontAndOpen(e).then(() => {
        fitAddon.fit()
        terminal.write("\n")
    })
    return terminal
}

export class Form {

    field: string
    i: number
    e: HTMLElement
    resolve: (value) => void
    reject: (reason?) => void
    fields: Fields
    results: Results
    static activeForm = false

    constructor(fields: Fields) {
        this.fields = fields
    }

    chooseFields(t: Terminal, title: string) {
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        return new Promise<Array<boolean>>((resolve, reject) => {
            t.writeln(`\n  ${title}, choose fields to edit:`)
            t.writeln("  [Use ⇅ to move, space to select, → to all, ← to none]")
            t.writeln("  " + this.fields.map(f => `[ ] ${f.prompt}: ${f.default}`).join('\n  '))
            t.write(`\x1B[4G\x1B[${len}A`) // move cursor to first field
            const disposable = t.onKey(ev => {
                const key = ev.domEvent.key
                const char = !enabled[current] ? 'X' : ' '
                switch (key) {
                    case "Escape":
                        disposable.dispose()
                        t.write(`\x1B[${len-current}B\rESC\n`)
                        window.terminal7.clearTempGates()
                        Form.activeForm = false
                        break
                    case "ArrowUp":
                        if (current > 0) {
                            current--
                            t.write("\x1B[A")
                        }
                        break
                    case "ArrowDown":
                        if (current < enabled.length - 1) {
                            current++
                            t.write("\x1B[B")
                        }
                        break
                    case " ":
                        enabled[current] = !enabled[current]
                        t.write(char + "\x1B[1D")
                        break
                    case "Enter":
                        this.fields = this.fields.filter((_, i) => enabled[i])
                        disposable.dispose()
                        resolve(enabled)
                        t.write(`\x1B[${len-current}B`)
                        break
                    case "ArrowRight":
                        enabled.fill(true)
                        if (current != 0)
                            t.write(`\x1B[${current}A`) // move cursor to first field
                        for (let i in enabled) {
                            t.write("X\x1B[1D\x1B[1B")
                        }
                        t.write(`\x1B[${len-current}A`) // restore cursor position
                        break
                    case "ArrowLeft":
                        enabled.fill(false)
                        if (current != 0)
                            t.write(`\x1B[${current}A`)
                        for (let i in enabled) {
                            t.write(" \x1B[1D\x1B[1B")
                        }
                        t.write(`\x1B[${len-current}A`)
                        break
                }
            })
            t.focus()
        })
    }

    menu(t: Terminal, title: string) {
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        return new Promise<string>((resolve, reject) => {
            t.writeln(`\n  ${title}:`)
            t.writeln("  [Use ⇅ to move, Enter to select]")
            t.writeln("  " + this.fields.map(f => `  ${f.prompt}`).join('\n  '))
            t.write(`\x1B[3G\x1B[${len}A`) // move cursor to first field
            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`)
            const disposable = t.onKey(ev => {
                const key = ev.domEvent.key
                const char = !enabled[current] ? 'X' : ' '
                switch (key) {
                    case "Escape":
                        disposable.dispose()
                        t.write(`\x1B[${len-current}B\rESC\n`)
                        window.terminal7.clearTempGates()
                        Form.activeForm = false
                        break
                    case "ArrowUp":
                        if (current > 0) {
                            t.write(`  ${this.fields[current].prompt}\x1B[3G`)
                            current--
                            t.write("\x1B[A")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`)
                        }
                        break
                    case "ArrowDown":
                        if (current < enabled.length - 1) {
                            t.write(`  ${this.fields[current].prompt}\x1B[3G`)
                            current++
                            t.write("\x1B[B")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`)
                        }
                        break
                    case "Enter":
                        disposable.dispose()
                        resolve(this.fields[current].prompt)
                        t.write(`\x1B[${len-current}B`)
                        break
                }
            })
            t.focus()
        })
    }


    start(t: Terminal) : Promise<Results> { 
        this.i = 0
        this.field = ''
        this.results = []
        return new Promise((resolve, reject) => {
            this.writeCurrentField(t)
            setTimeout(() => t.focus(), 0)
            const disposable = t.onKey(ev => {
                const key = ev.domEvent.key
                const password = this.fields[this.i].password
                switch (key) {
                    case "Escape":
                        disposable.dispose()
                        t.write("ESC\n")
                        window.terminal7.clearTempGates()
                        Form.activeForm = false
                        break
                    case "Backspace":
                        if (this.field.length > 0) {
                            this.field = this.field.slice(0, -1)
                            if (!password)
                                t.write("\b \b")
                        }
                        break
                    case "Enter":
                        t.write("\n")
                        if (!this.next(t)) {
                            resolve(this.results)
                            disposable.dispose()
                            return
                        }
                        break
                    default:
                        this.field += key
                        if (!password)
                            t.write(key)
                }
            })
            t.focus()
        })
    }

    // saves the current field and prints the next one
    // returns true if there are more fields to edit, false if done
    next(t: Terminal) {
        const current = this.fields[this.i]
        let valid = true
        if (!this.field && !current.default) {
            t.write("\n  Please enter a value")
            valid = false
        }
        else if (this.field && current.values && current.values.indexOf(this.field) == -1) {
            t.write(`\n  ${current.prompt} must be one of: ${current.values.join(', ')}`)
            valid = false
        }
        else if (this.field && current.validator) {
            const err = current.validator(this.field)
            if (err) {
                t.write(`\n  ${err}`)
                valid = false
            }
        }
        if (!valid) {
            this.field = ''
            this.writeCurrentField(t)
            return true
        }
        this.results.push(this.field || current.default || '')
        this.field = ''
        if (this.i < this.fields.length - 1) {
            this.i++
            this.writeCurrentField(t)
            return true
        }
        return false
    }

    writeCurrentField(t: Terminal) {
        const values = this.fields[this.i].values
        let def = this.fields[this.i].default
        if (values)
            def = values.map(v => v == def ? v.toUpperCase() : v).join('/')
        if (def)
            def = ` [${def}]`
        t.write(`\n  ${this.fields[this.i].prompt}${def || ''}: `)
    }
}
