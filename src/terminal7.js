import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
import Casts from './movies.js';
import * as Hammer from 'hammerjs';

const THEME = {foreground: "#00FAFA", background: "#000"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const SET_SIZE_PREFIX = "A($%JFDS*(;dfjmlsdk9-0"

class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor() {
        this.d = null
        this.buffer = []
        this.windows = []
        this.cells = []
        this.state = "initiated"
        this.defaultUrl = "https://he.wikipedia.org/wiki/%D7%A2%D7%9E%D7%95%D7%93_%D7%A8%D7%90%D7%A9%D7%99"
        // TODO make the bottom bars height responsive
        this.bottomMargin = 0.16
        this.cast = 0
        this.pc = null
        this.pendingCDCMsgs = []
        this.lastMsgId = 1
        this.cdc = null
        this.breadcrumbs = []
    }
    /*
     * connect connects to a remote host
     */
    connect(host) {
        this.pc = new RTCPeerConnection({ iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' }
                ] })

        this.pc.oniceconnectionstatechange = e => {
            console.log("ice connection state change: " + this.pc.iceConnectionState)
        }
        this.pc.onicecandidate = event => {
            if (event.candidate === null) {
              let offer = btoa(JSON.stringify(this.pc.localDescription))
              console.log("Signaling server...\n")
              fetch('http://'+host+'/connect', {
                headers: { "Content-Type": "application/json; charset=utf-8" },
                method: 'POST',
                body: JSON.stringify({Offer: offer}) 
              }).then(response => response.text())
                .then(data => {
                  let sd = new RTCSessionDescription(JSON.parse(atob(data)))
                    console.log("Got Session Description\n")
                  try {
                    this.pc.setRemoteDescription(sd)
                  } catch (e) {
                    alert(e)
        }})}}
        this.pc.onnegotiationneeded = e => 
            this.pc.createOffer().then(d => this.pc.setLocalDescription(d))
    }

    /*
     * Opens terminal7 on the given DOM element.
     * If the optional `silent` argument is true it does nothing but 
     * point the `e` property at the given element. Otherwise and by default
     * it adds the first window and pane.
     */
    open(e) {
        if (!e) {
            // create the container element
            e = document.createElement('div')
            e.id = "terminal7"
            document.body.appendChild(e)
        }
        else this.e = e
        // open the first window
        let w = this.addWindow('Welcome')
        // watch the buttons
        let b = document.getElementById("add-tab")
        if (b != null) 
            b.onclick = (e) => this.addWindow()

        this.state = "open"
    }
    openCDC() {
        var cdc = this.pc.createDataChannel('%')
        var enc = new TextDecoder("utf-8");
        cdc.onclose = () =>{
            this.state = "disconnected"
            this.write('Control Channel is closed.\n')
            // TODO: What now?
        }
        cdc.onopen = () => {
            this.cdc = cdc
            this.pendingCDCMsgs.forEach((m) => this.cdc.send(m))
            this.pendingCDCMsgs = []
        }
        cdc.onmessage = m => {
            // TODO: Handle control messages
            console.log("got cdc message:", this.state, m.data)
        }
        this.cdc = cdc
    }
    /*
     * Send the pane's size to the server
     */
    sendSize(pane) {
        if (this.pc == null)
            return
        var msg = JSON.stringify({
                    time: 0,
                    message_id: this.lastMsgId++,
                    resize_pty: {
                        id: pane.serverId,
                        sx: pane.t.cols,
                        sy: pane.t.rows
                    }})
        if (!this.cdc) {
            this.pendingCDCMsgs.push(msg)
            this.openCDC()
        }
        else
            try {
                this.cdc.send(msg)
            } catch(err) {
                setTimeout(this.sendSize, 1000)
            }

    }
    /*
     * Change the active window, all other windows and
     * mark its name in the tabbar as the chosen one
     */
    activateWindow(w) {
        if (typeof w == "undefined") {
            this.breadcrumbs.pop()
            // TODO: what if it's the first crumb we just deleted?
            w = this.breadcrumbs.pop()
        }
        else if (this.activeW instanceof Window)
            this.activeW.nameE.classList.remove("active")
        w.nameE.classList.add("active")
        this.activeW = w
        w.activeP.focus()
        window.location.href=`#tab${w.id+1}`
        this.breadcrumbs.push(w)
    }
    /*
     * Adds a window, complete with a first layout and pane
     */
    addWindow(name) {
        let i = this.windows.length
        if (!(name instanceof String))
            name = `Tab ${i+1}`
        let w = new Window({name:name, t7: this, id: this.windows.length})
        //TODO: move this to Window.open()
        w.e = document.createElement('div')
        w.e.className = "window"
        w.e.id = `tab${w.id+1}`
        this.e.appendChild(w.e)
        this.windows.push(w)
        // create the first layout and pane
        let l = 1.0,
            props = {sx:l, sy:l-this.bottomMargin,
                     xoff: 0, yoff: 0,
                     t7: this, w: w},
            layout = w.addLayout("TBD", props)
            
        w.activeP = layout.addPane(props)
        this.activeP = w.activeP
        // Add the name with link at #window-names
        let li = document.createElement('li'),
            a = document.createElement('a')
        a.id = w.e.id+'-name'
        a.w = w
        a.setAttribute('href', `#${w.e.id}`)
        a.innerHTML = `Tab ${w.id+1}`
        // Add gestures on the window name for rename and drag to trash
        let h = new Hammer.Manager(a, {})
        h.options.domEvents=true; // enable dom events
        h.add(new Hammer.Press({event: "rename", pointers: 1}))
        h.add(new Hammer.Tap({event: "switch", pointers: 1}))
        h.on("rename", (ev) => 
             // For some reason this works much better with a timeout
             window.setTimeout(() => this.renameWindow(w), 0))
        h.on('switch', (ev) => this.activateWindow(w))
                
        li.appendChild(a)
        w.nameE = a
        document.getElementById("window-names").appendChild(li)
        this.activateWindow(w)
        return w
    }
    /*
     * Replace the window name with an input field and updates the window
     * name when the field is changed. If we lose focus, we drop the changes.
     * In any case we remove the input field.
     */
    renameWindow(w) {
        let e = w.nameE
        this.activateWindow(w)
        e.innerHTML= `<input size='10' name='window-name'>`
        let i = e.children[0]
        i.focus()
        // On losing focus, replace the input element with the name
        // TODO: chrome fires too many blur events and wher remove
        // the input element too soon
        i.addEventListener('blur', (e) => {
            console.log("blur", e)
            let p = e.target.parentNode
            setTimeout(() => p.innerHTML = p.w.name, 0)
        }, { once: true })
        i.addEventListener('change', (e) => {
            console.log("change", e)
            let p = e.target.parentNode
            p.w.name = e.target.value
            setTimeout(() => p.innerHTML = p.w.name, 0)
        })
    }
    onSessionsChanged() {
        // TODO: why do we care?
    }
    onSessionChanged(id, name) {
        // TODO: why do we care?
    }
    refreshWindows(b) {
        console.log(">> refresh windows")
        for (let l of b) {
            console.log(l)
        }
        console.log("<< refresh windows")
    }
    onFirstContact(buffer) {
        this.onEnd = (buffer) => this.refreshWindows
        setTimeout(() => {
            console.log("sending list windows")
            this.d.send("list-windows\n")
        }, 0)
    }
    play(pane, frame) {
        var d
        let m = Casts[pane.cast]

        if ((typeof m !== "undefined") && (frame == m.length))
            frame = 2

        if (typeof frame === "undefined") {
            frame = 1
            pane.cast = this.cast
            m = Casts[pane.cast]
            this.cast++
            if (this.cast == Casts.length)
                this.cast = 0
            d = m[frame][0]
        } else {
            d = m[frame][0] - m[frame-1][0]
        }
        window.setTimeout(() => {
            pane.write(m[frame][2])
            this.play(pane, frame+1)
        }, d*1000)
    }
    // TODO: loop on all windows and get their layout. returns a string
    get layout() {
    }
}

