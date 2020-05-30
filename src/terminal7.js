import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
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
    }
    /*
     * Opens the terminal on the given DOM element.
     * If the optional `silent` argument is true it does nothing but 
     * point the `e` property at the given element. Otherwise and by default
     * it adds the first window and pane.
     */
    open(e) {
        if (!e) {
            // create the conbtainer element
            e = document.createElement('div')
            e.id = "terminal7"
            document.body.appendChild(e)
        }
        this.e = e

        let w = this.addWindow(),
            l = 1.0,
            p = w.addPane({sx:l, sy:l-0.16,
                           xoff: 0, yoff: 0})
        this.activeP = p
        this.activeW = w
        this.state = "open"
    }
    addWindow(name) {
        let w = new Window(name)
        w.t7 = this
        this.windows.push(w)
        return w
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
    openDC(pc) {
        this.buffer = []
        this.pc = pc
        this.d = pc.createDataChannel('/usr/local/bin/tmux -CC new')
        this.d.onclose = () =>{
            this.state = "disconnected"
            this.write('Data Channel is closed.\n')
            // TODO: What now?
        }
        this.d.onopen = () => {
            this.state = 2
            // TODO: set our size by sending "refresh-client -C <width>x<height>"
            setTimeout(() => {
                if (this.state == 2) {
                    this.write("Sorry, didn't get a prompt from the server.")
                    this.write("Please refresh.")
                }},3000)
        }
        this.d.onmessage = m => {
            // TODO:
            if (this.state == 2) {
                this.state = 3
                this.onEnd = this.onFirstContact
                //TODO: remove demo hack
                document.getElementById("tabbar").innerHTML = "zsh"
            }
            if (this.state == 4) {
                this.buffer.push(m.data)
            }
            if (this.state >= 3) {
                var rows = m.data.split("\r\n")
                for (let row of rows)
                    if (row)
                        this.parse(row)
            }
        }
        return this.d
    }
}

class Window {
    constructor (name) {
        this.name = name
        this.cells = []
    }
    addLayout(type, basedOn) {
        let l = new Layout(type, basedOn)
        l.id = this.t7.cells.length
        this.cells.push(l)
        this.t7.cells.push(l)
        return l

    }
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        let p = props || {}
        p.w = this
        p.t7 = this.t7
        var pane = new Pane(p)
        pane.id = this.t7.cells.length
        this.t7.cells.push(pane)
        this.cells.push(pane)
        return pane
    }
    close() {
        console.log("TODO: close window")
    }

}

class Cell {
    constructor(props) {
        this.t7 = props.t7 || null
        this.w = props.w || null
        this.id = props.id || undefined
        this.layout = props.layout || null
        this.createElement(props.className)
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
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
        this.t7.e.appendChild(this.e)
        return this.e
    }

    /*
     * Set the focus on the cell
     */
    focus() {
        this.active = true
        this.w.active = true
        this.t7.activeP.e.classList.remove("focused")
        this.e.classList.add("focused")
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
        let e = (typeof elem == 'undefined')?this.e:elem
        let h = new Hammer.Manager(e, {})
        h.options.domEvents=true; // enable dom events
        h.add(new Hammer.Tap({event: "tap", pointers: 1}))
        h.add(new Hammer.Tap({event: "doubletap", pointers: 2}))
        h.add(new Hammer.Swipe({threshold: 200, velocity: 0.7}))
        h.on('tap', (ev) => { console.log(ev); ev.srcEvent.stopPropagation(); this.focus()})
        h.on('doubletap', this.toggleZoom)

        h.on('swipe', (ev) => {
            if (!this.zoomed)  {
                let topb = Math.abs(ev.deltaY) > Math.abs(ev.deltaX)
                let t = this.split((topb)?"topbottom":"rightleft")
                t.openTerminal()
            }
        });
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
        if (this.layout != null) {
            this.layout.onClose(this)
        }
        // remove this from the window
        this.w.cells.splice(this.w.cells.indexOf(this), 1)
        this.e.remove()
    }
    toggleZoom(ev) {
        if (this.zoomed) {
            // Zoom out
            // this.e.className = this.unzoomed[0]
            this.xoff = this.unzoomed[1]
            this.yoff = this.unzoomed[2]
            this.sx = this.unzoomed[3]
            this.sy = this.unzoomed[4]
            Array.prototype.forEach.call(document.getElementsByClassName("cell"), 
                e => e.style.display = 'block') 
            Array.prototype.forEach.call(document.getElementsByClassName("bar"), 
                e => e.style.display = 'block')   // , ...document.getElementsByClassName("tab")]
        } else {
            this.unzoomed = [this.e.className,
                             this.xoff, this.yoff,
                             this.sx, this.sy]
            // hide all the other elements
            Array.prototype.forEach.call(
                document.getElementsByClassName("cell"), 
                e => { if (e != this.e) e.style.display = 'none'})
            Array.prototype.forEach.call(
                document.getElementsByClassName("bar"), 
                e => { if (e != this.e) e.style.display = 'none'})
            // this.e.className = "pane zoom"
            this.xoff = 0
            this.sx = 1.0
            this.sy = 1.0
            this.yoff = 0
        }
        this.fit()
        this.zoomed = !this.zoomed
    }

}

