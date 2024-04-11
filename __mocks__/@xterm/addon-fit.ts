import { vi } from "vitest"

export class FitAddon {
    constructor() {
        vi.fn()
    }
    activate = vi.fn()
    deactivate = vi.fn()
    fit = vi.fn()
}
