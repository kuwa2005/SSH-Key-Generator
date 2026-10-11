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
    viewport: { width: 1100, height: 2200 },
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

  // Redact private key bytes; keep the post-generate layout (both panes visible)
  await page.evaluate((text) => {
    const el = document.getElementById("private-key");
    if (el) el.value = text;
  }, REDACTED_PRIVATE);

  // Hide long help so the shot is the main generate result only
  await page.evaluate(() => {
    document.querySelectorAll(".guide, .footer").forEach((el) => {
      el.style.display = "none";
    });
  });

  await page.locator("#output .key-block.private").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);

  const outPath = path.join(outDir, "main-light-generated.png");
  await page.locator(".page").screenshot({ path: outPath });
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
