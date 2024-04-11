import { vi } from 'vitest'

export class SearchAddon {
    constructor() {
        vi.fn()
    }
    activate = vi.fn()
    deactivate = vi.fn()
    clearDecorations = vi.fn()
    findNext = vi.fn()
    findPrevious = vi.fn()
}
