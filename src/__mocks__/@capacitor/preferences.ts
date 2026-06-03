import { vi } from "vitest";

export const Preferences = {
    configure: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    keys: vi.fn(() => Promise.resolve({ keys: [] })),
    migrate: vi.fn(() => Promise.resolve({ migrated: [], existing: [] })),
    removeOld: vi.fn(() => Promise.resolve()),
};
