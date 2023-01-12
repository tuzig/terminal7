import { Clipboard } from '@capacitor/clipboard'
import { Shell } from "./shell"
import * as TOML from '@tuzig/toml'
import { Preferences } from "@capacitor/preferences"
import { Terminal7, DEFAULT_DOTFILE } from "./terminal7"
import { Fields } from "./form"
import fortuneURL from "../resources/fortune.txt"
import { Gate } from './gate'

declare const terminal7 : Terminal7

const installMessage = `
  To get the most of T7 you need our agent - webexec.
  It's open source and you can download the binary
  for your system from: https://download.webexec.sh
  and copy it to /usr/local/bin
  Or you can use the web installer: 
`
export type Command = {
    name: string
    help: string
    usage: string
    execute(args: string[]): Promise<void>
}

export function loadCommands(shell: Shell): Map<string, Command> {
    return new Map<string, Command>(Object.entries({
        'add': {
            name: "add",
            help: "Add a new gate",
            usage: "a[dd]",
            execute: async () => addCMD(shell)
        },
        clear: {
            name: "clear",
            help: "Clear the screen",
            usage: "cle[ar]",
            execute: async () => shell.t.clear()
        },
        close: {
            name: "close",
            help: "Close the current gate",
            usage: "clo[se]",
            execute: async args => closeCMD(shell, args)
        },
        connect: {
            name: "connect",
            help: "Connect to an existing gate",
            usage: "con[nect] <gatename>",
            execute: async args => connectCMD(shell, args)
        },
        copykey: {
            name: "copykey",
            help: "Copy the public key",
            usage: "copy[key]",
            execute: async args => copyKeyCMD(shell, args)
        },
        edit: {
            name: "edit",
            help: "Edit a gate",
            usage: "e[dit] <gatename>",
            execute: async args => editCMD(shell, args)
        },
        fortune: {
            name: "fortune",
            help: "Get a fortune",
            usage: "f[ortune]",
            execute: async () => fortuneCMD(shell)
        },
        help: {
            name: "help",
            help: "This help",
            usage: "he[lp] [command]",
            execute: async args => helpCMD(shell, args)
        },
        hide: {
            name: "hide",
            help: "Hide this window",
            usage: "hi[de]",
            execute: async () => shell.map.showLog(false)
        },
        map: {
            name: "map",
            help: "Back to the map",
            usage: "m[ap]",
            execute: async () => terminal7.goHome()
        },
        gates: {
            name: "gates",
            help: "List all gates",
            usage: "g[ates]",
            execute: async () => hostsCMD(shell)
        },
        reset: {
            name: "reset",
            help: "Reset a connected gate",
            usage: "r[eset] [gatename]",
            execute: async args => resetCMD(shell, args)
        },
    }))
}

async function helpCMD(shell: Shell, args: string[]) {
    let help = ""
    if (!args[0]) {
        help += `This CLI provides full control over Terminal7.

\x1B[1mAvailable commands:\x1B[0m\n
`
        for (const [, command] of shell.commands) {
            help += `  ${command.usage}: ${command.help}\n`
        }
        help += "\nType 'help <command>' for more information."
    } else {
        const command = shell.commands.get(args[0])
        if (!command) {
            if (args[0] == "copymode") {
                help +=`
Copy mode let's you navigate, search mark & copy
the active pane's buffer. Here's are the supported keys:
  hjkl & arrows:  Move
  w: word forward
  b: word backward
  e: end of word
  $: end of line
  f<Char>: forward find <char> inclusive
  F<Char>: backward find <char> inclusive
  t<Char>: forward until before <char>
  T<Char>: backward exclusive <char> 
  0: beginning of line
  Space:  Mark
  Enter:   Copy & Exit
  ?:  Search Backward
  /:  Search Forward
  q:  Quit

All navigation commands support a repetition factor.
For example, "5k" moves the cursor 5 lines up (type hi to hide).
`
            } else
                help += "No help for " + args[0]
        } else {
            help += `\x1B[1m${command.name}\x1B[0m\n`
            help += `  ${command.help}\n`
            help += `  Usage: ${command.usage}`
        }
    }
    shell.t.writeln(help)
}

async function fortuneCMD(shell: Shell) {
    const res = await fetch(fortuneURL)
    const abages = (await res.text()).split("%\n")
    shell.t.writeln(abages[Math.floor(Math.random() * abages.length)].trim())
}

