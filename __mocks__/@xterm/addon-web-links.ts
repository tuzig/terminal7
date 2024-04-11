import { vi } from "vitest"
export class WebLinksAddon {
    constructor() {
        vi.fn()
    }
    activate = vi.fn()
    deactivate = vi.fn()
}
