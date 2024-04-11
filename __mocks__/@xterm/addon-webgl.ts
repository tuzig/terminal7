import { vi } from 'vitest'

export class WebglAddon {
    constructor() {
        vi.fn()
    }
    activate = vi.fn()
    deactivate = vi.fn()
    onContextLoss = vi.fn()
}
