import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Clipboard } from '@capacitor/clipboard'
import { Shell } from "./shell"
import * as TOML from '@tuzig/toml'
import { Preferences } from "@capacitor/preferences"
import { Terminal7, DEFAULT_DOTFILE } from "./terminal7"
import { Fields } from "./form"
import fortuneURL from "../resources/fortune.txt"
import { Gate } from './gate'
import { Capacitor } from '@capacitor/core'

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
        install: {
            name: "install",
            help: "Install webexec",
            usage: "i[install] [gatename]",
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
            help: "Reset a connected gate",
            usage: "r[eset] [gatename]",
            execute: async args => resetCMD(shell, args)
        },
        subscribe: {
            name: "subscribe",
            help: "Subscripte to peerbook",
            usage: "sub[scribe]",
            execute: async args => subscribeCMD(shell, args)
        },
        unsubscribe: {
            name: "unsubscribe",
            help: "Subscripte from peerbook",
            usage: "unsub[scribe]",
            execute: async args => unsubscribeCMD(shell)
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
    if (gate.fp) {
        if (!gate.verified)
            return shell.t.writeln(`Host unverified, please verify at ${terminal7.conf.net.peerbook}`)
        if (!gate.online)
            return shell.t.writeln("Host offline")
    }
    // eslint-disable-next-line
    await new Promise<void>(async (resolve) => {
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
    const fields = [
        { prompt: "Close gate" },
        { prompt: "Reset connection & Layout" },
        { prompt: "\x1B[31mFactory reset\x1B[0m" },
    ]
    const factoryResetVerify = [{
        prompt: `Factory reset will remove the key, certificate,\n     all gates and configuration`,
        values: ["y", "n"],
        default: "n"
    }]
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
    let ans

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
                return
            }

            break

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
async function subscribeCMD(shell: shell, args: string[]) {
    let { customerInfo } = await CapacitorPurchases.getCustomerInfo()
    if (!customerInfo.entitlements.active.peerbook) {
        const packageTypeName = {
            'ANNUAL': 'a year',
            'MONTHLY': 'a month',
            'TWO_MONTH': 'two months',
            'THREE_MONTH': 'three months',
            'SIX_MONTH': 'six months',
            'LIFETIME': 'a lifetime',
            'WEEKLY': 'a week',
        }

        let offer
        try {
            // Enable to get debug logs in dev mode            
            const { offerings } = await CapacitorPurchases.getOfferings()
            offer = offerings.current
        } catch (err) {
            shell.t.writeln("Error getting offerings")
            terminal7.log("Error getting offerings: " + err)
            return false
        }
        if (offer == null) {  
            return false
                // Display current offering with offerings.current
        }  
        const pack = offer.availablePackages[0]
        const product = pack.product
        const term = packageTypeName[pack.packageType]
        shell.t.writeln(offer.serverDescription)
        const subPrompt = `Start your trial month (then ${product.priceString} for ${term})`
        const subscribeMenu = [
            { prompt: "No thanks" },
            { prompt: subPrompt },
            { prompt: "Don't offer again" },
        ]
        let choice: string
        try {
            choice = await shell.runForm(subscribeMenu, "menu")
        } catch (err) {
            shell.t.writeln("Error getting choice")
            return
        }
        if (choice == subPrompt) {
            shell.t.writeln("Thank you. Store will open momentarily.")
            shell.startHourglass(terminal7.conf.ui.subscribeTimeout)
            terminal7.ignoreAppEvents = true
            try {
                const data = await CapacitorPurchases.purchasePackage({
                    identifier: pack.identifier,
                    offeringIdentifier: pack.offeringIdentifier,
                })
                customerInfo = data.customerInfo
                shell.t.writeln("Waiting for store confirmation...")
            } catch(e) {
                shell.t.writeln("Error purchasing, please try again or contact support")
            } finally {
                shell.stopHourglass()
            }
        }
    } else {
        shell.t.writeln("You are already subscribed")
        // call purchase update manualy
        terminal7.pbConnect()
    }
}
async function installCMD(shell: Shell, args: string[]) {
    let gate: Gate
    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate)
            return shell.t.writeln(`Host not found: ${args[0]}`)
    } else {
        gate = terminal7.activeG
        if (!gate) {
            shell.t.writeln("Please select where to install:")
            let choices = []
            for (const [k, gate] of terminal7.gates)
                choices.push({ prompt: gate.name })
            const choice = await shell.runForm(choices, "menu")
            gate = shell.getGate(choice)
        }
    }
    // Connect to the gate over SSH and install webexec
    const { publicKey } = await terminal7.readId()
    const session = new SSHSession(gate.addr, gate.username)
    session.onStateChange = async (state, failure?) => {
        switch (state) {
            case "connecting":
                shell.t.writeln("Connecting...")
            case "connected":
                shell.t.writeln("Connected")
                let channel: SSHChannel
                try {
                    channel = await session.openChannel(
                        ["/usr/bin/env", "bash", "<(curl -sL https://get.webexec.sh)"],
                        shell.t.cols, shell.t.rows)
                } catch (e) {
                    shell.t.writeln("Error opening channel")
                    shell.t.writeln("Please try again or type `support`")
                    return
                }
                shell.t.clear()
                shell.masterChannel = channel
                let fingerprint = ""
                channel.onMessage = data => {
                    shell.t.write(data)
                    // use regex to extract the fingerprint from the data.
                    // fingerprint is on a line "Fingerprint: <fingerprint>"
                    fingerprint = data.match(/Fingerprint: (.*)/)?.[1]
                    if (fingerprint) {
                        // install is done, now we need to verify the fingerprint
                        shell.t.writeln("Install finished")
                        channel.close()
                    }
                }   
                // channel.send("bash <(curl -sL https://get.webexec.sh)")
                channel.onClose = () => { 
                    this.masterChannel = null
                    if (fingerprint)
                        this.onInstallDone(shell, fingerprint) 
                    else {
                        shell.t.writeln("Install failed")
                        shell.t.writeln("Please try again or type `support`")
                    }
                }

        }
    }
}
async function unsubscribeCMD(shell: Shell) {
    await Preferences.remove({key: "uID"})
    shell.t.writeln("Unsubscribed")
}
async function onInstallDone(shell, fp: string) {
    // connect to peerbook and verify the fingerprint
    return new Promise((resolve, reject) => {
        let session: HTTPWebRTCSession
        try {
            session = shell.PBConnect()
        } catch(e) {
            shell.t.writeln("Error connecting to peerbook")
            shell.t.writeln("Please try again or type `support`")
            reject()
            return
        }
        const reply = []
        session.onStateChange = async (state, failure?) => {
            switch (state) {
                case "connecting":
                    shell.t.writeln("Connecting...")
                    break
                case "connected":
                    shell.t.writeln("Connected")
                    let validated = false
                    while (true) {
                        let gotMsg = false
                        const otp = await shell.askValue("Enter OTP to verify gate")
                        const regChannel = await session.openChannel(["authorize", fp, otp], 0, shell.t.cols, shell.t.rows)
                        regChannel.onMessage = (data: Uint8Array) => {
                            gotMsg = true
                            if (data[0] == "1") {
                                shell.t.writeln("Authorizaton complete")
                                resolve()
                                return
                            }
                            else
                                shell.t.writeln("Authorizaton failed. Please try again.")
                        }
                        while (!gotMsg) {
                            await new Promise(r => setTimeout(r, 100))
                        }
                    }
                case "failed":
                    shell.t.writeln("PeerBook connection failed")
                    break
            }
        }
    })
}   
