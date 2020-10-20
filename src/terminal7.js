/*
 * This file contains the code that makes terminal seven - a tmux inspired
 * touchable terminal multiplexer running over wertc's data channels.
 */
import { Host } from './host.js'
import { v4 as uuidv4 } from 'uuid';
import * as Hammer from 'hammerjs'

export class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings) {
        settings = settings || {}
        this.hosts = []
        this.cells = []
        this.state = "init"
        this.activeH = null
        window.terminal7 = this
        // Load hosts from local storage
        let hs = JSON.parse(localStorage.getItem('hosts'))
        if (hs != null)
            hs.forEach((p) => {
                p.store = true
                let h = new Host(p)
                // h.restore()
                this.hosts.push(h)
            })
        this.minSplitSpeed      = settings.minSplitSpeed || 2.2
        this.scrollLingers4     = settings.scrollLingers4 || 2000
        this.shortestLongPress  = settings.shortestLongPress || 1000
        this.borderHotSpotSize  = settings.borderHotSpotSize || 30
        this.token = localStorage.getItem("token")
    }
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the hosts from local storage and redirects to home
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
                    ev => this.activeH.activeW.activeP.close())
        document.getElementById("home-button")
                .addEventListener("click", ev => this.goHome())
        document.getElementById("log-button")
                .addEventListener("click", ev => 
                    this.logDisplay(document.getElementById("log")
                                    .classList.contains("fade-out"))
                )
        document.getElementById("search-button")
                .addEventListener("click", ev => 
                    this.activeH && this.activeH.activeW.activeP.toggleSearch())
        // display the home page, starting with the plus button
        let addHost = document.getElementById("add-host")
        document.getElementById('plus-host').addEventListener(
            'click', ev => addHost.style.display="block")
        addHost.querySelector(".submit").addEventListener('click', (ev) => {
            let remember = addHost.querySelector('[name="remember"]').checked,
                host = this.addHost({
                    addr: addHost.querySelector('[name="hostaddr"]').value,
                    name: addHost.querySelector('[name="hostname"]').value,
                    store: remember
                })
            if (remember)
                    this.storeHosts()
            this.clear()
            host.connect()
        })
        // hide the modal on xmark click
        addHost.querySelector(".close").addEventListener('click',  ev =>  {
            ev.target.parentNode.parentNode.parentNode.style.display="none"
            this.clear()
        })
        this.state = "open"
        this.hosts.forEach((host) => {
            host.open(e)
            host.e.style.display = "none"
        })
        // Handle network events for the active host
        document.addEventListener("online", ev => {
            console.log("online")
            document.getElementById("connectivity").classList.remove("failed")
            this.clear()
            if (this.activeH)
                this.activeH.connect()
        })
        document.addEventListener("offline", ev => {
            console.log("offline")
            document.getElementById("connectivity").classList.add("failed")
            if (this.activeH)
                this.activeH.updateState("offline")
            
        })
        this.catchFingers()
        this.goHome()
    }
    /*
     * terminal7.onTouch is called on all nrowser's touch events
     */
    onTouch(type, ev) {
        let e = ev.target,
            pane = e.p
        // handle only events on pane
        if (pane === undefined) {
            console.log("igonring touch event on non-pane element: ", e )
            return
        }

        let x  = ev.changedTouches[0].pageX,
            y  = ev.changedTouches[0].pageY,
            lx = (x / document.body.offsetWidth - pane.xoff) / pane.sx,
            ly = (y / document.body.offsetHeight - pane.yoff) / pane.sy

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

        if (this.firstT.length == 0)
            return

        let dx = this.firstT[0].pageX - x,
            dy = this.firstT[0].pageY - y,
            d  = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)),
            deltaT = Date.now() - this.touch0,
            s  = d/deltaT,
            r = Math.abs(dx / dy),
            topb  = r < 1.0

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
     * Terminal7.addHost is used to add a host with properties p to terminal 7
     */
    addHost(props) {
        let out = [],
            p = props || {},
            addr = p.addr
        // add the id
        p.id = this.hosts.length

        // if no port specify, use the default port
        if (addr && (addr.indexOf(":") == -1))
            p.addr = `${addr}:7777`

        let h = new Host(p)
        console.log(`adding ${h.user}@${h.addr} & saving hosts`)
        this.hosts.push(h)
        this.storeHosts()
        h.open(this.e)
        return h
    }
    storeHosts() { 
        let out = []
        this.hosts.forEach((h) => {
            if (h.store) {
                let ws = []
                h.windows.forEach((w) => ws.push(w.id))
                out.push({id: h.id, addr: h.addr, user: h.user, secret: h.secret,
                    name:h.name, windows: ws})
            }
        })
        console.log("Storing hosts:", out)
        localStorage.setItem("hosts", JSON.stringify(out))
    }
    clear() {
        document.querySelectorAll(".modal").forEach(e =>
                e.style.display = "none")
    }
    goHome() {
        let s = document.getElementById("home-button"),
            f = document.getElementById("first-time"),
            h = document.getElementById("home")
        s.classList.add("off")
        // we need a token
        if (this.token == null) {
            this.token = uuidv4()
            localStorage.setItem('token', this.token)
        }

        else if (this.activeH) {
            this.activeH.unfocus()
        }
        // hide the modals
        this.clear()
        window.location.href = "#home"
    }
    /* 
     * Terminal7.logDisplay(show) display or hides the notifications
     */
    logDisplay(show) {
        let e = document.getElementById("log")
        if (show) {
            e.classList.remove("fade-out")
            document.getElementById("log-button")
                .classList.add("on")
        } else {
            e.classList.add("fade-out")
            document.getElementById("log-button")
                .classList.remove("on")
        }
    }
}
