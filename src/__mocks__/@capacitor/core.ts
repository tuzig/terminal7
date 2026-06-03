import { vi } from "vitest";

export const Capacitor = {
    getPlatform: vi.fn(() => "web"),
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => false),
    convertFileSrc: vi.fn((filePath: string) => filePath),
    registerPlugin: vi.fn(() => ({})),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    Exceptions: {},
};