async function connectCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gate: Gate = shell.getGate(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    await new Promise<void>((resolve) => {
        gate.connect(async () => {
            if (gate.firstConnection) {
                const fields: Fields = [{
                    prompt: "Gate's name",
                    validator: (a) => gate.t7.validateHostName(a),
                }]
                fields[0].default = gate.addr
                const res = await shell.runForm(fields, "text")
                const name = res[0]
                gate.name = name
                gate.verified = true
                gate.updateNameE()
                gate.store = true
                gate.firstConnection = false
                await terminal7.storeGates()
            }
            let clipboardFilled = false
            if (gate.keyRejected) {
                const keyForm = [
                    { prompt: "Just let me in" },
                    { prompt: "Copy command to 📋" },
                ]
                const { publicKey } = await terminal7.readId()
                if (publicKey) {
                    const cmd = `echo "${publicKey}" >> "$HOME/.ssh/authorized_keys"`
                    shell.t.writeln(`\n To use face id please copy the ES25519 key by running:\n\n\x1B[1m${cmd}\x1B[0m\n`)
                    const res = await shell.runForm(keyForm, "menu")
                    switch(res) {
                        case "Copy command to 📋":
                            Clipboard.write({ string: cmd })
                            clipboardFilled = true
                            break
                    }
                }
                else 
                    terminal7.log("oops readId failed")
            } 
            if (!clipboardFilled && gate.session.isSSH && !gate.onlySSH) {
                const webexecForm = [
                    { prompt: "Just let me in" },
                    { prompt: "Copy command to 📋" },
                    { prompt: "Always use SSH for this host" },
                ]
                const cmd = "bash <(curl -sL https://get.webexec.sh)"
                shell.t.writeln(installMessage)
                shell.t.writeln(`  \x1B[1m${cmd}\x1B[0m\n`)
                const res = await shell.runForm(webexecForm, "menu")
                switch(res) {
                    case "Copy command to 📋":
                        Clipboard.write({ string: cmd })
                        break

                    case "Always use SSH for this host":
                        gate.onlySSH = true
                        await gate.t7.storeGates()
                        break
                }
            }
            gate.load()
            Preferences.get({key: "first_gate"}).then(v => {
                if (v.value != "nope")
                    setTimeout(() => {
                        Preferences.set({key: "first_gate", value: "nope"})
                        terminal7.toggleHelp()
                    }, 1000)
            })
            resolve()
        })
        gate.onFailure = reason => {
            terminal7.log(`Connect command got failure ${reason}`) 
            terminal7.storeGates()
            resolve()
        }
    })
}

async function addCMD(shell: Shell) {
    // TODO: add peerbook registration
    // if (!terminal7.conf.peerbook) {
    // eslint-disable-next-line no-constant-condition
    if (false) {
        const pbForm = [
            { prompt: "Add static host" },
            { prompt: "Setup peerbook" }
        ]
        let choice
        try {
            choice = await shell.runForm(pbForm, "menu")
        } catch (e) {
            terminal7.log("add cmd menu got error: ", e)
            return
        }
        if (choice == "Setup peerbook")
            return peerbookForm(shell)
    }
    const f = [
        { prompt: "Enter destination (ip or domain)" }
    ]
    let hostname: string
    try {
        hostname = (await shell.runForm(f, "text"))[0]
    } catch (e) { 
        return
    }

    if (terminal7.validateHostAddress(hostname)) {
        shell.t.writeln(`  ${hostname} already exists, connecting...`)
        await new Promise<void>(resolve => {
            const gate = shell.getGate(hostname)
            gate.connect(() => {
                gate.load()
                resolve()
            })
        })
        return
    }
    const gate = terminal7.addGate({
        name: hostname, // temp name
        addr: hostname,
        id: hostname,
        firstConnection: true,
        store: true,
    })
    return connectCMD(shell, [gate.name])
}

async function peerbookForm(shell: Shell) {
    let dotfile = (await Preferences.get({key: 'dotfile'})).value || DEFAULT_DOTFILE

    const f = [
        {
            prompt: "Email",
            validator: email => !email.match(/.+@.+\..+/) ? "Must be a valid email" : ''
        },
        { prompt: "Peer's name" }
    ]
    let results
    try {
        results = await shell.runForm(f, "text")
    } catch (e) {
        return
    }
    const email = results[0],
        peername = results[1]

    dotfile += `
[peerbook]
email = "${email}"
peer_name = "${peername}"
`

    Preferences.set({ key: "dotfile", value: dotfile })
    terminal7.loadConf(TOML.parse(dotfile))
    terminal7.notify("Your email was added to the dotfile")
    terminal7.pbConnect()
    await terminal7.clear()
}

