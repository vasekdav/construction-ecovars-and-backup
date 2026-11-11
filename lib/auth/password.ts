import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no extra dependency).
 * Parameters follow the OWASP Password Storage Cheat Sheet equivalent set
 * N=2^15, r=8, p=3. Stored format: scrypt$N$r$p$<salt b64>$<hash b64>
 */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LEN = 64;
const SALT_LEN = 16;
const MAXMEM = 128 * N * R * 2;

export { MIN_PASSWORD_LENGTH } from "./password-policy";

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });
  return timingSafeEqual(actual, expected);
}
