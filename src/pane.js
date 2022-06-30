/*! Terminal 7 Pane - a class that colds a pane - a terminal emulation 
 * connected over a data channel to a remote interactive process
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Cell } from './cell.js'
import { fileRegex, urlRegex } from './utils.js'
import { Terminal } from '@tuzig/xterm'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Storage } from '@capacitor/storage'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { WebglAddon } from 'xterm-addon-webgl'


import XtermWebfont from 'xterm-webfont'

const  REGEX_SEARCH        = false,
      COPYMODE_BORDER_COLOR = "#F952F9",
        FOCUSED_BORDER_COLOR = "#F4DB53",
       SEARCH_OPTS = {
            regex: REGEX_SEARCH,
            wholeWord: false,
            incremental: false,
            caseSensitive: true}


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
        this.dividers = []
        this.flashTimer = null
        this.aLeader = false
        this.retries = 0
        this.lastKey = ''
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
            cols:80
        })
        this.fitAddon = new FitAddon()
        this.searchAddon = new SearchAddon()

        // there's a container div we need to get xtermjs to fit properly
        this.e.appendChild(con)
        con.style.height = "100%"
        con.style.width = "100%"
        this.t.loadAddon(new XtermWebfont())
        // the canvas gets the touch event and the nadler needs to get back here
        this.t.loadAddon(this.fitAddon)
        this.t.loadAddon(this.searchAddon)

        this.createDividers()
        this.t.onSelectionChange(() => this.selectionChanged())
        this.t.loadWebfontAndOpen(con).then(_ => {
            const webGLAddon = new WebglAddon()
            webGLAddon.onContextLoss(e => {
                console.log("lost context")
                  webGLAddon.dispose()
            })
            try {
                this.t.loadAddon(webGLAddon)
            } catch (e) { console.log("no webgl: " +e.toString()) }
            this.t.textarea.tabIndex = -1
            this.t.attachCustomKeyEventHandler(ev => {
                var toDo = true
                var meta = false
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

                if (!this.d) {
                    this.gate.notify("Gate is disconnected")
                    return
                }
                const state = this.d.readyState 
                if (state != "open") {
                    this.gate.notify(`Sorry, data channel is ${state}`)
                    return
                }
                this.d.send(d)
            })
            const resizeObserver = new window.ResizeObserver(() => this.fit())
            resizeObserver.observe(this.e);
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
    }

    // fit a pane to the display area. If it was resized, the server is updated.
    // returns true is size was changed
    fit(cb) {
        var oldr = this.t.rows,
            oldc = this.t.cols,
            ret = false

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
                this.notify(["Failed to fit the terminal",
                             "If things look funny,",
                             "   try zoom & un-zoom"].join("\n"))
        }
        this.refreshDividers()
        if (this.t.rows != oldr || this.t.cols != oldc) {
            if (this.d) {
                this.d.resize(this.t.cols, this.t.rows)
                this.gate.sendState()
            }
            ret = true
        }
        if (cb instanceof Function) cb(this)
        return ret
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
    onChannelConnected(channel, id) {
        console.log("onChannelConnected")
        const reconnect = this.d != null
        this.d = channel
        this.d.onMessage = m => this.onChannelMessage(m)
        this.d.onClose = () => {
            this.d = undefined 
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
            let  flashTime = this.t7.conf.indicators && this.t7.conf.indicators.flash
                             || 88
            this.gate.setIndicatorColor("#373702")
            this.flashTimer = this.t7.run(_ => {
                this.flashTimer = null
                this.gate.setIndicatorColor("unset")
            }, flashTime) 
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
    toggleSearch(searchDown) {
        const se = this.gate.e.querySelector(".search-box")
        if (se.classList.contains("hidden"))
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
        se.classList.remove("hidden")
        document.getElementById("search-button").classList.add("on")
        // TODO: restore regex search
        let up = se.querySelector(".search-up"),
            down = se.querySelector(".search-down"),
            i = se.querySelector("input[name='search-term']")
        if (searchDown) {
            up.classList.add("hidden")
            down.classList.remove("hidden")
        } else {
            up.classList.remove("hidden")
            down.classList.add("hidden")
        }
        if (REGEX_SEARCH) {
            i.setAttribute("placeholder", "regex here")
            u.classList.remove("hidden")
            f.classList.remove("hidden")
            u.onclick = ev => {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                i.value = this.searchTerm = urlRegex
            }
            // TODO: findPrevious does not work well
            f.onclick = _ => this.searchAddon.findPrevious(fileRegex, SEARCH_OPTS)
        } else 
            i.setAttribute("placeholder", "search string here")
        if (this.searchTerm)
            i.value = this.searchTerm

        i.onkeydown = ev => {
            if (ev.keyCode == 13) {
                this.findNext(i.value)
                this.hideSearch()
                this.t7.run(_ => this.t.focus(), 10)
            }
        }
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
            Storage.get({key: "first_copymode"}).then(v => {
                if (v.value != "1") {
                    var e = document.getElementById("help-copymode")
                    e.classList.remove("hidden")
                    Storage.set({key: "first_copymode", value: "1"})
                }
            })
        }
    }
    exitCopyMode() {
        if (this.copyMode) {
            this.copyMode = false
            this.e.style.borderColor = FOCUSED_BORDER_COLOR
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
        se.classList.add("hidden")
        document.getElementById("search-button").classList.remove("on")
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
            if (this.t.hasSelection()) 
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
        case "5":
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
            f = () => this.gate.disengage().then(() => this.gate.connect())
            break
        // this key is at terminal level
        case "l":
            f = () => this.t7.logDisplay()
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
        case "9":
            f = () => this.t7.dumpLog()
            break
        }

        if (f != null) {
            f()
            ev.preventDefault()
            ev.stopPropagation()
            return false
        }
        return true
    }
    findNext(searchTerm) {
        if (searchTerm != undefined) {
            this.cmAtEnd = null
            this.t.setOption("selectionStyle", "plain")
            this.searchTerm = searchTerm
        }

        if (this.searchTerm != undefined) {
            if (this.searchDown)
                if (!this.searchAddon.findNext(this.searchTerm, SEARCH_OPTS))
                    this.gate.notify(`Couldn't find "${this.searchTerm}"`)
                else 
                    this.enterCopyMode(true)
            if (!this.searchDown)
                if (!this.searchAddon.findPrevious(this.searchTerm, SEARCH_OPTS))
                    this.gate.notify(`Couldn't find "${this.searchTerm}"`)
                else 
                    this.enterCopyMode(true)
        }
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
        if (this.d)
            this.d.close()
        this.dividers.forEach(d => d.classList.add("hidden"))
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
        const selection = this.t.getSelectionPosition()
        if (selection != null) {
            this.copySelection()
            this.t.clearSelection()
        }
    }
    copySelection() {
        let i,
            ret = "",
            lines = this.t.getSelection().split('\n')
        for (i = 0; i < lines.length; i++)
            ret += lines[i].trimEnd()+'\n'
    
        return Clipboard.write({string: ret})
    }
    handleCMKey(key) {
        var x, y, newX, newY,
            selection = this.t.getSelectionPosition(),
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
        if (this.lastKey) {
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
                if (this.t.hasSelection())
                    this.copySelection().then(this.exitCopyMode())
                else
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
                if (y < this.t.buffer.active.baseY + this.t.rows)
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
                newX = this.regexFindIndex(line, /(?=(\W)\1*).(?!\1)(?!\s)|(?<=\w)\w(?=\W)(?=\S)/g, x - 1) + 1
                if (newX == 0)   
                    if (this.t.buffer.active.getLine(y + 1))
                        newY = y + 1
                    else {
                        newY = y
                        newX = x
                    }
                if (this.cmMarking)
                    newX++
                break
            case 'b':
                if (x == 0) {
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.replace(/\W/g, ' ').lastIndexOf(' ') + 1
                    newY = y - 1
                } else {
                    line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                    newX = line.replace(/\W/g, ' ').lastIndexOf(' ', x - 2) + 1
                }
                break
            case 'e':
                line = this.t.buffer.active.getLine(y).translateToString(true).trimEnd()
                newX = this.regexFindIndex(line, /(?=(\W)\1*)\S(?!\1)(?!\S)|(?=(\W)\2*)\S(?!\2)(?!\W)|(?=(\w)\3*).(?!\w)/g, x)
                while (newX == -1) {
                    newY++
                    line = this.t.buffer.active.getLine(newY)?.translateToString(true).trimEnd()
                    if (!line) {
                        newX = x
                        newY--
                    } else
                        newX = this.regexFindIndex(line, /(?=(\W)\1*)\S(?!\1)(?!\S)|(?=(\W)\2*)\S(?!\2)(?!\W)|(?=(\w)\3*).(?!\w)/g)
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
                    selection.endRow = newY
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
                console.log(scroll, this.t.buffer.active.viewportY, this.t.buffer.active.baseY)
            }
        }
    }
    cmInitCursor() {
        var selection = this.t.getSelectionPosition()
        if (selection) {
            this.cmCursor = {
                x: this.cmAtEnd?selection.endColumn:selection.startColumn,
                y: this.cmAtEnd?selection.endRow:selection.startRow
            }
            return
        }
        const buffer = this.t.buffer.active
        this.cmCursor = {x: buffer.cursorX,
                         y: buffer.cursorY + buffer.viewportY}
    }
    cmSelectionUpdate(selection) {
        if (this.cmAtEnd == null)
            this.t.setOption("selectionStyle", "plain")
        else
            this.t.setOption("selectionStyle", this.cmAtEnd?"mark-end":"mark-start")
        // maybe it's a cursor
        if (!this.cmMarking) {
            console.log("using selection to draw a cursor at", this.cmCursor)
            this.t.select(this.cmCursor.x, this.cmCursor.y, 1)
            return
        }
        if (!this.cmAtEnd) {
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
        this.t.select(selection.startColumn, selection.startRow, selectionLength)
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
}
