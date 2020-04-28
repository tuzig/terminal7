import { Deque } from '@blakeembrey/deque'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit';
import * as Hammer from 'hammerjs';

const THEME = {foreground: "#00FAFA", background: "#271d30"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1
const SET_SIZE_PREFIX = "A($%JFDS*(;dfjmlsdk9-0"

class Panes {
    constructor() {
        this.lastID = 0
    }
    newID() { return "l"+ this.lastID++}
    add(props) {
        if (props === undefined) props = {}
        if (!props.id) props.id = this.newID()
        this[props.id] = new Pane(props)
        return this[props.id]
    }
}
function setPx(i) { return i.toString()+"px" }

class Cell {
    constructor(props) {
        this.p = props
        this.parent = null
    }
    relocate(sx, sy, xoff, yoff) {
        if (sx !== undefined) this.sx = sx
        if (sy !== undefined) this.sy = sy
        if (yoff !== undefined) this.yoff = yoff
        if (xoff !== undefined) this.xoff = xoff
        if (this.e && this.t) {
            const core = this.t._core
            this.e.style.width = setPx(this.sx * core._renderService.dimensions.actualCellWidth)
            this.e.style.height = setPx(this.sy * core._renderService.dimensions.actualCellHeight)
            this.e.style.top = setPx(this.yoff * core._renderService.dimensions.actualCellHeight)
            this.e.style.left = setPx(this.xoff * core._renderService.dimensions.actualCellWidth)
        }
    }
}


class LayoutCell extends Cell {
    constructor(pane) {
        super(pane.props)
        this.sons = new Deque()
        this.sx = pane.sx
        this.sy = pane.sy
        this.xoff = pane.xoff
        this.yoff = pane.yoff
    }
    removeChild(child) {
        let i = this.sons.indexOf(child)
        this.sons.delete(i)
        if (this.sons.size == 0) {
            if (this.parent) {
                this.parent.sons.delete(this.parent.sons.indexOf(this))
                this.parent.relocate()
                return
            } else {
                console.log("Removing last layout cell, what now?")
            }
        } else {
            this.sons.peek((i>0)?i-1:0).t.focus()
        }
        this.relocate()
    }
    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        if (this.type == "rightleft") {
            let w = this.sx / this.sons.size
            let off = this.xoff
            for (let s of this.sons.entries()) {
                s.relocate(w,  this.sy, off,  this.yoff)
                off += w
            }       
        }
        else {
            let h = Math.floor((this.sy - 1) / this.sons.size)
            let off =  this.yoff
            for (let s of this.sons.entries()) {
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
    }
    createElement(elemClass) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.classList.add("border", "pane")
        if (typeof elemClass !== "undefined")
            this.e.classList.add(elemClass)

        this.h = new Hammer(this.e, {});
        this.h.get('pan').set({ direction: Hammer.DIRECTION_ALL });
        this.h.get('swipe').set({ direction: Hammer.DIRECTION_ALL });

        const that = this
        this.h.on('tap', (ev) => {
            console.log(ev);
        });
        this.h.on('pan', function(ev) {
            console.log(ev);
        });
        this.h.on('swipe', (ev) => {
            let topb = Math.abs(ev.deltaY) > Math.abs(ev.deltaX)
            console.log(ev)
            that.split((topb)?"topbottom":"rightleft")
        });
        document.getElementById('terminal7').appendChild(this.e)
    }
    openTerminal() {
        // creates the elment and opens the terminal
        this.t.open(this.e)
        this.state = 1
    }
    openDC() {
        this.d = window.pc.createDataChannel('/usr/bin/zsh')
        this.d.onclose = () => {
            this.state = 0
            this.t.write('Data Channel is closed.\n')
            this.e.parentNode.removeChild(this.e);
            if (this.parent)
                this.parent.removeChild(this)
            // TODO: if it's the last one, we need to call Connect()
        }
        this.d.onopen = () => {
            this.state = 2
            this.sendSize()
            setTimeout(() => {
                if (this.state == 2) {
                    this.t.write("Sorry, didn't get a prompt from the server.")
                    this.t.write("Please refresh.")
                }},3000)
        }
        this.d.onmessage = m => {
            if (this.state == 2) {
                this.state = 3
                //TODO: remove demo hack
                document.getElementById("tabbar").innerHTML = "zsh"
            }
            if (this.state == 3) 
                this.t.write(m.data)
        }
        return this.d
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
        console.log("spliting " + type)
        if (this.parent == null || this.parent.type == type) {
            let l = new LayoutCell(this)
            l.parent = this.prent
            this.parent = l
            if (type == "rightleft") 
                l.type = "topbottom"
            else 
                l.type = "rightleft"
            var newPane = window.panes.add()
            newPane.parent = l
            newPane.createElement()
            newPane.openTerminal()
            newPane.openDC()
            newPane.t.onKey( (keys, ev) => newPane.d.send(keys.key))
            l.sons.extend([this, newPane])
            l.relocate()
            newPane.t.focus()
        }
        else {
            console.log("TODO: just squeeze another pane in")
            let l = this.parent
            let newPane = window.panes.add()
            newPane.parent = l
            newPane.createElement()
            newPane.openTerminal()
            newPane.openDC()
            newPane.t.onKey( (keys, ev) => newPane.d.send(keys.key))
            l.sons.insert(l.sons.indexOf(this)+1, newPane)
            l.relocate()
            newPane.t.focus()
        }
    }
    output(buf) {
        this.t.write(buf)
    }
}
export { Panes, Pane, LayoutCell }
