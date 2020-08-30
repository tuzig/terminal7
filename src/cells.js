import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { fileRegex, urlRegex } from './utils.js'

const   DEFAULT_XTERM_THEME = {
            foreground: "#00FAFA", 
            background: "#000",
            selection: "#D9F505"},
        RETRIES             = 3,
        ABIT                = 10,
        TIMEOUT             = 3000,
        SEARCH_OPTS = {
            regex: true,
            wholeWord: false,
            incremental: false,
            caseSensitive: true}

export class Cell {
    constructor(props) {
        console.log("in cell constructore")
        this.t7 = props.t7 || null
        this.host = props.host || null
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
        }
        this.w.activeP = this
        this.e.classList.add("focused")
        
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

export class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(dir, basedOn) {
        console.log("in layout constructore")
        super({sx: basedOn.sx, sy: basedOn.sy,
               xoff: basedOn.xoff, yoff: basedOn.yoff,
               w: basedOn.w, t7: basedOn.t7,
               className: "layout",
               host: basedOn.host})
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
     * Adds a new pane. If the host is connected the pane will open a
     * new data channel.
     */
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        let p = props || {}
        p.w = this.w
        p.host = this.host
        p.layout = this
        p.id = this.host.cells.length
        let pane = new Pane(p)
        this.host.cells.push(pane)
        if (p.parent instanceof Cell)
            this.cells.splice(this.cells.indexOf(p.parent)+1, 0, pane)
        else
            this.cells.push(pane)
        
        // opening the terminal and the datachannel are heavy so we wait
        // for 10 msecs to let the new layout refresh
        pane.openTerminal()
        pane.focus()
        // if we're connected, open the data channel
        if (this.host.pc != null)
            setTimeout(() => {
                try {
                    pane.openDC()
                } catch (e) {
                    console.log("failed to open DC", e)
                }
            }, ABIT)
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
        this.channelId = null
        this.fontSize = props.fontSize || 12
        this.scrolling = false
        this.scrollLingers4 = props.scrollLingers4 || 2000
        this.theme = props.theme || DEFAULT_XTERM_THEME
        this.copyMode = false
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
        var afterLeader = false,
            con = document.createElement("div")