class Window {
    constructor (props) {
        this.name = name
        this.t7 = props.t7
        this.id = props.id
        this.cells = []
        this.e = null
    }
    addLayout(dir, basedOn) {
        let l = new Layout(dir, basedOn)
        l.id = this.t7.cells.length
        this.cells.push(l)
        this.t7.cells.push(l)
        return l

    }
    close() {
        // remove the window name
        this.nameE.parentNode.remove()
        this.e.remove()
    }

}

class Cell {
    constructor(props) {
        this.t7 = props.t7 || null
        if (props.w instanceof Window)
            this.w = props.w
        else
            throw "Can not create a Cell without an instance of Window in props.w"
        this.id = props.id || undefined
        this.layout = props.layout || null
        this.createElement(props.className)
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
        this.zoomed = false
        this.zoomedE = null
    }
    /*
     * Creates the HTML elment that will store our dimensions and content
     */
    createElement(className) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.classList.add("cell")
        if (typeof className == "string")
            this.e.classList.add(className)

        let terminal7 = document.getElementById('terminal7')
        this.w.e.appendChild(this.e)
        return this.e
    }

    /*
     * Set the focus on the cell
     */
    focus() {
        this.active = true
        this.w.active = true
        this.w.activeP = this
        if (this.t7.activeP !== undefined) {
            this.t7.activeP.e.classList.remove("focused")
            this.e.classList.add("focused")
        }
        this.t7.activeP = this
    }
    /*
     * Used to grow/shrink the terminal based on containing element dimensions
     * Should be overide
     */
    fit() {
    }
    /*
     * Catches gestures on an elment using hammerjs.
     * If an element is not passed in, `this.e` is used
     */
    catchFingers(elem) {
        let e = (typeof elem == 'undefined')?this.e:elem,
            h = new Hammer.Manager(e, {}),
        // h.options.domEvents=true; // enable dom events
            singleTap = new Hammer.Tap({event: "tap"}),
            doubleTap = new Hammer.Tap({event: "doubletap", taps: 2})
        h.add([singleTap,
            doubleTap,
            new Hammer.Tap({event: "twofingerstap", pointers: 2}),
            new Hammer.Swipe({threshold: 200, velocity: 0.7})])


        h.on('tap', e => this.focus())
        h.on('twofingerstap', e => this.toggleZoom())
        h.on('doubletap', e => this.toggleZoom())

        h.on('swipe', e => {
            if (!this.zoomed)  {
                var l
                let topb = (e.direction == Hammer.DIRECTION_UP) ||
                           (e.direction == Hammer.DIRECTION_DOWN)
                if (topb)
                    l = (e.center.x / document.body.offsetWidth - this.xoff) /
                        this.sx

                else
                    l = (e.center.y / document.body.offsetHeight - this.yoff) /
                        this.sy
                let t = this.split((topb)?"topbottom":"rightleft", l)
            }
        })
        this.mc = h
    }
    get sx(){
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    set sx(val) {
        this.e.style.width = String(val*100) + "%"
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1)) / 100.0
    }
    set sy(val) {
        this.e.style.height = String(val*100) + "%"
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    set xoff(val) {
        this.e.style.left = String(val*100) + "%"
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1)) / 100.0
    }
    set yoff(val) {
        this.e.style.top = String(val*100) + "%"
    }
    close() {
        this.layout.onClose(this)
        // remove this from the window
        this.w.cells.splice(this.w.cells.indexOf(this), 1)
        this.e.remove()
    }
    toggleZoom() {
        if (this.zoomed) {
            // Zoom out
            let te = this.zoomedE.children[0]
            this.e.appendChild(te)
            document.body.removeChild(this.zoomedE)
            this.zoomedE = null
        } else {
            let e = document.createElement('div'),
                te = this.e.removeChild(this.e.children[0])
            e.classList.add("pane", "zoomed", "focused")
            this.catchFingers(e)
            e.appendChild(te)
            document.body.appendChild(e)
            this.zoomedE = e
        }
        this.focus()
        this.zoomed = !this.zoomed
    }

}

