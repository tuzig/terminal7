import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { fileRegex, urlRegex } from './utils.js'
import { Plugins } from '@capacitor/core'
import * as aE from 'ansi-escapes'

const { Browser, Clipboard } = Plugins

const  ABIT                = 10,
        REGEX_SEARCH        = false,
        SEARCH_OPTS = {
            regex: REGEX_SEARCH,
            wholeWord: false,
            incremental: false,
            caseSensitive: true}

export class Cell {
    constructor(props) {
        console.log("in cell constructore")
        this.gate = props.gate || null
        this.w = props.w
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
     * get an optional className to be added to the element
     */
    createElement(className) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.p = this
        this.e.classList = "cell"
        if (typeof className == "string")
            this.e.classList.add(className)
        this.w.e.appendChild(this.e)
        return this.e
    }

    /*
     * Set the focus on the cell
     */
    focus() {
        this.active = true
        if (this.w.activeP !== null) {
            this.w.activeP.e.classList.remove("focused")
            this.w.activeP.active = false
        }
        this.w.activeP = this
        this.e.classList.add("focused")
        this.gate.sendState()
    }
    /*
     * Used to grow/shrink the terminal based on containing element dimensions
     * Should be overide
     */
    fit() { }
    scale() {}

    /*
     * Catches gestures on an elment using hammerjs.
     * If an element is not passed in, `this.e` is used
     */
    catchFingers(elem) {
        let e = (typeof elem == 'undefined')?this.e:elem,
            h = new Hammer.Manager(e, {}),
        // h.options.domEvents=true; // enable dom events
            singleTap = new Hammer.Tap({event: "tap"}),
            doubleTap = new Hammer.Tap({event: "doubletap", taps: 2}),
            pinch = new Hammer.Pinch({event: "pinch"}),
            lastEventT = 0;

        h.add([singleTap,
            doubleTap,
            pinch,
            new Hammer.Tap({event: "twofingerstap", pointers: 2})])

        h.on('tap', e => this.focus())
        h.on('twofingerstap', e => this.toggleZoom())
        h.on('doubletap', e => this.toggleZoom())

        h.on('pinch', e => {
            console.log(e.additionalEvent, e.distance, e.angle, e.deltaTime, e.isFirst, e.isFinal)
            if (e.deltaTime < this.lastEventT)
                this.lastEventT = 0
            if (e.deltaTime - this.lastEventT < 200)
                return
            this.lastEventT = e.deltaTime
            if (e.additionalEvent == "pinchout") 
                this.scale(1)
            else
                this.scale(-1)
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
    /*
     * Cell.close removes a cell's elment and removes itself from the window
     */
    close() {
        this.e.remove()
        this.layout.onClose(this)
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

export class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(dir, basedOn) {
        console.log("in layout constructore")
        super({
            sx: basedOn.sx || 1.0, 
            sy: basedOn.sy || 1.0,
            xoff: basedOn.xoff || 0.0,
            yoff: basedOn.yoff || 0.0,
            w: basedOn.w || null,
            className: "layout",
            gate: basedOn.gate ||null})
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
                this.w.close()
            }
            this.e.remove()
        } else {
            let i = this.cells.indexOf(c), 
                p = (i > 0)?this.cells[i-1]:this.cells[1]
            // if no peer it means we're removing the last pane in the window
            if (p === undefined) {
                this.w.close(true)
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
        this.gate.sendState()
    }
    /*
     * Replace an old cell with a new cell, used when a pane
     * is replaced with a layout
     */
    replace(o, n) {
        this.cells.splice(this.cells.indexOf(o), 1, n)
    }
    /*
     * Adds a new pane. If the gate is connected the pane will open a
     * new data channel.
     */
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        let p = props || {}
        p.w = this.w
        p.gate = this.gate
        p.layout = this
        p.id = terminal7.cells.length
        let pane = new Pane(p)
        terminal7.cells.push(pane)
        if (p.parent instanceof Cell)
            this.cells.splice(this.cells.indexOf(p.parent)+1, 0, pane)
        else
            this.cells.push(pane)
        
        // opening the terminal and the datachannel are heavy so we wait
        // for 10 msecs to let the new layout refresh
        pane.openTerminal()
        pane.focus()
        // if we're connected, open the data channel
        if (this.gate.pc != null)
            terminal7.run(_ => {
                try {
                    pane.openDC()
                } catch (e) {
                    console.log("failed to open DC", e)
                    return
                }
                this.gate.sendState()
            }, ABIT)
        return pane
    }
    toText() {
        // r is the text the function returns
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
                r += `,${c.id || c.webexecID}`
        })
        r += (this.dir=="rightleft")?"]":"}"
        return r
    }

    // Layout.dump dumps the layout to an object
    dump() {
        // r is the text the function returns
        let d = {
            dir: this.dir,
            sx: this.sx,
            sy: this.sy,
            xoff: this.xoff,
            yoff: this.yoff,
            cells: [],
        }
        // get the dimensions of all the cell, recurse if a layout is found
        this.cells.forEach(c => {
            var cell
            if (c instanceof Layout)
                cell = c.dump()
            else {
                // it's a pane
                cell = {
                    sx: c.sx,
                    sy: c.sy,
                    xoff: c.xoff,
                    yoff: c.yoff,
                    fontSize: c.fontSize,
                    webexec_id: c.webexecID,
                }
                if (c.webexecID == this.w.activeP.webexecID)
                    cell.active = true
            }
            d.cells.push(cell)
        })
        return d
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
    prevCell(c) {
        var i = this.cells.indexOf(c) - 1
        return (i >= 0)?this.cells[i]:null
    }
    nextCell(c) {
        var i = this.cells.indexOf(c) + 1
        return (i < this.cells.length)?this.cells[i]:null
    }
    /*
     * Layout.moveBorder moves a pane's border
     */
    moveBorder(pane, border, dest) {
        var s, off
        let i = this.cells.indexOf(pane),
            l = pane.layout,
            p0 = null,
            p1 = null
        // first, check if it's a horizontal or vertical border we're moving
        if (border == "top" || border == "bottom") {
            s = "sy"
            off = "yoff"
        } else {
            s = "sx"
            off = "xoff"
        }

        if (this.dir.indexOf(border) == -1) {
            if (border == "top" || border == "left") {
                p0 = this.prevCell(pane)
                p1 = pane
                // if it's the first cell in the layout we need to get the layout's
                // layout to move the borderg
            } else {
                p0 = pane
                p1 = this.nextCell(pane)
            }
        }
        if (p0 == null || p1 == null) {
            this.layout && this.layout.moveBorder(this, border, dest)
            return
        }

        window.toBeFit.add(p0)
        window.toBeFit.add(p1)
        let by = p1[off] - dest
        p0[s] -= by
        p1[s] += by
        p1[off] = dest
        this.gate.sendState()
    }
}

export class Pane extends Cell {
    constructor(props) {
        props.className = "pane"
        super(props)
        this.catchFingers()
        this.state = "init"
        this.d = null
        this.zoomed = false
        this.active = false
        this.webexecID = props.webexec_id || null
        this.fontSize = props.fontSize || 12
        this.scrolling = false
        this.scrollLingers4 = props.scrollLingers4 || 2000
        this.theme = props.theme || terminal7.conf.theme
        this.copyMode = false
        this.cmRep = 0
        this.cmSY = false
    }

    /*
     * Pane.write writes data to the terminal
     */
    write(data) {
        this.t.write(data)
    }
                
    /*
     * Pane.openTerminal opens an xtermjs terminal on our element
     */
    openTerminal() {
        var con = document.createElement("div")

        con.p = this
        this.t = new Terminal({
            convertEol: true,
            fontSize: this.fontSize,
            theme: this.theme,
            rows:24,
            cols:80
        })
        this.fitAddon = new FitAddon()
        this.searchAddon = new SearchAddon();

        // there's a container div we need to get xtermjs to fit properly
        this.e.appendChild(con)
        con.style.height = "100%"
        con.style.width = "100%"
        this.t.open(con)
        // the canvas gets the touch event and the nadler needs to get back here
        this.t.loadAddon(this.fitAddon)
        this.t.loadAddon(this.searchAddon)
        this.fit()
        con.querySelector(".xterm-cursor-layer").p = this
        this.t.textarea.tabIndex = -1
        this.t.attachCustomKeyEventHandler(ev => {
            // ctrl c is a special case 
            if (ev.ctrlKey && (ev.key == "c")) {
                this.d.send(String.fromCharCode(3))
                return false
            }
            if (ev.metaKey && (ev.key != "Shift") && (ev.key != "Meta"))
                return this.handleMetaKey(ev)
            else
                return true
        })
        this.t.onData(d =>  {
            if (!this.copyMode && (this.d != null)
                && (this.d.readyState == "open"))
                this.d.send(d)
        })
        this.t.onKey((ev) =>  {
            if (this.copyMode) {
                this.handleCopyModeKey(ev.domEvent)
            }
        })
        // keep tap of "scrolling mode"
        var tf
        this.t.onScroll(ev => {
            this.scrolling = true
            if (tf !== undefined)
                clearTimeout(tf)
            tf = terminal7.run(e => this.scrolling = false, this.scrollLingers4)
        })
        this.state = "opened"
        return this.t
    }
    updateBufferPosition() {
        var v
        const b = this.t.buffer.active,
              pos = this.t.getSelectionPosition()
        if (pos !== undefined)
            v = `[${pos.startRow}/${b.length}]`
        else
            v = `[${b.baseY + b.cursorY + 1}/${b.length}]`
        document.getElementById("copy-mode").innerHTML = v
    }
    setTheme(theme) {
        this.t.setOption("theme", theme)
    }
    /*
     * Pane.scale is used to change the pane's font size
     */
    scale(by) {
        this.fontSize += by
        if (this.fontSize < 6) this.fontSize = 6
        else if (this.fontSize > 30) this.fontSize = 30
        this.t.setOption('fontSize', this.fontSize)
        this.fit()
        this.gate.sendState()
    }

    // fit a pane
    fit() {
        try {
            this.fitAddon.fit()
        } catch {
            if (this.retries < terminal7.conf.retries) {
                this.retries++
                terminal7.run(this.fit, 20*this.retries)
            }
            else
                console.log(`fit failed ${this.retries} times. giving up`)
            return
        }
        this.gate.sendSize(this)
    }
    /*
     * Pane.focus focuses the UI on this pane
     */
    focus() {
        super.focus()
        if (this.t !== undefined)
            this.t.focus()
        else 
            console.log("can't focus, this.t is undefined")
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
        var tSize = this.t.rows+'x'+this.t.cols,
            label = ""
        this.buffer = []

        label = this.webexecID?`>${this.webexecID}`:
           `${tSize},${terminal7.conf.exec.shell},-is,--login`

        console.log(`opening dc with label: "${label}`)
        this.d = this.gate.pc.createDataChannel(label)
        this.d.onclose = e => {
            console.log("data channel close")
            this.state = "disconnected"
            if (this.gate.boarding)
                this.close()
        }
        this.d.onopen = () => {
            this.state = "opened"
            // TODO: set our size by sending "refresh-client -C <width>x<height>"
            terminal7.run(() => {
                if (this.state == "opened") {
                    this.gate.notify("Data channel is opened, but no first message")
                    this.gate.stopBoarding()
                }}, terminal7.conf.exec.timeout)
        }
        this.d.onmessage = m => this.onMessage(m)

        return this.d
    }
    // called when a message is received from the server
    onMessage (m) {
        terminal7.onMessage(m)
        var enc = new TextDecoder("utf-8")
        if (this.state == "opened") {
            var msg = enc.decode(m.data)
            console.log(`Got first DC msg: ${msg}`)
            this.state = "connected"
            this.webexecID = parseInt(msg)
            this.gate.onPaneConnected(this)
        }
        /* TODO: do we need a buffer?
        else if (this.state == "disconnected") {
            this.buffer.push(new Uint8Array(m.data))
        }
        */
        else if (this.state == "connected") {
            this.write(new Uint8Array(m.data))
        }
        else
            this.gate.notify(`${this.state} & dropping a message: ${m.data}`)
    }
    toggleZoom() {
        super.toggleZoom()
        this.fit()
    }
    updateCopyMode() {
        let b = this.t.buffer.active
        if (this.cmSY) {
            console.log(`select: cursor: ${b.cursorX}, ${b.cursorY}
                                 start: ${this.cmSX}, ${this.cmSY}`)
            if ((this.cmSY < b.cursorY) ||
                ((this.cmSY == b.cursorY) && this.cmSX < b.cursorX))
                this.t.select(this.cmSX, this.cmSY, 
                               b.cursorX  - this.cmSX
                              + this.t.cols * (b.cursorY - this.cmSY))
            else
                this.t.select(b.cursorX, b.cursorY, 
                              this.cmSX - b.cursorX
                              + this.t.cols * (this.cmSY - b.cursorY))
        }
        this.updateBufferPosition()
    }
    /*
     * Pane.handleCopyModeKey(ev) is called on a key press event when the
     * pane is in copy mode. 
     * Copy mode uses vim movment commands to let the user for text, mark it 
     * and copy it.
     */
    handleCopyModeKey(ev) {
        let b = this.t.buffer.active,
            updateSelection = false,
            postWrite = () => { this.updateCopyMode() }
        // special handling for numbers
        if (ev.keyCode >=48 && ev.keyCode <= 57) {
            this.cmRep = this.cmRep * 10 + ev.keyCode - 48
            return
        }
        let r = (this.cmRep==0)?1:this.cmRep
        switch (ev.key) {
        case "Enter":
            if (this.t.hasSelection()) {
                Clipboard.write(this.t.getSelection())
                this.cmSY = false
                this.t.clearSelection()
                break
            }
        case "n":
            this.findNext()
            break
        case "f":
            if (ev.ctrlKey)
                this.t.scrollToLine(b.baseY+this.t.rows-2)
            else if (ev.metaKey)
                this.toggleSearch()
            else
                this.notify("TODO: go back a a word")
            break
        case "b":
            if (ev.ctrlKey)
                this.t.scrollToLine(b.baseY-this.t.rows+2)
            else
                this.notify("TODO: go back a a word")
            break
        case "p":
            this.findPrevious()
            break
        case "o":
            if (REGEX_SEARCH) {
                var u = this.t.getSelection()
                Browser.open({url: u})
            }
            break
        case "Escape":
        case "q":
            this.exitCopyMode()
            break
        case "ArrowUp":
        case "k":
            if (r > b.cursorY) {
                // we need to scroll
                this.t.scrollToLine(b.viewportY-r+b.cursorY)
                /*
                for (var i=0; i < r - b.cursorY; i++)
                    this.t.write(aE.scrollDown)
                */
                this.t.write(aE.cursorTo(b.cursorX, 0), postWrite)
            }
            else
                this.t.write(aE.cursorUp(r), postWrite)
            this.updateBufferPosition()
            break
                /*
                console.log(`vy = ${b.viewportY} by = ${b.baseY}`)
            // this.t.write(aE.cursorGetPosition)
            if ((b.cursorY == 0) && (b.baseY > 0)) {
                this.t.scrollToLine(b.viewportY-1)
                this.t.refresh(0, this.t.rows-1)
                setTimeout( _ => this.t.write(aE.cursorTo(b.cursorX, 0)), 500)
            }
            else
            */
        case "ArrowDown":
        case "j":
            this.t.write(aE.cursorDown(r), postWrite)
            break
        case "ArrowRight":
        case "l":
            this.t.write(aE.cursorForward(r), postWrite)
            break
        case "ArrowLeft":
        case "h":
            this.t.write(aE.cursorBackward(r), postWrite)
            break
        case "?":
        case "/":
            this.showSearch()
            break
        default:
            if (ev.keyCode == 32) {
                this.cmSY = b.cursorY
                this.cmSX = b.cursorX
                console.log(`set cmSX & Y to ${this.cmSX}, ${this.cmSY}`)
            }
            else
                this.gate.notify("TODO: Add copy mode help")
        }
        this.cmRep = 0
    }
    /*
     * toggleSearch displays and handles pane search
     * First, tab names are replaced with an input field for the search string
     * as the user keys in the chars the display is scrolled to their first
     * occurences on the terminal buffer and the user can use line-mode vi
     * keys to move around, mark text and yank it
     */
    toggleSearch() {
        this.copyMode = !this.copyMode
        if (this.copyMode) {
            this.enterCopyMode() 
            this.showSearch()
            // document.getElementById("copy-mode").classList.remove("hidden")
        }
        else
            this.exitCopyMode() 
            // this.gate.e.querySelector(".search-box").classList.add("hidden")
    }
    showSearch() {
        // show the search field
        const se = this.gate.e.querySelector(".search-box")
        se.classList.remove("hidden")
        this.updateBufferPosition()
        document.getElementById("search-button").classList.add("on")
        // TODO: restore regex search
        let u = se.querySelector("a[href='#find-url']"),
            f = se.querySelector("a[href='#find-file']"),
            i = se.querySelector("input[name='search-term']")
        if (REGEX_SEARCH) {
            i.setAttribute("placeholder", "regex here")
            u.classList.remove("hidden")
            f.classList.remove("hidden")
            u.onclick = ev => {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                i.value = this.searchTerm = urlRegex
                this.handleCopyModeKey({keyCode: 13})
            }
            // TODO: findPrevious does not work well
            f.onclick = _ => this.searchAddon.findPrevious(fileRegex, SEARCH_OPTS)
        } else 
            i.setAttribute("placeholder", "search string here")
        if (this.searchTerm)
            i.value = this.searchTerm

        i.onkeydown = ev => {
            if (ev.keyCode == 13) {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                this.searchTerm = ev.target.value
                this.handleCopyModeKey(ev)
            }
        }
        i.focus()
    }
    enterCopyMode() {
        this.cmSY = false
        this.cmX = this.t.buffer.active.cursorX
        this.cmY = this.t.buffer.active.cursorY
        this.copyMode = true
        this.updateBufferPosition()
        document.getElementById("copy-mode")
                .classList.remove("hidden")
    }
    exitCopyMode() {
        const se = this.gate.e.querySelector(".search-box"),
              cm = document.getElementById("copy-mode")
        se.classList.add("hidden")
        cm.classList.add("hidden")
        document.getElementById("search-button").classList.remove("on")
        this.copyMode = false
        this.t.clearSelection()
        this.t.scrollToBottom()
        this.t.write(aE.cursorTo(this.cmX, this.cmY))
        this.focus()
    }
    handleMetaKey(ev) {
        var f = null
        console.log(`Handling meta key ${ev.key}`)
        switch (ev.key) {
        case "c":
            if (this.t.hasSelection()) 
                Clipboard.write({string: this.t.getSelection()})
            break
        case "z":
            f = () => this.toggleZoom()
            break
        case ",":
            f = () => this.w.rename()
            break
        case "d":
            f = () => this.close()
            break
        case "0":
            f = () => this.scale(12 - this.fontSize)
            break
        case "=":
                f = () => this.scale(1)
            break
        case "-":
            f = () => this.scale(-1)
            break
        case "5":
            f = () => this.split("topbottom")
            break
        case "'":
            f = () => this.split("rightleft")
            break
        case "[":
            f = () => (terminal7.conf.features.copy_mode)
                      ?this.enterCopyMode()
                      :null
            break
        case "f":
            f = () => this.toggleSearch()
        }
        if (f != null) {
            f()
            ev.preventDefault()
            ev.stopPropagation()
            return false
        }
        return true
    }
    findPrevious(searchTerm) {
        if (searchTerm != undefined)
            this.searchTerm = searchTerm
        if (this.searchTerm != undefined
            && !this.searchAddon.findNext(this.searchTerm, SEARCH_OPTS))
            this.gate.notify(`Couldn't find "${this.searchTerm}"`)
        this.updateCopyMode()
    }
    findNext(searchTerm) {
        if (searchTerm != undefined)
            this.searchTerm = searchTerm
        if (this.searchTerm != undefined
            && !this.searchAddon.findPrevious(this.searchTerm, SEARCH_OPTS))
            // TODO: it's too intrusive. use bell?
            this.gate.notify(`Couldn't find "${this.searchTerm}"`)
        this.updateCopyMode()
    }
}
