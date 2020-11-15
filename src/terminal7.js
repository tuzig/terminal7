/*
 * This file contains the code that makes terminal seven - a tmux inspired
 * touchable terminal multiplexer running over wertc's data channels.
 */
import { Gate } from './gate.js'
import { v4 as uuidv4 } from 'uuid'
import * as Hammer from 'hammerjs'
import * as TOML from '@iarna/toml'
import CodeMirror from 'codemirror/src/codemirror.js'
import { vimMode } from 'codemirror/keymap/vim.js'
import { tomlMode} from 'codemirror/mode/toml/toml.js'
import { dialogAddOn } from 'codemirror/addon/dialog/dialog.js'
import { formatDate } from './utils.js'

const DEFAULT_DOTFILE = `[theme]
foreground = "#00FAFA"
background = "#000"
selection = "#D9F505"

[indicators]
flash = 100
log_lines = 7

[exec]
shell = "zsh"
timeout = 3000
retries = 3

[touch]
quickest_press = 1000
`

export class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings) {
        settings = settings || {}
        this.gates = []
        this.cells = []
        this.timeouts = []
        this.state = "init"
        this.activeG = null
        window.terminal7 = this
        // Load gates from local storage
        let hs = JSON.parse(localStorage.getItem('gates'))
        if (hs != null)
            hs.forEach((p) => {
                p.store = true
                let h = new Gate(p)
                // h.restore()
                this.gates.push(h)
            })
        let dotfile = localStorage.getItem('dotfile') || DEFAULT_DOTFILE
        this.conf = TOML.parse(dotfile)
        this.minSplitSpeed      = settings.minSplitSpeed || 2.2
        this.scrollLingers4     = settings.scrollLingers4 || 2000
        this.shortestLongPress  = settings.shortestLongPress || 1000
        this.borderHotSpotSize  = settings.borderHotSpotSize || 30
        this.token = localStorage.getItem("token")
        this.confEditor = null
        this.flashTimer = null
        this.conf.features = this.conf.features || {}
        this.conf.touch = this.conf.touch || {}
        this.conf.touch.quickest_press = this.conf.touch.quickest_press || 1000
    }
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the gates from local storage and redirects to home
     */
    open(e) {
        if (!e) {
            // create the container element
            e = document.createElement('div')
            e.id = "terminal7"
            document.body.appendChild(e)
        }
        this.e = e
        window.onresize = 
            c => this.cells.forEach(c => {if (c.fit != undefined) c.fit()})
        // buttons
        document.getElementById("trash-button")
                .addEventListener("click",
                    ev => this.activeG.activeW.activeP.close())
        document.getElementById("home-button")
                .addEventListener("click", ev => this.goHome())
        document.getElementById("log-button")
                .addEventListener("click", ev => {
                    this.logDisplay(document.getElementById("log")
                                    .classList.contains("fade-out"))
                    this.focus()
                })
        document.getElementById("search-button")
                .addEventListener("click", ev => 
                    this.activeG && this.activeG.activeW.activeP.toggleSearch())
        document.getElementById("dotfile-button")
                .addEventListener("click", ev => this.editDotfile(ev))
        // display the home page, starting with the plus button
        let addHost = document.getElementById("add-host")
        document.getElementById('plus-host').addEventListener(
            'click', ev => addHost.classList.remove("hidden"))
        addHost.querySelector(".submit").addEventListener('click', (ev) => {
            let remember = addHost.querySelector('[name="remember"]').checked,
                gate = this.addGate({
                    addr: addHost.querySelector('[name="hostaddr"]').value,
                    name: addHost.querySelector('[name="hostname"]').value,
                    store: remember
                })
            if (remember)
                    this.storeGates()
            this.clear()
            gate.connect()
        })
        // hide the modal on xmark click
        addHost.querySelector(".close").addEventListener('click',  ev =>  {
            this.clear()
        })
        this.state = "open"
        this.gates.forEach(gate => {
            gate.open(e)
            gate.e.classList.add("hidden")
        })
        // Handle network events for the active gate
        document.addEventListener("online", ev => {
            console.log("online")
            document.getElementById("connectivity").classList.remove("failed")
            this.clear()
            if (this.activeG) {
                this.activeG.clear()
                this.activeG.connect()
            }
        })
        document.addEventListener("offline", ev => {
            console.log("offline")
            document.getElementById("connectivity").classList.add("failed")
            /*
            if (this.activeG)
                this.activeG.updateState("offline")
            */
            
        })
        this.catchFingers()
        // setting up edit host events
        let editHost = document.getElementById("edit-host")
        editHost.querySelector(".submit").addEventListener('click', ev =>
            editHost.gate.editSubmit(ev))
        editHost.querySelector(".close").addEventListener('click',  ev =>
            terminal7.clear())
        editHost.querySelector(".trash").addEventListener('click',  ev => {
            editHost.gate.delete()
            terminal7.clear()
        })
        editHost.querySelector(".reset").addEventListener('click',  ev => {
            this.clear()
            editHost.gate.showResetHost(ev)
        })
        // setting up reset host event
        let resetHost = document.getElementById("reset-host")
        resetHost.querySelector(".submit").addEventListener('click', ev =>
            editHost.gate.resetHost())
        resetHost.querySelector(".close").addEventListener('click',  ev =>
            terminal7.clear())
        this.goHome()
        // settip up keys help
        document.addEventListener("keydown", ev => {
            if (ev.key == "Meta") {
                this.metaPressStart = Date.now()
                this.run(_ => {
                    let e = document.getElementById('keys-help')
                    if (!this.conf.features["copy_mode"])
                        e.querySelectorAll('.copy_mode').forEach(i =>
                            i.style.display = "none")
                    if (Date.now() - this.metaPressStart > 987)
                        e.classList.remove('hidden')
                }, terminal7.conf.touch.quickest_press)
            } else
                this.metaPressStart = Number.MAX_VALUE
        })
        document.addEventListener("keyup", ev => {
            // hide the keys help when releasing the command key
            if ((ev.key == "Meta") && 
                (this.metaPressStart < Number.MAX_VALUE))
                document.getElementById('keys-help').classList.add('hidden')
            this.metaPressStart = Number.MAX_VALUE
        })
        // Last one: focus
        this.focus()
    }
    editDotfile(ev) {
        var modal   = document.getElementById("settings-modal"),
            button  = document.getElementById("dotfile-button"),
            area    =  document.getElementById("edit-conf"),
            conf    =  localStorage.getItem("dotfile") || DEFAULT_DOTFILE

        area.value = conf

        button.classList.add("on")
        modal.classList.remove("hidden")

        if (terminal7.confEditor == null) {
            // initialize the editor
            vimMode(CodeMirror)
            tomlMode(CodeMirror)
            dialogAddOn(CodeMirror)
            CodeMirror.commands.save = _ => this.saveConf()
            // TODO: the next 2 lines do nothing fixed them and support :q
            CodeMirror.commands.wq = _ => this.saveConf()
            CodeMirror.commands.q = _ => modal.classList.add("hidden")
            terminal7.confEditor  = CodeMirror.fromTextArea(area, {
               value: conf,
               lineNumbers: true,
               mode: "toml",
               keyMap: "vim",
               matchBrackets: true,
               showCursorWhenSelecting: true
            })
            modal.querySelector(".close").addEventListener('click',
                ev => {
                    button.classList.remove("on")
                    this.clear()
                    this.focus()
                }
            )
            modal.querySelector(".save").addEventListener('click',
                ev => { 
                    this.saveConf()
                    this.focus()
                })
            modal.querySelector(".copy").addEventListener('click',
                ev => {
                    var area =  document.getElementById("edit-conf")
                    terminal7.confEditor.save()
                    cordova.plugins.clipboard.copy(area.value);
                    this.focus()
                })
        }
        terminal7.confEditor.focus()
    }
    /*
     * saveConf saves the configuration and closes open conf editor
     */
    saveConf() {
        var button  = document.getElementById("dotfile-button"),
            area    =  document.getElementById("edit-conf")
        button.classList.remove("on")
        terminal7.confEditor.save()
        this.conf = TOML.parse(area.value)
        localStorage.setItem("dotfile", area.value)
        this.cells.forEach(c => {
            if (typeof(c.setTheme) == "function")
                c.setTheme(this.conf.theme)
        })
        this.clear()
    }
    /*
     * terminal7.onTouch is called on all browser's touch events
     */
    onTouch(type, ev) {
        let e = ev.target,
            pane = e.p
        if (type == "start") {
            this.touch0 = Date.now() 
            this.firstT = this.lastT = ev.changedTouches
            window.toBeFit = new Set([])
            return 
        } else if (type == "cancel") {
            this.touch0 = null
            this.firstT = []
            this.lastT = []
            this.gesture = null
            return
        }

        let x  = ev.changedTouches[0].pageX,
            y  = ev.changedTouches[0].pageY

        if (this.firstT.length == 0)
            return

        let dx = this.firstT[0].pageX - x,
            dy = this.firstT[0].pageY - y,
            d  = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)),
            deltaT = Date.now() - this.touch0,
            s  = d/deltaT,
            r = Math.abs(dx / dy),
            topb  = r < 1.0


        if (e.gate instanceof Gate) {
            let longPress = terminal7.conf.touch.quickest_press
            if (deltaT > longPress) {
                e.gate.edit()
            }
            return
        }
        if (pane === undefined)  {
            console.log(`igonring touch event ${type} on non-pane element: `, e )
            return
        }
        let lx = (x / document.body.offsetWidth - pane.xoff) / pane.sx,
            ly = (y / document.body.offsetHeight - pane.yoff) / pane.sy
        if (type == "move") {
            if (this.gesture == null) {
                let rect = pane.e.getBoundingClientRect()
                console.log(x, y, rect)
                // identify pan event on a border
                if (Math.abs(rect.x - x) < this.borderHotSpotSize)
                    this.gesture = "panborderleft"
                else if (Math.abs(rect.right - x) < this.borderHotSpotSize) 
                    this.gesture = "panborderright"
                else if (Math.abs(y - rect.y) < this.borderHotSpotSize)
                    this.gesture = "panbordertop"
                else if (Math.abs(y - rect.bottom) < this.borderHotSpotSize)
                    this.gesture = "panborderbottom"
                else 
                    return
                console.log(`identified: ${this.gesture}`)
            } 
            if (this.gesture.startsWith("panborder")) {
                let where = this.gesture.slice(9),
                    dest = ((where == "top") || (where == "bottom"))
                            ? y / document.body.offsetHeight
                            : x / document.body.offsetWidth
                console.log(`moving ${where} border of #${pane.id} to ${dest}`)
                pane.layout.moveBorder(pane, where, dest)
            }
            this.lastT = ev.changedTouches
        }
        if (type == "end") {
            window.toBeFit.forEach(c => c.fit())
            window.toBeFit = new Set([])
            if ((!pane.scrolling)
                && (ev.changedTouches.length == 1)
                && (d > 50)) {
                // it's a swipe!!
                console.log(`swipe speed: ${s}`)
                if (s > this.minSplitSpeed) {
                    let p = ev.target.p
                    if (!pane.zoomed)  {
                        let t = pane.split((topb)?"topbottom":"rightleft",
                                           (topb)?lx:ly)
                        // t.focus()
                    }
                }
            }
            this.touch0 = null
            this.firstT = []
            this.gesture = null
        }
    }
    catchFingers() {
        var start,
            last,
            firstT = [],
            gesture = null
        this.e.addEventListener("touchstart", ev =>
            this.onTouch("start", ev), false)
        this.e.addEventListener("touchend", ev =>
            this.onTouch("end", ev), false)
        this.e.addEventListener("touchcancel", ev =>
            this.onTouch("cancel", ev), false)
        this.e.addEventListener("touchmove", ev =>
            this.onTouch("move", ev), false)
    }
    /*
     * Terminal7.addGate is used to add a Host connection
     */
    addGate(props) {
        let out = [],
            p = props || {},
            addr = p.addr
        // add the id
        p.id = this.gates.length

        // if no port specify, use the default port
        if (addr && (addr.indexOf(":") == -1))
            p.addr = `${addr}:7777`

        let h = new Gate(p)
        console.log(`adding ${h.user}@${h.addr} & saving gates`)
        this.gates.push(h)
        this.storeGates()
        h.open(this.e)
        return h
    }
    storeGates() { 
        let out = []
        this.gates.forEach((h) => {
            if (h.store) {
                let ws = []
                h.windows.forEach((w) => ws.push(w.id))
                out.push({id: h.id, addr: h.addr, user: h.user, secret: h.secret,
                    name:h.name, windows: ws})
            }
        })
        console.log("Storing gates:", out)
        localStorage.setItem("gates", JSON.stringify(out))
    }
    clear() {
        this.e.querySelectorAll(".temporal").forEach(e => e.remove())
        this.e.querySelectorAll(".modal").forEach(e => e.classList.add("hidden"))
    }
    goHome() {
        let s = document.getElementById("home-button"),
            h = document.getElementById("home"),
            hc = document.getElementById("downstream-indicator")
        s.classList.add("on")
        hc.classList.add("off")
        hc.classList.remove("on", "failed")
        // we need a token
        if (this.token == null) {
            this.token = uuidv4()
            localStorage.setItem('token', this.token)
        }
        if (this.activeG) {
            this.activeG.unfocus()
            this.activeG = null
        }
        // hide the modals
        this.clear()
        // trash and search are off
        document.getElementById("search-button").classList.add("off")
        document.getElementById("trash-button").classList.add("off")
        window.location.href = "#home"
    }
    /* 
     * Terminal7.logDisplay(show) display or hides the notifications
     */
    logDisplay(show) {
        let e = document.getElementById("log")
        if (show) {
            e.classList.remove("fade-out", "hidden")
            document.getElementById("log-button")
                .classList.add("on")
        } else {
            e.classList.add("fade-out")
            document.getElementById("log-button")
                .classList.remove("on")
        }
    }
    /*
     * OnMessage is called by the pane when they recieve traffic.
     * if the indicator is not alreay flushing it will flush it
     */
    onMessage(m) {
        if (this.flashTimer == null) {
            let  e = document.getElementById("downstream-indicator"),
                 flashTime = this.conf.indicators && this.conf.indicators.flash
                             || 88
            e.classList.remove("failed", "off")
            e.classList.add("on")
            this.flashTimer = terminal7.run(_ => {
                this.flashTimer = null
                e.classList.remove("on")
                e.classList.add("off")
            }, flashTime) 
        }
    }
    /*
     * onDisconnect is called when a gate disconnects.
     */
    onDisconnect(gate) {
        let e = document.getElementById("disconnect-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelector("h1").textContent =
            `Communication Failure at ${gate.name}`
        e.querySelector(".reconnect").addEventListener('click', ev => {
            this.clear()
            gate.resetPC()
        })
        e.querySelector(".close").addEventListener('click', ev => {
            gate.close()
            terminal7.goHome()
        })
        this.e.appendChild(e)
    }
    /*
     * focus restores the focus to the ative pane, if there is one
     */
    focus(gate) {
        if (gate)
            this.activeG = gate
        if (this.activeG && this.activeG.activeW &&
            this.activeG.activeW.activeP)
            this.activeG.activeW.activeP.focus()
        else
            this.e.focus()
    }
    ssh(e, gate, cmd, cb) {
        let uname = e.querySelector('[name="uname"]').value,
            pass = e.querySelector('[name="pass"]').value,
            addr = gate.addr.substr(0, gate.addr.indexOf(":"))
        this.notify("ssh is connecting...")
        window.cordova.plugins.sshConnect.connect(uname, pass, addr, 22,
            resp => {
                this.notify("ssh connected")
                if (resp) {
                    let token = terminal7.token
                    // TODO: make it work with non-standrad webexec locations
                    window.cordova.plugins.sshConnect.executeCommand(
                        cmd, 
                        msg =>  {
                            this.notify(`ssh success: ${msg}`)
                            cb(msg)
                        },
                        msg => this.notify(`ssh failed: ${msg}`))
                    window.cordova.plugins.sshConnect.disconnect()
                }
            }, ev => {
                this.notify("Wrong password")
                console.log("ssh failed to connect", ev)
            })
    }
    onNoSignal(gate) {
        let e = document.getElementById("nosignal-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelectorAll(".name").forEach(e => e.textContent = gate.name)
        e.querySelectorAll(".address").forEach(e => e.textContent = gate.addr)
        e.querySelector(".edit-link").addEventListener('click', _ => {
            this.clear()
            gate.edit()
        })
        e.querySelector(".start").addEventListener('click', ev => {
            this.ssh(this.e.lastElementChild, gate, 
                "go/bin/webexec start", ev => {
                gate.close()
                this.clear()
                gate.connect()
            })
        })
        e.querySelector(".close").addEventListener('click', ev => {
            gate.close()
            terminal7.goHome()
        })
        this.e.appendChild(e)
    }
    /*
     * noitify adds a message to the teminal7 notice board
     */
    notify(message) {    
        let ul = document.getElementById("log-msgs"),
            li = document.createElement("li"),
            d = new Date(),
            t = formatDate(d, "HH:mm:ss.fff")

        let lines = ul.querySelectorAll('li')
        if (lines.length > terminal7.conf.indicators.log_lines)
            lines[0].remove()
        li.innerHTML = `<time>${t}</time> ${message}`
        li.classList = "log-msg"
        ul.appendChild(li)
        terminal7.logDisplay(true)
    }
    run(cb, delay) {
        var i = this.timeouts.length
        this.timeouts.push(
            window.setTimeout(ev => {
                this.timeouts.splice(i, 1)
                cb(ev)
            }, delay)
        )
    }
    close() {
        this.timeouts.forEach(t => window.clearTimeout(t))
        this.timeouts = []
    }
}
