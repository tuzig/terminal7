import { Denque } from './denque.js'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
import * as Hammer from 'hammerjs';

const THEME = {foreground: "#00FAFA", background: "#271d30"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const SET_SIZE_PREFIX = "A($%JFDS*(;dfjmlsdk9-0"

const TouchTmux = {
    state: 0,
    lastID: 0,
    panes: {},
    windows: {},
    d: {},
    buffer: [],

    write(data, paneId) {
        if (paneId)
            if (pane[paneId])
                pane.t.write(data)
            else {
                this.addPane(paneId)
            }
                
        else if (this.lastPane)
            this.lastPane.t.write(data)
        else
            console.log("No currentT, logging here: " + data)
    },

    refreshWindows(b) {
        console.log(">> refresh windows")
        for (let l of b) {
            console.log(l)
        }
        console.log("<< refresh windows")
    },

    onFirstContact(buffer) {
        this.onOutput = (buffer) => this.refreshWindows
        setTimeout(() => {
            console.log("sending list windows")
            this.d.send("list-windows\n")
        }, 0)
    },
    openDC(pc) {
        this.buffer = []
        this.pc = pc
        this.d = pc.createDataChannel('/usr/local/bin/tmux -CC new')
        this.d.onclose = () =>{
            this.state = 0
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
            if (this.state == 2) {
                this.state = 3
                this.onOutput = this.onFirstContact
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
    },
    parse(row) {
        console.log("parsing: "+row)
        if (row.substring(1, 7) == "P1000p")
            row = row.substring(7)
        const w = row.split(" ")
        if (w[0][0] == "%") {
            switch (w[0]) {
            case "%begin":
                if (this.state == 4)
                    console.log("ERROR: got %begin when expecting data or %end")
                this.buffer = []
                this.state = 4
                break;
            case "%end":
                if (this.state == 3)
                    console.log("ERROR: got %end when expecting commands")
                if (this.onOutput)
                    this.onOutput(this.buffer)
                this.state = 3
                break;
            case "%output":
                if (this.state != 3)
                    console.log("ERROR: got %output  when state is "+this.state)
                var paneId = w[1],
                    payload = w.slice(2).join(" ")
                this.write(payload, this.panes[paneId])
                break;
            case "%window-add":
                this.windows[w[1]] = new Window(w[2])
                break;
            }
        }
    },
    addPane(props) {
        if (props === undefined) props = {}
        if (!props.id) props.id = this.newID()
        var p = new Pane(props)
        this.panes[props.id] = p
        this.lastPane = p
        return p
    },
    newID() { return "l"+ this.lastID++}
}

function setPx(i) { return i.toString()+"px" }

class Window {
    constructor () {
    }
}

class Cell {
    constructor(props) {
        this.id = props.id
        this.sx = props.sx || 80
        this.sy = props.sy || 24
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
        this.parent = props.parent || null
        this.e = props.e || null
        this.t = props.t || null
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
    constructor(id, basedOn) {
        super(basedOn)
        this.id = id
        this.sons = new Denque()
        this.sx = basedOn.sx
        this.sy = basedOn.sy
        this.xoff = basedOn.xoff
        this.yoff = basedOn.yoff
    }
    findChild(child) {
        for (let i = 0; i < this.sons.length; i++)
            if (this.sons.peekAt(i) == child) {
                return i
            }
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
        this.t = new Terminal({
            convertEol: true,
            theme: THEME,
        })
        this.fitAddon = new FitAddon()
        this.t.loadAddon(this.fitAddon)
        this.state = 0
        this.xoff = 0
        this.yoff = 0
        this.d = null
        this.zommed = false
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
            terminal7 = document.createElement('div')
            terminal7.id = "terminal7"
            document.body.appendChild(terminal7)
        }

        terminal7.appendChild(this.e)
    }
    removeElment() {
        this.e.parentNode.removeChild(this.e);
        if (this.parent)
            this.parent.removeChild(this)
    }
    openTerminal() {
        // creates the elment and opens the terminal
        this.t.open(this.e)
        this.state = 1
    }

    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        this.fit()
        this.sendSize()
    }
    // TODO: delete this
    proposeDimensions() {
        if (!this.t) {
          return undefined
        }

        if (!this.t.element || !this.t.element.parentElement) {
          return undefined
        }

        const core = this.t._core

        const parentElementStyle = window.getComputedStyle(this.e.parentElement)
        const parentElementHeight = parseInt(parentElementStyle.getPropertyValue('height'))
        const parentElementWidth = Math.max(0, parseInt(parentElementStyle.getPropertyValue('width')))
        const elementStyle = window.getComputedStyle(this.t.element)
        const elementPadding = {
          top: parseInt(elementStyle.getPropertyValue('padding-top')),
          bottom: parseInt(elementStyle.getPropertyValue('padding-bottom')),
          right: parseInt(elementStyle.getPropertyValue('padding-right')),
          left: parseInt(elementStyle.getPropertyValue('padding-left'))
        }
        const elementPaddingVer = elementPadding.top + elementPadding.bottom
        const elementPaddingHor = elementPadding.right + elementPadding.left
        const availableHeight = parentElementHeight - elementPaddingVer
        const availableWidth = parentElementWidth - elementPaddingHor - core.viewport.scrollBarWidth
        const geometry = {
          cols: Math.max(MINIMUM_COLS, Math.floor(availableWidth / core._renderService.dimensions.actualCellWidth)),
          rows: Math.max(MINIMUM_ROWS, Math.floor(availableHeight / core._renderService.dimensions.actualCellHeight))
        }
        return geometry
    }
    fit() {
        this.fitAddon.fit()
        this.sx = this.t.cols
        this.sy = this.t.rows
        /*
        this.xoff = 0
        this.yoff = 0
        */
    }
    sendSize() {
        if (this.d)
            try {
                this.d.send(SET_SIZE_PREFIX+JSON.stringify({
                    Cols: this.sx,
                    Rows: this.sy,
                    X: 0,
                    Y: 0
                }))
            } catch(err) {
                setTimeout(this.sendSize, 1000)
            }

    }
    onresize() {
        this.fit()
        if (this.d)
            this.sendSize()
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        if (this.parent == null || this.parent.type == type) {
            let l = new Layout(this)
            l.parent = this.prent
            this.parent = l
            if (type == "rightleft") 
                l.type = "topbottom"
            else 
                l.type = "rightleft"
            var newPane = window.ttmux.addPane()
            newPane.parent = l
            newPane.createElement()
            newPane.openTerminal()
            newPane.openDC()
            newPane.t.onKey( (keys, ev) => newPane.d.send(keys.key))
            l.sons.push(this)
            l.sons.push(newPane)
            l.relocate()
            newPane.t.focus()
        }
        else {
            let l = this.parent
            let newPane = window.ttmux.addPane()
            newPane.parent = l
            newPane.createElement()
            newPane.openTerminal()
            newPane.openDC()
            newPane.t.onKey( (keys, ev) => newPane.d.send(keys.key))
            l.sons.splice(l.sons.findChild(this)+1, 0, newPane)
            l.relocate()
            newPane.t.focus()
        }
    }
    output(buf) {
        this.t.write(buf)
    }
}
export { TouchTmux , Cell, Pane, Layout }
