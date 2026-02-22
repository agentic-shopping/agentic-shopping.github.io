// Agentic Shopping — all client-side logic (no backend).
// Replace the "mock agent tools" with real API calls when you're ready.

const state = {
  products: [],
  filtered: [],
  compare: new Set(),
  cart: new Map(), // id -> qty
  lastQuery: "",
  toastTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function stars(r){
  const full = Math.round(clamp(r,0,5));
  return '★'.repeat(full) + '☆'.repeat(5-full);
}

function money(x){ return `$${Number(x).toFixed(2)}`; }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function toast(msg){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(()=> el.classList.remove("show"), 2200);
}

async function loadProducts(){
  const res = await fetch("data_products.json");
  const data = await res.json();
  state.products = data;
  // Hydrate any persisted cart/compare
  const saved = safeJson(localStorage.getItem("as_state")) || {};
  if(saved.cart){
    Object.entries(saved.cart).forEach(([id, qty]) => {
      const q = Number(qty);
      if(Number.isFinite(q) && q > 0) state.cart.set(id, q);
    });
  }
  if(saved.compare){
    saved.compare.forEach((id)=> state.compare.add(id));
  }
  applyFilters();
  renderAll();
  bootstrapCategorySelect();
  wireEvents();
  greet();
}

function safeJson(s){
  try{ return JSON.parse(s); }catch(e){ return null; }
}

function persist(){
  const obj = {
    cart: Object.fromEntries(state.cart.entries()),
    compare: Array.from(state.compare),
  };
  localStorage.setItem("as_state", JSON.stringify(obj));
}

function bootstrapCategorySelect(){
  const categories = Array.from(new Set(state.products.map(p => p.category))).sort();
  const sel = $("#category");
  const navSel = document.getElementById("navCategory");
  categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
    if(navSel){
      const opt2 = document.createElement("option");
      opt2.value = c;
      opt2.textContent = c;
      navSel.appendChild(opt2);
    }
  });
}

function wireEvents(){
  $("#q").addEventListener("input", () => { applyFilters(); renderCatalog(); });
  $("#category").addEventListener("change", () => { applyFilters(); renderCatalog(); });
  $("#sort").addEventListener("change", () => { applyFilters(); renderCatalog(); });

  const maxPrice = $("#maxPrice");
  const minRating = $("#minRating");
  const updateRanges = () => {
    $("#maxPriceLabel").textContent = money(maxPrice.value);
    $("#minRatingLabel").textContent = (minRating.value / 10).toFixed(1);
  };
  updateRanges();
  maxPrice.addEventListener("input", () => { updateRanges(); applyFilters(); renderCatalog(); });
  minRating.addEventListener("input", () => { updateRanges(); applyFilters(); renderCatalog(); });

  $("#clearCompare").addEventListener("click", () => {
    state.compare.clear();
    persist();
    renderCompare();
    toast("Compare cleared");
  });

  $("#checkoutBtn").addEventListener("click", () => {
    if(state.cart.size === 0){ toast("Cart is empty"); return; }
    const total = calcTotal();
    pushAgent(`Mock checkout created. Total: <b>${money(total)}</b>. (Wire to Stripe/Shopify next.)`, "agent");
    toast("Mock checkout");
  });

  $("#exportBtn").addEventListener("click", exportCart);

  $("#sendBtn").addEventListener("click", () => sendChat());
  $("#chatInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter") sendChat();
  });

  $$(".agent-tools [data-tool]").forEach(btn => {
    btn.addEventListener("click", () => runTool(btn.dataset.tool));
  });
}

  // Navbar search (app header)
  const navQ = document.getElementById("navQ");
  const navCat = document.getElementById("navCategory");
  const navBtn = document.getElementById("navSearchBtn");
  if(navQ && navBtn){
    navBtn.addEventListener("click", () => {
      const qEl = document.getElementById("q");
      if(qEl){ qEl.value = navQ.value; }
      const cEl = document.getElementById("category");
      if(cEl && navCat){ cEl.value = navCat.value; }
      applyFilters(); renderCatalog();
      toast("Search updated");
    });
    navQ.addEventListener("keydown", (e)=>{ if(e.key==="Enter") navBtn.click(); });
  }


