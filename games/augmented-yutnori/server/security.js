import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_MIN = 4;
const PASSWORD_MAX = 64;

export function normalizePassword(value) {
  const password = String(value ?? "");
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw Object.assign(new Error(`방 비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`), { code: "INVALID_ROOM_PASSWORD" });
  }
  return password;
}

export function hashPassword(value) {
  const password = normalizePassword(value);
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32);
  return { algorithm: "scrypt", salt: salt.toString("base64url"), hash: digest.toString("base64url") };
}

export function verifyPassword(value, record) {
  if (!record?.salt || !record?.hash || record.algorithm !== "scrypt") return false;
  try {
    const password = String(value ?? "");
    const expected = Buffer.from(record.hash, "base64url");
    const actual = scryptSync(password, Buffer.from(record.salt, "base64url"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export class FixedWindowRateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.records = new Map();
  }

  consume(key, { limit, windowMs }) {
    const now = this.now();
    const current = this.records.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      this.records.set(key, { startedAt: now, count: 1 });
      return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
    }
    current.count += 1;
    if (current.count <= limit) return { ok: true, remaining: limit - current.count, retryAfterMs: 0 };
    return { ok: false, remaining: 0, retryAfterMs: Math.max(1, windowMs - (now - current.startedAt)) };
  }

  prune(maxAgeMs = 10 * 60_000) {
    const threshold = this.now() - maxAgeMs;
    for (const [key, record] of this.records) if (record.startedAt < threshold) this.records.delete(key);
  }
}
