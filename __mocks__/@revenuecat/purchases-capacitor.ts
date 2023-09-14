import { vi } from "vitest"

export const configure = vi.fn().mockResolvedValue(undefined);
export const setMockWebResults = vi.fn().mockResolvedValue(undefined);
export const getOfferings = vi.fn().mockResolvedValue({ offerings: [] });
export const getProducts = vi.fn().mockResolvedValue({ products: [] });
// ...mock other methods as needed
