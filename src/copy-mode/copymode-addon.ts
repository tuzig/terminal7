import { Plugins } from '@capacitor/core'
import { Terminal, ITerminalAddon, ISelectionPosition, IBufferCellPosition } from 'xterm';
import { SearchAddon } from 'xterm-addon-search';

const { Clipboard } = Plugins

export class CopymodeAddon implements ITerminalAddon {
    
    isActive = false;
    endSelection: boolean | null = null;
    t: Terminal = null;
    selection: ISelectionPosition = null;
    keyListener: any;
    searchAddon: SearchAddon = null;
    cursor: IBufferCellPosition = null
    marking: boolean = false;
    onstop: () => void = null;

    activate(terminal: Terminal): void {
        this.t = terminal;
        this.t.onSelectionChange(() => this.selectionChanged())
        this.keyListener = (ev: KeyboardEvent) => this.keyPress(ev);
        document.addEventListener('keydown', this.keyListener)
    }

    dispose() {
        document.removeEventListener('keydown', this.keyListener)
    }

    selectionChanged() {
        const selection = this.t.getSelectionPosition();
        this.marking = selection != null
        if (selection) {
            this.start();
        } else {
            this.stop();
        }
    }

    keyPress(ev: KeyboardEvent) {
        const key = ev.key;
        const buffer = this.t.buffer.active;
        var x, y, newX, newY;
        if (!this.isActive) {
            return;
        }
        // chose the x & y we're going to change
        if (!this.marking) {
            x = this.cursor.x
            y =  this.cursor.y; 
        }
        else if (this.endSelection) {
            x = this.selection.endColumn
            y = this.selection.endRow; 
        }
        else {
            x = this.selection.startColumn;
            y = this.selection.startRow; 
        }
        newX = x
        newY = y
        switch(key) {
            // space is used to toggle the marking state
            case ' ':
                if (!this.marking) {
                    // entering marking mode, start the selection on the cursor
                    // with unknown direction
                    this.selection = {
                        startColumn: this.cursor.x,
                        endColumn: this.cursor.x,
                        startRow: this.cursor.y,
                        endRow: this.cursor.y
                    }
                    this.endSelection = null
                } else {
                    // copy the selection start|end to the cursor
                    this.cursor = {
                        x: this.endSelection?this.selection.endColumn:this.selection.startColumn,
                        y: this.endSelection?this.selection.endRow:this.selection.startRow
                    }
                }
                this.marking = !this.marking;
                this.updateSelection();
                break;
            case 'Enter':
                this.complete();
                break;
            case 'Escape':
            case 'q':
                this.stop();
                break;
            case 'n':
                if (this.searchAddon) {
                    this.searchAddon.findNext(this.t.getSelection());
                }
                break;
            case 'p':
                if (this.searchAddon) {
                    this.searchAddon.findPrevious(this.t.getSelection());
                }
                break;
            case 'ArrowLeft':
            case 'h':
                if (x > 0) 
                    newX = x - 1;
                if (this.marking && (this.endSelection == null))
                    this.endSelection = false;
                break;
            case 'ArrowRight':
            case 'l':
                if (x < this.t.cols - 2)
                    newX = x + 1;
                if (this.marking && (this.endSelection == null))
                    this.endSelection = true;
                break;
            case 'ArrowDown':
            case 'j':
                if (y < this.t.rows + buffer.viewportY - 1)
                    newY = y + 1;
                else 
                    this.t.scrollLines(1)
                if (this.marking && (this.endSelection == null))
                    this.endSelection = true;
                break;
            case 'ArrowUp':
            case 'k':
                if (y > buffer.viewportY)
                    newY = y - 1
                else 
                    this.t.scrollLines(-1)
                if (this.marking && (this.endSelection == null))
                    this.endSelection = false
                break;
        }
        if ((newY != y) || (newX != x)) {
            if (!this.marking) {
                this.cursor.x = newX;
                this.cursor.y = newY; 
            }
            else if (this.endSelection) {
                if ((newY < this.selection.startRow) || 
                   ((newY == this.selection.startRow)
                    && (newX < this.selection.startColumn))) {
                    this.endSelection = false;
                    this.selection.endRow = this.selection.startRow;
                    this.selection.endColumn = this.selection.startColumn;
                    this.selection.startRow = newY;
                    this.selection.startColumn = newX;
                } else {
                    this.selection.endColumn = newX;
                    this.selection.endRow = newY;
                }
            }
            else {
                if ((newY > this.selection.endRow) ||
                    ((newY == this.selection.endRow)
                     && (newX > this.selection.endColumn))) {
                    this.endSelection = true;
                    this.selection.startRow = this.selection.endRow;
                    this.selection.startColumn = this.selection.endColumn;
                    this.selection.endRow = newY;
                    this.selection.endColumn = newX;
                } else {
                    this.selection.startColumn = newX;
                    this.selection.startRow = newY;
                }
            }
        }
        this.updateSelection();
        this.t.blur()
    }

    updateSelection() {
        // maybe we've got just a cursor?
        if (!this.marking) {
            console.log("using selection to draw a cursor at", this.cursor);
            this.t.setOption("selectionStyle", "mark-start")
            this.t.select(this.cursor.x, this.cursor.y, 1);
            return
        }
        // we've got a selection!
        this.t.setOption("selectionStyle",
            this.endSelection?"mark-end":"mark-start");
        if (!this.endSelection) {
            if (this.selection.startRow > this.selection.endRow) {
                this.selection.endRow = this.selection.startRow;                
            }
            if (this.selection.endRow === this.selection.startRow) {
                if (this.selection.startColumn > this.selection.endColumn) {
                    this.selection.endColumn = this.selection.startColumn;
                }    
            }
        } else {
            if (this.selection.startRow > this.selection.endRow) {
                this.selection.startRow = this.selection.endRow;                
            }
            if (this.selection.startRow === this.selection.endRow) {
                if (this.selection.startColumn > this.selection.endColumn) {
                    this.selection.startColumn = this.selection.endColumn;
                }    
            }
        }
        const rowLength = this.t.cols;
        let selectionLength = rowLength*(this.selection.endRow - this.selection.startRow) + this.selection.endColumn - this.selection.startColumn;
        if (selectionLength === 0) {
            selectionLength = 1;
        }
        console.log("updating selection", this.selection.startColumn, this.selection.startRow, selectionLength);
        this.t.select(this.selection.startColumn, this.selection.startRow, selectionLength);
    }

    start() {
        console.log('starting copy mode', this.isActive);
        if (!this.isActive) {
            this.isActive = true;
            this.selection = this.t.getSelectionPosition();
            if (!this.selection) {
                const buffer = this.t.buffer.active;
                this.cursor = {x: buffer.cursorX,
                               y: buffer.cursorY + buffer.baseY};
                this.marking = false;
            } else {
                this.marking = true;
            }
            this.endSelection = null;
            document.querySelector('#copy-mode-indicator').classList.remove('hidden');
            this.t.blur();
        }
    }

    stop() {
        if (this.isActive) {
            this.isActive = false;
            document.querySelector('#copy-mode-indicator').classList.add('hidden');
            this.t.clearSelection()
            if (this.onstop) {
                this.onstop();
            }
        }
    }

    complete () {
        if (this.t.hasSelection()) {
            Clipboard.write({string: this.t.getSelection()})
                .then(() => {
                    this.t.focus();
                    this.stop();
                })
        } else {
            this.stop();
        }
    }
}
