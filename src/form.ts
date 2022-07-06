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
    terminal: Terminal
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
            t.write(`\n  ${this.fields[0].desc} [${this.fields[0].default || ''}]: `)
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
        t.write("\r\n")
        if (this.i < this.fields.length - 1) {
            this.results.push(this.field || this.fields[this.i].default || '')
            this.i++
            t.write(`  ${this.fields[this.i].desc} [${this.fields[this.i].default || ''}]: `)
            this.field = ''
            return true
        }
        return false
    }
}