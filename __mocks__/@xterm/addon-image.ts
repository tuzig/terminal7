import { vi } from "vitest"

export class ImageAddon {
    constructor() {
        vi.fn()
    }
    activate = vi.fn()
    deactivate = vi.fn()
}

