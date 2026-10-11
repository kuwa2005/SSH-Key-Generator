/**
 * Client-side SSH key generation via Web Crypto.
 * Outputs OpenSSH public + private key formats. Nothing is sent to a server.
 */

const enc = new TextEncoder();

const ALGO_OPTIONS = {
  ed25519: {
    label: "Ed25519",
    fileBase: "id_ed25519",
    bits: null,
  },
  rsa: {
    label: "RSA",
    fileBase: "id_rsa",
    bits: [2048, 3072, 4096],
    defaultBits: 3072,
  },
  ecdsa: {
    label: "ECDSA",
    fileBase: "id_ecdsa",
    bits: [256, 384, 521],
    defaultBits: 256,
    curveMap: {
      256: "P-256",
      384: "P-384",
      521: "P-521",
    },
    sshCurve: {
      256: "nistp256",
      384: "nistp384",
      521: "nistp521",
    },
  },
};

const algoEl = document.getElementById("algo");
const bitsEl = document.getElementById("bits");
const bitsField = document.getElementById("bits-field");
const commentEl = document.getElementById("comment");
const usernameEl = document.getElementById("username");
const hostnameEl = document.getElementById("hostname");
const generateBtn = document.getElementById("generate");
const clearBtn = document.getElementById("clear");
const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const publicKeyEl = document.getElementById("public-key");
const privateKeyEl = document.getElementById("private-key");
const pubNameEl = document.getElementById("pub-name");
const privNameEl = document.getElementById("priv-name");
const helpNoteEl = document.getElementById("help-target-note");
const configSnippetEl = document.getElementById("config-snippet");

function currentFileBase() {
  return ALGO_OPTIONS[algoEl.value]?.fileBase || "id_ed25519";
}

function currentUser() {
  const fromField = (usernameEl.value || "").trim();
  if (fromField) return fromField;

  const hostRaw = (hostnameEl.value || "").trim();
  if (hostRaw.includes("@")) return hostRaw.split("@")[0] || "user";

  const comment = (commentEl.value || "").trim();
  if (comment.includes("@")) return comment.split("@")[0] || "user";
  return "user";
}

function currentHostName() {
  const raw = (hostnameEl.value || "").trim();
  if (!raw) return "host";
  return raw.includes("@") ? raw.split("@").pop() : raw;
}

/** user@host for help commands (placeholders when empty). */
function currentTarget() {
  const user = currentUser();
  const host = currentHostName();
  const hasUser = !!(usernameEl.value || "").trim() || (hostnameEl.value || "").includes("@");
  const hasHost = !!(hostnameEl.value || "").trim();
  if (!hasUser && !hasHost) return "user@host";
  return `${hasUser ? user : "user"}@${hasHost ? host : "host"}`;
}

function currentAlias() {
  const host = currentHostName();
  if (!(hostnameEl.value || "").trim()) return "myserver";
  const short = host.split(".")[0] || "myserver";
  return short.replace(/[^A-Za-z0-9_-]/g, "-") || "myserver";
}

function refreshHelpCommands() {
  const fileBase = currentFileBase();
  const target = currentTarget();
  const alias = currentAlias();
  const user = (usernameEl.value || "").trim() || currentUser();
  const hostName = (hostnameEl.value || "").trim()
    ? currentHostName()
    : "example.invalid";

  document.querySelectorAll("[data-filebase]").forEach((el) => {
    el.textContent = fileBase;
  });
  document.querySelectorAll("[data-target]").forEach((el) => {
    el.textContent = target;
  });
  document.querySelectorAll("[data-alias]").forEach((el) => {
    el.textContent = alias;
  });

  if (helpNoteEl) {
    const filled =
      !!(usernameEl.value || "").trim() || !!(hostnameEl.value || "").trim();
    helpNoteEl.textContent = filled
      ? `接続先は「${target}」、鍵ファイル名は「${fileBase}」で表示しています。`
      : "上の「ユーザー名」「ホスト名」欄を入れると、下のコマンド例の接続先が差し替わります。";
  }

  if (configSnippetEl) {
    const configUser = (usernameEl.value || "").trim() || "yourname";
    configSnippetEl.textContent = `cat >> ~/.ssh/config <<'EOF'
Host ${alias}
  HostName ${hostName}
  User ${configUser}
  Port 22
  IdentityFile ~/.ssh/${fileBase}
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config`;
  }
}

