import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Clipboard } from '@capacitor/clipboard'
import { Shell } from "./shell"
import { Preferences } from "@capacitor/preferences"
import { Terminal7 } from "./terminal7"
import { Fields } from "./form"
import fortuneURL from "../resources/fortune.txt"
import { Gate } from './gate'
import { Capacitor } from '@capacitor/core'
import { SSHSession } from './ssh_session'
import { Failure } from './session'

declare const terminal7 : Terminal7

const installMessage = `
        session.on
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
            usage: "conn[ect] <gatename>",
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
        install: {
            name: "install",
            help: "Install webexec",
            usage: "i[nstall] [gatename]",
            execute: async args => installCMD(shell, args)
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
            help: "Reset various settings",
            usage: "r[eset]",
            execute: async args => resetCMD(shell, args)
        },
        subscribe: {
            name: "subscribe",
            help: "Subscripte to peerbook",
            usage: "sub[scribe]",
            execute: async () => subscribeCMD(shell)
        },
        config: {
            name: "config",
            help: "Edit the config file",
            usage: "conf[ig]",
            execute: async () => configCMD(shell),
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
    await new Promise<void>(async (resolve) => {
        const hostname = args[0]
        if (!hostname) {
            shell.t.writeln("Missing hostname")
            resolve()
            return
        }
        const gate: Gate = shell.getGate(hostname)
        if (!gate) {
            shell.t.writeln(`Host not found: ${hostname}`)
            resolve()
            return
        }
        if (gate.fp) {
            if (!gate.verified) {
                shell.verifyPeer(gate).catch(() => {
                    shell.t.writeln("Doing nothing")
                    resolve()
                    return
                })
            }
            if (!gate.online) {
                shell.t.writeln("Host is offline")
                resolve()
                return
            }
        }
    // eslint-disable-next-line
        gate.onFailure = reason => {
            terminal7.log(`Connect command got failure ${reason}`) 
            shell.stopWatchdog()
            gate.close()
            terminal7.storeGates()
            resolve()
        }
        if (Capacitor.isNativePlatform())  {
            if (!gate.fp && !gate.username) {
                try {
                    gate.username = await shell.askValue("Username")
                } catch (e) {
                    gate.notify("Failed to get username")
                }
            }
        }
        shell.startWatchdog().catch(e => gate.handleFailure(e))
        gate.connect(async () => {
            shell.stopWatchdog()
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
    })
}

async function addCMD(shell: Shell) {
    const f = [
        { prompt: "Enter destination (ip or domain)" }
    ]
    let hostname: string
    try {
        hostname = (await shell.runForm(f, "text"))[0]
    } catch (e) { 
        console.log("got error", e)
        return
    }

    if (shell.getGate(hostname)) {
        shell.t.writeln(`${hostname} already exists, connecting...`)
        return connectCMD(shell, [hostname])
    }
    const gate = terminal7.addGate({
        name: hostname, // temp name
        addr: hostname,
        id: hostname,
        firstConnection: true,
        store: true,
    })
    terminal7.storeGates()
    return connectCMD(shell, [gate.name])
}

async function resetCMD(shell: Shell, args: string[]) {
    let gate: Gate
    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate) {
            return shell.t.writeln(`Host not found: ${args[0]}`)
        }
    } else {
        gate = terminal7.activeG
    }
    if (gate) {
        const fields = [
            { prompt: "Close gate" },
            { prompt: "Reset connection & Layout" },
            { prompt: "\x1B[31mFactory reset\x1B[0m" },
        ]
        if (!gate.onlySSH)
            // Add the connection reset option for webrtc
            fields.splice(0, 0, { prompt: "Reset connection" })
        shell.t.writeln(`\x1B[4m${gate.name}\x1B[0m`)
        let choice
        try {
            choice = await shell.runForm(fields, "menu")
        } catch (e) {
            return
        }

        switch (choice) {
            case "Reset connection":
                // TODO: simplify
                if (gate.session) {
                    gate.session.close()
                    gate.session = null
                }
                // reset peerbook connection
                terminal7.pb = null
                try {
                    await shell.runCommand("connect", [gate.name])
                } catch(e) {
                    shell.t.writeln("Failed to connect. Please try again and if it keeps failing, close and connect fresh.")
                    shell.t.writeln("  Please take the time to write your flow\n  in ##🪳bugs🪳at https://discord.com/invite/rDBj8k4tUE")
                }
                return

            case "Reset connection & Layout":
                if (gate.session) {
                    gate.session.close()
                    gate.session = null
                }
                await shell.runCommand("connect", [gate.name])
                gate.clear()
                gate.map.showLog(false)
                gate.activeW = gate.addWindow("", true)
                gate.focus()
                return

            case "Close gate":
                gate.close()
                return
        }
    }
    const reset = [
        { prompt: "Fingerprint" },
        { prompt: "Gates" },
        { prompt: "Private/public key" },
        { prompt: "\x1B[31mEverything\x1B[0m" },
    ]
    const factoryResetVerify = [{
        prompt: `Factory reset will remove the key, certificate,\n     all gates and configuration`,
        values: ["y", "n"],
        default: "n"
    }]
    const res = await shell.runForm(reset, "menu", "What do you want to reset?")
    switch(res) {
        case "Fingerprint":
            await Preferences.remove({key: "PBUID"})
            await CapacitorPurchases.logOut()
            shell.t.writeln("Unsubscribed")
            terminal7.pbClose()
            break
        case "Gates":
            terminal7.resetGates()
            break
        case "Private/public key":
            terminal7.keys = undefined
            shell.t.writeln("Keys removed")
            break
        case "\x1B[31mEverything\x1B[0m":
            const ans = (await shell.runForm(factoryResetVerify, "text"))[0]
            if (ans == "y") {
                terminal7.factoryReset()
            }
            else
                this.map.showLog(false)
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
    terminal7.gates.forEach(gate => {
        res += `\x1B[1m${gate.name}:\x1B[0m ${gate.addr} ${gate.fp || ""}\n`
    })
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
async function subscribeCMD(shell: Shell) {
    const { customerInfo } = await CapacitorPurchases.getCustomerInfo()
    if (!customerInfo.entitlements.active.peerbook) {
        const offer = await shell.getOffer()
        if (!offer)
            return
        shell.t.writeln("Directing to payment...")
        await shell.subscribe(offer)
    } else {
        shell.t.writeln("You are already subscribed")
        // call purchase update manualy
        terminal7.pbConnect()
    }
}
export async function installCMD(shell: Shell, args: string[]) {
    let gate: Gate

    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate) {
            shell.t.writeln(`Host not found: ${args[0]}`)
            return
        }
    } else {
        gate = terminal7.activeG
        if (!gate) {
            shell.t.writeln("Please select gate:")
            const choices = []
            terminal7.gates.forEach(gate => {
                choices.push({ prompt: gate.name })
            })
            if (choices.length == 0) {
                shell.t.writeln("No gates found")
                shell.t.writeln("Please `add` one and run install again")
                return
            }
            shell.t.writeln("Please select where to install:")
            const choice = await shell.runForm(choices, "menu")
            gate = shell.getGate(choice)
        }
    }
    // Connect to the gate over SSH and install webexec
    let publicKey, privateKey
    try {
        const ids = await terminal7.readId()
        publicKey = ids.publicKey
        privateKey = ids.privateKey
    } catch(e) {
        console.log("readId error", e)
    }

    const session = new SSHSession(gate.addr, gate.username)
    session.onStateChange = async (state, failure?: Failure) => {
        const host = terminal7.conf.net.peerbook
        let channel: SSHChannel
        let password: string
        let data 
        terminal7.log("Install SSH session got state", state, failure)
        switch (state) {
            case "connecting":
                shell.t.writeln("Connecting...")
                break
            case "connected":
                shell.t.writeln("Connected")
                try {
                    console.log("opening channel", shell.t.cols, shell.t.rows)
                    channel = await session.openChannel(
                        ["*"], null,
                        shell.t.cols, shell.t.rows)
                } catch (e) {
                    shell.t.writeln("Error opening channel")
                    shell.t.writeln("Please try again or type `support`")
                    return
                }
                shell.t.clear()
                shell.t.writeln(`Connecting to ${gate.addr}`)
                shell.masterChannel = channel
                // set #log border color to yellow
                document.getElementById("log").style.borderColor = "var(--remote-border)"
                data  = await terminal7.pbVerify()
                channel.send(`PEERBOOK_UID=${data.uid} PEERBOOK_HOST=${host} bash <(curl -sL https://get.webexec.sh)`)
                channel.onMessage = async msg => {
                    shell.t.write(msg)
                    // use regex to extract the fingerprint from the message.
                    // fingerprint is on a line "Fingerprint: <fingerprint>"
                    const match = msg.match(/Fingerprint:\s*([A-F0-9]+)/)
                    if (match) {
                        const fp = match[1]
                        // install is done, now we need to verify the fingerprint
                        setTimeout(async () => {
                            document.getElementById("log").style.borderColor = "var(--local-border)"
                            shell.masterChannel = null
                            channel.close()
                            shell.t.writeln("~~~ Orderly Disconnect")
                            // will throw exception if not verified
                            await shell.verifyFP(fp, "Finished install, enter OTP to verify")
                            shell.t.writeln("Gate is installed & verified")
                            // TODO: resolve the command that started it all
                        }, 100)
                    }
                }   
                break
            case "failed":
                if (failure == Failure.KeyRejected) {
                    shell.t.write("🔑 Rejected")
                    password = await shell.askPass()
                    session.passConnect(null, password)
                    return
                } else {
                    shell.t.writeln("Connection failed")
                    shell.t.writeln("Please try again or type `support`")
                    return
                }
                break
        }
    }
    session.connect(0, publicKey, privateKey)
}
async function configCMD(shell: Shell) {
    shell.t.writeln("Opening vi-style editor.")
    shell.t.writeln("Use \x1B[1;37m:w\x1B[0m to save & exit or \x1B[1;37m:q\x1B[0m to exit without saving.")
    shell.t.writeln("An example config is available at")
    shell.t.writeln("https://github.com/tuzig/terminal7/wiki/Setting-file-format")
    await shell.waitForKey()
    await shell.openConfig()
}

