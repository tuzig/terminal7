import { Terminal } from "@tuzig/xterm"
import { FitAddon } from "xterm-addon-fit"

export type Fields = Array<{
    prompt:string,
    default?:string,
    values?:Array<string>,
    validator?:(field: string) => string,
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
    terminal.open(e)
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    fitAddon.fit()
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

    constructor(fields: Fields) {
        this.fields = fields
    }

    chooseFields(t: Terminal) {
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        return new Promise<Array<boolean>>((resolve, reject) => {
            t.write("\n  Choose fields to edit:")
            t.write("\n  [Use arrows to move, space to select, right to all, left to none]")
            t.write("\n  " + this.fields.map(f => `[ ] ${f.prompt}: ${f.default}`).join('\n  '))
            t.write(`\x1B[4G\x1B[${len - 1}A`) // move cursor to first field
            const disposable = t.onKey(ev => {
                const key = ev.domEvent.key
                const char = !enabled[current] ? 'X' : ' '
                switch (key) {
                    case "Escape":
                        reject()
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
                        t.reset()
                        disposable.dispose()
                        resolve(enabled)
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
        })
    }


    start(t: Terminal) : Promise<Results> { 
        this.i = 0
        this.field = ''
        this.results = []
        return new Promise((resolve, reject) => {
            this.writeCurrentField(t)
            setTimeout(() => t.focus(), 0)
            t.onKey(ev => {
                const key = ev.domEvent.key
                switch (key) {
                    case "Escape":
                        reject()
                        return
                    case "Backspace":
                        if (this.field.length > 0) {
                            t.write("\b \b")
                            this.field = this.field.slice(0, -1)
                        }
                        break
                    case "Enter":
                        if (!this.next(t)) {
                            resolve(this.results)
                            return
                        }
                        break
                    default:
                        this.field += key
                        t.write(key)
                }
            })
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
