import { Terminal, ITerminalAddon, ISelectionPosition } from 'xterm';




export class CopymodeAddon implements ITerminalAddon {
    
    isActive = false;
    endSelection = false;
    t: Terminal = null;
    selection: ISelectionPosition = null;

    activate(terminal: Terminal): void {
        this.t = terminal;
        this.t.onSelectionChange(() => this.selectionChanged())
        this.t.onKey((p: {key: string, domEvent: KeyboardEvent}) => this.keyPress(p.key, p.domEvent))
    }

    dispose() {
    }

    selectionChanged() {
        const selection = this.t.getSelectionPosition();
        console.log('CM SELECTION', selection);
        this.selection = selection;
        if (selection) {
            this.start();
        } else {
            this.stop();
        }
    }

    keyPress(key: string, domEvent: KeyboardEvent) {
        if (!this.isActive) {
            return;
        }
        if (key === '[') {
            this.endSelection = !this.endSelection;
        } else {
            if (!this.endSelection) {
                if (key === 'h') {
                    this.selection.startColumn -= 1;
                } else if (key === 'j') {
                    this.selection.startRow += 1;        
                } else if (key === 'k') {
                    this.selection.startRow -= 1;
                } else if (key === 'l') {
                    this.selection.startColumn += 1;        
                }
            } else {
                if (key === 'h') {
                    this.selection.endColumn -= 1;
                } else if (key === 'j') {
                    this.selection.endRow += 1;        
                } else if (key === 'k') {
                    this.selection.endRow -= 1;
                } else if (key === 'l') {
                    this.selection.endColumn += 1;        
                }
            }
            this.updateSelection();
        }
    }

    updateSelection() {
        if (!this.endSelection) {
            if (this.selection.startColumn > this.selection.endColumn) {
                this.selection.endColumn = this.selection.startColumn;
            }
            if (this.selection.startRow > this.selection.endRow) {
                this.selection.endRow = this.selection.startRow;                
            }
        } else {
            if (this.selection.startColumn > this.selection.endColumn) {
                this.selection.startColumn = this.selection.endColumn;
            }
            if (this.selection.startRow > this.selection.endRow) {
                this.selection.startRow = this.selection.endRow;                
            }
        }
        console.log('SELECTING', this.selection);
        const rowLength = this.t.cols;
        const selectionLength = rowLength*(this.selection.endRow - this.selection.startRow) + this.selection.endColumn - this.selection.startColumn + 1;
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
            }
            this.isActive = true;
            this.t.blur();
        }
    }

    stop() {
        if (this.isActive) {
            this.isActive = false;
        }
    }

}