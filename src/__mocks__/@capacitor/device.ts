import { vi } from "vitest";

export const Device = {
    getId: vi.fn(() => Promise.resolve({ identifier: "test-uid" })),
    getInfo: vi.fn(() =>
        Promise.resolve({
            name: "Test Device",
            model: "test",
            platform: "web" as const,
            operatingSystem: "web" as const,
            osVersion: "1.0",
            manufacturer: "test",
            isVirtual: true,
            webViewVersion: "1.0",
        }),
    ),
    getBatteryInfo: vi.fn(() =>
        Promise.resolve({ batteryLevel: 1, isCharging: true }),
    ),
    getLanguageCode: vi.fn(() => Promise.resolve({ value: "en" })),
    getLanguageTag: vi.fn(() => Promise.resolve({ value: "en-US" })),
};
