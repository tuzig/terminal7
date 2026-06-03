import { vi } from "vitest";

export const Network = {
    getStatus: vi.fn(() =>
        Promise.resolve({ connected: true, connectionType: "wifi" }),
    ),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    removeAllListeners: vi.fn(() => Promise.resolve()),
};
