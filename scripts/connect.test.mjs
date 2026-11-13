// Run with: node --test scripts/connect.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { apiBase, DEFAULT_API, keyLink, safeVerifyUrl, waitForApproval } from "./connect.js";

test("the API address comes from an old link, or is the live site", () => {
  assert.equal(apiBase(""), DEFAULT_API);
  assert.equal(apiBase("https://api.aetherobserver.com/foundry-sync/abcdefghijklmnopqrst"), "https://api.aetherobserver.com");
  assert.equal(apiBase("http://localhost:8000/foundry-sync/abcdefghijklmnopqrst"), "http://localhost:8000");
  // Plain http anywhere but this computer is never used.
  assert.equal(apiBase("http://evil.example/foundry-sync/abcdefghijklmnopqrst"), DEFAULT_API);
  // Nor any other https host: the key never leaves for a site an old link names.
  assert.equal(apiBase("https://evil.example/foundry-sync/abcdefghijklmnopqrst"), DEFAULT_API);
  assert.equal(apiBase("https://aetherobserver.com.evil.example/foundry-sync/abcdefghijklmnopqrst"), DEFAULT_API);
});

test("the key link needs a real key and a story id", () => {
  const story = "11111111-2222-3333-4444-555555555555";
  assert.equal(keyLink(DEFAULT_API, `aok_${"x".repeat(43)}`, story), `${DEFAULT_API}/foundry-api/aok_${"x".repeat(43)}/stories/${story}`);
  assert.equal(keyLink(DEFAULT_API, "", story), null);
  assert.equal(keyLink(DEFAULT_API, `aok_${"x".repeat(43)}`, "../admin"), null);
  assert.equal(keyLink(DEFAULT_API, "aok_short", story), null);
});

test("only the site's own connect page is ever opened", () => {
  assert.equal(safeVerifyUrl("https://aetherobserver.com/foundry/connect?code=ABCD-EFGH"), "https://aetherobserver.com/foundry/connect?code=ABCD-EFGH");
  assert.equal(safeVerifyUrl("http://localhost:3000/foundry/connect?code=ABCD-EFGH"), "http://localhost:3000/foundry/connect?code=ABCD-EFGH");
  assert.equal(safeVerifyUrl("https://evil.example/foundry/connect?code=X"), null);
  assert.equal(safeVerifyUrl("https://aetherobserver.com.evil.example/foundry/connect"), null);
  assert.equal(safeVerifyUrl("https://aetherobserver.com/somewhere-else"), null);
  assert.equal(safeVerifyUrl("javascript:alert(1)"), null);
});

test("waiting polls until approved, skips dropped connections, and gives up when time runs out", async () => {
  let clock = 0;
  const sleep = async (ms) => void (clock += ms);
  const now = () => clock;
  const answers = [{ status: "pending" }, new Error("offline"), { status: "approved", key: "aok_x" }];
  const poll = async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  assert.deepEqual(await waitForApproval(poll, { interval: 3, expiresIn: 600, sleep, now }), { status: "approved", key: "aok_x" });
  assert.equal(clock, 9000);
  clock = 0;
  const never = await waitForApproval(async () => ({ status: "pending" }), { interval: 3, expiresIn: 9, sleep, now });
  assert.deepEqual(never, { status: "expired" });
  assert.deepEqual(await waitForApproval(async () => ({ status: "pending" }), { sleep, now, stop: () => true }), { status: "expired" });
});
