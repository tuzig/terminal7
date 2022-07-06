import { Terminal } from "@tuzig/xterm"
import { FitAddon } from "xterm-addon-fit"

export type Fields = Array<{
    desc:string,
    default?:string,
    values?:Array<string>,
    validator?:(field: string) => string,
}>

export type Results = Array<string>

export function openFormsTerminal(e: HTMLElement) {
    const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        theme: terminal7.conf.theme,
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

    next(t: Terminal) {
        const def = this.fields[this.i]
        let valid = true
        if (!this.field && !def.default) {
            t.write("\n  Please enter a value")
            valid = false
        }
        else if (this.field != '') {
            if (def.values) {
                if (def.values.indexOf(this.field) ===-1) {
                    t.write(`\n  ${this.fields[this.i].desc} must be one of: ${def.values.join(', ')}`)
                    valid = false
                }
            }
            if (def.validator) {
                const err = def.validator(this.field)
                if (err) {
                    t.write(`\n  ${err}`)
                    valid = false
                }
            }
        }
        if (!valid) {
            this.field = ''
            this.writeCurrentField(t)
            return true
        }
        this.results.push(this.field || this.fields[this.i].default || '')
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
        t.write(`\n  ${this.fields[this.i].desc}${def || ''}: `)
    }
}