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
const OUT_NAME = "main-ui-light.png";
const PAD_X = 32;
const PAD_Y = 24;

const REDACTED_PRIVATE = `-----BEGIN OPENSSH PRIVATE KEY-----
[redacted for documentation — generate your own in the app]
-----END OPENSSH PRIVATE KEY-----
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 2600 },
    deviceScaleFactor: 2,
  });

  await page.goto(baseURL, { waitUntil: "networkidle" });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.cookie = "skg-theme=light; path=/; max-age=31536000; SameSite=Lax";
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-label", "ダークモードに切り替え");
      btn.title = "ダークモード（点灯中）";
    }
  });

  await page.fill("#comment", "example@example.com");
  await page.fill("#username", "example");
  await page.fill("#hostname", "example.com");
  await page.fill("#passphrase", "example");
  await page.selectOption("#algo", "ed25519");

  await page.click("#generate");
  await page.waitForSelector("#output:not([hidden])");
  await page.waitForFunction(() => {
    const pub = document.getElementById("public-key")?.value || "";
    const priv = document.getElementById("private-key")?.value || "";
    return (
      pub.startsWith("ssh-ed25519 ") &&
      priv.includes("BEGIN OPENSSH PRIVATE KEY")
    );
  });

  await page.evaluate((text) => {
    const el = document.getElementById("private-key");
    if (el) el.value = text;
  }, REDACTED_PRIVATE);

  await page.evaluate(() => {
    document.querySelectorAll(".guide, .footer").forEach((el) => {
      el.style.display = "none";
    });
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const box = await page.locator(".page").boundingBox();
  if (!box) throw new Error(".page not found");

  const clip = {
    x: Math.max(0, box.x - PAD_X),
    y: Math.max(0, box.y - PAD_Y),
    width: box.width + PAD_X * 2,
    height: box.height + PAD_Y * 2,
  };

  await page.setViewportSize({
    width: Math.ceil(clip.x + clip.width + 16),
    height: Math.ceil(clip.y + clip.height + 16),
  });
  await page.waitForTimeout(100);

  // Re-measure after viewport change (centering may shift)
  const box2 = await page.locator(".page").boundingBox();
  const clip2 = {
    x: Math.max(0, box2.x - PAD_X),
    y: Math.max(0, box2.y - PAD_Y),
    width: box2.width + PAD_X * 2,
    height: box2.height + PAD_Y * 2,
  };

  const outPath = path.join(outDir, OUT_NAME);
  await page.screenshot({ path: outPath, clip: clip2 });
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
