const CURRENCY = "USD";
const DOWNLOAD_EXPIRY = 3600;
const CATALOG_KEY = "catalog.json";
const SESSION_TTL = 4 * 60 * 60;

const LEGACY_PRODUCTS = [
  {
    id: "beard-20",
    name: "20 REALISTIC BEARD OVERLAYS – 4K PNG TRUE ALPHA",
    description: "20 realistic beard overlay PNGs in 4K resolution with true alpha transparency. Perfect for photo editing, digital art, retouching, and character design.",
    amount: "14.50",
    currency: "USD",
    file: "20-Realistic-Beard-Overlays-4K-PNG-True-Alpha.rar",
    images: [
      "realistic-beard-overlays-4k-png-assets.png",
      "realistic-beard-overlays-true-alpha-preview.png",
      "realistic-beard-overlay-alpha-transparency-preview.png"
    ],
    detailUrl: "20-Realistic-Beard-Overlays-4K-PNG-True-Alpha.html",
    active: true
  },
  {
    id: "eyebrows-35",
    name: "35 Realistic Eyebrows Pack",
    description: "35 high-quality eyebrow PNGs with true alpha transparency and realistic detail. Designed for digital artists, character creators, photo editing, and content creation. Compatible with Photoshop, Procreate, and other editing software.",
    amount: "13.99",
    currency: "USD",
    file: "36 Brows set width 3000 X 500 png.rar",
    images: [
      "35-realistic-eyebrows-pack-true-alpha.png",
      "35-realistic-eyebrows-true-alpha-preview.png",
      "35-realistic-eyebrows-character-preview.png"
    ],
    detailUrl: "realistic-eyebrows-asset.html",
    active: true
  },
  {
    id: "solene-skin",
    name: "Solene • Lelutka EvoX & Body Skin Templates PSD • 5 Tones Full Perm",
    description: "Lelutka EvoX and body skin templates in 5 tones, supplied as PSD files with full permissions.",
    amount: "11.00",
    currency: "USD",
    file: "Solene Lelutka EvoX Skin psd.psd",
    images: ["solene-image-1.jpg", "solene-image-2.jpg", "solene-image-3.jpg"],
    detailUrl: "Solene-Lelutka-EvoX-Body-Skin-Templates.html",
    active: true
  },
  {
    id: "evox-templates",
    name: "Lelutka EvoX Skin Templates – 5 Tones",
    description: "Lelutka EvoX skin templates in five tones for Second Life creators.",
    amount: "11.99",
    currency: "USD",
    file: "Evox Lelutka 2026.psd",
    images: ["evox-templates-image-1.jpg", "evox-templates-image-2.jpg", "evox-templates-image-3.jpg"],
    detailUrl: "Lelutka-Evox-Skin-Templates-5-Tones.html",
    active: true
  }
];

const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ADMIN_ALLOWED_ORIGINS || "https://shopliannax.com,https://pixel.shopliannax.com")
    .split(",").map(x => x.trim()).filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function requireBucket(env) {
  if (!env.produse) throw new Error("R2 bucket binding 'produse' is missing.");
}

function validProduct(p) {
  return p && typeof p.id === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(p.id)
    && typeof p.name === "string" && p.name.trim().length > 0
    && typeof p.description === "string"
    && typeof p.amount === "string" && /^\d{1,7}\.\d{2}$/.test(p.amount)
    && p.currency === CURRENCY
    && typeof p.file === "string" && p.file.length > 0
    && !p.file.includes("..") && !p.file.startsWith("/")
    && Array.isArray(p.images) && p.images.length <= 12
    && p.images.every(x => typeof x === "string" && x.length <= 500)
    && typeof p.active === "boolean";
}

async function readCatalog(env) {
  requireBucket(env);
  const object = await env.produse.get(CATALOG_KEY);
  if (!object) {
    const catalog = { version: 1, currency: CURRENCY, products: LEGACY_PRODUCTS };
    await env.produse.put(CATALOG_KEY, JSON.stringify(catalog, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
    });
    return catalog;
  }
  let catalog;
  try {
    catalog = JSON.parse(await object.text());
  } catch {
    throw new Error("catalog.json exists but contains invalid JSON. It was not overwritten.");
  }
  if (!catalog || !Array.isArray(catalog.products)) throw new Error("catalog.json has an invalid structure.");
  return catalog;
}

async function writeCatalog(env, catalog) {
  requireBucket(env);
  await env.produse.put(CATALOG_KEY, JSON.stringify(catalog, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
  });
}

function getProduct(catalog, id) {
  return catalog.products.find(p => p.id === id && p.active) || null;
}

async function paypalToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) throw new Error("PayPal credentials are not configured.");
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("PayPal authentication failed.");
  return data.access_token;
}

