import { Denque } from './denque.js'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
import * as Hammer from 'hammerjs';

const THEME = {foreground: "#00FAFA", background: "#271d30"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const SET_SIZE_PREFIX = "A($%JFDS*(;dfjmlsdk9-0"

class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(props) {
        this.panes = []
        this.d = null
        this.paneMargin = props && props.paneMargin || 0.02
        this.buffer = []
        this.windows = []
        this.panes = []
        this.state = "initiated"
    }
    /*
     * Opens the terminal on the given DOM element.
     * If the optional `silent` argument is true it does nothing but 
     * point the `e` property at the given element. Otherwise and by default
     * it adds the first window and pane.
     */
    open(e) {
        this.e = e

        let w = this.addWindow(),
            l = 1.0 - this.paneMargin * 2,
            off = this.paneMargin,
            p = w.addPane({sx:l, sy:l,
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

function setPx(i) { return i.toString()+"px" }

class Window {
    constructor (name) {
        this.name = name
        this.cells = []
    }
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        props.w = this
        props.t7 = this.t7
        props.id = this.t7.panes.length
        var p = new Pane(props || {})
        this.t7.panes.push(p)
        this.cells.push(p)
        return p
    }
}

class Cell {
    constructor(props) {
        // TODO: move create element here and call it now 
        this.createElement()
        this.t7 = props.t7 || null
        this.w = props.w || null
        this.layout = props.layout || null
        this.parent = props.parent || null
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || this.t7 && this.t7.paneMargin
        this.yoff = props.yoff || this.t7 && this.t7.paneMarginthis.t7 && this.t7.paneMargin
    }
    createElement(elemClass) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.classList.add("border", "pane")
        if (typeof elemClass !== "undefined")
            this.e.classList.add(elemClass)

        const h = new Hammer.Manager(this.e, {});
        h.add(new Hammer.Tap({event: "doubletap", pointers: 2}))
        h.add(new Hammer.Swipe({threshold: 300, velocity: 1}))
        h.on('doubletap', (ev) => {
            if (this.zoomed) {
                this.e.className = this.className
                this.e.style.top = this.top
                this.e.style.left = this.left
                this.e.style.width = this.width
                this.e.style.height = this.height
                Array.prototype.forEach.call(document.getElementsByClassName("pane"), 
                    e => e.style.display = 'block') 
                Array.prototype.forEach.call(document.getElementsByClassName("bar"), 
                    e => e.style.display = 'block')   // , ...document.getElementsByClassName("tab")]
            } else {
                Array.prototype.forEach.call(document.getElementsByClassName("pane"), 
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
            this.split((topb)?"topbottom":"rightleft")
        });
        let terminal7 = document.getElementById('terminal7')
        if (!terminal7) {
            // create the conbtainer element
            terminal7 = document.createElement('div')
            terminal7.id = "terminal7"
            document.body.appendChild(terminal7)
        }
        terminal7.appendChild(this.e)
        return this.e
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
}

class Layout extends Cell {
    constructor(type, basedOn) {
        super(basedOn)
        this.type = type
        this.sons = []
        basedOn.layout = this
    }
    removeChild(child) {
        let i = this.sons.indexOf(child)
        this.sons.splice(i, 1)
        if (this.sons.length == 0) {
            if (this.parent) {
                this.parent.removeChild(this)
                this.parent.relocate()
                return
            } else {
                console.log("Removing last layout cell, what now?")
            }
        } else {
            this.sons[(i>0)?i-1:0].t.focus()
        }
        this.relocate()
    }
    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        if (this.type == "rightleft") {
            let w = this.sx / this.sons.length
            let off = this.xoff
            for (let s of this.sons.toArray()) {
                s.relocate(w,  this.sy, off,  this.yoff)
                off += w
            }       
        }
        else {
            let h = Math.floor((this.sy - 1) / this.sons.length)
            let off =  this.yoff
            for (let s of this.sons.toArray()) {
                s.relocate( this.sx, h,  this.xoff, off)
                off += h+1
            }       
        }

    }
}
class Pane extends Cell {
    constructor(props) {
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
        this.t.onKey((keys, ev) =>  {
            if (this.t7.d && this.t7.d.readyState == "open") {
                console.log(keys)
                this.t7.d.send("send " + keys.key + "\n")
            }
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
        if (this.t !== undefined)
            this.t.focus()
        this.active = true
        this.w.active = true
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        var sx, sy, xoff, yoff, l
        if (type == "rightleft") {
            sy = (this.sy - this.t7.paneMargin) / 2.0
            sx = this.sx
            xoff = this.xoff
            console.log(this.yoff, this.sy, sy)
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
        let newPane = this.w.addPane({sx: sx, sy: sy, 
                                      xoff: xoff, yoff: yoff,
                                      parent: this})
        // if we need to create a new layout do it and add us and new pane as sons
        if (this.layout == null || this.layout.type != type) {
            l = new Layout(type, this)
            this.layout = l
            l.sons.push(this)
            l.sons.push(newPane)
            // TODO:Open the webexec channel
            // this.openDC()
        } else {
            l = this.layout
            l.sons.splice(l.sons.indexOf(this), 0, newPane)
        }
        newPane.layout = l
        newPane.focus()
    }
}
export { Terminal7 , Cell, Pane, Layout } 
