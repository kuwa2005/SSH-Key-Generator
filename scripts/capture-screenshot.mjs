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
const OUT_NAME = "main-ui.png";
const PAD = 40;

const REDACTED_PRIVATE = `-----BEGIN OPENSSH PRIVATE KEY-----
[redacted for documentation — generate your own in the app]
-----END OPENSSH PRIVATE KEY-----
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 2800 },
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

  await page.evaluate((pad) => {
    document.querySelectorAll(".guide, .footer").forEach((el) => {
      el.style.display = "none";
    });

    const pageEl = document.querySelector(".page");
    const wrap = document.createElement("div");
    wrap.id = "shot-wrap";
    const bg = getComputedStyle(document.body).background;
    wrap.style.cssText = [
      `padding:${pad}px`,
      "display:block",
      "box-sizing:border-box",
      `background:${bg}`,
      "width:fit-content",
      "margin:0 auto",
    ].join(";");
    pageEl.parentNode.insertBefore(wrap, pageEl);
    wrap.appendChild(pageEl);
    pageEl.style.width = "920px";
    pageEl.style.maxWidth = "920px";
    pageEl.style.margin = "0";
  }, PAD);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const box = await page.locator("#shot-wrap").boundingBox();
  await page.setViewportSize({
    width: Math.ceil((box?.x || 0) + (box?.width || 1000) + 24),
    height: Math.ceil((box?.y || 0) + (box?.height || 2000) + 24),
  });
  await page.waitForTimeout(150);

  const outPath = path.join(outDir, OUT_NAME);
  await page.locator("#shot-wrap").screenshot({ path: outPath });
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