function setStatus(msg, kind = "") {
  statusEl.textContent = msg;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

function b64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64s = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function sshString(data) {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return concat(u32(bytes.length), bytes);
}

function sshMpint(bytes) {
  let v = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Strip leading zeros, but keep one zero if number is zero
  let i = 0;
  while (i < v.length - 1 && v[i] === 0) i++;
  v = v.subarray(i);
  if (v.length && v[0] & 0x80) {
    v = concat(new Uint8Array([0]), v);
  }
  return sshString(v);
}

function wrapPem(label, bytes) {
  const body = b64(bytes).replace(/(.{70})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

function randomCheckInt() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return new DataView(b.buffer).getUint32(0);
}

function buildOpenSshPrivate(publicBlob, privateInner) {
  const check = randomCheckInt();
  const checkBytes = u32(check);
  let priv = concat(checkBytes, checkBytes, privateInner);
  // Pad to block size 8 with 1..n
  const padLen = (8 - (priv.length % 8)) % 8;
  if (padLen) {
    const pad = new Uint8Array(padLen);
    for (let i = 0; i < padLen; i++) pad[i] = i + 1;
    priv = concat(priv, pad);
  }

  const body = concat(
    enc.encode("openssh-key-v1\0"),
    sshString("none"),
    sshString("none"),
    sshString(new Uint8Array(0)),
    u32(1),
    sshString(publicBlob),
    sshString(priv)
  );
  return wrapPem("OPENSSH PRIVATE KEY", body);
}

function publicLine(algName, publicBlob, comment) {
  const c = comment.trim();
  return `${algName} ${b64(publicBlob)}${c ? ` ${c}` : ""}`;
}

async function generateEd25519(comment) {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const seed = b64urlToBytes(privJwk.d);
  const pub = b64urlToBytes(privJwk.x);
  if (seed.length !== 32 || pub.length !== 32) {
    throw new Error("Ed25519 鍵の長さが不正です");
  }
  const pubBlob = concat(sshString("ssh-ed25519"), sshString(pub));
  const privInner = concat(
    sshString("ssh-ed25519"),
    sshString(pub),
    sshString(concat(seed, pub)),
    sshString(comment)
  );
  return {
    publicKey: publicLine("ssh-ed25519", pubBlob, comment),
    privateKey: buildOpenSshPrivate(pubBlob, privInner),
    fileBase: "id_ed25519",
  };
}

async function generateRsa(bits, comment) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: bits,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const n = b64urlToBytes(jwk.n);
  const e = b64urlToBytes(jwk.e);
  const d = b64urlToBytes(jwk.d);
  const p = b64urlToBytes(jwk.p);
  const q = b64urlToBytes(jwk.q);
  const iqmp = b64urlToBytes(jwk.qi);
  const pubBlob = concat(sshString("ssh-rsa"), sshMpint(e), sshMpint(n));
  const privInner = concat(
    sshString("ssh-rsa"),
    sshMpint(n),
    sshMpint(e),
    sshMpint(d),
    sshMpint(iqmp),
    sshMpint(p),
    sshMpint(q),
    sshString(comment)
  );
  return {
    publicKey: publicLine("ssh-rsa", pubBlob, comment),
    privateKey: buildOpenSshPrivate(pubBlob, privInner),
    fileBase: "id_rsa",
  };
}

function uncompressedPoint(x, y) {
  return concat(new Uint8Array([0x04]), x, y);
}

async function generateEcdsa(bits, comment) {
  const meta = ALGO_OPTIONS.ecdsa;
  const namedCurve = meta.curveMap[bits];
  const sshCurve = meta.sshCurve[bits];
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const x = b64urlToBytes(jwk.x);
  const y = b64urlToBytes(jwk.y);
  const d = b64urlToBytes(jwk.d);
  const point = uncompressedPoint(x, y);
  const keyType = `ecdsa-sha2-${sshCurve}`;
  const pubBlob = concat(sshString(keyType), sshString(sshCurve), sshString(point));
  const privInner = concat(
    sshString(keyType),
    sshString(sshCurve),
    sshString(point),
    sshMpint(d),
    sshString(comment)
  );
  return {
    publicKey: publicLine(keyType, pubBlob, comment),
    privateKey: buildOpenSshPrivate(pubBlob, privInner),
    fileBase: "id_ecdsa",
  };
}

function updateBitsOptions() {
  const algo = algoEl.value;
  const conf = ALGO_OPTIONS[algo];
  bitsEl.innerHTML = "";
  if (!conf.bits) {
    bitsField.hidden = true;
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "固定";
    bitsEl.appendChild(opt);
    refreshHelpCommands();
    return;
  }
  bitsField.hidden = false;
  for (const b of conf.bits) {
    const opt = document.createElement("option");
    opt.value = String(b);
    opt.textContent =
      algo === "ecdsa" ? `NIST P-${b}` : `${b} bit`;
    if (b === conf.defaultBits) opt.selected = true;
    bitsEl.appendChild(opt);
  }
  refreshHelpCommands();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function clearKeys() {
  publicKeyEl.value = "";
  privateKeyEl.value = "";
  outputEl.hidden = true;
  outputEl.removeAttribute("data-reveal");
  clearBtn.disabled = true;
  setStatus("クリアしました。メモリ上の鍵表示を消しました。", "ok");
}

async function onGenerate() {
  const algo = algoEl.value;
  const comment = commentEl.value.trim() || "ssh-key-generator";
  generateBtn.disabled = true;
  setStatus("生成中…");
  try {
    let result;
    if (algo === "ed25519") {
      if (!crypto.subtle || typeof crypto.subtle.generateKey !== "function") {
        throw new Error("このブラウザは Web Crypto に対応していません");
      }
      result = await generateEd25519(comment);
    } else if (algo === "rsa") {
      const bits = Number(bitsEl.value);
      setStatus(`RSA ${bits} bit を生成中…（少し時間がかかることがあります）`);
      result = await generateRsa(bits, comment);
    } else if (algo === "ecdsa") {
      const bits = Number(bitsEl.value);
      result = await generateEcdsa(bits, comment);
    } else {
      throw new Error("未対応のアルゴリズムです");
    }

    publicKeyEl.value = result.publicKey.endsWith("\n")
      ? result.publicKey
      : `${result.publicKey}\n`;
    privateKeyEl.value = result.privateKey;
    pubNameEl.textContent = `${result.fileBase}.pub`;
    privNameEl.textContent = result.fileBase;
    outputEl.hidden = false;
    outputEl.dataset.reveal = "1";
    clearBtn.disabled = false;
    setStatus("生成完了。このタブを閉じると表示は消えます。", "ok");
  } catch (err) {
    console.error(err);
    const msg =
      err && err.name === "NotSupportedError"
        ? "このブラウザは選択したアルゴリズムに対応していません。Ed25519 か RSA を試してください。"
        : `生成に失敗しました: ${err.message || err}`;
    setStatus(msg, "error");
  } finally {
    generateBtn.disabled = false;
  }
}

document.getElementById("copy-pub").addEventListener("click", async () => {
  try {
    await copyText(publicKeyEl.value);
    setStatus("公開鍵をコピーしました。", "ok");
  } catch {
    setStatus("コピーに失敗しました。手動で選択してください。", "error");
  }
});

document.getElementById("copy-priv").addEventListener("click", async () => {
  try {
    await copyText(privateKeyEl.value);
    setStatus("秘密鍵をコピーしました。手元でのみ扱ってください。", "ok");
  } catch {
    setStatus("コピーに失敗しました。手動で選択してください。", "error");
  }
});

document.getElementById("dl-pub").addEventListener("click", () => {
  downloadText(pubNameEl.textContent, publicKeyEl.value);
  setStatus(`${pubNameEl.textContent} をダウンロードしました。`, "ok");
});

document.getElementById("dl-priv").addEventListener("click", () => {
  downloadText(privNameEl.textContent, privateKeyEl.value);
  setStatus(`${privNameEl.textContent} をダウンロードしました。`, "ok");
});

const THEME_COOKIE = "skg-theme";
const themeToggle = document.getElementById("theme-toggle");

function readThemeCookie() {
  const m = document.cookie.match(/(?:^|;\s*)skg-theme=(dark|light)/);
  return m ? m[1] : null;
}

function writeThemeCookie(theme) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  writeThemeCookie(next);
  if (themeToggle) {
    const toLight = next === "dark";
    themeToggle.setAttribute(
      "aria-label",
      toLight ? "ライトモードに切り替え" : "ダークモードに切り替え"
    );
    themeToggle.title = toLight ? "ライトモード（消灯中）" : "ダークモード（点灯中）";
  }
}

function initTheme() {
  applyTheme(readThemeCookie() || document.documentElement.dataset.theme || "dark");
  themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  });
}

generateBtn.addEventListener("click", onGenerate);
clearBtn.addEventListener("click", clearKeys);
algoEl.addEventListener("change", updateBitsOptions);
usernameEl.addEventListener("input", refreshHelpCommands);
hostnameEl.addEventListener("input", refreshHelpCommands);
commentEl.addEventListener("input", refreshHelpCommands);

initTheme();
updateBitsOptions();
refreshHelpCommands();