async function paypalRequest(env, path, options = {}) {
  const token = await paypalToken(env);
  const response = await fetch(`https://api-m.paypal.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "PayPal request failed.");
  return data;
}

async function createOrder(request, env) {
  const body = await request.json();
  const catalog = await readCatalog(env);
  const product = getProduct(catalog, body.productId);
  if (!product) return json({ error: "Invalid product." }, 400);
  const order = await paypalRequest(env, "/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: product.id,
        custom_id: product.id,
        description: product.name,
        amount: { currency_code: CURRENCY, value: product.amount }
      }]
    })
  });
  return json({ id: order.id });
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signDownload(env, productId, expires) {
  const secret = env.DOWNLOAD_SECRET || env.PAYPAL_SECRET;
  if (!secret) throw new Error("Download signing secret is missing.");
  return hmacHex(secret, `${productId}:${expires}`);
}

async function verifyOrder(request, env) {
  const body = await request.json();
  const catalog = await readCatalog(env);
  const product = getProduct(catalog, body.productId);
  if (!product || typeof body.orderID !== "string" || !/^[A-Z0-9-]+$/i.test(body.orderID)) {
    return json({ error: "Invalid order or product." }, 400);
  }
  const captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(body.orderID)}/capture`, {
    method: "POST", body: "{}"
  });
  const unit = captured.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (
    captured.status !== "COMPLETED" ||
    capture?.status !== "COMPLETED" ||
    unit?.reference_id !== product.id ||
    unit?.custom_id !== product.id ||
    capture?.amount?.currency_code !== CURRENCY ||
    capture?.amount?.value !== product.amount
  ) return json({ error: "Payment could not be verified." }, 402);

  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_EXPIRY;
  const signature = await signDownload(env, product.id, expires);
  const downloadUrl = new URL("/download", request.url);
  downloadUrl.searchParams.set("product", product.id);
  downloadUrl.searchParams.set("expires", String(expires));
  downloadUrl.searchParams.set("sig", signature);
  return json({ downloadUrl: downloadUrl.toString() });
}

async function downloadFile(request, env) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product");
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("sig") || "";
  const catalog = await readCatalog(env);
  const product = getProduct(catalog, productId);
  if (!product || !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return new Response("Invalid or expired download link.", { status: 403 });
  }
  const expected = await signDownload(env, productId, expires);
  if (!constantTimeEqual(signature, expected)) return new Response("Invalid download signature.", { status: 403 });
  const object = await env.produse.get(product.file);
  if (!object) return new Response("Product file not found in storage.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(product.file.split("/").pop())}`,
      "Cache-Control": "private, no-store"
    }
  });
}

