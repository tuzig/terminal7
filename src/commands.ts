import { Shell } from "./shell"
import { WebRTCSession } from "./webrtc_session"
import * as TOML from '@tuzig/toml'
import { Storage } from "@capacitor/storage"
import { Terminal7, DEFAULT_DOTFILE } from "./terminal7"

declare const terminal7 : Terminal7

export type Command = {
    name: string
    help: string
    usage: string
    execute(args: string[]): Promise<void>
}

export function loadCommands(shell: Shell): Map<string, Command> {
    return new Map<string, Command>(Object.entries({
        help: {
            name: "help",
            help: "This help",
            usage: "help [command]",
            execute: async args => helpCMD(shell, args)
        },
        fortune: {
            name: "fortune",
            help: "Get a fortune",
            usage: "fortune",
            execute: async () => fortuneCMD(shell)
        },
        echo: {
            name: "echo",
            help: "Echo a message",
            usage: "echo <message>",
            execute: async args => echoCMD(shell, args)
        },
        clear: {
            name: "clear",
            help: "Clear the screen",
            usage: "clear",
            execute: async () => shell.t.clear()
        },
        connect: {
            name: "connect",
            help: "Connect to an existing host",
            usage: "connect <hostname>",
            execute: async args => connectCMD(shell, args)
        },
        'add-host': {
            name: "add-host",
            help: "Add a new host",
            usage: "add-host",
            execute: async () => addHostCMD(shell)
        },
        reset: {
            name: "reset",
            help: "Reset a running or the active host",
            usage: "reset [hostname]",
            execute: async args => resetCMD(shell, args)
        },
        edit: {
            name: "edit",
            help: "Edit a host",
            usage: "edit <hostname>",
            execute: async args => editCMD(shell, args)
        },
        hosts: {
            name: "hosts",
            help: "List all hosts",
            usage: "hosts",
            execute: async () => hostsCMD(shell)
        },
        home: {
            name: "home",
            help: "Go to the home page",
            usage: "home",
            execute: async () => terminal7.goHome()
        }
    }))
}

async function helpCMD(shell: Shell, args: string[]) {
    let help = ""
    if (!args[0]) {
        help += "\x1B[1mAvailable commands:\x1B[0m\n"
        for (const [name, command] of shell.commands) {
            help += `  ${name}: ${command.help}\n`
        }
        help += "\nType 'help <command>' for more information."
    } else {
        const command = shell.commands.get(args[0])
        if (!command)
            help = `Command not found: ${args[0]}`
        else {
            help += `\x1B[1m${command.name}\x1B[0m\n`
            help += `  ${command.help}\n`
            help += `  Usage: ${command.usage}`
        }
    }
    shell.t.writeln(help)
}

async function fortuneCMD(shell: Shell) {
    const res = await fetch("https://raw.githubusercontent.com/ruanyf/fortunes/master/data/fortunes")
    shell.t.writeln((await res.text()).split("%\n")[Math.floor(Math.random() * 100)].trim())
}

async function echoCMD(shell: Shell, args: string[]) {
    shell.t.writeln(args.join(" "))
}

async function connectCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gates = terminal7.gates
    const gate = gates.get(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    await new Promise<void>((resolve) => {
        gate.connect(() => {
            gate.load()
            resolve()
        }, () => {
            shell.t.writeln(`Failed to connect to ${hostname}`)
            resolve()
        })
    })
}

async function addHostCMD(shell: Shell) {
    if (!terminal7.conf.peerbook) {
        const pbForm = [
            { prompt: "Add static host" },
            { prompt: "Setup peerbook" }
        ]
        let choice
        try {
            choice = await shell.newForm(pbForm, "menu")
        } catch (e) {
            return
        }
        if (choice == "Setup peerbook") {
            await peerbookForm(shell)
            return
        }
    }
    const f = [
        { prompt: "Enter destination (ip or domain)" }
    ]
    let hostname
    try {
        hostname = (await shell.newForm(f, "text"))[0]
    } catch (e) { 
        return
    }

    if (terminal7.validateHostAddress(hostname)) {
        shell.t.writeln(`  ${hostname} already exists, connecting...`)
        terminal7.gates.get(hostname).connect()
        return
    }
    terminal7.activeG = terminal7.addGate({
        name: "temp_" + Math.random().toString(16).slice(2), // temp random name
        addr: hostname,
        id: hostname
    }, false)
    shell.map.refresh()
    await terminal7.activeG.CLIConnect(() => {
        shell.t.writeln(`Failed to connect to ${hostname}`)
    })
}

async function peerbookForm(shell: Shell) {
    let dotfile = (await Storage.get({key: 'dotfile'})).value || DEFAULT_DOTFILE

    const f = [
        {
            prompt: "Email",
            validator: email => !email.match(/.+@.+\..+/) ? "Must be a valid email" : ''
        },
        { prompt: "Peer's name" }
    ]
    let results
    try {
        results = await shell.newForm(f, "text")
    } catch (e) {
        return
    }
    const email = results[0],
        peername = results[1]

    dotfile += `
[peerbook]
email = "${email}"
peer_name = "${peername}"\n`

    Storage.set({ key: "dotfile", value: dotfile })
    terminal7.loadConf(TOML.parse(dotfile))
    terminal7.notify("Your email was added to the dotfile")
    terminal7.pbConnect()
    terminal7.clear()
}