class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(dir, basedOn) {
        super({sx: basedOn.sx, sy: basedOn.sy,
               xoff: basedOn.xoff, yoff: basedOn.yoff,
               w: basedOn.w, t7: basedOn.t7,
               className: "layout"})
        this.dir = dir
        // if we're based on a cell, we make it our first cell
        if (basedOn instanceof Cell) {
            this.layout = basedOn.layout
            basedOn.layout = this
            this.cells = [basedOn]
            // if we're in a layout we need replace basedOn there
            if (this.layout != null)
                this.layout.cells.splice(this.layout.cells.indexOf(basedOn), 1, this)
        }
        else
            this.cells = []
    }
    /*
     * On a cell going away, resize the other elements
     */
    onClose(c) {
        // if this is the only pane in the layout, close the layout
        if (this.cells.length == 1) {
            if (this.layout != null)
                this.layout.onClose(this)
            else {
                // activate the next window
                this.t7.activateWindow()
                this.w.close()
            }
            this.e.remove()
        } else {
            let i = this.cells.indexOf(c), 
                p = (i > 0)?this.cells[i-1]:this.cells[1]
            // if no peer it means we're removing the last pane in the window
            if (p === undefined) {
                this.w.close()
                return
            }
            if (this.dir == "rightleft") {
                p.sy += c.sy
                if (c.yoff < p.yoff)
                    p.yoff = c.yoff
            } else {
                p.sx += c.sx
                if (c.xoff < p.xoff)
                    p.xoff = c.xoff
            }
            p.fit()
            if (p instanceof Layout)
                // just pick the first cell
                p.cells[0].focus()
            else
                p.focus()
            // remove this from the layout
            this.cells.splice(i, 1)
        }
    }
    /*
     * Replace an old cell with a new cell, used when a pane
     * is replaced with a layout
     */
    replace(o, n) {
        this.cells.splice(this.cells.indexOf(o), 1, n)
    }
    /*
     * Adds a new cell - `n` - to the layout, just after `o`
     */
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        let p = props || {}
        p.w = this.w
        p.t7 = this.t7
        p.layout = this
        p.id = this.t7.cells.length
        let pane = new Pane(p)
        this.t7.cells.push(pane)
        if (p.parent instanceof Cell)
            this.cells.splice(this.cells.indexOf(p.parent)+1, 0, pane)
        else
            this.cells.push(pane)
        // opening the terminal and the datachannel are heavy so we wait
        // for 10 msecs to let the new layout refresh
        setTimeout(() => {
            pane.openTerminal()
            if (this.t7.pc != null)
                pane.openDC()
        }, 10)
        pane.focus()
        return pane
    }
    fit() {
        this.cells.forEach((c) => (typeof c.t == "object") && c.fit())
    }
    toText() {
        // r is the text we return, start with our own dimensions & position
        let r = (this.dir=="rightleft")?"[":"{"
        let that = this
        // get the dimensions of all the cell, recurse if a layout is found
        this.cells.forEach((c, i) => {
            if (i > 0)
                r += ','
            try {
                r += `${c.sx.toFixed(3)}x${c.sy.toFixed(3)}`
            }
            catch(e) {
                console.log(i, c)
            }
            r += `,${c.xoff.toFixed(3)},${c.yoff.toFixed(3)}`
            if (c == that)
                console.log("ERROR: layout shouldn't have `this` in his cells")
            // TODO: remove this workaround - `c != that`
            if ((c != that) && (typeof c.toText == "function"))
                r += c.toText()
            else
                r += `,${c.id}`
        })
        r += (this.dir=="rightleft")?"]":"}"
        return r
    }

    get sx() {
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    /*
     * update the sx of all cells
     */
    set sx(val) {
        let r = val/this.sx
        this.e.style.width = String(val * 100) + "%"
        if (this.cells !== undefined)
            // this doesn't happen on init and that's fine
            this.cells.forEach((c) => c.sx *= r)
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1)) / 100.0
    }
    /*
     * Update the y size for all cells
     */
    set sy(val) {
        let r = val/this.sy
        this.e.style.height = String(val * 100) + "%"
        if (this.cells !== undefined)
            this.cells.forEach((c) => c.sy *= r)
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    /*
     * Update the X offset for all cells
     */
    set xoff(val) {
        let x=val
        this.e.style.left = String(val * 100) + "%"
        if (this.cells !== undefined)
            this.cells.forEach((c) => {
                if (this.dir == "rightleft")
                    c.xoff = val
                else {
                    c.xoff = x
                    x += c.sx
                }
            })
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1)) / 100.0
    }
    /*
     * Update the Y offset for all cells
     */
    set yoff(val) {
        let y = val
        this.e.style.top = String(val * 100) + "%"
        if (this.cells !== undefined)
            this.cells.forEach((c) => {
                if (this.dir =="topbottom")
                    c.yoff = val
                else {
                    c.yoff = y
                    y += c.sy
                }
            })
    }
}
class Pane extends Cell {
    constructor(props) {
        props.className = "pane"
        super(props)
        this.catchFingers()
        this.state = "init"
        this.d = null
        this.zoomed = false
        this.active = false
    }

