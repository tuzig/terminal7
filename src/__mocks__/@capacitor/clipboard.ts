import { vi } from "vitest";

export const Clipboard = {
    write: vi.fn(() => Promise.resolve()),
    read: vi.fn(() => Promise.resolve({ value: "", type: "text/plain" })),
};
