/**
 * Pure, dependency-free SHA-256 / HMAC-SHA-256 (§4.2 shape-module rules:
 * hermetic embed, no imports, no host globals — `Uint8Array`/`Math` are
 * language builtins).
 *
 * Why hand-rolled: the social trigger's signature verification is part of
 * the parity source (adapter + node step must agree byte-for-byte), so it
 * lives in the pack as pure code instead of reaching for a host crypto
 * module that embeds cannot carry. Correctness is pinned against RFC 4231
 * vectors AND cross-checked against `node:crypto` in the pack's unit test.
 */

// ── UTF-8 (hand-rolled: TextEncoder is a host global, not a JS builtin) ────

export function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return new Uint8Array(bytes);
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 15]!;
  }
  return out;
}

const HEX = '0123456789abcdef';

// ── SHA-256 ────────────────────────────────────────────────────────────────

/** Round constants (first 32 bits of the fractional parts of cube roots). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** Raw SHA-256 digest of `message` bytes. */
export function sha256(message: Uint8Array): Uint8Array {
  const h: [number, number, number, number, number, number, number, number] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const len = message.length;
  const bitLenHi = Math.floor(len / 0x20000000);
  const bitLenLo = (len << 3) >>> 0;
  // padded length: message + 0x80 + zeros + 8-byte length, block-aligned
  const blocks = (((len + 8) >> 6) | 0) + 1;
  const words = new Uint32Array(blocks * 16);
  for (let i = 0; i < len; i++) {
    words[i >> 2] = (words[i >> 2]! | (message[i]! << ((3 - (i & 3)) * 8))) >>> 0;
  }
  words[len >> 2] = (words[len >> 2]! | (0x80 << ((3 - (len & 3)) * 8))) >>> 0;
  words[blocks * 16 - 1] = bitLenLo;
  words[blocks * 16 - 2] = bitLenHi;

  const w = new Uint32Array(64);
  for (let b = 0; b < blocks; b++) {
    const base = b * 16;
    for (let t = 0; t < 16; t++) w[t] = words[base + t]!;
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = bb;
      bb = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + bb) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    digest[i * 4] = h[i]! >>> 24;
    digest[i * 4 + 1] = (h[i]! >>> 16) & 255;
    digest[i * 4 + 2] = (h[i]! >>> 8) & 255;
    digest[i * 4 + 3] = h[i]! & 255;
  }
  return digest;
}

// ── HMAC-SHA-256 ───────────────────────────────────────────────────────────

const BLOCK = 64;

/** HMAC-SHA-256 over `message` keyed by `secret` (RFC 2104). */
export function hmacSha256(secret: Uint8Array, message: Uint8Array): Uint8Array {
  let key = secret;
  if (key.length > BLOCK) key = sha256(key);
  const inner = new Uint8Array(BLOCK + message.length);
  const outer = new Uint8Array(BLOCK + 32);
  for (let i = 0; i < BLOCK; i++) {
    const k = i < key.length ? key[i]! : 0;
    inner[i] = k ^ 0x36;
    outer[i] = k ^ 0x5c;
  }
  inner.set(message, BLOCK);
  outer.set(sha256(inner), BLOCK);
  return sha256(outer);
}

/** Hex HMAC-SHA-256 of a raw body string under a secret string. */
export function hmacSha256Hex(secretText: string, rawBodyText: string): string {
  return toHex(hmacSha256(utf8Bytes(secretText), utf8Bytes(rawBodyText)));
}

/**
 * Constant-time hex comparison (no early exit on mismatch). Tolerates an
 * optional `sha256=` scheme prefix on the provided signature.
 */
export function verifyHexSignature(expectedHex: string, providedHeader: string): boolean {
  const provided =
    providedHeader.startsWith('sha256=') || providedHeader.startsWith('SHA256=')
      ? providedHeader.slice(7)
      : providedHeader;
  if (provided.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