async function resetCMD(shell: Shell, args: string[]) {
    let gate
    if (args[0]) {
        gate = terminal7.gates.get(args[0])
        if (!gate)
            return shell.t.writeln(`Host not found: ${args[0]}`)
    } else {
        gate = terminal7.activeG
        if (!gate)
            return shell.t.writeln("No active connection")
    }
    const fields = [
        { prompt: "Reset connection & Layout" },
        { prompt: "Close gate" },
        { prompt: "\x1B[31mFactory reset\x1B[0m" },
    ]
    const factoryResetVerify = [{
        prompt: `Factory reset will remove all gates,\n    the certificate and configuration changes.`,
        values: ["y", "n"],
        default: "n"
    }]
    if (gate.session instanceof WebRTCSession)
        // Add the connection reset option for webrtc
        fields.splice(0,0, { prompt: "Reset connection" })
    shell.t.writeln(`\x1B[4m${gate.name}\x1B[0m`)
    let choice
    try {
        choice = await shell.newForm(fields, "menu")
    } catch (e) {
        return
    }
    let ans
    switch (choice) {
        case "Reset connection":
            gate.disengage().then(async () => {
                if (gate.session) {
                    gate.session.close()
                    gate.session = null
                }
                gate.t7.run(() =>  {
                    gate.connect()
                }, 100)
            }).catch(() => gate.connect())
            break
        case "Reset connection & Layout":
            try {
                if (gate.session) {
                    await gate.disengage()
                    gate.session.close()
                    gate.session = null
                }
                gate.connect(() => {
                    gate.clear()
                    gate.map.showLog(false)
                    gate.activeW = gate.addWindow("", true)
                    gate.focus()
                })
            } catch(e) {
                gate.notify("Connect failed")
            }
            break
        case "\x1B[31mFactory reset\x1B[0m":
            try {
                ans = (await shell.newForm(factoryResetVerify, "text"))[0]
            } catch (e) {
                return
            }
            if (ans == "y") {
                gate.t7.factoryReset()
                gate.clear()
                gate.t7.goHome()
            }
            else
                shell.map.showLog(false)
            break
        case "Close gate":
            gate.boarding = false
            gate.clear()
            gate.updateNameE()
            if (gate.session) {
                gate.session.close()
                gate.session = null
            }
            // we need the timeout as cell.focus is changing the href when dcs are closing
            setTimeout(() => gate.t7.goHome(), 100)
            break
    }
}

async function editCMD (shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gates = terminal7.gates
    const gate = gates.get(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    const f1 = [
        { prompt: "Connect" },
        { prompt: "Edit" },
        { prompt: "\x1B[31mDelete\x1B[0m" },
    ]
    let f2 = [
        {
            prompt: "Name",
            default: gate.name,
            validator: a => gate.t7.validateHostName(a)
        },
        { 
            prompt: "Hostname",
            default: gate.addr,
            validator: a => gate.t7.validateHostAddress(a)
        },
        { prompt: "Username", default: gate.username }
    ]
    const fDel = [{
        prompt: `Delete ${gate.name}?`,
        values: ["y", "n"],
        default: "n",
    }]
    if (typeof(gate.fp) == "string") {
        gate.notify("Got peer from \uD83D\uDCD6, connect only")
        return
    }
    let choice, enabled, res
    try {
        choice = await shell.newForm(f1, "menu", `Menu for \x1B[4m${gate.name}\x1B[0m:`)
    } catch (e) {
        return
    }
    const gateAttrs = ["name", "addr", "username"]
    switch (choice) {
        case 'Connect':
            await connectCMD(shell, [hostname])
            break
        case 'Edit':
            try {
                enabled = await shell.newForm(f2, "choice", `\x1B[4m${gate.name}\x1B[0m edit`)
            } catch (e) {
                return
            }
            if (!enabled) {
                gate.t7.clear()
                return
            }
            f2 = f2.filter((_, i) => enabled[i])
            try {
                res = await shell.newForm(f2, "text")
            } catch (e) {
                return
            }
            gateAttrs.filter((_, i) => enabled[i])
                .forEach((k, i) => gate[k] = res[i])
            if (enabled[1]) {
                gate.t7.gates.delete(gate.id)
                gate.id = gate.addr
                gate.t7.gates.set(gate.id, gate)
            }
            gate.t7.storeGates()
            gate.updateNameE()
            shell.map.showLog(false)
            break
        case "\x1B[31mDelete\x1B[0m":
            try {
                res = await shell.newForm(fDel, "text")
            } catch (e) {
                return
            }
            if (res[0] == "y")
                gate.delete()
            gate.t7.clear()
            break
    }
}

async function hostsCMD(shell: Shell) {
    let res = ""
    for (const [name, gate] of terminal7.gates) {
        res += `\x1B[1m${name}:\x1B[0m ${gate.addr}\n`
    }
    shell.t.writeln(res)
}

