import { Plugins } from '@capacitor/core'
import { Terminal, ITerminalAddon, ISelectionPosition } from 'xterm';
import { SearchAddon } from 'xterm-addon-search';

const { Clipboard } = Plugins

export class CopymodeAddon implements ITerminalAddon {
    
    isActive = false;
    endSelection = false;
    t: Terminal = null;
    selection: ISelectionPosition = null;
    keyListener: any;
    searchAddon: SearchAddon = null;
    onstop: () => void = null;

    activate(terminal: Terminal): void {
        this.t = terminal;
        this.t.onSelectionChange(() => this.selectionChanged())
        this.keyListener = (ev: KeyboardEvent) => this.keyPress(ev);
    }

    dispose() {
    }

    selectionChanged() {
        const selection = this.t.getSelectionPosition();
        this.selection = selection;
        if (selection) {
            this.start();
        } else {
            this.stop();
        }
    }

    keyPress(ev: KeyboardEvent) {
        const key = ev.key;
        const buffer = this.t.buffer.active;
        if (!this.isActive) {
            return;
        }
        switch(key) {
            case '[':
            case ' ':
                this.endSelection = !this.endSelection;
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
                if (!this.endSelection) {
                    if (this.selection.startColumn > 0) {
                        this.selection.startColumn -= 1;
                    }
                } else {
                    if (this.selection.endColumn > 0) {
                        this.selection.endColumn -= 1;
                    }    
                }
                this.updateSelection();
                break;
            case 'ArrowRight':
            case 'l':
                if (!this.endSelection) {
                    if (this.selection.startColumn < this.t.cols) {
                        this.selection.startColumn += 1;
                    }
                } else {         
                    if (this.selection.startColumn < this.t.cols) {
                        this.selection.endColumn += 1;
                    }              
                }
                this.updateSelection();
                break;
            case 'ArrowDown':
            case 'j':
                if (!this.endSelection) {
                    if (this.selection.startRow < buffer.cursorY) {
                        this.selection.startRow += 1;
                    }
                } else {         
                    if (this.selection.endRow < buffer.cursorY) {
                        this.selection.endRow += 1;
                    }                   
                }
                this.updateSelection();
                break;
            case 'ArrowUp':
            case 'k':
                if (!this.endSelection) {
                    if (this.selection.startRow > 0) {
                        this.selection.startRow -= 1;
                    }    
                } else { 
                    if (this.selection.endRow > 0) {
                        this.selection.endRow -= 1;
                    }                           
                }
                this.updateSelection();
                break;
        }
    }

    updateSelection() {
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
        this.t.select(this.selection.startColumn, this.selection.startRow, selectionLength);
        this.selectionChanged();
    }

    start() {
        console.log('COPYMODE START');
        if (!this.isActive) {
            if (!this.t.getSelectionPosition()) {
                const buffer = this.t.buffer.active;
                this.selection = {
                    startColumn: buffer.cursorX,
                    endColumn: buffer.cursorX,
                    startRow: buffer.cursorY,
                    endRow: buffer.cursorY
                }
                this.updateSelection();
                return;
            } else {
                this.selection = this.t.getSelectionPosition();
            }
            this.isActive = true;
            this.endSelection = false;
            document.addEventListener('keydown', this.keyListener)
            document.querySelector('#copy-mode-indicator').classList.remove('hidden');
            this.t.blur();
        }
    }

    stop() {
        console.log('COPYMODE STOP');
        if (this.isActive) {
            this.isActive = false;
            document.removeEventListener('keydown', this.keyListener)
            document.querySelector('#copy-mode-indicator').classList.add('hidden');
            if (this.onstop) {
                this.onstop();
            }
        }
    }

    complete () {
        console.log('COPYMODE COMPLETE');
        if (this.t.hasSelection()) {
            Clipboard.write({string: this.t.getSelection()})
                .then(() => {
                    this.t.clearSelection();
                    this.t.focus();
                    this.stop();
                })
        } else {
            this.stop();
        }
    }
}