class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(type, basedOn) {
        super({sx: basedOn.sx, sy: basedOn.sy,
               xoff: basedOn.xoff, yoff: basedOn.yoff,
               w: basedOn.w, t7: basedOn.t7,
               className: "layout"})
        // take the place of basedOn in its layout
        this.type = type
        this.cells = [basedOn]
        this.layout = basedOn.layout
        // if we're in a layout we need replace basedOn there
        if (this.layout != null)
            this.layout.cells.splice(this.layout.cells.indexOf(basedOn), 1, this)
        basedOn.layout = this

    }
    /*
     * On a cell going away, resize the other elements
     */
    onClose(c) {
        // if this is the only pane in the layout, remove the layout
        if (this.cells.length == 1) {
            this.layout.onClose(this)
            this.e.remove()
        } else {
            let i = this.cells.indexOf(c), 
                p = (i > 0)?this.cells[i-1]:this.cells[1]
            // if no peer it means we're removing the last pane in the window
            if (p === undefined) {
                this.w.close()
                return
            }
            if (this.type == "rightleft") {
                p.sy += c.sy
                if (c.yoff < p.yoff)
                    p.yoff = c.yoff
            } else {
                p.sx += c.sx
                if (c.xoff < p.xoff)
                    p.xoff = c.xoff
            }
            // remove this from the layout
            this.cells.splice(i, 1)
        }
    }
    fit() {
        this.cells.forEach((c) => (typeof c.t == "object") && c.fit())
    }
    get sx() {
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    /*
     * update the sx of all cells
     */
    set sx(val) {
        let p = String(val * 100) + "%"
        this.e.style.width = p
        if (this.cells !== undefined)
            // this doesn't happen on init and that's fine
            this.cells.forEach((c) => c.e.style.width = p)
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1)) / 100.0
    }
    /*
     * Update the y size for all cells
     */
    set sy(val) {
        let p = String(val * 100) + "%"
        this.e.style.height = p
        if (this.cells !== undefined)
            this.cells.forEach((c) => c.e.style.height = p)
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    /*
     * Update the X offset for all cells
     */
    set xoff(val) {
        let p = String(val * 100) + "%"
        this.e.style.left = p
        if (this.cells !== undefined)
            this.cells.forEach((c) => c.e.style.left = p)
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1)) / 100.0
    }
    /*
     * Update the Y offset for all cells
     */
    set yoff(val) {
        let p = String(val * 100) + "%"
        this.e.style.top = p
        if (this.cells !== undefined)
            this.cells.forEach((c) => c.e.style.top = p)
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
            // if ((ev.domEvent.ctrlKey == true) && (ev.domEvent.key == 'c'))
            if (ev.key == "z")
                this.toggleZoom()
            else if (ev.key == "d")
                this.close()
        })
        this.fit()
        this.state = "ready"
        return this.t
    }

    fit() {
        if (this.fitAddon !== undefined)
            this.fitAddon.fit()
    }
    //TODO: move this to the handlers of commands that cause a resize
    sendSize() {
        if (this.d)
            try {
                Terminal7.d.send(SET_SIZE_PREFIX+JSON.stringify({
                    Cols: this.sx,
                    Rows: this.sy,
                    X: 0,
                    Y: 0
                }))
            } catch(err) {
                setTimeout(this.sendSize, 1000)
            }

    }
    focus() {
        super.focus()
        if (this.t !== undefined)
            this.t.focus()
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        var sx, sy, xoff, yoff, l
        if (type == "rightleft") {
            sy = this.sy / 2.0
            sx = this.sx
            xoff = this.xoff
            yoff = this.yoff + sy
            this.sy = sy
        }
        else  {
            sy = this.sy
            sx = this.sx / 2.0
            yoff = this.yoff
            xoff = this.xoff + sx
            this.sx = sx
        }
        this.fit()
        let newPane = this.w.addPane({sx: sx, sy: sy, 
                                      xoff: xoff, yoff: yoff,
                                      className: 'layout'})
        // if we need to create a new layout do it and add us and new pane as cells
        if (this.layout == null || this.layout.type != type) {
            l = this.w.addLayout(type, this)
            l.cells.push(newPane)
            // TODO:Open the webexec channel
            // this.openDC()
        } else {
            l = this.layout
            l.cells.splice(l.cells.indexOf(this), 0, newPane)
        }
        newPane.layout = l
        newPane.focus()
        return newPane
    }
}
export { Terminal7 , Cell, Pane, Layout } 
