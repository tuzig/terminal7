import { vi } from "vitest";

export const Directory = {
    Documents: "DOCUMENTS",
    Data: "DATA",
    Library: "LIBRARY",
    Cache: "CACHE",
    External: "EXTERNAL",
    ExternalStorage: "EXTERNAL_STORAGE",
    ExternalCache: "EXTERNAL_CACHE",
    LibraryNoCloud: "LIBRARY_NO_CLOUD",
    Temporary: "TEMPORARY",
};

export const Encoding = {
    UTF8: "utf8",
    ASCII: "ascii",
    UTF16: "utf16",
};

export const Filesystem = {
    checkPermissions: vi.fn(() =>
        Promise.resolve({ publicStorage: "granted" }),
    ),
    requestPermissions: vi.fn(() =>
        Promise.resolve({ publicStorage: "granted" }),
    ),
    readFile: vi.fn(() => Promise.resolve({ data: "" })),
    readFileInChunks: vi.fn(() => Promise.resolve("")),
    writeFile: vi.fn(() => Promise.resolve({ uri: "" })),
    appendFile: vi.fn(() => Promise.resolve()),
    deleteFile: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
    rmdir: vi.fn(() => Promise.resolve()),
    readdir: vi.fn(() => Promise.resolve({ files: [] })),
    getUri: vi.fn(() => Promise.resolve({ uri: "" })),
    stat: vi.fn(() =>
        Promise.resolve({
            name: "",
            type: "file",
            size: 0,
            mtime: 0,
            uri: "",
        }),
    ),
    rename: vi.fn(() => Promise.resolve()),
    copy: vi.fn(() => Promise.resolve({ uri: "" })),
    downloadFile: vi.fn(() => Promise.resolve({ path: "", blob: undefined })),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    removeAllListeners: vi.fn(() => Promise.resolve()),
};