        con.p = this
        this.t = new Terminal({
            convertEol: true,
            fontSize: this.fontSize,
            theme: this.theme,
            rows:24,
            disableStdin: true,
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
        this.t.onKey((ev) =>  {
            if (afterLeader) {
                if (ev.domEvent.key == "z") 
                    this.toggleZoom()
                else if (ev.domEvent.key == ",") 
                    this.w.rename()
                else if (ev.domEvent.key == "d")
                    this.close()
                else if (ev.domEvent.key == "+") {
                    this.scale(1)
                }
                else if (ev.domEvent.key == "-") {
                    this.scale(-1)
                }
                else if (ev.domEvent.key == "?") {
                    this.toggleSearch()
                }
                afterLeader = false
            }
            else if (this.copyMode) {
                this.handleCopyModeKey(ev.domEvent)
            // TODO: make the leader key configurable
            } else if ((ev.domEvent.ctrlKey == true) && (ev.domEvent.key == "a")) {
                afterLeader = true
                return
            }
            else
                if ((this.d != null) && (this.d.readyState == "open"))
                    this.d.send(ev.key)
        })
        // keep tap of "scrolling mode"
        var tf
        this.t.onScroll(ev => {
            this.scrolling = true
            if (tf !== undefined)
                clearTimeout(tf)
            tf = setTimeout(e => this.scrolling = false, this.scrollLingers4)
        })
        this.t.textarea.addEventListener('paste', (event) => {
            let paste = (event.clipboardData || window.clipboardData).getData('text');
            this.d.send(paste)
            event.preventDefault();
        })
        this.state = "opened"
        return this.t
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
    }

    // fit a pane
    fit() {
        setTimeout(() => {
            try {
                this.fitAddon.fit()
            } catch {
                if (this.retries < RETRIES) {
                    this.retries++
                    setTimeout(this.fit, 20*this.retries)
                }
                else
                    console.log(`fit failed ${RETRIES} times. giving up`)
                return
            }
            this.host.sendSize(this)
        }, ABIT)
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
    openDC(reconnect) {
        var tSize = this.t.rows+'x'+this.t.cols
        this.buffer = []

        if (reconnect)
            this.d = this.host.pc.createDataChannel(
                `${tSize} >${this.channelId}`)
        else
            this.d = this.host.pc.createDataChannel(tSize + ' zsh')

        this.d.onclose = e => {
            this.state = "disconnected"
            this.close()
        }
        this.d.onopen = () => {
            this.state = "opened"
            // TODO: set our size by sending "refresh-client -C <width>x<height>"
            setTimeout(() => {
                if (this.state == "opened") {
                    this.host.notify("Data channel is opened, but no first message")
                    this.host.updateState("disconnected")
                }}, TIMEOUT)
        }
        this.d.onmessage = m => {
            if (this.state == "opened") {
                var enc = new TextDecoder("utf-8"),
                    str = enc.decode(m.data)
                this.state = "connected"
                this.channelId = parseInt(str)
                this.host.onPaneConnected(this)
            }
            else if (this.state == "disconnected") {
                this.buffer.push(new Uint8Array(m.data))
            }
            else if (this.state == "connected") {
                this.write(new Uint8Array(m.data))
            }
            else
                this.host.notify(`${this.state} & dropping a message: ${m.data}`)
        }
        return this.d
    }
    toggleZoom() {
        super.toggleZoom()
        this.fit()
    }
    /*
     * Pane.handleCopyModeKey(ev) is called on a key press event when the
     * pane is in copy mode. 
     * Copy mode uses vim movment commands to let the user for text, mark it 
     * and copy it.
     */
    handleCopyModeKey(ev) {
        // Enter and "n" find the next match
        if ((ev.keyCode == 13) || (ev.key == "n")) {
            if (!this.searchAddon
                     .findPrevious(this.searchRE, SEARCH_OPTS))
                console.log(`Couldn't find "${this.searchRE}"`)
            else
                console.log(`Found "${this.searchRE}"`)
        }
        else if (ev.key == "o") {
            var ref = cordova.InAppBrowser.open(this.t.getSelection(), "_system", "");
        }
        else if (ev.key == "q") {
            this.toggleSearch()
            this.t.scrollToBottom()
        }
    }
    /*
     * Pane.enterSearch displays and handles pane search
     * First, tab names are replaced with an input field for the search string
     * as the user keys in the chars the display is scrolled to their first
     * occurences on the terminal buffer and the user can use line-mode vi
     * keys to move around, mark text and yank it
     */
    toggleSearch() {
        // show the search field
        const ne = this.host.e.querySelector(".tabbar-names-nav"),
              se = this.host.e.querySelector(".tabbar-search")
        this.copyMode = !this.copyMode
        if (this.copyMode) {
            ne.classList.add("hidden")
            se.classList.remove("hidden")
            document.getElementById("search-button").classList.add("on")
            let u = se.querySelector("a[href='#find-url']"),
                f = se.querySelector("a[href='#find-file']"),
                i = se.querySelector("input[name='regex']")
            u.onclick = ev => {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                i.value = this.searchRE = urlRegex
                this.handleCopyModeKey({keyCode: 13})
            }
            f.onclick = _ => this.searchAddon.findPrevious(fileRegex, SEARCH_OPTS)
            i.onkeydown = ev => {
                if (ev.keyCode == 13) {
                    ev.preventDefault()
                    ev.stopPropagation()
                    this.focus()
                    this.searchRE = ev.target.value
                    this.handleCopyModeKey(ev)
                }
            }
            i.focus()
        } else {
            ne.classList.remove("hidden")
            se.classList.add("hidden")
            document.getElementById("search-button").classList.remove("on")
            this.focus()
        }

    }
}
