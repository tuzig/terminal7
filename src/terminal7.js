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
    constructor(props) {
        this.d = null
        this.paneMargin = props && props.paneMargin || 0.02
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
            l = 1.0 - this.paneMargin * 2,
            off = this.paneMargin,
            // TODO the .15 sould be for landscape, portrait is another issue
            p = w.addPane({sx:l, sy:l-0.16-this.paneMargin,
                           xoff: off, yoff: off})
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
        p.id = this.t7.cells.length
        var pane = new Pane(p)
        this.t7.cells.push(pane)
        this.cells.push(pane)
        return pane
    }
    findChild(c) {
        for (var i = 0; i < this.cells.length; i++)
            if (this.cells[i].parent == c)
               return this.cells[i] 
        return null
    }
    close() {
        console.log("TODO: close window")
    }

}

class Cell {
    constructor(props) {
        this.t7 = props.t7 || null
        this.w = props.w || null
        this.parent = null
        this.id = props.id || undefined
        this.layout = props.layout || null
        this.parent = props.parent || null
        this.createElement(props.className)
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || this.t7 && this.t7.paneMargin
        this.yoff = props.yoff || this.t7 && this.t7.paneMargin
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
        this.catchFingers()
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
        let e = elem || this.e
        let h = new Hammer.Manager(e, {})
        
        h.add(new Hammer.Tap({event: "doubletap", pointers: 2}))
        h.add(new Hammer.Swipe({threshold: 200, velocity: 0.7}))
        h.on('doubletap', (ev) => {
            if (this.zoomed) {
                this.e.className = this.className
                this.e.style.top = this.top
                this.e.style.left = this.left
                this.e.style.width = this.width
                this.e.style.height = this.height
                Array.prototype.forEach.call(document.getElementsByClassName("cell"), 
                    e => e.style.display = 'block') 
                Array.prototype.forEach.call(document.getElementsByClassName("bar"), 
                    e => e.style.display = 'block')   // , ...document.getElementsByClassName("tab")]
            } else {
                Array.prototype.forEach.call(document.getElementsByClassName("cell"), 
                    e => { if (e != this.e) e.style.display = 'none'})
                Array.prototype.forEach.call(document.getElementsByClassName("bar"), 
                    e => { if (e != this.e) e.style.display = 'none'})
                this.top = this.e.style.top
                this.left = this.e.style.left
                this.className = this.e.className
                this.e.className = "pane zoom"
                this.e.style.left = 0
                this.width = this.e.style.width
                this.height = this.e.style.height
                this.e.style.width = "100%"
                this.e.style.height = "100%"
                this.e.style.top = 0
            }
            setTimeout(() => {
                this.fit()
                this.sendSize()
                this.zoomed = !this.zommed
            }, 10);
        });
        h.on('swipe', (ev) => {
            let topb = Math.abs(ev.deltaY) > Math.abs(ev.deltaX)
            let t = this.split((topb)?"topbottom":"rightleft")
            t.openTerminal()
        });
    }
    get sx() {
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
        // the layout makes things complex
        var p
        if (this.layout && (this.layout != null)) {
            // if this is the single pane in the layout, drop the layout
            if (this.layout.cells.length == 1) {
                this.layout.close()
                this.e.remove()
                return
            }
            else {
                p = this.layout.findPeer(this)// w.findChild(this)
                if (p === undefined) {
                    this.w.close()
                    return
                }
            }
            if (this.layout.type == "rightleft") {
                p.sy += this.sy + this.t7.paneMargin
                if (this.yoff < p.yoff)
                    p.yoff = this.yoff
            } else {
                p.sx += this.sx + this.t7.paneMargin
                if (this.xoff < p.xoff)
                    p.xoff = this.xoff
            }
            // remove this from the layout
            this.layout.cells.splice(this.layout.cells.indexOf(this), 1)
            p.fit()
        }
        // remove this from the window
        this.w.cells.splice(this.w.cells.indexOf(this), 1)
        this.e.remove()
        p.focus()
    }

}

class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(type, basedOn) {
        super({sx: basedOn.sx, sy: basedOn.sy,
               xoff: basedOn.xoff, yoff: basedOn,
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
        this.parent = basedOn.parent
        basedOn.parent = null

    }
    findPeer(c) {
        let i = this.cells.indexOf(c)
        return (i > 0)?this.cells[i-1]:this.cells[1]
    }
    removeChild(child) {
        let i = this.cells.indexOf(child)
        this.cells.splice(i, 1)
        if (this.cells.length == 0) {
            if (this.parent) {
                this.parent.removeChild(this)
                this.parent.relocate()
                return
            } else {
                console.log("Removing last layout cell, what now?")
            }
        } else {
            this.cells[(i>0)?i-1:0].t.focus()
        }
        this.relocate()
    }
    get sx() {
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    /*
     * update the sx of all cells
     */
    set sx(val) {
        let p = String(val * 100 + "%")
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
        let p = String(val * 100 + "%")
        this.e.style.height = p
        if (this.cells !== undefined)
            this.cells.forEach((c) => this.e.style.height = p)
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    /*
     * Update the X offset for all cells
     */
    set xoff(val) {
        let p = String(val * 100 + "%")
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
        let p = String(val * 100 + "%")
        this.e.style.top = p
        if (this.cells !== undefined)
            this.cells.forEach((c) => c.e.style.top = p)
    }
    // TODO: old code, probably need to refactor to `spread` with the layout
    // as argument.
    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        if (this.type == "rightleft") {
            let w = this.sx / this.cells.length
            let off = this.xoff
            for (let s of this.cells.toArray()) {
                s.relocate(w,  this.sy, off,  this.yoff)
                off += w
            }       
        }
        else {
            let h = Math.floor((this.sy - 1) / this.cells.length)
            let off =  this.yoff
            for (let s of this.cells.toArray()) {
                s.relocate( this.sx, h,  this.xoff, off)
                off += h+1
            }       
        }
    }
}
class Pane extends Cell {
    constructor(props) {
        props.className = "pane"
        super(props)
        this.state = "init"
        this.d = null
        this.zoomed = false
        this.active = false
    }

    write(data) {
        this.t.write(data)
    }
                
    removeElment() {
        if (this.layout)
            this.layout.removeChild(this)
        this.e.parentNode.removeChild(this.e);
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
        // this.catchFingers(e)
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
                this.close()
            /*
            else if (this.t7.d && this.t7.d.readyState == "open")
                this.t7.d.send("send " + keys.key + "\n")
            else
                this.t.write(ev.key)
                */
        })
        this.fit()
        this.state = "ready"
        return this.t
    }

    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        this.fit()
        //TODO: move this to the handlers of commands that cause a resize
        // this.sendSize()
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
            sy = (this.sy - this.t7.paneMargin) / 2.0
            sx = this.sx
            xoff = this.xoff
            yoff = this.yoff + this.sy - sy
            this.sy = sy
        }
        else  {
            sy = this.sy
            sx = (this.sx - this.t7.paneMargin) / 2.0
            yoff = this.yoff
            xoff = this.xoff + sx + this.t7.paneMargin
            this.sx = sx
        }
        this.fit()
        let newPane = this.w.addPane({sx: sx, sy: sy, 
                                      xoff: xoff, yoff: yoff,
            parent: this, className: 'layout'})
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