function applyFilters(){
  const q = ($("#q").value || "").trim().toLowerCase();
  const cat = $("#category").value;
  const sort = $("#sort").value;
  const maxPrice = Number($("#maxPrice").value);
  const minRating = Number($("#minRating").value) / 10;

  let arr = state.products.filter(p => {
    if(cat && p.category !== cat) return false;
    if(p.price > maxPrice) return false;
    if(p.rating < minRating) return false;
    if(!q) return true;
    const hay = [
      p.name, p.brand, p.category,
      ...(p.features || []),
      ...(p.tags || [])
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  // Sorting
  if(sort === "price_asc") arr.sort((a,b) => a.price - b.price);
  else if(sort === "price_desc") arr.sort((a,b) => b.price - a.price);
  else if(sort === "rating_desc") arr.sort((a,b) => b.rating - a.rating);
  else if(sort === "ship_asc") arr.sort((a,b) => a.shipping_days - b.shipping_days);
  else {
    // Relevance-ish: rating + review count + query match
    arr.sort((a,b) => score(b, q) - score(a, q));
  }

  state.filtered = arr;
  const meta = $("#catalogMeta");
  if(meta) meta.textContent = `${arr.length} products`;
}

function score(p, q){
  const base = (p.rating * 10) + Math.log10((p.reviews || 1)+10) * 6;
  if(!q) return base;
  const hay = (p.name + " " + (p.features||[]).join(" ") + " " + (p.tags||[]).join(" ")).toLowerCase();
  const bonus = hay.includes(q) ? 12 : 0;
  return base + bonus;
}

function renderAll(){
  renderCatalog();
  renderCompare();
  renderCart();
}

function renderCatalog(){
  const root = $("#productList");
  root.innerHTML = "";
  state.filtered.forEach(p => root.appendChild(productCard(p)));
}

function productCard(p){
  const el = document.createElement("div");
  el.className = "card product";

  const inCompare = state.compare.has(p.id);
  const inCart = state.cart.get(p.id) || 0;

  el.innerHTML = `
    <div class="pimg"><img src="${p.image}" alt="" /></div>
    <div class="ptitle"><a href="javascript:void(0)">${escapeHtml(p.name)}</a></div>
    <div class="prating"><span class="stars">${stars(p.rating)}</span> <span class="muted">(${p.reviews})</span></div>
    <div class="pmeta">${escapeHtml(p.brand)} • ${escapeHtml(p.category)}</div>
    <div class="price">${money(p.price)}</div>
    <div class="ship">Get it in <b>${p.shipping_days}</b> day(s)</div>
    <hr class="sep" />
    <div class="pactions">
      <button class="btn" data-act="add">Add to cart</button>
      <button class="btn btn-secondary" data-act="compare">${inCompare ? "Remove compare" : "Compare"}</button>
      <button class="btn btn-secondary" data-act="ask">Ask agent</button>
    </div>
    <div class="muted" style="font-size:12px;">${inCart ? `In cart: <span class="mono">${inCart}</span>` : ""}</div>
  `;

  el.querySelector('[data-act="add"]').addEventListener("click", () => {('[data-act="add"]').addEventListener("click", () => {
    addToCart(p.id, 1);
    toast("Added to cart");
  });

  el.querySelector('[data-act="compare"]').addEventListener("click", () => {
    toggleCompare(p.id);
  });

  el.querySelector('[data-act="ask"]').addEventListener("click", () => {
    pushAgent(`Tell me your constraints and I’ll recommend the best option near <b>${escapeHtml(p.name)}</b>.`, "agent");
    pushTool(`tool.search(query="${escapeHtml(p.name)}")`, "tool");
    state.lastQuery = p.name;
  });

  return el;
}

function toggleCompare(id){
  if(state.compare.has(id)){
    state.compare.delete(id);
    persist();
    renderCompare();
    toast("Removed from compare");
    return;
  }
  if(state.compare.size >= 3){
    toast("Compare supports up to 3 items");
    return;
  }
  state.compare.add(id);
  persist();
  renderCompare();
  toast("Added to compare");
}

function renderCompare(){
  const root = $("#compareArea");
  if(state.compare.size === 0){
    root.innerHTML = `<div class="compare-empty">No items selected. Use <b>Compare</b> on products.</div>`;
    return;
  }
  const items = Array.from(state.compare).map(id => state.products.find(p => p.id === id)).filter(Boolean);
  root.innerHTML = `
    <div class="compare-grid">
      ${items.map(p => compareCardHtml(p)).join("")}
    </div>
  `;
  root.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => toggleCompare(btn.dataset.remove));
  });
}

function compareCardHtml(p){
  return `
    <div class="compare-card">
      <div class="ptitle">${escapeHtml(p.name)}</div>
      <div class="pmeta">${escapeHtml(p.brand)} • ${escapeHtml(p.category)}</div>
      <hr class="sep" />
      <div class="kv"><span>Price</span><span><b>${money(p.price)}</b></span></div>
      <div class="kv"><span>Rating</span><span>${p.rating.toFixed(1)} ★</span></div>
      <div class="kv"><span>Shipping</span><span>${p.shipping_days} day(s)</span></div>
      <div class="muted tiny" style="margin-top:8px;">${(p.features||[]).slice(0,3).map(escapeHtml).join(" • ")}</div>
      <div class="actions" style="margin-top:10px;">
        <button class="btn btn-ghost" data-remove="${p.id}">Remove</button>
        <button class="btn btn-primary" data-add="${p.id}">Add</button>
      </div>
    </div>
  `;
}

function addToCart(id, delta){
  const qty = (state.cart.get(id) || 0) + delta;
  if(qty <= 0) state.cart.delete(id);
  else state.cart.set(id, qty);
  persist();
  renderCart();
}

function renderCart(){
  const root = $("#cartArea");
  const meta = $("#cartMeta");
  if(state.cart.size === 0){
    root.innerHTML = `<div class="cart-empty">Cart is empty.</div>`;
    meta.textContent = "0 items";
    const badge = document.getElementById("cartBadge");
    if(badge) badge.textContent = "0";
    $("#cartTotal").textContent = money(0);
    return;
  }
  const rows = Array.from(state.cart.entries()).map(([id, qty]) => {
    const p = state.products.find(x => x.id === id);
    return { p, qty };
  }).filter(x => x.p);

  const totalItems = rows.reduce((s,r)=> s + r.qty, 0);
  meta.textContent = `${totalItems} item(s)`;
  const badge = document.getElementById("cartBadge");
  if(badge) badge.textContent = String(totalItems);

  root.innerHTML = rows.map(({p, qty}) => `
    <div class="cart-item">
      <div class="ptitle">${escapeHtml(p.name)}</div>
      <div class="pmeta">${escapeHtml(p.brand)} • ${escapeHtml(p.category)}</div>
      <hr class="sep" />
      <div class="kv"><span>Unit</span><span>${money(p.price)}</span></div>
      <div class="kv"><span>Qty</span><span class="mono">${qty}</span></div>
      <div class="kv"><span>Line</span><span><b>${money(p.price * qty)}</b></span></div>
      <div class="actions" style="margin-top:10px;">
        <button class="btn btn-ghost" data-dec="${p.id}">−</button>
        <button class="btn btn-ghost" data-inc="${p.id}">+</button>
        <button class="btn btn-ghost" data-rm="${p.id}">Remove</button>
      </div>
    </div>
  `).join("");

  root.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", () => addToCart(b.dataset.dec, -1)));
  root.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", () => addToCart(b.dataset.inc, +1)));
  root.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => addToCart(b.dataset.rm, -999)));

  const total = calcTotal();
  $("#cartTotal").textContent = money(total);
}

