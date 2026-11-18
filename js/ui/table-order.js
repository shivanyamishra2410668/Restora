import QRCode from 'qrcode';
import { readPageCache, writePageCache } from '../services/cache.js';
import { optimizeCloudinaryImage } from '../services/cloudinary.js';
import { svgIcon, loadingMarkup, setButtonLoading, restoreButton } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
import { money } from '../services/money.js';

export function renderTablesPanel(tables, restaurantId, role) {
  return `<section class="panel"><div class="panel-head"><h3>Restaurant tables</h3><span>${tables.length} tables</span></div><p class="section-intro">Generate a QR code for each table. Guests can scan this code to open the restaurant menu and place a table order.</p><div class="table-wrap"><table><thead><tr><th>Table</th><th>Seats</th><th>Status</th><th>QR ordering</th><th>Actions</th></tr></thead><tbody>${tables.map(table => `<tr><td>${esc(table.table_number)}</td><td>${esc(table.capacity)}</td><td><span class="badge ${esc(table.status)}">${esc(table.status)}</span></td><td>${['restaurant_owner', 'manager'].includes(role) ? `<button class="btn btn-ghost" data-action="qr" data-id="${esc(table.id)}">Show QR code</button>` : 'Ask an admin for the QR code'}</td><td><button class="btn btn-ghost" data-action="edit" data-id="${esc(table.id)}">Edit</button> <button class="btn btn-ghost" data-action="delete" data-id="${esc(table.id)}">Delete</button></td></tr>`).join('')}</tbody></table>${tables.length ? '' : '<div class="empty">No tables yet. Add a table, then generate its QR code.</div>'}</div></section>`;
}

export function renderOrdersPanel(orders, role) {
  return `<section class="panel"><div class="panel-head"><h3>Orders</h3><span>${orders.length} orders</span></div><p class="section-intro">Review new orders, correct items if needed, label anything the team should notice, then send the order to the kitchen.</p><div class="table-wrap"><table><thead><tr><th>Order</th><th>Guest</th><th>Type</th><th>Table</th><th>Items</th><th>Kitchen notes</th><th>Label</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>${orders.map(order => {
    const itemSummary = (order.order_items || []).map(item => `${esc(item.name_snapshot)} × ${esc(item.quantity)}`).join(', ') || '-';
    const admin = ['restaurant_owner', 'manager'].includes(role);
    const action = !admin ? esc(order.status) : order.status === 'pending'
      ? `<button class="btn btn-ghost" data-action="edit-order-items" data-id="${esc(order.id)}">Edit items</button> <button class="btn btn-ghost" data-action="edit" data-id="${esc(order.id)}">Guest details</button> <button class="btn btn-primary" data-action="forward" data-id="${esc(order.id)}">Verify & send to kitchen</button>`
      : ['confirmed','preparing'].includes(order.status) ? '<span class="badge confirmed">Kitchen preparing</span>'
      : order.status === 'ready' ? `<button class="btn btn-primary" data-action="deliver" data-id="${esc(order.id)}">Hand over & mark delivered</button>`
      : order.status === 'completed' ? '<span class="badge completed">Delivered</span>'
      : esc(order.status);
    return `<tr><td>${esc(String(order.order_number).padStart(6, '0'))}</td><td>${esc(order.guest_name || 'Guest')}</td><td>${esc(String(order.order_type || 'takeaway').replaceAll('_', ' '))}</td><td>${esc(order.restaurant_tables?.table_number || '-')}</td><td class="order-item-summary">${itemSummary}</td><td class="order-item-summary">${esc(order.notes || '-')}</td><td><span class="order-label-chip">${esc(order.label || '-')}</span>${admin ? `<div class="order-label-editor"><input data-order-label value="${esc(order.label || '')}" maxlength="40" placeholder="Add label" aria-label="Order label"><button class="btn btn-ghost" data-action="save-order-label" data-id="${esc(order.id)}">Save</button></div>` : ''}</td><td>${money(order.total)}</td><td><span class="badge ${esc(order.status)}">${esc(order.status === 'completed' ? 'delivered' : order.status)}</span></td><td class="order-actions">${action}</td></tr>`;
  }).join('')}</tbody></table>${orders.length ? '' : '<div class="empty">No orders yet.</div>'}</div></section>`;
}

