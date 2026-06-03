import { vi } from "vitest";

export const App = {
    exitApp: vi.fn(() => Promise.resolve()),
    getInfo: vi.fn(() =>
        Promise.resolve({
            name: "Terminal7",
            id: "com.terminal7",
            build: "1",
            version: "1.0.0",
        }),
    ),
    getState: vi.fn(() => Promise.resolve({ isActive: true })),
    getLaunchUrl: vi.fn(() => Promise.resolve({ url: "" })),
    minimizeApp: vi.fn(() => Promise.resolve()),
    getAppLanguage: vi.fn(() => Promise.resolve({ value: "en" })),
    toggleBackButtonHandler: vi.fn(() => Promise.resolve()),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    removeAllListeners: vi.fn(() => Promise.resolve()),
};