function calcTotal(){
  let total = 0;
  for(const [id, qty] of state.cart.entries()){
    const p = state.products.find(x => x.id === id);
    if(p) total += p.price * qty;
  }
  return total;
}

function exportCart(){
  const rows = Array.from(state.cart.entries()).map(([id, qty]) => {
    const p = state.products.find(x => x.id === id);
    return p ? { id, name: p.name, qty, unit_price: p.price, line_total: p.price * qty } : null;
  }).filter(Boolean);

  const payload = {
    generated_at: new Date().toISOString(),
    currency: "USD",
    item_count: rows.reduce((s,r)=> s + r.qty, 0),
    total: calcTotal(),
    items: rows,
    note: "This is a mock export from the static prototype.",
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cart_export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported cart_export.json");
}

function greet(){
  pushAgent("Hi! Describe what you want to buy (use case + budget + constraints). I’ll shortlist options from the catalog.", "agent");
  pushTool("tool.help() -> [search, rank, bundle, negotiate, summarize]", "tool");
}

function sendChat(){
  const input = $("#chatInput");
  const text = (input.value || "").trim();
  if(!text) return;
  input.value = "";
  pushUser(text);
  state.lastQuery = text;
  // Auto-run shortlist after user message
  setTimeout(() => runTool("shortlist", text), 80);
}

function pushUser(text){ pushBubble(text, "user"); }
function pushAgent(html, kind="agent"){ pushBubble(html, kind, true); }
function pushTool(text, kind="tool"){ pushBubble(text, kind); }

function pushBubble(content, cls, isHtml=false){
  const area = $("#chatArea");
  const div = document.createElement("div");
  div.className = `bubble ${cls}`;
  div.innerHTML = isHtml ? content : escapeHtml(content);
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---------------- Mock Agent Tools ---------------- */

function parseConstraints(text){
  const t = text.toLowerCase();
  // budget
  const moneyMatch = t.match(/\$?\s?(\d{2,5})(?:\s?usd)?/);
  const budget = moneyMatch ? Number(moneyMatch[1]) : null;

  // category hint
  const categories = Array.from(new Set(state.products.map(p=>p.category.toLowerCase())));
  const cat = categories.find(c => t.includes(c)) || null;

  // shipping
  const shipMatch = t.match(/(\d)\s?(?:day|days)/);
  const shipMax = shipMatch ? Number(shipMatch[1]) : null;

  // keywords
  const kws = [];
  ["anc","noise","flight","call","mic","usb-c","usbc","4k","monitor","keyboard","vacuum","air fryer","ssd","portable","gps","battery","sleep"]
    .forEach(k => { if(t.includes(k)) kws.push(k); });

  return { budget, cat, shipMax, kws };
}

function runTool(name, userText=null){
  const text = userText ?? state.lastQuery ?? "";
  if(name === "shortlist") return toolShortlist(text);
  if(name === "bundle") return toolBundle(text);
  if(name === "negotiate") return toolNegotiate(text);
  if(name === "summarize") return toolSummarize();
}

function toolShortlist(text){
  const c = parseConstraints(text);
  pushTool(`tool.search(query="${escapeHtml(text)}")`, "tool");

  let pool = state.products.slice();

  if(c.cat){
    pool = pool.filter(p => p.category.toLowerCase() === c.cat);
  }
  if(c.budget){
    pool = pool.filter(p => p.price <= c.budget);
  }
  if(c.shipMax){
    pool = pool.filter(p => p.shipping_days <= c.shipMax);
  }
  if(c.kws.length){
    pool = pool.filter(p => {
      const hay = (p.name + " " + (p.features||[]).join(" ") + " " + (p.tags||[]).join(" ")).toLowerCase();
      return c.kws.some(k => hay.includes(k.replace("usbc","usb-c")));
    });
  }

  pool.sort((a,b) => score(b, (text||"").toLowerCase()) - score(a, (text||"").toLowerCase()));

  const top = pool.slice(0, 3);
  if(top.length === 0){
    pushAgent("I couldn’t find an exact match in the demo catalog. Try loosening budget/shipping or different keywords.", "agent");
    return;
  }

  const lines = top.map((p, i) => {
    const why = [
      `${p.rating.toFixed(1)}★`,
      `${money(p.price)}`,
      `${p.shipping_days}d ship`,
      (p.tags||[])[0] ? `“${p.tags[0]}”` : ""
    ].filter(Boolean).join(" • ");
    return `${i+1}) <b>${escapeHtml(p.name)}</b> — ${escapeHtml(why)}`;
  }).join("<br/>");

  const rationale = buildRationale(top, c);

  pushTool(`tool.rank(candidates=[${top.map(p=>p.id).join(", ")}])`, "tool");
  pushAgent(`Here are my top picks:<br/><br/>${lines}<br/><br/><span class="muted">${escapeHtml(rationale)}</span>`, "agent");

  // highlight in UI via filters if helpful
  toast("Shortlist ready");
}

function buildRationale(top, c){
  const parts = [];
  if(c.budget) parts.push(`Budget ≤ $${c.budget}`);
  if(c.cat) parts.push(`Category: ${c.cat}`);
  if(c.shipMax) parts.push(`Shipping ≤ ${c.shipMax} day(s)`);
  if(c.kws.length) parts.push(`Keywords: ${c.kws.slice(0,4).join(", ")}`);
  if(parts.length === 0) return "Ranked by overall value (rating, reviews, and price).";
  return `Used constraints: ${parts.join(" • ")}. Ranked by value + match quality.`;
}

function toolBundle(text){
  pushTool(`tool.bundle(context="${escapeHtml(text)}")`, "tool");

  // Simple heuristic: if there's a monitor, suggest SSD/keyboard; if headphones, suggest earbuds; if vacuum, suggest air fryer? (fun)
  const cartIds = Array.from(state.cart.keys());
  const inCart = cartIds.map(id => state.products.find(p=>p.id===id)).filter(Boolean);
  const wantMonitor = (text||"").toLowerCase().includes("monitor") || inCart.some(p=>p.category==="Computing" && p.name.toLowerCase().includes("monitor"));
  const wantAudio = (text||"").toLowerCase().includes("headphone") || (text||"").toLowerCase().includes("earbud") || inCart.some(p=>p.category==="Audio");
  const wantHome = (text||"").toLowerCase().includes("vacuum") || inCart.some(p=>p.category==="Home");

  let bundle = [];
  if(wantMonitor){
    bundle = [findById("p006"), findById("p008"), findById("p005")].filter(Boolean);
  }else if(wantAudio){
    bundle = [findById("p001"), findById("p002")].filter(Boolean);
  }else if(wantHome){
    bundle = [findById("p004"), findById("p007")].filter(Boolean);
  }else{
    // generic bundle: best rated
    bundle = state.products.slice().sort((a,b)=> b.rating-a.rating).slice(0,3);
  }

  const msg = bundle.map(p => `<b>${escapeHtml(p.name)}</b> (${money(p.price)})`).join("<br/>");
  pushAgent(`Suggested bundle (for better overall outcome / potential discounts):<br/><br/>${msg}<br/><br/><span class="muted">Tip: merchants often offer 5–10% off bundles, accessories, or slower shipping.</span>`, "agent");

  // Auto-add? we won't; just give one-click buttons in message would be complex; keep simple.
  toast("Bundle suggested");
}

function toolNegotiate(text){
  pushTool(`tool.negotiate(goal="lower price", context="${escapeHtml(text)}")`, "tool");

  // Make a plausible negotiation script
  const cartRows = Array.from(state.cart.entries()).map(([id,qty]) => {
    const p = findById(id);
    return p ? `${qty}× ${p.name}` : null;
  }).filter(Boolean);

  const focus = cartRows.length ? cartRows.join(", ") : "the item";
  const script = [
    `Hi! I’m interested in ${focus}.`,
    `If I bundle items or accept a slightly slower delivery, can you offer a discount?`,
    `I’m ready to checkout today if we can do ~8% off or a free accessory.`,
    `If that’s not possible, could you match the best available price and include extended returns?`
  ].map(s => `• ${escapeHtml(s)}`).join("<br/>");

  pushAgent(`Draft negotiation message you can send to a seller:<br/><br/>${script}<br/><br/><span class="muted">In a real product, this tool would call merchant channels or auto-apply eligible offers.</span>`, "agent");
  toast("Negotiation draft ready");
}

function toolSummarize(){
  pushTool("tool.summarize(decision_state)", "tool");

  const items = Array.from(state.cart.entries()).map(([id,qty]) => {
    const p = findById(id);
    return p ? `${qty}× ${p.name} (${money(p.price)} ea)` : null;
  }).filter(Boolean);

  const compare = Array.from(state.compare).map(id => findById(id)?.name).filter(Boolean);

  const summary = [
    items.length ? `<b>Cart</b>: ${escapeHtml(items.join("; "))}` : `<b>Cart</b>: empty`,
    compare.length ? `<b>Compare</b>: ${escapeHtml(compare.join(", "))}` : `<b>Compare</b>: none`,
    `<b>Estimated total</b>: ${money(calcTotal())}`
  ].join("<br/>");

  pushAgent(`Summary:<br/><br/>${summary}<br/><br/><span class="muted">Next: connect catalog feeds + real checkout + tool-calling agent.</span>`, "agent");
  toast("Summary added");
}

function findById(id){ return state.products.find(p => p.id === id); }

loadProducts().catch(err => {
  console.error(err);
  toast("Failed to load products. Run via a local server (not file://).");
});
