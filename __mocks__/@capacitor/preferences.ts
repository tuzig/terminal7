
import { vi } from 'vitest';

const storage = new Map<string, string>();

export const Preferences = {
  configure: vi.fn(),
  get: vi.fn(async (options: { key: string }): Promise<{ value: string | null }> => {
    return { value: storage.get(options.key) || null };
  }),
  set: vi.fn(async (options: { key: string; value: string }): Promise<void> => {
    storage.set(options.key, options.value);
  }),
  remove: vi.fn(async (options: { key: string }): Promise<void> => {
    storage.delete(options.key);
  }),
  keys: vi.fn(async (): Promise<{ keys: string[] }> => {
    return { keys: Array.from(storage.keys()) };
  }),
  clear: vi.fn(async (): Promise<void> => {
    storage.clear();
  }),
  migrate: vi.fn(async (): Promise<{
    migrated: string[];
    existing: string[];
  }> => {
    return { migrated: [], existing: [] };
  }),
  usePreferences: vi.fn(),
};