function checkoutHtml(env, product) {
  const name = escapeHtml(product.name);
  const price = `$${product.amount} USD`;
  const clientId = encodeURIComponent(env.PAYPAL_CLIENT_ID || "");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ShopLiannaX - Secure Checkout</title>
<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture"></script>
<style>
*{box-sizing:border-box}html,body{width:100%;min-height:100%;margin:0}
body{min-height:100vh;padding:12px 24px;display:flex;align-items:center;justify-content:center;background:#090909;color:#f5f0eb;font-family:Arial,sans-serif;text-align:center}
.panel{width:100%;max-width:760px;margin:auto;padding:38px 42px;background:linear-gradient(145deg,#1c171a,#111);border:1px solid rgba(255,0,119,.65);border-radius:20px;box-shadow:0 0 35px rgba(255,0,119,.13);transform:translateY(-65px)}
h2{font-size:25px;font-weight:600;margin:0 0 22px;color:#fff}.name{font-size:17px;line-height:1.6;color:#e0d3da;max-width:620px;margin:auto}
.price{font-size:32px;font-weight:700;color:#ff8bc4;margin:24px 0}
#paypal-button-container{width:100%;max-width:540px;margin:28px auto 0;border:0;outline:none}
#paypal-button-container iframe{border:0!important;outline:none!important;box-shadow:none!important}
#message{font-size:15px;line-height:1.6;margin-top:22px;color:#ff8bc4;overflow-wrap:anywhere}#message a{color:#ff8bc4;font-weight:bold;text-decoration:underline}
@media(max-width:600px){body{padding:10px 14px}.panel{padding:28px 18px;border-radius:15px;transform:translateY(-30px)}h2{font-size:21px}.name{font-size:15px}.price{font-size:28px}#paypal-button-container{max-width:100%}}
</style></head><body><div class="panel"><h2>Secure Checkout</h2><div class="name">${name}</div><div class="price">${price}</div><div id="paypal-button-container"></div><div id="message"></div></div>
<script>
const productId=${JSON.stringify(product.id)};const message=document.getElementById("message");
paypal.Buttons({
style:{layout:"vertical",color:"black",shape:"pill",label:"paypal",height:45},
createOrder:async()=>{message.textContent="";const r=await fetch("/create-pp-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId})});const d=await r.json();if(!r.ok||!d.id)throw new Error(d.error||"Could not create PayPal order.");return d.id;},
onApprove:async data=>{message.textContent="Verifying payment...";const r=await fetch("/verify-pp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderID:data.orderID,productId})});const d=await r.json();if(!r.ok||!d.downloadUrl){message.textContent=d.error||"Payment verification failed.";return;}message.innerHTML='Payment successful! <a href="'+d.downloadUrl+'">Download your product</a>';},
onError:err=>{message.textContent="PayPal error. Please try again.";console.error(err);}
}).render("#paypal-button-container");
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function createAdminSession(env) {
  if (!env.ADMIN_SESSION_SECRET) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = btoa(JSON.stringify({ exp: expires, role: "admin" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const sig = await hmacHex(env.ADMIN_SESSION_SECRET, payload);
  return payload + "." + sig;
}

async function verifyAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = await hmacHex(env.ADMIN_SESSION_SECRET, parts[0]);
  if (!constantTimeEqual(parts[1], expected)) return false;
  try {
    const payload = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "admin" && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

async function adminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return json({ error: "Admin secrets are not configured." }, 503);
  const body = await request.json();
  const supplied = String(body.password || "");
  if (!constantTimeEqual(supplied, String(env.ADMIN_PASSWORD))) return json({ error: "Incorrect password." }, 401);
  return json({ token: await createAdminSession(env), expiresIn: SESSION_TTL });
}

async function adminApi(request, env, url) {
  if (url.pathname === "/admin/login" && request.method === "POST") return adminLogin(request, env);
  if (!(await verifyAdmin(request, env))) return json({ error: "Unauthorized." }, 401);

  if (url.pathname === "/admin/catalog" && request.method === "GET") {
    const catalog = await readCatalog(env);
    return json(catalog);
  }

  if (url.pathname === "/admin/catalog" && request.method === "PUT") {
    const body = await request.json();
    if (!Array.isArray(body.products) || body.products.length > 500) return json({ error: "Invalid catalog." }, 400);
    const ids = new Set();
    for (const p of body.products) {
      if (!validProduct(p) || ids.has(p.id)) return json({ error: "Invalid product data or duplicate ID." }, 400);
      ids.add(p.id);
    }
    const catalog = { version: 1, currency: CURRENCY, products: body.products };
    await writeCatalog(env, catalog);
    return json({ success: true, catalog });
  }

  if (url.pathname === "/admin/upload" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "");
    if (!(file instanceof File) || !file.size) return json({ error: "Select a file to upload." }, 400);
    if (file.size > 100 * 1024 * 1024) return json({ error: "Maximum upload size is 100 MB." }, 413);
    const isImage = kind === "image";
    if (!isImage && kind !== "archive") return json({ error: "Invalid upload type." }, 400);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const allowed = isImage ? ["jpg","jpeg","png","webp","gif"] : ["zip","rar","7z","psd"];
    if (!allowed.includes(ext)) return json({ error: "Unsupported file extension." }, 400);
    if (isImage && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return json({ error: "Invalid image MIME type." }, 400);
    const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
    const key = (isImage ? "product-images/" : "product-files/") + Date.now() + "-" + safeName;
    await env.produse.put(key, file.stream(), {
      httpMetadata: { contentType: isImage ? file.type : "application/octet-stream" }
    });
    return json({ success: true, key, url: isImage ? new URL("/asset?key=" + encodeURIComponent(key), request.url).toString() : null });
  }

  if (url.pathname === "/admin/product" && request.method === "DELETE") {
    const id = url.searchParams.get("id");
    const catalog = await readCatalog(env);
    const next = catalog.products.filter(p => p.id !== id);
    if (next.length === catalog.products.length) return json({ error: "Product not found." }, 404);
    await writeCatalog(env, { version: 1, currency: CURRENCY, products: next });
    return json({ success: true });
  }
  return json({ error: "Not found." }, 404);
}

async function publicAsset(request, env) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("product-images/") || key.includes("..")) return new Response("Not found.", { status: 404 });
  const object = await env.produse.get(key);
  if (!object) return new Response("Not found.", { status: 404 });
  const headers = new Headers(object.httpMetadata);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request, env) });
    try {
      if (url.pathname.startsWith("/admin/")) return withCors(await adminApi(request, env, url), request, env);
      if (url.pathname === "/asset" && request.method === "GET") return publicAsset(request, env);
      if (request.method === "GET" && url.pathname === "/") {
        const catalog = await readCatalog(env);
        const product = getProduct(catalog, url.searchParams.get("product"));
        return product ? checkoutHtml(env, product) : new Response("Product not found.", { status: 404 });
      }
      if (request.method === "POST" && url.pathname === "/create-pp-order") return await createOrder(request, env);
      if (request.method === "POST" && url.pathname === "/verify-pp") return await verifyOrder(request, env);
      if (request.method === "GET" && url.pathname === "/download") return await downloadFile(request, env);
      return new Response("Not found.", { status: 404 });
    } catch (error) {
      console.error("Worker error:", error);
      return json({ error: error.message || "Server error." }, 500);
    }
  }
};