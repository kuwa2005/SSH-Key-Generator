/**
 * Capture light-mode main UI after key generation.
 * Private key area is replaced with a redacted placeholder before shot
 * so documentation assets never contain real key material.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "screenshots");
const baseURL = process.env.SKG_URL || "http://127.0.0.1:8002/";

const REDACTED_PRIVATE = `-----BEGIN OPENSSH PRIVATE KEY-----
[redacted for documentation — generate your own in the app]
-----END OPENSSH PRIVATE KEY-----
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1400 },
    deviceScaleFactor: 2,
  });

  await page.goto(baseURL, { waitUntil: "networkidle" });

  // Force light mode (and cookie) for the hardcopy
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.cookie = "skg-theme=light; path=/; max-age=31536000; SameSite=Lax";
  });
  // Sync toggle labels
  await page.evaluate(() => {
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", "ダークモードに切り替え");
      btn.title = "ダークモード（点灯中）";
    }
  });

  await page.fill("#comment", "example@example.com");
  await page.fill("#username", "example");
  await page.fill("#hostname", "example.com");
  await page.selectOption("#algo", "ed25519");

  await page.click("#generate");
  await page.waitForSelector("#output:not([hidden])");
  await page.waitForFunction(() => {
    const pub = document.getElementById("public-key")?.value || "";
    return pub.startsWith("ssh-ed25519 ");
  });

  // Do not ship real private key material in documentation assets
  await page.evaluate((text) => {
    const el = document.getElementById("private-key");
    if (el) el.value = text;
  }, REDACTED_PRIVATE);

  // Main UI only (header → generated keys), not the long help sections
  const box = await page.evaluate(() => {
    const pageEl = document.querySelector(".page");
    const output = document.getElementById("output");
    if (!pageEl || !output) return null;
    const top = pageEl.getBoundingClientRect().top + window.scrollY;
    const bottom =
      output.getBoundingClientRect().bottom + window.scrollY + 16;
    const left = pageEl.getBoundingClientRect().left + window.scrollX;
    const width = pageEl.getBoundingClientRect().width;
    return {
      x: Math.max(0, left - 8),
      y: Math.max(0, top - 8),
      width: width + 16,
      height: bottom - top + 8,
    };
  });

  const outPath = path.join(outDir, "main-light-generated.png");
  if (!box) {
    await page.locator(".page").screenshot({ path: outPath });
  } else {
    await page.screenshot({ path: outPath, clip: box });
  }
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
