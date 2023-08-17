import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Clipboard } from '@capacitor/clipboard'
import { Shell } from "./shell"
import { Preferences } from "@capacitor/preferences"
import { DEFAULT_DOTFILE, Terminal7 } from "./terminal7"
import { Fields } from "./form"
import fortuneURL from "../resources/fortune.txt"
import { Gate } from './gate'
import { Capacitor } from '@capacitor/core'
import { SSHSession, SSHChannel } from './ssh_session'
import { Failure } from './session'
import { NativeBiometric } from 'capacitor-native-biometric'

declare const terminal7 : Terminal7

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
            execute: async () => setTimeout(() => shell.t.clear(),10)
        },
        close: {
            name: "close",
            help: "Close the current gate",
            usage: "clo[se]",
            execute: async args => closeCMD(shell, args)
        },
        config: {
            name: "config",
            help: "Edit the config file",
            usage: "conf[ig]",
            execute: async () => configCMD(shell),
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
        gates: {
            name: "gates",
            help: "List all gates",
            usage: "g[ates]",
            execute: async () => hostsCMD(shell)
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
        reset: {
            name: "reset",
            help: "Reset various settings",
            usage: "r[eset]",
            execute: async args => resetCMD(shell, args)
        },
        support: {
            name: "support",
            help: "Get support",
            usage: "sup[port]",
            execute: async () => supportCMD(shell)
        },
        subscribe: {
            name: "subscribe",
            help: "Subscripte to peerbook",
            usage: "sub[scribe]",
            execute: async () => subscribeCMD(shell)
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
    if (!hostname) {
        shell.t.writeln("Missing hostname")
        return
    }
    const gate: Gate = shell.getGate(hostname)
    if (!gate) {
        shell.t.writeln(`Host not found: ${hostname}`)
        return
    }
    const pbOpen = terminal7.pb && terminal7.pb.isOpen()
    const overPB = pbOpen && gate.fp && (gate.fp.length > 0) && gate.online
    if (overPB) {
        if (!gate.verified) {
            const answer = await shell.askValue("Gate unverified, would you like to verify it?", "y")
            if (answer == "y" || answer == "Y" || answer == "") {
                await terminal7.pb.verifyFP(gate.fp)
            } else {
                shell.t.writeln("Doing nothing")
                return
            }
        }
        if (!gate.online) {
            shell.t.writeln("Host is offline, better try another host")
            return
        }
    }
    if (Capacitor.isNativePlatform())  {
        if (!gate.fp && !gate.username) {
            try {
                gate.username = await shell.askValue("Username")
            } catch (e) {
                gate.notify("Failed to get username")
                return
            }
        }
    }
    let done = false
    gate.onFailure = reason => {
        terminal7.log(`Connect command got failure ${reason}`) 
        shell.stopWatchdog()
        gate.close()
        terminal7.storeGates()
        done = true
    }
    if (gate.session) {
        gate.focus()
        return
    }
    const  firstGate = (await Preferences.get({key: "first_gate"})).value
    const timeout = (firstGate == "nope") ? undefined : 10000

    shell.startWatchdog(timeout).catch(e => gate.handleFailure(e))
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
        if (gate.keyRejected && !overPB) {
            const keyForm = [
                { prompt: "Just let me in" },
                { prompt: "Copy command to clipboard" },
            ]
            let publicKey = ""  
            try {
                publicKey = (await terminal7.readId()).publicKey
            } catch (e) {
                terminal7.log("oops readId failed")
            }
            if (publicKey) {
                const cmd = `echo "${publicKey}" >> "$HOME/.ssh/authorized_keys"`
                shell.t.writeln(`\n To use face id please copy the ES25519 key by running:\n\n\x1B[1m${cmd}\x1B[0m\n`)
                let res = ""
                try {
                    res = await shell.runForm(keyForm, "menu")
                } catch (e) {}
                switch(res) {
                    case "Copy command to clipboard":
                        Clipboard.write({ string: cmd })
                        clipboardFilled = true
                        break
                }
            }
        } 
        if (!clipboardFilled && gate.session.isSSH && !gate.onlySSH && pbOpen) {
            let toConnect: boolean
            try {
                toConnect = await shell.offerInstall(gate)
            } catch (e) {
                toConnect = true
            }
            if (!toConnect) {
                gate.close()
                done = true
                return
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
        done = true
    })
    while (!done) {
        await new Promise(r => setTimeout(r, 100))
    }
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
                terminal7.pbClose()
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
        { prompt: "Dotfile" },
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
    let ans
    switch(res) {
        case "Dotfile":
            terminal7.saveDotfile(DEFAULT_DOTFILE)
            shell.t.writeln("dotfile back to default")
            break
        case "Fingerprint":
            await CapacitorPurchases.logOut()
            shell.t.writeln("Cleared fingerprint and disconnected from PeerBook")
            terminal7.pbClose()
            await terminal7.pbConnect()
            break
        case "Gates":
            terminal7.resetGates()
            break
        case "Private/public key":
            terminal7.keys = undefined
            NativeBiometric.deleteCredentials({ server: "dev.terminal7.default" })
            shell.t.writeln("Keys removed")
            break
        case "\x1B[31mEverything\x1B[0m":
            ans = (await shell.runForm(factoryResetVerify, "text"))[0]
            if (ans == "y") {
                terminal7.factoryReset()
            }
            else
                this.map.showLog(false)
            break
    }
}

async function editCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gate = shell.getGate(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    const isPB = !!gate.fp
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
            prompt: isPB ? "Fallback Hostname" : "Hostname",
            default: gate.addr,
            validator: a => gate.t7.validateHostAddress(a)
        },
        { prompt: "Username", default: gate.username || ""},
        { prompt: "SSH only", values: ["y", "n"], default: gate.onlySSH?"y":"n" },
    ]
    const fDel = [{
        prompt: isPB ? `Delete ${gate.name} from PeerBook?` : `Delete ${gate.name}?`,
        values: ["y", "n"],
        default: "n",
    }]
    if (isPB) {
        const schema = terminal7.conf.peerbook.insecure ? "http" : "https",
            url = `${schema}://${terminal7.conf.net.peerbook}`
        shell.t.writeln(`You can also edit this peer in the web interface at \n${url}`)
    }
    let choice, enabled, res
    choice = await shell.runForm(fMain, "menu", "")
    const gateAttrs = ["name", "addr", "username", "onlySSH"]
    switch (choice) {
        case 'Connect':
            await connectCMD(shell, [hostname])
            break
        case 'Edit':
            enabled = await shell.runForm(fFields, "choice", `\x1B[4m${gate.name}\x1B[0m edit`)
            if (!enabled) {
                await gate.t7.clear()
                return
            }
            fFields = fFields.filter((_, i) => enabled[i])
            res = await shell.runForm(fFields, "text")
            if (isPB && enabled[0]) {
                const code = await terminal7.pb.adminCommand("rename", gate.fp, res[0])
                if (code != "1") {
                    shell.t.writeln("Failed to rename host")
                    res[0] = gate.name
                }
            }
            gateAttrs.filter((_, i) => enabled[i])
                     .forEach((k, i) => 
                        gate[k] = (k == 'onlySSH')?res[i] == 'y':res[i])
            gate.t7.storeGates()
            gate.updateNameE()
            break
        case "\x1B[31mDelete\x1B[0m":
            res = await shell.runForm(fDel, "text")
            if (res[0] != "y")
                return
            if (isPB) {
                const otp = await shell.askValue("OTP")
                try {
                    await terminal7.pb.adminCommand("delete", gate.fp, otp)
                } catch (e) {
                    console.log("Failed to delete host", e)
                    shell.t.writeln("Failed to delete host")
                    return
                }
            }
            gate.delete()
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
        terminal7.log("readId error", e)
        return shell.t.writeln("Error reading key")
    }
    Clipboard.write({ string: publicKey })
    return shell.t.writeln(`${publicKey}\n☝️ copied to 📋`)
}
async function subscribeCMD(shell: Shell) {
    const { customerInfo } = await CapacitorPurchases.getCustomerInfo()
    if (!customerInfo.entitlements.active.peerbook) {
        shell.t.writeln("Join PeerBook subscribers and enjoy:")
        shell.t.writeln("")
        shell.t.writeln("  󰟆  Persistent Sessions")
        shell.t.writeln("    2FA & SRTP Based Encryption")
        shell.t.writeln("  󰴽  WebRTC w/ Direct and Relay Connections")
        shell.t.writeln("  󰟀  Behind-the-NAT Desktops connections")
        shell.t.writeln("    Ephemeral IP Servers connections")
        shell.t.write("\t\t\t(\x1B]8;;https://terminal7.dev/privacy\x07Privacy Policy\x1B]8;;\x07 & ")
        shell.t.writeln("\x1B]8;;https://www.apple.com/legal/internet-services/itunes/dev/stdeula/\x07Terms of Service\x1B]8;;\x07)")
        const TYPES = {
            "MONTHLY": "Month",
            "TWO_MONTH": "2 Months",
            "THREE_MONTH": "3 Months",
            "SIX_MONTH": "6 Months",
            "ANNUAL": "Year",
        }
        const { offerings } = await CapacitorPurchases.getOfferings(),
            offer = offerings.current
        const products = offer.availablePackages.map(p => {
            const identifier = p.identifier,
                price = p.product.priceString,
                period = TYPES[p.packageType],
                introPrice = p.product.introPrice
            let prompt = `${price} / ${period}`
            if (introPrice) {
                const price = (introPrice.price == 0)?"Free":introPrice.priceString,
                    unit = introPrice.periodUnit.toLowerCase(),
                    period = (introPrice.periodNumberOfUnits == 1)?unit:`${introPrice.periodNumberOfUnits} ${unit}s`
                prompt += `     🎁 ${price} for the first ${period} 🎁`
            }
            return { identifier, prompt }
        })
        const fields: Fields = products.map(p => ({ prompt: p.prompt }))
        fields.push({ prompt: "Restore Purchases" })
        fields.push({ prompt: "Cancel" })
        let choice
        try {
            choice = await shell.runForm(fields, "menu")
        } catch(e) {
            return
        }
        if (choice == "Cancel")
            return
        if (choice == "Restore Purchases") {
            shell.t.writeln("Restoring purchases")
            shell.startWatchdog(10000).catch(e => {
                shell.t.writeln("Sorry, restore command timed out")
                shell.t.writeln("Please try again or `support`")
                throw e
            })
            try {
                await CapacitorPurchases.restorePurchases()
            } catch(e) {
                shell.stopWatchdog()
                shell.t.writeln("Error restoring purchases, please try again or `support`")
                return
            }
            shell.stopWatchdog()
            const { customerInfo } = await CapacitorPurchases.getCustomerInfo()
            if (!customerInfo.entitlements.active.peerbook) {
                shell.t.writeln("Sorry, no active subscription found")
                return
            } else {
                shell.t.writeln("Subscription restored")
            }
        } else {
            const product = products.find(p => p.prompt == choice)
            shell.t.writeln("Thank you! directing you to the store")
            shell.startWatchdog(120000).catch(e => {
                shell.t.writeln("Sorry, subscribe command timed out")
                shell.t.writeln("Please try again or `support`")
                throw e
            })
            terminal7.ignoreAppEvents = true
            try {
                await terminal7.pb.purchase(product.identifier, offer.identifier)
                shell.stopWatchdog()
            } catch(e) {
                shell.stopWatchdog()
                console.log("purchase error", e)
                shell.t.writeln("Error purchasing, please try again or `support`")
                return
            }
        }
    }
    if (!terminal7.pb.isOpen()) {
        try {
            await terminal7.pb.connect(customerInfo.originalAppUserId)
        } catch(e) {
            if (e == "Unregistered") {
                shell.t.writeln("You are subscribed, please register:")
                await terminal7.pb.register()
            } else if (e == "Unauthorized") {
                shell.t.writeln("Failed to connect to PeerBook, please try again or `support`")
                return
            } else {
                let msg = "PeerBook connection failed"
                if (e)
                    msg += ": " + e
                shell.t.writeln(msg)
                shell.t.writeln("Please try again and if persists, `support`")
                return
            }
        }
    } else
        shell.t.writeln("You are already subscribed and registered")
    const uid = await terminal7.pb.getUID()
    const answer = await shell.askValue(`Copy user id to the clipboard? (y/N)`, "n")
    if (answer.toLowerCase() == "y") {
        Clipboard.write({ string: uid })
        shell.t.writeln("UID copied to clipboard")
    }
}
export async function installCMD(shell: Shell, args: string[]) {
    if (!terminal7.pb?.isOpen()) {
        shell.t.writeln("Please `subscribe` to PeerBook first")
        return
    }

    let uid: string
    try {
        uid  = await terminal7.pb.getUID()
    } catch(e) {
        console.log("ping error", e)
        shell.t.writeln("Error connecting to Peerbook")
        shell.t.writeln("Please try again or `support`")
        return
    }
    console.log("got uid", uid)

    if (!uid) {
        shell.t.writeln("You are not subscribed to Peerbook")
        shell.t.writeln("Please `subscribe`")
        return
    }
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
            const choices = []
            terminal7.gates.forEach(gate => {
                choices.push({ prompt: gate.name })
            })
            if (choices.length == 0) {
                shell.t.writeln("No gates found")
                shell.t.writeln("Please `add` one and run install again")
                return
            }
            shell.t.writeln("Please select server to install on:")
            const choice = await shell.runForm(choices, "menu")
            gate = shell.getGate(choice)
        }
    }

    const host = terminal7.conf.net.peerbook
    let cmd = `PEERBOOK_UID=${uid} PEERBOOK_NAME="${gate.name}"`
    if (host != "api.peerbook.io")
        cmd += ` PEERBOOK_HOST=${host}`
    cmd += " \\\nbash <(curl -sL https://get.webexec.sh)"

    // Connect to the gate over SSH and install webexec
    let publicKey, privateKey
    let done = false
    let error = false
    const fields: Fields = [
        { prompt: "Connect & send command" },
        { prompt: "Copy command to 📋" },
        { prompt: "Cancel" },
    ]
    shell.t.writeln("To Enjoy WebRTC you need Terminal7 agent installed & running")
    shell.t.writeln("")
    shell.t.writeln(`$ \x1B[1m${cmd}\x1B[0m`)
    const choice= await shell.runForm(fields, "menu")
    if (choice == "Cancel")
        return
    if (choice == "Copy command to 📋") {
        Clipboard.write({ string: cmd })
        shell.t.writeln("Command copied to clipboard")
        return
    }
    const passConnect = async () => {
        let password: string
        try {
            password = await shell.askPass()
        } catch(e) {
            error = true
            return
        }
        session.passConnect(undefined, password)
    }

    try {
        const ids = await terminal7.readId()
        publicKey = ids.publicKey
        privateKey = ids.privateKey
    } catch(e) {
        console.log("readId error", e)
    }

    const session = new SSHSession(gate.addr, gate.username)

    session.onClose = () => {
        // TODO: handle close without installation
        terminal7.log("Install SSH session closed")
    }
    session.onStateChange = async (state, failure?: Failure) => {
        let channel: SSHChannel
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
                    session.close()
                    error = true
                    return
                }
                shell.t.clear()
                shell.t.writeln(`Connecting to ${gate.addr}`)
                shell.masterChannel = channel
                // set #log border color to yellow
                document.getElementById("log").style.borderColor = "var(--remote-border)"
                channel.onClose = () => {
                    shell.t.writeln("~~~ Disconnected without install")
                    document.getElementById("log").style.borderColor = "var(--local-border)"
                    channel.onClose = undefined
                    shell.masterChannel = null
                    error = true
                }

                channel.send(cmd)

                channel.onMessage = async (msg: string) => {
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
                            channel.onClose = undefined
                            channel.close()
                            shell.t.writeln("~~~ Orderly Disconnect")
                            // will throw exception if not verified
                            try {
                                await terminal7.pb.verifyFP(fp, "Finished install, enter OTP to verify")
                            } catch(e) {
                                shell.t.writeln("Verification failed")
                                error = true
                                return
                            }
                            done = true
                            // TODO: resolve the command that started it all
                        }, 1000)
                    }
                }   
                break
            case "failed":
                if (failure == Failure.KeyRejected) {
                    shell.t.write("🔑 Rejected")
                    await passConnect()
                    return
                } else if (failure == Failure.WrongPassword) {
                    shell.t.writeln("Wrong password")
                    await passConnect()
                    return
                } else {
                    shell.t.writeln("Connection failed")
                    error = true
                    return
                }
                break
        }
    }
    if (publicKey) {
        session.connect(0, publicKey, privateKey)
    } else {
        await passConnect()
    }
    while (!done && !error) 
        await (new Promise(r => setTimeout(r, 100)))
    if (done) {
        // wait for the gate to get an fp
        let timedOut = false
        shell.startWatchdog(terminal7.conf.net.timeout)
            .catch(() => timedOut = true)
        while (!gate.fp && ! timedOut)
            await (new Promise(r => setTimeout(r, 100)))
        shell.t.writeln(`Gate is installed & verified, use \`connect ${gate.name}\``)
        shell.stopWatchdog()
    } else {
        shell.t.writeln("Install failed")
        shell.t.writeln("Please try again or type `support`")
    }
}
async function configCMD(shell: Shell) {
    shell.t.writeln("Opening vi-style editor.")
    shell.t.writeln("Use \x1B[1;37m:w\x1B[0m to save & exit or \x1B[1;37m:q\x1B[0m to exit without saving.")
    shell.t.writeln("An example config is available at")
    shell.t.writeln("https://github.com/tuzig/terminal7/wiki/Setting-file-format")
    await shell.waitForKey()
    await shell.openConfig()
}
async function supportCMD(shell: Shell) {
    shell.t.writeln("https://discord.gg/Puu2afdUtr")
    shell.t.writeln("☝️  Please click to join and get help")
}

