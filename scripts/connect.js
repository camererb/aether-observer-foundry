// Connect to Aether Observer (2026-11-13), the parts that don't need Foundry, so they can be tested in Node.
// The module asks the site for a short code, the GM approves it on the site, and the module collects a personal key.
// With the key and the story picked for this Foundry world, the module reads maps and sends notes at
// <api>/foundry-api/<key>/stories/<story>, laid out like the old per-story link, so the rest of the module is unchanged.

export const DEFAULT_API = "https://api.aetherobserver.com";
const KEY_PATTERN = /^aok_[A-Za-z0-9_-]{20,}$/;
const STORY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's address. From an old pasted link when there is one (a test server on this computer keeps working),
 *  otherwise the live site. Only https, or http on this computer. */
export function apiBase(oldLink) {
  const match = String(oldLink ?? "").trim().match(/^(https?:\/\/[^/\s]+(?:\/[^\s]*?)?)\/foundry-sync\//);
  if (!match) return DEFAULT_API;
  const base = match[1];
  // The personal key only ever goes to the site itself or a test server on this computer, never to whatever host
  // an old pasted link names (2026-11-13 review).
  if (/^https:\/\/([a-z0-9-]+\.)*aetherobserver\.com(\/|$)/i.test(base)) return base;
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base)) return base;
  return DEFAULT_API;
}

/** The address the module reads maps from and sends notes to, or null when not connected or nothing picked. */
export function keyLink(base, key, storyId) {
  if (!KEY_PATTERN.test(String(key ?? "")) || !STORY_PATTERN.test(String(storyId ?? ""))) return null;
  return `${base}/foundry-api/${key}/stories/${storyId}`;
}

/** Only an address on the site itself is opened from Foundry: never one a server answer could point elsewhere. */
export function safeVerifyUrl(url) {
  try {
    const u = new URL(String(url));
    const local = u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (!(u.protocol === "https:" && (u.hostname === "aetherobserver.com" || u.hostname.endsWith(".aetherobserver.com"))) && !local) return null;
    if (u.pathname !== "/foundry/connect") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Asks `poll()` every `interval` seconds until the answer isn't "pending" or the time runs out.
 *  Returns the last answer, or { status: "expired" }. `stop()` lets the GM give up. */
export async function waitForApproval(poll, { interval = 3, expiresIn = 600, sleep, now = () => Date.now(), stop = () => false } = {}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const until = now() + expiresIn * 1000;
  while (now() < until && !stop()) {
    await wait(Math.max(1, interval) * 1000);
    let answer;
    try {
      answer = await poll();
    } catch {
      continue; // A dropped connection is retried on the next turn.
    }
    if (answer && answer.status !== "pending") return answer;
  }
  return { status: "expired" };
}