export async function showTableQr({ supabase, restaurantId, tableId }) {
  const { data: table, error } = await supabase.from('restaurant_tables').select('table_number').eq('id', tableId).eq('restaurant_id', restaurantId).single();
  if (error) throw error;
  const url = new URL('/menu.html', location.origin);
  url.searchParams.set('restaurant', restaurantId);
  url.searchParams.set('table', tableId);
  const image = await QRCode.toDataURL(url.toString(), { width: 320, margin: 2, errorCorrectionLevel: 'M' });
  const dialog = document.createElement('dialog');
  dialog.className = 'table-qr-dialog';
  dialog.innerHTML = `<div class="table-qr-content"><span class="eyebrow">Table QR ordering</span><h2>Table ${esc(table.table_number)}</h2><p>Guests scan this code to open the restaurant menu and order from this table.</p><img src="${image}" alt="QR code for table ${esc(table.table_number)}"><a class="btn btn-primary" href="${image}" download="restora-table-${esc(table.table_number)}-qr.png">Download QR code</a><button type="button" class="btn btn-ghost" data-close>Done</button><small>${esc(url.toString())}</small></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
}

const tableCartKey = (restaurantId, tableId) => `restora_table_cart:${restaurantId}:${tableId}`;
const tableOrderIdsKey = (restaurantId, tableId) => `restora_table_orders:${restaurantId}:${tableId}`;
const tableCartUrl = (page, restaurantId, tableId) => `/${page}.html?restaurant=${encodeURIComponent(restaurantId)}&table=${encodeURIComponent(tableId)}`;
const productPhotos = product => [...new Set([...(Array.isArray(product.image_urls) ? product.image_urls : []), ...(product.image_url ? [product.image_url] : [])])];
let tablePhotoSlideTimer = null;
let tableStatusPollTimer = null;
function stopTableStatusPolling() { if (tableStatusPollTimer) clearInterval(tableStatusPollTimer); tableStatusPollTimer = null; }
function readTrackedOrderIds(restaurantId, tableId) {
  try { const ids = JSON.parse(localStorage.getItem(tableOrderIdsKey(restaurantId, tableId)) || '[]'); return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string'))].slice(-20) : []; }
  catch { return []; }
}
async function refreshTrackedTableOrders({ supabase, restaurantId, tableId }) {
  const ids = readTrackedOrderIds(restaurantId, tableId);
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc('get_table_order_statuses', { rid: restaurantId, tid: tableId, order_ids: ids });
  if (error) return null;
  const active = Array.isArray(data) ? data : [];
  localStorage.setItem(tableOrderIdsKey(restaurantId, tableId), JSON.stringify(active.map(order => order.order_id)));
  return active;
}
function renderTrackedTableOrders(orders) {
  if (!orders?.length) return '';
  const phases = [
    ['pending', 'Waiting for confirmation', '◷'],
    ['confirmed', 'Sent for preparation', '✓'],
    ['preparing', 'Preparing', '♨'],
    ['ready', 'Prepared', '✦'],
  ];
  return `<section class="guest-live-orders"><div class="guest-live-orders-heading"><div><span class="eyebrow">Live table orders</span><h2>We’ll keep you posted</h2></div><span class="live-pulse">Live</span></div>${orders.map(order => {
    const step = phases.findIndex(([status]) => status === order.status);
    const progress = Math.max(0, step) / (phases.length - 1) * 100;
    const messages = {
      pending: 'The restaurant has received your order and is confirming it.',
      confirmed: 'Your order is confirmed and sent for preparation.',
      preparing: 'The kitchen is preparing your dishes fresh.',
      ready: 'Your food is prepared. The restaurant team will hand it over shortly.',
    };
    return `<article class="guest-live-order guest-live-order-${esc(order.status)}"><div class="guest-live-order-head"><div><span class="guest-order-id-label">Your order</span><b>#${esc(String(order.order_number).padStart(6, '0'))}</b></div><span class="badge ${esc(order.status)}">${esc(phases[step]?.[1] || order.status)}</span></div><div class="guest-progress-wrap" style="--order-progress:${progress}%"><div class="guest-progress-track"><i></i></div><ol class="guest-order-progress">${phases.map(([status, label, icon], index) => `<li class="${index < step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}"><i class="guest-step-icon">${index < step ? '✓' : icon}</i><span>${esc(label)}</span></li>`).join('')}</ol></div><p>${esc(messages[order.status] || 'Your restaurant is working on your order.')}</p></article>`;
  }).join('')}</section>`;
}
function readTableCart(restaurantId, tableId) {
  try {
    const value = JSON.parse(localStorage.getItem(tableCartKey(restaurantId, tableId)) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0).map(item => ({ id: item.id, quantity: Number(item.quantity) })) : [];
  } catch { return []; }
}
function saveTableCart(restaurantId, tableId, cart) { localStorage.setItem(tableCartKey(restaurantId, tableId), JSON.stringify(cart)); }
const tableCartCount = cart => cart.reduce((sum, item) => sum + item.quantity, 0);

async function getPublicTableContext({ app, supabase, restaurantId, tableId }) {
  if (!restaurantId || !tableId) throw new Error('This QR code is missing its restaurant or table details.');
  const { data, error } = await supabase.rpc('get_public_table_info', { rid: restaurantId, tid: tableId });
  if (error) throw error;
  const tableInfo = Array.isArray(data) ? data[0] : data;
  if (!tableInfo) throw new Error('This table QR code is invalid or the restaurant is unavailable.');
  return tableInfo;
}

function showTablePageLoader(app, label) {
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = `<div class="public-menu table-store"><header class="public-menu-header"><a class="brand" href="/"><span class="brand-mark">${svgIcon('utensils-crossed')}</span>restora</a>${loadingMarkup(label)}</header><main><section class="panel page-loader">${loadingMarkup(label)}</section></main></div>`;
}

function tablePageShell(tableInfo, restaurantId, tableId, content, cart = readTableCart(restaurantId, tableId)) {
  return `<div class="public-menu table-store"><header class="public-menu-header"><a class="brand" href="${tableCartUrl('menu', restaurantId, tableId)}"><span class="brand-mark">${svgIcon('utensils-crossed')}</span>restora</a><a class="table-badge table-cart-nav" href="${tableCartUrl('table-cart', restaurantId, tableId)}">${svgIcon('table')} Table ${esc(tableInfo.table_number)} <span>${svgIcon('cart')} Cart · ${tableCartCount(cart)}</span></a></header><main>${content}</main></div>`;
}

export async function renderPublicTableMenu({ app, supabase, restaurantId, tableId }) {
  stopTableStatusPolling();
  showTablePageLoader(app, 'Loading the table menu');
  const tableInfo = await getPublicTableContext({ app, supabase, restaurantId, tableId });
  const cacheKey = `public-menu-v2:${restaurantId}:${tableId}`;
  let menuData = readPageCache(cacheKey, 30_000);
  if (!menuData) {
    let result = await supabase.from('products').select('id,name,description,price,image_url,image_urls,quantity,category_id,categories(name)').eq('restaurant_id', restaurantId).eq('available', true).gt('quantity', 0).order('name');
    if (result.error && /image_urls/i.test(result.error.message || '')) {
      result = await supabase.from('products').select('id,name,description,price,image_url,quantity,category_id,categories(name)').eq('restaurant_id', restaurantId).eq('available', true).gt('quantity', 0).order('name');
      if (!result.error) result.data = (result.data || []).map(product => ({ ...product, image_urls: product.image_url ? [product.image_url] : [] }));
    }
    const { data: products, error } = result;
    if (error) throw error;
    menuData = { products: products || [] };
    writePageCache(cacheKey, menuData);
  }
  const products = menuData.products;
  let trackedOrders = await refreshTrackedTableOrders({ supabase, restaurantId, tableId });
  let justPlacedOrder = sessionStorage.getItem(`restora_just_ordered:${restaurantId}:${tableId}`);
  if (justPlacedOrder) sessionStorage.removeItem(`restora_just_ordered:${restaurantId}:${tableId}`);
  let cart = readTableCart(restaurantId, tableId);
  const startSlideshow = () => {
    clearInterval(tablePhotoSlideTimer);
    const carousels = [...app.querySelectorAll('[data-table-photo-slideshow]')].filter(gallery => gallery.querySelectorAll('[data-table-photo]').length > 1);
    if (!carousels.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    tablePhotoSlideTimer = setInterval(() => carousels.forEach(gallery => {
      const slides = [...gallery.querySelectorAll('[data-table-photo]')];
      const active = slides.findIndex(slide => slide.classList.contains('is-active'));
      slides[active]?.classList.remove('is-active');
      slides[(active + 1) % slides.length]?.classList.add('is-active');
    }), 3200);
  };
  const productId = new URLSearchParams(location.search).get('product');
  const renderDetail = () => {
    const product = products.find(item => item.id === productId);
    if (!product) throw new Error('This dish is no longer available. Go back to the table menu and choose another dish.');
    const photos = productPhotos(product), qty = cart.find(item => item.id === product.id)?.quantity || 0;
    const gallery = photos.length
      ? `<div class="table-dish-gallery" data-table-photo-slideshow>${photos.map((photo, index) => `<img class="table-dish-photo ${index === 0 ? 'is-active' : ''}" data-table-photo src="${esc(optimizeCloudinaryImage(photo, 1000))}" alt="${esc(product.name)} photo ${index + 1}" ${index ? 'hidden' : ''} loading="lazy">`).join('')}${photos.length > 1 ? `<button class="table-dish-arrow previous" data-photo-step="-1" aria-label="Previous photo">‹</button><button class="table-dish-arrow next" data-photo-step="1" aria-label="Next photo">›</button><div class="table-dish-dots">${photos.map((_, index) => `<button data-photo-index="${index}" class="${index === 0 ? 'is-active' : ''}" aria-label="Show photo ${index + 1}"></button>`).join('')}</div>` : ''}</div>`
      : '<div class="table-dish-gallery table-dish-placeholder">✦</div>';
    app.innerHTML = tablePageShell(tableInfo, restaurantId, tableId, `<section class="table-dish-detail"><a class="table-dish-back" href="${tableCartUrl('menu', restaurantId, tableId)}">← Back to the table menu</a><div class="table-dish-detail-layout">${gallery}<div class="table-dish-copy"><span class="menu-product-category">${esc(product.categories?.name || 'Menu')}</span><h1>${esc(product.name)}</h1><b class="table-dish-price">${money(product.price)}</b><p>${esc(product.description || 'Prepared fresh for your table.')}</p><span class="table-dish-fresh">✦ Prepared fresh for your table</span><button class="btn btn-primary" data-detail-add ${qty >= product.quantity ? 'disabled' : ''}>${qty ? `Add another · ${qty} in cart` : 'Add to cart'} · ${money(product.price)}</button></div></div></section>`);
    const slides = [...app.querySelectorAll('[data-table-photo]')], dots = [...app.querySelectorAll('[data-photo-index]')];
    let activePhoto = 0;
    const showPhoto = index => {
      if (!slides.length) return;
      activePhoto = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.hidden = i !== activePhoto; slide.classList.toggle('is-active', i === activePhoto); });
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activePhoto));
    };
    app.querySelectorAll('[data-photo-step]').forEach(button => button.addEventListener('click', () => showPhoto(activePhoto + Number(button.dataset.photoStep))));
    dots.forEach((dot, index) => dot.addEventListener('click', () => showPhoto(index)));
    app.querySelector('[data-detail-add]')?.addEventListener('click', () => {
      const existing = cart.find(item => item.id === product.id);
      if ((existing?.quantity || 0) >= product.quantity) return;
      if (existing) existing.quantity += 1; else cart.push({ id: product.id, quantity: 1 });
      saveTableCart(restaurantId, tableId, cart);
      renderDetail();
    });
    startSlideshow();
  };
  const render = () => {
    const selected = cart.map(item => ({ ...item, product: products.find(product => product.id === item.id) })).filter(item => item.product);
    const count = tableCartCount(cart);
    if (productId) { renderDetail(); return; }
    clearInterval(tablePhotoSlideTimer);
    app.innerHTML = tablePageShell(tableInfo, restaurantId, tableId, `<div id="table-order-notice">${justPlacedOrder ? '<div class="table-order-placed-banner">✓ Your order was sent to the restaurant. Track its progress below.</div>' : ''}</div><section class="public-menu-intro"><span class="eyebrow">Fresh from the kitchen · Table ${esc(tableInfo.table_number)}</span><h1>${esc(tableInfo.restaurant_name)}</h1><p>${esc(tableInfo.description || 'Choose your favorites, review your cart, then send your order straight to the kitchen.')}</p></section><div id="guest-order-tracking">${renderTrackedTableOrders(trackedOrders)}</div><section class="table-menu-toolbar"><div><b>${products.length} dishes ready to order</b><span>Prices shown are the restaurant’s current menu prices.</span></div><a class="btn btn-primary" href="${tableCartUrl('table-cart', restaurantId, tableId)}">Open cart ${count ? `· ${count}` : ''} →</a></section>${products.length ? `<section class="menu-product-grid">${products.map(product => { const qty = cart.find(item => item.id === product.id)?.quantity || 0, photos = productPhotos(product), detailUrl = `${tableCartUrl('menu', restaurantId, tableId)}&product=${encodeURIComponent(product.id)}`; return `<article class="menu-product-card"><a class="table-dish-link" href="${detailUrl}" aria-label="View ${esc(product.name)} details"><div class="table-photo-gallery" data-table-photo-slideshow>${photos.length ? photos.map((photo, index) => `<img class="menu-product-image table-menu-slide ${index === 0 ? 'is-active' : ''}" data-table-photo src="${esc(optimizeCloudinaryImage(photo, 640))}" alt="${esc(product.name)} photo ${index + 1}" loading="lazy">`).join('') : '<div class="menu-product-image menu-product-placeholder">✦</div>'}${photos.length > 1 ? `<span class="table-photo-count">${photos.length} photos</span>` : ''}</div><div class="menu-product-category">${esc(product.categories?.name || 'Menu')}</div><h2>${esc(product.name)}</h2><p>${esc(product.description || 'Prepared fresh for your table.')}</p><span class="table-dish-open-label">View dish details ↗</span></a><footer><b>${money(product.price)}</b><button class="btn btn-primary" data-add-product="${esc(product.id)}" ${qty >= product.quantity ? 'disabled' : ''}>${qty ? `Add more · ${qty}` : 'Add to cart'}</button></footer><small>${product.quantity} available</small></article>`; }).join('')}</section>` : '<section class="panel empty">The restaurant has no available menu items right now.</section>'}${selected.length ? `<a class="table-cart-fab" href="${tableCartUrl('table-cart', restaurantId, tableId)}"><span><b>${count} item${count === 1 ? '' : 's'} in your cart</b><small>Review your order before sending it</small></span><strong>View cart →</strong></a>` : ''}`);
    app.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', () => {
      const product = products.find(item => item.id === button.dataset.addProduct);
      if (!product) return;
      const existing = cart.find(item => item.id === product.id);
      if ((existing?.quantity || 0) >= product.quantity) return;
      if (existing) existing.quantity += 1; else cart.push({ id: product.id, quantity: 1 });
      saveTableCart(restaurantId, tableId, cart);
      render();
    }));
    startSlideshow();
  };
  if (productId) renderDetail(); else render();
  app.removeAttribute('aria-busy');
  if (readTrackedOrderIds(restaurantId, tableId).length) {
    tableStatusPollTimer = setInterval(async () => {
      if (location.pathname !== '/menu.html' || new URLSearchParams(location.search).get('table') !== tableId) { stopTableStatusPolling(); return; }
      const latest = await refreshTrackedTableOrders({ supabase, restaurantId, tableId });
      if (latest !== null) {
        const current = JSON.stringify(trackedOrders.map(order => [order.order_id, order.status]));
        const next = JSON.stringify(latest.map(order => [order.order_id, order.status]));
        if (current !== next) {
          trackedOrders = latest;
          const tracker = app.querySelector('#guest-order-tracking');
          if (tracker) tracker.innerHTML = renderTrackedTableOrders(trackedOrders);
        }
        if (!latest.length) {
          justPlacedOrder = '';
          const notice = app.querySelector('#table-order-notice');
          if (notice) notice.innerHTML = '';
          stopTableStatusPolling();
        }
      }
    }, 7000);
  }
}

async function loadTableCartProducts({ supabase, restaurantId, cart }) {
  const ids = cart.map(item => item.id);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('products').select('id,name,description,price,image_url,quantity,available').eq('restaurant_id', restaurantId).in('id', ids);
  if (error) throw error;
  return data || [];
}

export async function renderPublicTableCart({ app, supabase, restaurantId, tableId }) {
  stopTableStatusPolling();
  showTablePageLoader(app, 'Loading your cart');
  const tableInfo = await getPublicTableContext({ app, supabase, restaurantId, tableId });
  let cart = readTableCart(restaurantId, tableId);
  let products = await loadTableCartProducts({ supabase, restaurantId, cart });
  const reconcile = () => { cart = cart.filter(item => products.some(product => product.id === item.id && product.available && product.quantity > 0)); saveTableCart(restaurantId, tableId, cart); };
  reconcile();
  const lines = () => cart.map(item => ({ ...item, product: products.find(product => product.id === item.id) })).filter(item => item.product);
  const render = () => {
    const currentLines = lines();
    const total = currentLines.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    app.innerHTML = tablePageShell(tableInfo, restaurantId, tableId, `<section class="table-page-heading"><span class="eyebrow">Your table · ${esc(tableInfo.table_number)}</span><h1>Your cart</h1><p>Make any changes here. You’ll confirm your name and kitchen notes at checkout.</p></section>${currentLines.length ? `<div class="table-order-layout"><section class="table-cart-lines">${currentLines.map(item => `<article class="table-cart-line"><div class="table-cart-thumb">${item.product.image_url ? `<img src="${esc(optimizeCloudinaryImage(item.product.image_url, 240))}" alt="">` : '✦'}</div><div class="table-cart-info"><span>${esc(tableInfo.restaurant_name)}</span><h2>${esc(item.product.name)}</h2><p>${money(item.product.price)} each</p><button class="cart-remove" data-remove="${esc(item.id)}">Remove</button></div><div class="quantity-control"><button type="button" data-qty="-1" data-id="${esc(item.id)}" aria-label="Decrease quantity">−</button><b>${item.quantity}</b><button type="button" data-qty="1" data-id="${esc(item.id)}" aria-label="Increase quantity" ${item.quantity >= item.product.quantity ? 'disabled' : ''}>+</button></div><b class="cart-line-total">${money(Number(item.product.price) * item.quantity)}</b></article>`).join('')}<a class="continue-shopping" href="${tableCartUrl('menu', restaurantId, tableId)}">← Add more dishes</a></section><aside class="table-order-summary"><span class="eyebrow">Order summary</span><h2>${esc(tableInfo.restaurant_name)}</h2><div class="table-summary-row"><span>${tableCartCount(cart)} items</span><b>${money(total)}</b></div><p>Payment is handled at the restaurant after you order.</p><a class="btn btn-primary full" href="${tableCartUrl('table-checkout', restaurantId, tableId)}">Continue to checkout →</a></aside></div>` : `<section class="store-empty"><span>＋</span><h2>Your cart is empty</h2><p>Pick something delicious from the menu to get started.</p><a class="btn btn-primary" href="${tableCartUrl('menu', restaurantId, tableId)}">Browse the menu</a></section>`}`);
    app.querySelectorAll('[data-qty]').forEach(button => button.addEventListener('click', () => {
      const item = cart.find(row => row.id === button.dataset.id), product = products.find(row => row.id === button.dataset.id);
      if (!item || !product) return;
      const next = item.quantity + Number(button.dataset.qty);
      if (next < 1) cart = cart.filter(row => row !== item); else item.quantity = Math.min(product.quantity, next);
      saveTableCart(restaurantId, tableId, cart); render();
    }));
    app.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { cart = cart.filter(item => item.id !== button.dataset.remove); saveTableCart(restaurantId, tableId, cart); render(); }));
  };
  render();
  app.removeAttribute('aria-busy');
}

export async function renderPublicTableCheckout({ app, supabase, restaurantId, tableId, toast }) {
  stopTableStatusPolling();
  showTablePageLoader(app, 'Loading checkout');
  const tableInfo = await getPublicTableContext({ app, supabase, restaurantId, tableId });
  let cart = readTableCart(restaurantId, tableId);
  let products = await loadTableCartProducts({ supabase, restaurantId, cart });
  cart = cart.filter(item => products.some(product => product.id === item.id && product.available && product.quantity > 0));
  saveTableCart(restaurantId, tableId, cart);
  const lines = () => cart.map(item => ({ ...item, product: products.find(product => product.id === item.id) })).filter(item => item.product);
  const render = () => {
    const currentLines = lines();
    if (!currentLines.length) {
      app.innerHTML = tablePageShell(tableInfo, restaurantId, tableId, `<section class="store-empty"><span>＋</span><h2>Nothing to check out yet</h2><p>Your table cart is empty. Add your favorites from the menu first.</p><a class="btn btn-primary" href="${tableCartUrl('menu', restaurantId, tableId)}">Browse the menu</a></section>`);
      app.removeAttribute('aria-busy');
      return;
    }
    const total = currentLines.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    app.innerHTML = tablePageShell(tableInfo, restaurantId, tableId, `<section class="table-page-heading"><span class="eyebrow">One last step · Table ${esc(tableInfo.table_number)}</span><h1>Ready to send it?</h1><p>Choose how you’d like your food, then share your name and any special requests.</p></section><div class="table-order-layout"><section class="checkout-card table-checkout-card"><form id="table-checkout-form"><span class="eyebrow">Guest details</span><h2>How would you like your order?</h2><label class="checkout-label" for="table-order-type">Order type</label><select id="table-order-type" name="kind" required><option value="dine_in">Dine in · served at this table</option><option value="takeaway">Takeaway · packed to go</option></select><label class="checkout-label" for="table-guest-name">Your name</label><input id="table-guest-name" name="guest_name" required maxlength="100" autocomplete="name" placeholder="Name for the order"><label class="checkout-label" for="table-order-notes">Notes for the kitchen <span>Optional</span></label><textarea id="table-order-notes" name="notes" maxlength="500" rows="4" placeholder="Allergies, spice preference or anything else"></textarea><div id="table-checkout-error" role="alert"></div><button class="btn btn-primary full" type="submit">Place order · ${money(total)}</button><p class="checkout-terms">No payment is collected online. Please pay at the restaurant.</p></form></section><aside class="table-order-summary"><span class="eyebrow">Your order · ${esc(tableInfo.table_number)}</span><h2>${esc(tableInfo.restaurant_name)}</h2><ul>${currentLines.map(item => `<li><span>${esc(item.product.name)} <small>× ${item.quantity}</small></span><b>${money(Number(item.product.price) * item.quantity)}</b></li>`).join('')}</ul><div class="table-summary-row"><span>Total</span><b>${money(total)}</b></div><a class="continue-shopping" href="${tableCartUrl('table-cart', restaurantId, tableId)}">← Back to cart</a></aside></div>`);
    app.querySelector('#table-checkout-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('[type="submit"]'), errorBox = form.querySelector('#table-checkout-error'), data = new FormData(form);
      setButtonLoading(button, 'Sending your order'); errorBox.innerHTML = '';
      try {
        const { data: orderId, error } = await supabase.rpc('place_table_order', {
          rid: restaurantId, tid: tableId,
          items: currentLines.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
          kind: String(data.get('kind') || 'dine_in'),
          guest_name: String(data.get('guest_name') || '').trim(),
          notes: String(data.get('notes') || '').trim() || null,
        });
        if (error) throw error;
        if (!orderId) throw new Error('The restaurant did not confirm this order. Please try again.');
        localStorage.removeItem(tableCartKey(restaurantId, tableId));
        const trackedIds = readTrackedOrderIds(restaurantId, tableId);
        localStorage.setItem(tableOrderIdsKey(restaurantId, tableId), JSON.stringify([...trackedIds, orderId].slice(-20)));
        sessionStorage.setItem(`restora_just_ordered:${restaurantId}:${tableId}`, '1');
        location.href = tableCartUrl('menu', restaurantId, tableId);
      } catch (error) {
        errorBox.innerHTML = `<div class="error">${esc(/place_table_order|schema cache|function .*does not exist/i.test(error.message || '') ? 'Table ordering is not enabled on this restaurant database yet. Please contact the restaurant team.' : error.message || 'We could not send your order. Please try again.')}</div>`;
        restoreButton(button, `Place order · ${money(total)}`);
      }
    });
  };
  render();
  app.removeAttribute('aria-busy');
}
