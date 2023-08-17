/*! Terminal 7 Pane - a class that colds a pane - a terminal emulation 
 * connected over a data channel to a remote interactive process
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Cell } from './cell.js'
import { Terminal } from 'xterm'
import { Clipboard } from '@capacitor/clipboard'
import { Preferences } from '@capacitor/preferences'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { WebglAddon } from 'xterm-addon-webgl'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { Camera } from '@capacitor/camera'
/* restore the bell. commented as it silences all background audio
import { BELL_SOUND } from './bell.js'
*/

import { Failure } from './session'

import XtermWebfont from '@liveconfig/xterm-webfont'

const REGEX_SEARCH = false,
    COPYMODE_BORDER_COLOR = "#F952F9",
    FOCUSED_BORDER_COLOR = "#F4DB53",
    SEARCH_OPTS = {
        regex: REGEX_SEARCH,
        wholeWord: false,
        incremental: false,
        caseSensitive: true,
    }


export class Pane extends Cell {
    constructor(props) {
        props.className = "pane"
        super(props)
        this.catchFingers()
        this.d = null
        this.active = false
        this.fontSize = props.fontSize || 12
        this.theme = props.theme || this.t7.conf.theme
        this.copyMode = false
        this.cmAtEnd = null
        this.cmCursor = null
        this.cmMarking = false
        this.cmSelection = null
        this.cmDecorations = []
        this.dividers = []
        this.flashTimer = null
        this.aLeader = false
        this.retries = 0
        this.lastKey = ''
        this.repetition = 0
        this.resizeObserver = new window.ResizeObserver(() => this.fit())
        this.needsResize = false
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
    openTerminal(parentID, channelID) {
        console.log("in OpenTerminal")
        var con = document.createElement("div")
        this.t = new Terminal({
            convertEol: false,
            fontFamily: "FiraCode",
            fontSize: this.fontSize,
            rendererType: "canvas",
            theme: this.theme,
            rows:24,
            cols:80,
            allowProposedApi: true,
            /* TODO: restore this. commented because it silences spotify
            bellStyle: "sound",
            bellSound: BELL_SOUND, */
        })
        this.fitAddon = new FitAddon()
        this.searchAddon = new SearchAddon()
        this.WebLinksAddon = new WebLinksAddon((MouseEvent, url) => {
            window.open(url, "_blank", "noopener")
        })

        // there's a container div we need to get xtermjs to fit properly
        this.e.appendChild(con)
        con.style.height = "100%"
        con.style.width = "100%"
        this.t.loadAddon(new XtermWebfont())
        // the canvas gets the touch event and the nadler needs to get back here
        this.t.loadAddon(this.fitAddon)
        this.t.loadAddon(this.searchAddon)
        this.t.loadAddon(this.WebLinksAddon)
        const webGLAddon = new WebglAddon()
        webGLAddon.onContextLoss(() => {
            terminal7.log("lost context")
            webGLAddon.dispose()
        })

        this.createDividers()
        this.t.onSelectionChange(() => this.selectionChanged())
        this.t.loadWebfontAndOpen(con).then(() => {
            this.t.loadAddon(webGLAddon)
            this.t.textarea.tabIndex = -1
            this.t.attachCustomKeyEventHandler(ev => {
                var toDo = true
                // ctrl c is a special case 
                if (ev.ctrlKey && (ev.key == "c") && (this.d != null)) {
                    this.d.send(String.fromCharCode(3))
                    toDo = false
                }
                if (ev.ctrlKey && (ev.key == this.t7.conf.ui.leader)) {
                    this.aLeader = !this.aLeader
                    toDo = !this.aLeader
                }
                else if (ev.metaKey && (ev.key != "Shift") && (ev.key != "Meta") ||
                    this.aLeader && (ev.key != this.t7.conf.ui.leader) 
                                 && (ev.key != 'Control')) {
                    // ensure help won't pop
                    this.t7.metaPressStart = Number.MAX_VALUE
                    toDo = this.handleMetaKey(ev)
                    this.aLeader = false
                }
                else if (this.copyMode) {
                    if  (ev.type == "keydown") {
                        if (ev.ctrlKey)
                            this.handleCMKey('C-' + ev.key)
                        else
                            this.handleCMKey(ev.key)
                    }
                    toDo = false
                }
                if (!toDo) {
                    ev.stopPropagation()
                    ev.preventDefault()
                }
                return toDo
            })
            this.t.onData(d =>  {
                if (!this.d || this.d.readyState != "open" ) {
                    this.gate.handleFailure(Failure.DataChannelLost)
                } else
                    this.d.send(d)
            })
            this.t.element.addEventListener('mouseup', () => {
                if (this.cmSelection) {
                    this.copySelection()
                    this.t.clearSelection()
                    this.cmDecorationsClear()
                }
            })
            this.resizeObserver.observe(this.e);
            this.fit(pane => { 
               if (pane != null)
                  pane.openChannel({parent: parentID, id: channelID})
                  .catch(e => 
                      this.gate.notify("Failed to open communication channel: "+e))
            })
        })
        return this.t
    }
    setTheme(theme) {
        this.t.options.theme = theme
    }
    /*
     * Pane.scale is used to change the pane's font size
     */
    scale(by) {
        this.fontSize += by
        if (this.fontSize < 6) this.fontSize = 6
        else if (this.fontSize > 30) this.fontSize = 30
        this.t.options.fontSize = this.fontSize
        this.fit()
    }

    // fit a pane to the display area. If it was resized, the server is updated.
    // returns true is size was changed
    // TODO: make it async
    fit(cb) {
        if (!this.t) {
            if (cb instanceof Function) cb(this)
            return
        }
        let oldr = this.t.rows
        let oldc = this.t.cols

        // there's no point in fitting when in the middle of a restore
        //  it happens in the eend anyway
        try {
            this.fitAddon.fit()
        } catch (e) {
            if (this.retries < this.t7.conf.retries) {
                this.retries++
                this.t7.run(this.fit, 20*this.retries)
            }
            else 
                console.log(e)
        }
        this.refreshDividers()
        if (this.t.rows != oldr || this.t.cols != oldc) {
            if (this.d)
                this.d.resize(this.t.cols, this.t.rows)
            else
                this.needsResize = true
        }
        if (cb instanceof Function) cb(this)
    }
    /*
     * Pane.focus focuses the UI on this pane
     */
    focus() {
        super.focus()
        if (this.t !== undefined)
            setTimeout(() => this.t.focus(), 100)
        else 
            this.t7.log("can't focus, this.t is undefined")
    }
    /*
     * Splitting the pane, receivees a dir-  either "topbottom" or "rightleft"
     * and the relative size (0-1) of the area left for us.
     * Returns the new pane.
     */
    split(dir, s) {
        if (!this.isSplittable(dir)) return
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
        let p = l.addPane({sx: sx, sy: sy, 
                       xoff: xoff, yoff: yoff,
                       parent: this})
        p.focus()
        this.gate.sendState()
        return p
    }
    onChannelConnected(channel) {
        const reconnect = this.d != null
        this.d = channel
        this.d.onMessage = m => this.onChannelMessage(m)
        this.d.onClose = () => {
            this.d = null
            this.close()
        }
        if (!reconnect)
            this.gate.sendState()
    }
    openChannel(opts) {
        return new Promise((resolve, reject) => {
            if (!this.gate.session) {
                reject("Gate has no session yet")
                return
            }
            if (this.d && (this.d.readyState == "open"))
                return
            this.buffer = []
            if (opts.id) {
                this.gate.session.openChannel(opts.id)
                .then((channel, id) =>this.onChannelConnected(channel, id))
                .then(resolve)
                .catch(m => console.log(m))
            } else {
                this.gate.session.openChannel(
                    this.t7.conf.exec.shell, opts.parent, this.t.cols, this.t.rows)
                .then((channel, id) =>this.onChannelConnected(channel, id))
                .then(resolve)
                .catch(m => console.log(m))
            }
        })
    }
    flashIndicator () {
        if (this.flashTimer == null) {
            this.gate.setIndicatorColor("#373702")
            this.flashTimer = this.t7.run(() => {
                this.flashTimer = null
                this.gate.setIndicatorColor("unset")
            }, this.t7.conf.ui.flash) 
        }
    }
    // called when a message is received from the server
    onChannelMessage (m) {
        this.flashIndicator()
        this.write(m)
    }
    toggleZoom() {
        super.toggleZoom()
        this.fit()
    }
    toggleSearch() {
        const se = this.gate.e.querySelector(".search-box")
        if (!se.classList.contains("show"))
            this.showSearch()
        else {
            this.hideSearch()
            this.focus()
        }
    }

    showSearch(searchDown) {
        // show the search field
        this.searchDown = searchDown || false
        const se = this.gate.e.querySelector(".search-box")
        se.classList.add("show")
        se.classList.remove("hidden")
        document.getElementById("search-button").classList.add("on")
        // TODO: restore regex search
        let i = se.querySelector("input[name='search-term']")
        this.disableSearchButtons()
        i.setAttribute("placeholder", "search string here")
        if (this.searchTerm)
            i.value = this.searchTerm
        if (this.zoomed)
            this.styleZoomed()
        i.onkeydown = ev => {
            if (ev.keyCode == 13) {
                this.findPrev(i.value)
                this.enableSearchButtons()
                this.t7.run(() => this.t.focus(), 10)
            }
        }
        i.addEventListener("input", () => {
            this.searchTerm = i.value
            if (i.value) {
                this.enableSearchButtons()
            }
            else {
                this.disableSearchButtons()
            }
        })
        i.focus()
    }
    enterCopyMode(marking) {
        if (marking)
            this.cmMarking = true
        if (!this.copyMode) {
            this.copyMode = true
            this.cmInitCursor()
            this.cmAtEnd = null
            if (this.zoomed)
                this.t7.zoomedE.children[0].style.borderColor = COPYMODE_BORDER_COLOR
            else
                this.e.style.borderColor = COPYMODE_BORDER_COLOR
            Preferences.get({key: "first_copymode"}).then(v => {
                if (v.value != "1") {
                    // this.gate.map.shell.runCommand('help', ['copymode'])
                    Preferences.set({key: "first_copymode", value: "1"})
                }
            })
        }
    }
    exitCopyMode() {
        if (this.copyMode) {
            this.copyMode = false
            this.e.style.borderColor = FOCUSED_BORDER_COLOR
            this.cmDecorationsClear()
            this.cmSelection = null
            this.searchAddon.clearDecorations()
            this.t.clearSelection()
            this.t.scrollToBottom()
            if (this.zoomed)
                this.t7.zoomedE.children[0].style.borderColor = FOCUSED_BORDER_COLOR
            else
                this.e.style.borderColor = FOCUSED_BORDER_COLOR
            this.focus()
        }
    }
    hideSearch() {
        const se = this.gate.e.querySelector(".search-box")
        se.classList.remove("show")
        setTimeout(() => se.classList.add("hidden"), 500)
        document.getElementById("search-button").classList.remove("on")
        if (this.zoomed)
            this.styleZoomed()
    }
    exitSearch() {
        this.hideSearch();
        this.exitCopyMode();
    }
    handleMetaKey(ev) {
        var f = null
        this.t7.log(`Handling meta key ${ev.key}`)
        switch (ev.key) {
        case "c":
            this.copySelection()
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
        case "\\":
            f = () => this.split("topbottom")
            break
        case "'":
            f = () => this.split("rightleft")
            break
        case "[":
   
            f = () => this.enterCopyMode()
            break
        case "f":
            f = () => this.showSearch()
            break
        // next two keys are on the gate level
        case "t":
            f = () => this.gate.newTab()
            break
        case "r":
            f = () => this.gate.reset()
            break
        // this key is at terminal level
        case "l":
            f = () => this.t7.map.showLog()
            break
        case "ArrowLeft":
            f = () => this.w.moveFocus("left")
            break
        case "ArrowRight":
            f = () => this.w.moveFocus("right")
            break
        case "ArrowUp":
            f = () => this.w.moveFocus("up")
            break
        case "ArrowDown":
            f = () => this.w.moveFocus("down")
            break
        case "p":
            f = () => this.t7.dumpLog()
            break
        default:
            if (ev.key >= "1" && ev.key <= "9") {
                const win = this.gate.windows[ev.key - 1]
                if (win)
                    win.focus()
            }
            break
        }

        if (f != null) {
            f()
            return false
        }
        return true
    }
    findNext(searchTerm) {
        const notFound = this.gate.e.querySelector(".not-found")
        if (searchTerm) {
            this.cmAtEnd = null
            // this.t.options.selectionStyle = "plain"
            this.searchTerm = searchTerm
        }

        if (this.searchTerm) {
            if (!this.searchAddon.findNext(this.searchTerm, SEARCH_OPTS))
                notFound.classList.remove("hidden")
            else {
                notFound.classList.add("hidden")
                this.enterCopyMode(true)
                this.markSelection()
            }
        }
    }
    findPrev(searchTerm) {
        const notFound = this.gate.e.querySelector(".not-found")
        if (searchTerm) {
            this.cmAtEnd = null
            // this.t.options.selectionStyle = "plain"
            this.searchTerm = searchTerm
        }

        if (this.searchTerm) {
            if (!this.searchAddon.findPrevious(this.searchTerm, SEARCH_OPTS))
                notFound.classList.remove("hidden")
            else {
                notFound.classList.add("hidden")
                this.enterCopyMode(true)
                this.markSelection()
            }
        }
    }
    markSelection() {
        const selection = this.t.getSelectionPosition()
        if (!selection)
            return
        this.cmCursor = { x: selection.start.x, y: selection.start.y }
        this.cmSelectionUpdate({ startRow: selection.start.y, endRow: selection.end.y,
            startColumn: selection.start.x, endColumn: selection.end.x - 1 })
    }
    /*
     * createDividers creates a top and left educationsl dividers.
     * The dividers are here because they're elegant and they let the user know
     * he can move the borders
     * */
    createDividers() {
        // create the dividers
        var t = document.getElementById("divider-template")
        if (t) {
            var d = [t.content.cloneNode(true),
                     t.content.cloneNode(true)]
            d.forEach((e, i) => {
                this.w.e.prepend(e)
                e = this.w.e.children[0]
                e.classList.add((i==0)?"left-divider":"top-divider")
                e.pane = this
                this.dividers.push(e)
            })
        }
    }
    /*
     * refreshDividerrs rrepositions the dividers after the pane has been
     * moved or resized
     */
    refreshDividers() {
        var W = this.w.e.offsetWidth,
            H = this.w.e.offsetHeight,
            d = this.dividers[0]
        if (this.xoff > 0.001 & this.sy * H > 50) {
            // refresh left divider position
            d.style.left = `${this.xoff * W - 4 - 20 }px`
            d.style.top = `${(this.yoff + this.sy/2)* H - 22 - 40}px`
            d.classList.remove("hidden")
        } else
            d.classList.add("hidden")
        d = this.dividers[1]
        if (this.yoff > 0.001 & this.sx * W > 50) {
            // refresh top divider position
            d.style.top = `${this.yoff * H - 25 - 20 }px`
            d.style.left = `${(this.xoff + this.sx/2)* W - 22 - 40}px`
            d.classList.remove("hidden")
        } else
            d.classList.add("hidden")
    }
    close() {
        try {
            this.resizeObserver.unobserve(this.e);
        } catch (e) {}

        if (this.d)
            this.d.close()
        this.dividers.forEach(d => d.classList.add("hidden"))
        document.querySelector('.add-tab').classList.remove("off")
        super.close()
    }
    dump() {
        var cell = {
            sx: this.sx,
            sy: this.sy,
            xoff: this.xoff,
            yoff: this.yoff,
            fontSize: this.fontSize
        }
        if (this.d)
            cell.channel_id = this.d.id
        if (this.w.activeP && this == this.w.activeP)
            cell.active = true
        if (this.zoomed)
            cell.zoomed = true
        return cell
    }
    // listening for terminal selection changes
    selectionChanged() {
        this.markSelection()
        return
    }
    copySelection() {
        if (this.t.hasSelection()) {
            return Clipboard.write({string: this.t.getSelection()})
        }
        if (!this.cmSelection)
            return

        const lines = []
        for (let line = this.cmSelection.startRow; line <= this.cmSelection.endRow; line++) {
            const lineText = this.t.buffer.active.getLine(line).translateToString(true)
            const start = line == this.cmSelection.startRow ? this.cmSelection.startColumn : 0
            const end = line == this.cmSelection.endRow ? this.cmSelection.endColumn : lineText.length
            const selectedText = lineText.slice(start, end)
            lines.push(selectedText)
        }
        return Clipboard.write({string: lines.join('\n')})
    }
    handleCMKey(key) {
        var x, y, newX, newY,
            selection = this.cmSelection,
            line
        // chose the x & y we're going to change
        if ((!this.cmMarking) || (selection == null)) {
            this.cmMarking = false
            if (!this.cmCursor)
                this.cmInitCursor()
            x = this.cmCursor.x
            y =  this.cmCursor.y; 
            selection = {
                startColumn: x,
                endColumn: x,
                startRow: y,
                endRow: y
            }
        }
        else if (this.cmAtEnd) {
            x = selection.endColumn
            y = selection.endRow; 
        }
        else {
            x = selection.startColumn
            y = selection.startRow; 
        }
        newX = x
        newY = y
        if (this.repetition || key.match(/[1-9]/)) {
            if (key.match(/\d/))
                this.repetition = 10 * this.repetition + parseInt(key)
            else {
                let temp = this.repetition
                this.repetition = 0
                for (let i = 0; i < temp; i++) {
                    this.handleCMKey(key)
                }
            }
        }
        else if (this.lastKey) {
            switch (key) {
                case 'Escape':
                case 'ArrowRight':
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'ArrowDown':
                    break
                default:
                    if (!key.match(/^.$/))
                        return
                    break
            }
            switch (this.lastKey) {
                case 'f':
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.indexOf(key, x + 1)
                    if (newX == -1)
                        newX = x
                    else if (this.cmMarking)
                        newX++
                    break
                case 'F':
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.lastIndexOf(key, x - 2)
                    if (newX == -1)
                        newX = x
                    break
                case 't':
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.indexOf(key, x + 1) - 1
                    if (newX == -2)
                        newX = x
                    else if (this.cmMarking)
                        newX++
                    break
                case 'T':
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.lastIndexOf(key, x - 2) + 1
                    if (newX == 0)
                        newX = x
                    break
            }
            this.lastKey = ''
        }
        else switch(key) {
            // space is used to toggle the marking state
            case ' ':
                if (!this.cmMarking) {
                    // entering marking mode, start the selection on the cursor
                    // with unknown direction
                    this.cmAtEnd = null
                } else {
                    this.cmInitCursor()
                }
                this.cmMarking = !this.cmMarking
                console.log("setting marking:", this.cmMarking)
                this.cmSelectionUpdate(selection)
                break
            case "Enter":
                this.copySelection()
                this.exitCopyMode();
                break
            case '/':
                this.showSearch(true)
                break
            case '?':
                this.showSearch()
                break
            case 'Escape':
            case 'q':
                this.exitCopyMode()
                break
            case 'n':
                this.findNext()
                break
            case 'ArrowLeft':
            case 'h':
                if (x > 0) 
                    newX = x - 1
                if (this.cmAtEnd === null)
                    this.cmAtEnd = false
                break
            case 'ArrowRight':
            case 'l':
                if (x < this.t.cols - 2)
                    newX = x + 1
                if (this.cmAtEnd === null)
                    this.cmAtEnd = true
                break
            case 'ArrowDown':
            case 'j':
                if (y < this.t.buffer.active.baseY + this.t.rows - 1)
                    newY = y + 1
                if (this.cmAtEnd === null)
                    this.cmAtEnd = true
                break
            case 'ArrowUp':
            case 'k':
                if (y > 0)
                    newY = y - 1
                if (this.cmAtEnd === null)
                    this.cmAtEnd = false
                break
            case '0':
                newX = 0
                break
            case '$':
                line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                newX = line.length
                if (newX != 0 && !this.cmMarking)
                    newX--
                break
            case 'w':
                line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                while (newX < line.length) {
                    if (line.substring(newX, newX + 2).match(/\W\w/)
                        || line.substring(newX, newX + 2).match(/\w[^\w\s]/)
                        || line.substring(newX, newX + 2).match(/\s\S/)) {
                        newX++
                        break
                    }
                    newX++
                }
                if (newX >= line.length) {
                    if (this.t.buffer.active.getLine(y+1)?.translateToString(true).trimEnd()) {
                        newX = 0
                        newY++
                    } else
                        newX = line.length - 1
                }
                if (this.cmMarking)
                    newX++
                break
            case 'b':
                line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                if (x <= 0 && y > 0) {
                    newY--
                    line = this.t.buffer.active.getLine(newY).translateToString(true).trimEnd()
                    newX = line.length
                }
                while (newX > 0) {
                    if (line.substring(newX - 2, newX).match(/\W\w/)
                        || line.substring(newX - 2, newX).match(/\w[^\w\s]/)
                        || line.substring(newX - 2, newX).match(/\s\S/)) {
                        newX--
                        break
                    }
                    newX--
                }
                break
            case 'e':
                line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                if (newX >= line.length - 1) {
                    line = this.t.buffer.active.getLine(y+1).translateToString(true).trimEnd()
                    if (!line) break
                    newX = 0
                    newY++
                }
                while (newX < line.length) {
                    newX++
                    if (newX == line.length) {
                        newX--
                        break
                    }
                    if (line.substring(newX, newX + 2).match(/\w\W/)
                        || line.substring(newX, newX + 2).match(/[^\w\s]\w/)
                        || line.substring(newX, newX + 2).match(/\S\s/))
                        break
                }
                if (this.cmMarking)
                    newX++
                break
            case 'f':
            case 'F':
            case 't':
            case 'T':
                console.log("waiting for input")
                this.lastKey = key
                break
            case 'C-f':
                newY = this.t.buffer.active.viewportY + this.t.buffer.active.length - this.t.buffer.active.baseY
                if (newY >= this.t.buffer.active.length) 
                    newY = this.t.buffer.active.length - 1
                break
            case 'C-b':
                console.log('y', this.t.buffer.active.baseY, this.t.buffer.active.viewportY, this.t.buffer.active.length, this.t.rows)
                newY = this.t.buffer.active.viewportY - (this.t.buffer.active.length - this.t.buffer.active.baseY)
                if (newY < 0) 
                    newY = 0
                break
        }
        if ((newY != y) || (newX != x)) {
            if (!this.cmMarking) {
                this.cmCursor.x = newX
                this.cmCursor.y = newY; 
            }
            else if (this.cmAtEnd) {
                if ((newY < selection.startRow) || 
                   ((newY == selection.startRow)
                    && (newX < selection.startColumn))) {
                    this.cmAtEnd = false
                    selection.endRow = selection.startRow
                    selection.endColumn = selection.startColumn
                    selection.startRow = newY
                    selection.startColumn = newX
                } else {
                    selection.endColumn = newX
                    selection.endRow = newY
                }
            }
            else {
                if ((newY > selection.endRow) ||
                    ((newY == selection.endRow)
                     && (newX > selection.endColumn))) {
                    this.cmAtEnd = true
                    selection.startRow = selection.endRow
                    selection.endRow = newY
                    selection.startColumn = selection.endColumn
                    selection.endColumn = newX
                } else {
                    selection.startColumn = newX
                    selection.startRow = newY
                }
            }
            this.cmSelectionUpdate(selection)
            if ((newY >= this.t.buffer.active.viewportY + this.t.rows) ||
                (newY < this.t.buffer.active.viewportY)) {
                let scroll = newY - this.t.buffer.active.viewportY
                this.t.scrollLines(scroll, true)
            }
        }
    }
    cmInitCursor() {
        if (this.cmSelection)
            return
        const buffer = this.t.buffer.active
        this.cmCursor = {x: buffer.cursorX,
                         y: buffer.cursorY + buffer.viewportY}
    }
    cmMark() {
        this.cmDecorationsClear()
        const x1 = this.cmSelection.startColumn,
            x2 = this.cmSelection.endColumn,
            y1 = this.cmSelection.startRow,
            y2 = this.cmSelection.endRow
        const baseY = this.t.buffer.active.baseY + this.t.buffer.active.cursorY,
            rowLength = this.t.cols,
            colors = {
                backgroundColor: '#D9F505',
                foregroundColor: '#271D30'
            }
        const m1 = this.t.registerMarker(y1 - baseY)
        if (y1 == y2) {
            this.cmDecorations.push(this.t.registerDecoration({
                marker: m1,
                x: x1,
                width: x2 - x1 + 1,
                ...colors
            }))
            return
        }
        this.cmDecorations.push(this.t.registerDecoration({
            marker: m1,
            x: x1,
            width: rowLength - x1,
            ...colors,
        }))
        for (let i = y1 + 1; i < y2; i++) {
            const m = this.t.registerMarker(i - baseY)
            this.cmDecorations.push(this.t.registerDecoration({
                marker: m,
                x: 0,
                width: rowLength,
                ...colors,
            }))
        }
        const m2 = this.t.registerMarker(y2 - baseY)
        this.cmDecorations.push(this.t.registerDecoration({
            marker: m2,
            x: 0,
            width: x2 + 1,
            ...colors,
        }))
    }
    cmDecorationsClear() {
        this.cmDecorations.forEach(d => d.dispose())
        this.cmDecorations = []
    }
    cmSelectionUpdate(selection) {
        // maybe it's a cursor
        if (!this.cmMarking) {
            console.log("using selection to draw a cursor at", this.cmCursor)
            selection = {
                startRow: this.cmCursor.y,
                startColumn: this.cmCursor.x,
                endRow: this.cmCursor.y,
                endColumn: this.cmCursor.x
            }
        } else if (!this.cmAtEnd) {
            if (selection.startRow > selection.endRow) {
                selection.endRow = selection.startRow
            }
            if (selection.endRow === selection.startRow) {
                if (selection.startColumn > selection.endColumn) {
                    selection.endColumn = selection.startColumn
                }    
            }
        } else {
            if (selection.startRow > selection.endRow) {
                selection.startRow = selection.endRow
            }
            if (selection.startRow === selection.endRow) {
                if (selection.startColumn > selection.endColumn) {
                    selection.startColumn = selection.endColumn
                }    
            }
        }
        const rowLength = this.t.cols
        let selectionLength = rowLength*(selection.endRow - selection.startRow) + selection.endColumn - selection.startColumn
        if (selectionLength == 0) selectionLength = 1


        this.cmSelection = selection
        this.cmMark()
    }
    enableSearchButtons() {
        const se = this.gate.e.querySelector(".search-box")
        let up = se.querySelector(".search-up"),
            down = se.querySelector(".search-down")
        up.classList.remove("off")
        down.classList.remove("off")
    }
    disableSearchButtons() {
        const se = this.gate.e.querySelector(".search-box")
        let up = se.querySelector(".search-up"),
            down = se.querySelector(".search-down")
        up.classList.add("off")
        down.classList.add("off")
    }
    regexFindIndex(str, regex, startIndex) {
        startIndex = startIndex || 0
        let match = -1
        str.replace(regex, (...args) => {
            let i = args.find(x => typeof(x) == "number")
            if (match == -1 && i > startIndex)
                match = i
        })
        return match
    }
    // showVideo replace the terminal with a video and vice versa
    // if `show` is undefined the video is toggled
    showVideo(show) {
        const video = document.querySelector("video")
        if (show === undefined)
            show = video === null
        if (video) {
            video.parentElement.querySelector("div").classList.remove("hidden")
            video.remove()
        }
        const button = document.getElementById("video-button")
        if (show) {
            // first remove all videos
            button.classList.add("on")
            const v = document.createElement("video");
            this.e.querySelector("div").classList.add("hidden")
            this.e.prepend(v)
            Camera.checkPermissions().then(result => {
                if (result.camera == "prompt") {
                    terminal7.log("camera permission prompt")
                    terminal7.ignoreAppEvents = true
                }
                navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                    .then((stream) => {
                        v.srcObject = stream
                        v.addEventListener("loadedmetadata", () => v.play())
                    })
                    .catch(e => this.t7.log("mediaDevices error", e))
            })
		} else {
            button.classList.remove("on")
            this.e.querySelector("div").classList.remove("hidden")
            this.focus()
        }
    }   
    /* receives a dir: "topbottom" or "rightleft"
     * and returns whether or not the pane can be split in the direction
     */
    isSplittable(dir) {
        const min = this.t7.conf.ui.min_pane_size
        if (this.w.rootLayout.numPanes > this.t7.conf.ui.max_panes)
            return false
        else if (dir == "topbottom")
            return this.sx >= min
        else if (dir == "rightleft")
            return this.sy >= min
    }
}
