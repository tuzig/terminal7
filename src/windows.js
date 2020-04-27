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
        if (!props.id)
            props.id = panes.newID()
        this[props.id] = new Pane(props)
        return this[props.id]
    }
}
// let windows = new Deque()
// windows.add = props => this.push(Pane(props))
class Cell {
    constructor(props) {
        this.p = props
        this.parent = null
    }
}


class LayoutCell extends Cell {
    constructor(props) {
        super(props)
        this.sons = new Deque()
    }
    redraw() {
        debugger
        if (this.p.type == "rightleft") {
            let l = this.sons.size
            let w = this.p.sx / l
            let xoff = 0
            for (s in this.sons.entries()) {
                s.p.sx = w
                s.p.xoff = xoff
                xoff += w
                s.redraw()
            }       
        }
    }


}
class Pane extends Cell {
    constructor(props) {
        super(props)
        const that = this
        this.t = new Terminal({
            convertEol: true,
            theme: THEME,
        })
        this.fitAddon = new FitAddon()
        this.t.loadAddon(this.fitAddon)
        this.state = 0
        this.h = new Hammer(pane0, {});
        this.h.on('swipe', (ev) => {
            console.log(ev)
            that.split("rightleft")
        });
    }
    createElement(elemClass) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.classList.add("border", "pane")
        if (typeof elemClass !== "undefined")
            this.e.classList.add(elemClass)

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

    redraw() {
        this.e.width = this.sx
        this.e.height = this.sy
        this.e.top = this.yoff
        this.e.left = this.xoff
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
    }
    sendSize() {
        this.d.send(SET_SIZE_PREFIX+JSON.stringify({
            Rows: this.t.rows,
            Cols: this.t.cols,
            X: 0,
            Y: 0
        }))
    }
    onresize() {
        this.fit()
        this.sendSize()
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        if (this.parent == null || this.parent.type != type) {
            // Add layout_cell
            // create a layout based on this.p
            var p_props
            let l_props = JSON.parse(JSON.stringify(this.p))
            l_props.type = type
            let l = new LayoutCell(l_props)
            l.parent = this.prent
            this.parent = l
            if (type == "topbottom") {
                let netRows = this.sy - 1 // save a row for the border
                let halfSize = netRows / 2 // rounded down
                this.p.sy = halfSize + netRows%2
                // TODO: resize t.term
                p_props = {sx: this.sx, sy: halfSize,
                           yoff: this.p.sy+1, xoff: this.p.xoff} 
            }
            else if (type == "rightleft") {
                let netCols = this.t.cols - 1
                let halfSize = netCols / 2
                this.p.sx = halfSize  + netCols%2
                p_props = {sx: halfSize, sy: this.sy,
                           yoff: this.sy, xoff: this.p.sx+1} 
                
            }
            var newPane = windows.panes.add(p_props)
            newPane.parent = l

            l.sons.extend([this, newPane])
            l.redraw()
                
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