async function resetCMD(shell: Shell, args: string[]) {
    let gate
    if (args[0]) {
        gate = shell.getGate(args[0])
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
        prompt: `Factory reset will remove the key, certificate,\n     all gates and configuration`,
        values: ["y", "n"],
        default: "n"
    }]
    if (!gate.onlySSH)
        // Add the connection reset option for webrtc
        fields.splice(0,0, { prompt: "Reset connection" })
    shell.t.writeln(`\x1B[4m${gate.name}\x1B[0m`)
    let choice
    try {
        choice = await shell.runForm(fields, "menu")
    } catch (e) {
        return
    }
    let ans

    switch (choice) {
        case "Reset connection":
            // TODO: simplify
            if (gate.session) {
                gate.session.close()
                gate.session = null
            }
            try {
                await new Promise<void>((resolve, reject) => {
                //setTimeout(() => {
                    gate.connect(() => {
                        gate.load()
                        resolve()
                    })
                    gate.onFailure = reject
                // }, 100)
                })
            } catch(e) {
                shell.t.writeln("Failed to connect. Please try again and if it keeps failing, close and connect fresh.")
                shell.t.writeln("  Please take the time to write your flow\n  in ##🪳bugs🪳at https://discord.com/invite/rDBj8k4tUE")
                return
            }

            break

        case "Reset connection & Layout":
            if (gate.session) {
                gate.session.close()
                gate.session = null
            }
            await new Promise<void>(resolve => {
                gate.connect(() => {
                    gate.clear()
                    gate.map.showLog(false)
                    gate.activeW = gate.addWindow("", true)
                    gate.focus()
                    resolve()
                })
            })
            break

        case "\x1B[31mFactory reset\x1B[0m":
            try {
                ans = (await shell.runForm(factoryResetVerify, "text"))[0]
            } catch (e) {
                return
            }
            if (ans == "y") {
                gate.t7.factoryReset()
                gate.close()
            }
            else
                shell.map.showLog(false)
            break
        case "Close gate":
            gate.close()
            break
    }
}

async function editCMD (shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gate = shell.getGate(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    const fMain = [
        { prompt: "Edit" },
        { prompt: "Connect" },
        { prompt: "\x1B[31mDelete\x1B[0m" },
    ]
    let fFields = [
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
        { prompt: "Username", default: gate.username || ""},
        { prompt: "SSH only", values: ["y", "n"], default: gate.onlySSH?"y":"n" },
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
        choice = await shell.runForm(fMain, "menu", "")
    } catch (e) {
        return
    }
    const gateAttrs = ["name", "addr", "username", "onlySSH"]
    switch (choice) {
        case 'Connect':
            await connectCMD(shell, [hostname])
            break
        case 'Edit':
            try {
                enabled = await shell.runForm(fFields, "choice", `\x1B[4m${gate.name}\x1B[0m edit`)
            } catch (e) {
                return
            }
            if (!enabled) {
                await gate.t7.clear()
                return
            }
            fFields = fFields.filter((_, i) => enabled[i])
            try {
                res = await shell.runForm(fFields, "text")
            } catch (e) {
                return
            }
            gateAttrs.filter((_, i) => enabled[i])
                     .forEach((k, i) => 
                        gate[k] = (k == 'onlySSH')?res[i] == 'y':res[i])
            if (enabled[1]) {
                gate.t7.gates.delete(gate.id)
                gate.t7.gates.set(gate.id, gate)
            }
            gate.t7.storeGates()
            gate.updateNameE()
            shell.map.showLog(false)
            break
        case "\x1B[31mDelete\x1B[0m":
            try {
                res = await shell.runForm(fDel, "text")
            } catch (e) {
                return
            }
            if (res[0] == "y")
                gate.delete()
            await gate.t7.clear()
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

async function closeCMD(shell: Shell, args: string[]) {
    let gate: Gate
    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate)
            return shell.t.writeln(`Host not found: ${args[0]}`)
    } else {
        gate = terminal7.activeG
        if (!gate)
            return shell.t.writeln("No active connection")
    }
    gate.close()
}
async function copyKeyCMD(shell: Shell) {
    let publicKey
    try {
        const ret = await terminal7.readId()
        publicKey = ret.publicKey
    } catch(e) {
        console.log("readId erro", e)
    }
    if (publicKey) {
        Clipboard.write({ string: publicKey })
        return shell.t.writeln(`${publicKey}\n☝️ copied to 📋`)
    } else
        return shell.t.writeln("No key yet. Please connect to generate one.\n(try connect or add)")
}