    write(data) {
        this.t.write(data)
    }
                
    setEcho(echoOn) {
        if (this.echo === undefined) {
            this.t.onData((data) => this.echo && this.t.write(data))
        }
        this.echo = echoOn
    }
    /*
     * Opens and iframe with the requested address or source
     *
     * The props object can have values to `url` and/or `src` both are copied
     * to the new iframe as `src` and `srcdoc`.
     */
    openURL(props) {
        let p = props || {}
        let e = document.createElement('iframe')
        e.allow = "fullscreen"
        e.setAttribute('height', this.e.clientHeight)
        e.setAttribute('width', this.e.clientWidth)
        this.e.innerHTML = ""
        this.e.appendChild(e)
        e.onload = () => this.catchFingers(e.contentWindow.document.body)
        e.setAttribute('src', p.url || this.t7.defaultUrl)
        if (typeof srcdoc == 'string')
            e.setAttribute('srcdoc', p.src)
    }
    openTerminal() {
        var afterLeader = false

        this.t = new Terminal({
            convertEol: true,
            theme: THEME,
            rows:24,
            cols:80
        })
        this.fitAddon = new FitAddon()
        this.t.open(this.e)
        this.t.loadAddon(this.fitAddon)
        this.t.onKey((ev) =>  {
            if (afterLeader) {
                if (ev.domEvent.key == "z") 
                    this.toggleZoom()
                else if (ev.domEvent.key == ",") 
                    this.t7.renameWindow(this.w)
                else if (ev.domEvent.key == "d")
                    this.close()
                afterLeader = false
            }
            // TODO: make the leader key configurable
            else if ((ev.domEvent.ctrlKey == true) && (ev.domEvent.key == "a")) {
                afterLeader = true
                return
            }
            else
                if (this.d != null)
                    this.d.send(ev.key)
        })
        this.fit()
        this.state = "opened"
        // this.t7.play(this)
        return this.t
    }

