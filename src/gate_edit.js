import { Terminal } from "@tuzig/xterm"

export class Edit {
    constructor(gate) {
        this.gate = gate
        this.name = gate.name
        this.addr = gate.addr
        this.username = gate.username
        this.createElement()
        this.field = ''
        this.state = 0
    }

    createElement() {
        this.e = document.createElement("div")
        this.e.cell = this
        this.e.classList = "edit-gate"
        document.getElementById("terminal7").appendChild(this.e)
        return this.e
    }

    openTerminal() {
        this.terminal = new Terminal({
            cols: 80,
            rows: 24,
            cursorBlink: true,
            cursorStyle: "block"
        })
        this.terminal.open(this.e)
        this.terminal.write(`Name [${this.name}]: `)
        this.terminal.onKey(ev => this.handleKey(ev.domEvent.key))
    }

    handleKey(key) {
        switch (key) {
            case "Escape":
                this.close()
                break
            case "Backspace":
                this.terminal.write("\b \b")
                this.field = this.field.slice(0, -1)
                break
            case "Enter":
                this.next()
                break
            default:
                this.field += key
                this.terminal.write(key)
        }
    }

    next() {
        this.terminal.write("\r\n")
        switch (this.state) {
            case 0:
                this.terminal.write(`Hostname [${this.addr}]: `)
                this.name = this.field || this.name
                break
            case 1:
                this.terminal.write(`Username [${this.username}]: `)
                this.addr = this.field || this.addr
                break
            case 2:
                this.username = this.field || this.username
                this.send()
                break
        }
        this.state++
        this.field = ''
    }

    send() {
        console.log(this.name, this.addr, this.username)
        this.gate.name = this.name
        this.gate.addr = this.addr
        this.gate.username = this.username
        this.gate.nameE.innerHTML = this.name || this.addr
        this.close()
    }

    close() {
        this.gate.t7.longPressGate = null
        this.e.remove()
    }
}