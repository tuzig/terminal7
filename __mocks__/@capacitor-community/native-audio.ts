import { vi } from "vitest"

export const NativeAudio = {
 // Mock the methods you use from the plugin
 preload: vi.fn(),
 play: vi.fn(),
};

