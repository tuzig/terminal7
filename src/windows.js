import { Denque } from './denque.js'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
import * as Hammer from 'hammerjs';

const THEME = {foreground: "#00FAFA", background: "#271d30"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const SET_SIZE_PREFIX = "A($%JFDS*(;dfjmlsdk9-0"

class Terminal7 {
    constructor() {
        // constants
        this.paneMargins = 0.02
        // vars
        this.state = 0
        this.panes = []
        this.d = null
        this.buffer = []
        this.windows = []
        this.panes = []

        let w = this.addWindow(),
            l = 1.0-this.paneMargins,
            p = w.addPane({sx:l, sy:l})
        //p.sx = p.sy = l
        this.activeP = p
        this.activeW = w
    }

    open (e) {
        this.e = e
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
        var p = new Pane(props || {})
        this.t7.panes.push(p)
        p.id = this.t7.panes.length - 1
        p.w = this
        p.t7 = this.t7
        p.createElement()
        p.sx = props.sx 
        p.sy = props.sy 
        this.cells.push(p)
        return p
    }
}

class Cell {
    constructor(props) {
        // TODO: move create element here and call it now 
        /*
        this.sx = props.sx || 80
        this.sy = props.sy || 24
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
        this.parent = props.parent || null
        */
    }
    relocate(sx, sy, xoff, yoff) {
        if (sx !== undefined) this.sx = sx
        if (sy !== undefined) this.sy = sy
        if (yoff !== undefined) this.yoff = yoff
        if (xoff !== undefined) this.xoff = xoff
        if (this.e && this.t) {
            // move tand resize the dom element
            const core = this.t._core
            this.e.style.width = setPx(this.sx * core._renderService.dimensions.actualCellWidth)
            this.e.style.height = setPx(this.sy * core._renderService.dimensions.actualCellHeight)
            this.e.style.top = setPx(this.yoff * core._renderService.dimensions.actualCellHeight)
            this.e.style.left = setPx(this.xoff * core._renderService.dimensions.actualCellWidth)
        }
    }
}

class Layout extends Cell {
    constructor(basedOn) {
        super(basedOn)
        this.sons = new Denque()
        this.sx = basedOn.sx
        this.sy = basedOn.sy
        this.xoff = basedOn.xoff
        this.yoff = basedOn.yoff
    }
    findChild(child) {
        for (let i = 0; i < this.sons.length; i++)
            if (this.sons.peekAt(i) == child)
                return i
        return null
    }
    removeChild(child) {
        let i = this.findChild(child)
        this.sons.remove(i)
        if (this.sons.length == 0) {
            if (this.parent) {
                this.parent.removeChild(this)
                this.parent.relocate()
                return
            } else {
                console.log("Removing last layout cell, what now?")
            }
        } else {
            this.sons.peekAt((i>0)?i-1:0).t.focus()
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
    }

    write(data) {
        this.t.write(data)
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
    removeElment() {
        this.e.parentNode.removeChild(this.e);
        if (this.parent)
            this.parent.removeChild(this)
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
        var sx, sy, type, l
        if (type == "rightleft") {
            sx = this.sx
            sy = this.sy / 2.0
            this.sy = sy
        }
        else  {
            sy = this.sy
            sx = this.sx / 2.0
            this.sx = sx
        }
        if (this.parent == null || this.parent.type == type) {
            console.log("Adding new layout")
            l = new Layout(this)
            l.parent = this.parent
            this.parent = l
            var newPane = this.w.addPane(sx, sy)
            newPane.parent = l
            // TODO:Open the datachannel
            // this.openDC()
            l.sons.push(this)
            l.sons.push(newPane)
            l.relocate()
            newPane.focus()
        }
        else {
            l = this.parent
            let newPane = this.w.addPane(sx, sy)
            newPane.parent = l
            newPane.openDC()
            l.sons.splice(l.sons.findChild(this)+1, 0, newPane)
            l.relocate()
            newPane.t.focus()
        }
        if (type=="rightleft")
            l.type = "topleft"
        else
            l.type ="rightleft"

    }
    get sx() {
        return parseFloat(this.e.style.width.slice(0,-1))
    }
    set sx(val) {
        this.e.style.width = String(val) + "%"
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1))
    }
    set sy(val) {
        this.e.style.height = String(val) + "%"
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1))
    }
    set xoff(val) {
        this.e.style.left = String(val) + "%"
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1))
    }
    set yoff(val) {
        this.e.style.top = String(val) + "%"
    }
}
export { Terminal7 , Cell, Pane, Layout }
