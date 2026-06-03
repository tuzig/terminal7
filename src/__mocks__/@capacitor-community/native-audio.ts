import { vi } from "vitest";

export const NativeAudio = {
    configure: vi.fn(() => Promise.resolve()),
    preload: vi.fn(() => Promise.resolve()),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    loop: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    unload: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(() => Promise.resolve()),
    getCurrentTime: vi.fn(() => Promise.resolve({ currentTime: 0 })),
    getDuration: vi.fn(() => Promise.resolve({ duration: 0 })),
    isPlaying: vi.fn(() => Promise.resolve({ isPlaying: false })),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
};
