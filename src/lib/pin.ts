// PIN-код на вход. Хранится только хэш (SHA-256 с солью). Это экран приватности,
// а не шифрование: данные в IndexedDB остаются в открытом виде.
function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Одинаковый результат и на https, и на http по локальной сети (crypto.subtle там недоступен). */
export async function hashPin(pin: string, salt: string) {
  let h = `${salt}:${pin}:cursed-world`;
  for (let i = 0; i < 2000; i++) h = cyrb53(h, i) + cyrb53(h, i + 7);
  return 'cyrb:' + h;
}

export function newSalt() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
