#!/usr/bin/env node
// Hand-run visual check against a throwaway Jellyfin with fake data. Not used in CI.
//
//   npm i --no-save playwright-core
//   JELLYFIN_URL=http://localhost:8096 JC_ADMIN_USER=alice JC_ADMIN_PASS=... \
//   JC_GUEST_USER=bob JC_GUEST_PASS=... CHROMIUM_PATH=/path/to/chrome node scripts/screenshots.mjs [outDir]
//
// If the library has a movie, it plays it first (JC_SEEK_SECONDS picks the frame). Takes Violet and Glass, docked and floating, own messages left and right, on desktop, phone portrait and phone landscape.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = (process.env.JELLYFIN_URL || "http://localhost:8096").replace(/\/+$/, "");
const out = process.argv[2] || "screenshots";
const accounts = {
  admin: { user: process.env.JC_ADMIN_USER, pass: process.env.JC_ADMIN_PASS, device: "jc-shot-admin" },
  guest: { user: process.env.JC_GUEST_USER, pass: process.env.JC_GUEST_PASS, device: "jc-shot-guest" }
};
const viewports = {
  desktop: { width: 1280, height: 800 },
  "phone-portrait": { width: 390, height: 844 },
  "phone-landscape": { width: 844, height: 390 }
};

function header(account, token) {
  return `MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="${account.device}", Version="1"` + (token ? `, Token="${token}"` : "");
}

async function call(account, token, method, path, body) {
  const response = await fetch(base + path, { method, headers: { Authorization: header(account, token), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function login(account) {
  const result = await call(account, null, "POST", "/Users/AuthenticateByName", { Username: account.user, Pw: account.pass });
  return { token: result.AccessToken, userId: result.User.Id, serverId: result.ServerId };
}

async function setPrefs(session, prefs) {
  const path = `/DisplayPreferences/jellychat?userId=${session.userId}&client=jellychat`;
  const current = await call(accounts.admin, session.token, "GET", path);
  current.CustomPrefs = { ...current.CustomPrefs, "jellychat.prefs.v3": JSON.stringify(prefs) };
  await call(accounts.admin, session.token, "POST", path, current);
}

for (const [name, account] of Object.entries(accounts)) {
  if (!account.user || !account.pass) throw new Error(`Set JC_${name.toUpperCase()}_USER and JC_${name.toUpperCase()}_PASS.`);
}

await mkdir(out, { recursive: true });
const admin = await login(accounts.admin);
const guest = await login(accounts.guest);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });

async function say(text) {
  await call(accounts.guest, guest.token, "POST", "/JellyChat/Events", { type: "chat.message", text, clientEventId: "shot" + Math.random().toString(16).slice(2) });
}

async function shoot(label, viewport, prefs) {
  await setPrefs(admin, prefs);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(({ url, serverId, userId, token, device }) => {
    localStorage.setItem("_deviceId2", device);
    localStorage.setItem("jellyfin_credentials", JSON.stringify({ Servers: [{ ManualAddress: url, Id: serverId, UserId: userId, AccessToken: token, DateLastAccessed: Date.now(), LastConnectionMode: 2 }] }));
  }, { url: base, serverId: admin.serverId, userId: admin.userId, token: admin.token, device: accounts.admin.device });
  const page = await context.newPage();
  await page.goto(base + "/web/#/home");
  await page.waitForFunction(() => window.JellyChat && window.ApiClient?.accessToken());
  await page.evaluate(async () => {
    const client = window.ApiClient;
    const post = (path, body) => client.ajax({ type: "POST", url: client.getUrl(path), data: JSON.stringify(body), contentType: "application/json" });
    const groups = await client.getJSON(client.getUrl("SyncPlay/List"));
    await (groups.length ? post("SyncPlay/Join", { GroupId: groups[0].GroupId }) : post("SyncPlay/New", { GroupName: "Movie night" }));
  });
  await page.waitForFunction(() => window.JellyChat.debug().room?.inGroup, null, { timeout: 15000 });
  const movie = (await call(accounts.admin, admin.token, "GET", `/Items?Recursive=true&IncludeItemTypes=Movie&Limit=1&userId=${admin.userId}`)).Items[0];
  if (movie) {
    await call(accounts.admin, admin.token, "POST", "/SyncPlay/SetNewQueue", { PlayingQueue: [movie.Id], PlayingItemPosition: 0, StartPositionTicks: Number(process.env.JC_SEEK_SECONDS || 0) * 10000000 });
    await page.waitForSelector("video", { timeout: 30000 });
    await page.waitForTimeout(4000);
    await call(accounts.admin, admin.token, "POST", "/SyncPlay/Pause");
    await page.waitForTimeout(2500);
  }
  const list = await call(accounts.admin, admin.token, "GET", "/SyncPlay/List");
  await call(accounts.guest, guest.token, "POST", "/SyncPlay/Join", { GroupId: list[0].GroupId }).catch(() => undefined);
  await say("everyone ready? starting in a sec");
  await say("i brought snacks");
  await call(accounts.admin, admin.token, "POST", "/JellyChat/Events", { type: "chat.message", text: "ready! press play whenever", clientEventId: "shot" + Math.random().toString(16).slice(2) });
  await say("ok pressing play now");
  if (movie) await page.waitForTimeout(5000);
  if (movie) {
    await page.mouse.move(400, 300);
    await page.keyboard.press("c");
  } else {
    await page.waitForSelector(".jc-hbtn", { timeout: 10000 });
    await page.click(".jc-hbtn");
  }
  await page.waitForSelector(".jc-m");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${label}.png` });
  await call(accounts.guest, guest.token, "POST", "/SyncPlay/Leave").catch(() => undefined);
  await call(accounts.admin, admin.token, "POST", "/SyncPlay/Leave").catch(() => undefined);
  await context.close();
}

try {
  for (const theme of ["violet", "glass"]) {
    for (const layout of ["docked", "floating"]) {
      for (const messageSide of ["left", "right"]) {
        await shoot(`desktop-${theme}-${layout}-mine-${messageSide}`, viewports.desktop, { theme, layout, messageSide });
      }
    }
    await shoot(`phone-portrait-${theme}`, viewports["phone-portrait"], { theme, layout: "docked" });
    await shoot(`phone-landscape-${theme}`, viewports["phone-landscape"], { theme, layout: "docked" });
  }
} finally {
  await browser.close();
}
console.log("Saved screenshots to", out);
