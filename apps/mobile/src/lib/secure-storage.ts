import * as SecureStore from 'expo-secure-store';

// Some iOS releases refused values above about 2048 bytes, and a session can be
// larger, so a value is split across numbered keys.
const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.count`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function storedCount(key: string): Promise<number> {
  return Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
}

async function removeChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
}

/** Encrypted on the device: the Android Keystore or the iOS keychain. */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedCount(key);
    if (count === 0) return null;
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      // A half-written value is treated as missing rather than used.
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await storedCount(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(count));
    await removeChunks(key, count, previous);
  },

  async removeItem(key: string): Promise<void> {
    const previous = await storedCount(key);
    await SecureStore.deleteItemAsync(countKey(key));
    await removeChunks(key, 0, previous);
  },
};
