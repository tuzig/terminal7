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
            this.e.style.display = 'none'
            this.e.style.display = 'block'
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
    relocate(sx, sy, xoff, yoff) {
        super.relocate(sx, sy, xoff, yoff)
        if (this.type == "rightleft") {
            let w = this.sx / this.sons.size
            let off=xoff
            for (let s of this.sons.entries()) {
                s.relocate(w, sy, off, yoff)
                off += w
            }       
        }
        else {
            let h = Math.floor(this.sy / this.sons.size)
            let off = yoff
            for (let s of this.sons.entries()) {
                s.relocate(sx, h, xoff, off)
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
            console.log(ev)
            that.split("rightleft")
        });
        document.getElementById('terminal7').appendChild(this.e)
    }
    openTerminal() {
        // creates the elment and opens the terminal
        this.t.open(this.e)
        this.state = 1
    }
    openDC(pc, onClose) {
        const that = this
        this.d = pc.createDataChannel('/usr/bin/zsh')
        this.d.onclose = () => {
            that.state = 0
            that.t.write('Data Channel is closed.\n')
            onClose()
        }
        this.d.onopen = () => {
            that.t.write('Connected to remote shell\n')
            that.state = 2
            that.sendSize()
            setTimeout(() => {
                if (that.state == 2) {
                    that.t.write("Sorry, didn't get a prompt from the server.")
                    that.t.write("Please refresh.")
                }},3000)
        }
        this.d.onmessage = m => {
            if (that.state == 2) {
                that.state = 3
                //TODO: remove demo hack
                document.getElementById("tabbar").innerHTML = "zsh"
            }
            if (that.state == 3) 
                that.t.write(m.data)
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
        this.xoff = 0
        this.yoff = 0
    }
    sendSize() {
        if (this.d)
            this.d.send(SET_SIZE_PREFIX+JSON.stringify({
                Cols: this.sx,
                Rows: this.sy,
                X: 0,
                Y: 0
            }))
    }
    onresize() {
        this.fit()
        if (this.d)
            this.sendSize()
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        console.log("spliting " + type)
        if (this.parent == null || this.parent.type != type) {
            // Add layout_cell
            // create a layout based on this.p
            let l = new LayoutCell(this)
            l.type = "topdown"
            l.parent = this.prent
            this.parent = l
            // calc the vars of the new pane we're going to create
            let lsx=this.sx, lsy=this.sy, lxoff=this.xoff, lyoff=this.yoff
            /*
            var sx, sy, xoff, yoff
            if (type == "rightleft") {
                let netY = this.sy - 1 // save a row for the new border
                let halfSize = Math.floor(netY / 2) // rounded down
                this.sy = halfSize + netY%2
                sx = this.sx
                sy = halfSize
                yoff = this.yoff+this.sy+1
                xoff = this.xoff 
            }
            else if (type == "topdown") {
                let netX = this.sx - 1
                let halfSize = Math.floor(netX / 2)
                this.sx = halfSize  + netX%2
                sx = halfSize
                sy = this.sy
                yoff = this.sy
                xoff = this.xoff + this.sx + 1 
            }
            // finally creating the pane
                // */
            var newPane = window.panes.add()
            newPane.parent = l
            // newPane.relocate(sx, sy, xoff, yoff)
            newPane.createElement()
            newPane.openTerminal()

            l.sons.extend([this, newPane])
            l.relocate(lsx, lsy, lxoff, lyoff)
        }
        else {
            console.log("TODO: just squeeze another pane in")
        }
    }
    output(buf) {
        this.t.write(buf)
    }
}
export { Panes, Pane, LayoutCell }
