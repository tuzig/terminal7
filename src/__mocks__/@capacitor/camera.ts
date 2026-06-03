import { vi } from "vitest";

export const CameraSource = {
    Prompt: "PROMPT",
    Camera: "CAMERA",
    Photos: "PHOTOS",
};
export const CameraDirection = { Rear: "REAR", Front: "FRONT" };
export const CameraResultType = {
    Uri: "uri",
    Base64: "base64",
    DataUrl: "dataUrl",
};
export const MediaType = { Photo: 0, Video: 1 };
export const MediaTypeSelection = { Photo: 0, Video: 1, All: 2 };
export const EncodingType = { JPEG: 0, PNG: 1 };
export const CameraErrorCode = {
    CameraPermissionDenied: "OS-PLUG-CAMR-0003",
    GalleryPermissionDenied: "OS-PLUG-CAMR-0005",
    NoCameraAvailable: "OS-PLUG-CAMR-0007",
    TakePhotoCancelled: "OS-PLUG-CAMR-0006",
    TakePhotoFailed: "OS-PLUG-CAMR-0010",
};

export const Camera = {
    // v8 new methods
    takePhoto: vi.fn(() =>
        Promise.resolve({
            type: MediaType.Photo,
            thumbnail: "",
            saved: false,
            webPath: "",
        }),
    ),
    recordVideo: vi.fn(() =>
        Promise.resolve({
            type: MediaType.Video,
            thumbnail: "",
            saved: false,
            webPath: "",
        }),
    ),
    playVideo: vi.fn(() => Promise.resolve()),
    chooseFromGallery: vi.fn(() => Promise.resolve({ results: [] })),
    editPhoto: vi.fn(() => Promise.resolve({ outputImage: "" })),
    editURIPhoto: vi.fn(() =>
        Promise.resolve({
            type: MediaType.Photo,
            thumbnail: "",
            saved: false,
            webPath: "",
        }),
    ),
    // v8 continued
    pickLimitedLibraryPhotos: vi.fn(() => Promise.resolve({ photos: [] })),
    getLimitedLibraryPhotos: vi.fn(() => Promise.resolve({ photos: [] })),
    checkPermissions: vi.fn(() =>
        Promise.resolve({ camera: "granted", photos: "granted" }),
    ),
    requestPermissions: vi.fn(() =>
        Promise.resolve({ camera: "granted", photos: "granted" }),
    ),
    // deprecated v7 methods (still present in v8)
    getPhoto: vi.fn(() =>
        Promise.resolve({
            base64String: "",
            dataUrl: "",
            path: "",
            webPath: "",
            format: "jpeg",
            saved: false,
        }),
    ),
    pickImages: vi.fn(() => Promise.resolve({ photos: [] })),
};