    // fit a pane
    fit() {
        if (this.fitAddon !== undefined) {
            this.fitAddon.fit()
            this.t7.sendSize(this)
        }
        if (this.fitAddon !== undefined)
            // wait a bit so the display refreshes before we do the heavy lifting
            // lifitinof resizing the terminal
            setTimeout(() => {
                this.fitAddon.fit()
                this.t7.sendSize(this)
            }, 10)
    }
    focus() {
        super.focus()
        if (this.t !== undefined)
            this.t.focus()
    }
    /*
     * Splitting the pane, receivees a dir-  either "topbottom" or "rightleft"
     * and the relative size (0-1) of the area left for us.
     * Returns the new pane.
     */
    split(dir, s) {
        var sx, sy, xoff, yoff, l
        // if the current dir is `TBD` we can swing it our way
        if (typeof s == "undefined")
            s = 0.5
        if ((this.layout.dir == "TBD") || (this.layout.cells.length == 1))
            this.layout.dir = dir
        // if we need to create a new layout do it and add us and new pane as cells
        if (this.layout.dir != dir)
            l = this.w.addLayout(dir, this)
        else 
            l = this.layout

        // update the dimensions & position
        if (dir == "rightleft") {
            sy = this.sy * (1 - s)
            sx = this.sx
            xoff = this.xoff
            this.sy -= sy
            yoff = this.yoff + this.sy
        }
        else  {
            sy = this.sy
            sx = this.sx * (1 - s)
            yoff = this.yoff
            this.sx -= sx
            xoff = this.xoff + this.sx
        }
        this.fit()

        // add the new pane
        return l.addPane({sx: sx, sy: sy, 
                          xoff: xoff, yoff: yoff,
                          parent: this})
    }
    openDC() {
        var tSize = this.t.rows+'x'+this.t.cols
        this.buffer = []

        this.d = this.t7.pc.createDataChannel(tSize + ' zsh')
        this.d.onclose = () =>{
            this.state = "disconnected"
            this.write('Data Channel is closed.\n')
            this.close()
        }
        this.d.onopen = () => {
            this.state = "opened"
            // TODO: set our size by sending "refresh-client -C <width>x<height>"
            setTimeout(() => {
                if (this.state == "opened") {
                    this.write("Sorry, didn't get a prompt from the server.")
                    this.write("Please refresh.")
                }},3000)
        }
        this.d.onmessage = m => {
            // TODO:
            console.log("got message:", this.state, m.data)
            if (this.state == "opened") {
                var enc = new TextDecoder("utf-16"),
                    str = enc.decode(m.data)
                this.state = "ready"
                this.onEnd = this.onFirstContact
                this.serverId = parseInt(str)
            }
            else if (this.state == "disconnected") {
                this.buffer.push(new Uint8Array(m.data))
            }
            else if (this.state == "ready") {
                this.write(new Uint8Array(m.data))
            }
        }
        return this.d
    }
    toggleZoom() {
        super.toggleZoom()
        this.fit()
    }
}
export { Terminal7 , Cell, Pane, Layout } 
