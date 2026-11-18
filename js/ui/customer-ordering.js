import { money } from '../services/money.js';
import { optimizeCloudinaryImage } from '../services/cloudinary.js';
import { svgIcon, setButtonLoading, restoreButton } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cartKey = 'restora_cart';
const readCart = () => { try { return JSON.parse(localStorage.getItem(cartKey) || '[]'); } catch { return []; } };
const saveCart = cart => localStorage.setItem(cartKey, JSON.stringify(cart));
const itemCount = cart => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
const loading = button => setButtonLoading(button, 'Placing order');
const restore = button => restoreButton(button);
const photosOf = product => [...new Set([...(Array.isArray(product.image_urls) ? product.image_urls : []), ...(product.image_url ? [product.image_url] : [])])];
const needsGalleryMigration = error => Boolean(error && /image_urls/i.test(error.message || '') && (['42703', 'PGRST204', 'PGRST200'].includes(error.code) || /(column|schema cache|field)/i.test(error.message || '')));
async function loadProductsWithGallery(query) {
  let result = await query(true);
  if (!needsGalleryMigration(result.error)) return result;
  result = await query(false);
  if (!result.error && result.data) {
    const withFallback = product => ({ ...product, image_urls: product.image_url ? [product.image_url] : [] });
    result.data = Array.isArray(result.data) ? result.data.map(withFallback) : withFallback(result.data);
  }
  return result;
}

function shell(title, subtitle, content, count = itemCount(readCart())) {
  return `<div class="customer-store"><header class="store-nav"><a class="brand" href="/customer/restaurants.html"><span class="brand-mark">${svgIcon('utensils-crossed')}</span>restora</a><nav><a href="/customer/restaurants.html">${svgIcon('store')} Restaurants</a><a class="store-cart-link" href="/customer/cart.html">${svgIcon('cart')} Cart <span>${count}</span></a></nav></header><main class="store-main"><div class="store-heading"><div><span class="eyebrow">Made for your appetite</span><h1>${title}</h1><p>${subtitle}</p></div></div>${content}</main><footer class="store-footer">A good meal is just around the corner.</footer></div>`;
}

export async function renderCustomerOrdering({ app, supabase, page, restaurantId, toast }) {
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = shell('Loading your table…', 'Fetching the latest menu and availability.', '<div class="store-skeleton-grid">' + Array.from({ length: 6 }, () => '<div class="store-skeleton"></div>').join('') + '</div>');
  const { data: { session } = {}, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const user = session?.user;
  if (!user) { location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`; return; }

  if (page === 'restaurants') {
    const { data, error } = await supabase.from('restaurants').select('id,name,description,cuisine_type,address,logo_url,cover_url').eq('status', 'active').order('name');
    if (error) throw error;
    app.innerHTML = shell('Find your next favourite.', 'Choose a restaurant and explore what is cooking.', data?.length ? `<section class="restaurant-card-grid">${data.map(restaurant => `<a class="restaurant-card" href="/customer/menu.html?restaurant=${encodeURIComponent(restaurant.id)}">${restaurant.cover_url ? `<img src="${esc(optimizeCloudinaryImage(restaurant.cover_url, 720))}" alt="${esc(restaurant.name)}" loading="lazy">` : '<div class="restaurant-card-art"><span>R</span></div>'}<div class="restaurant-card-body"><span class="eyebrow">${esc(restaurant.cuisine_type || 'Freshly prepared')}</span><h2>${esc(restaurant.name)}</h2><p>${esc(restaurant.description || restaurant.address || 'Explore the menu and order your favourites.')}</p><span class="restaurant-card-cta">View menu <b>↗</b></span></div></a>`).join('')}</section>` : '<div class="store-empty"><span>✦</span><h2>Restaurants are getting ready</h2><p>There are no active restaurants to browse yet. Please check back soon.</p></div>');
    app.removeAttribute('aria-busy');
    return;
  }

  if (page === 'menu' && !new URLSearchParams(location.search).has('product')) {
    if (!restaurantId) throw new Error('Choose a restaurant to view its menu.');
    const [{ data: restaurant, error: restaurantError }, { data: products, error: productsError }, { data: categories, error: categoryError }] = await Promise.all([
      supabase.from('restaurants').select('id,name,description,cuisine_type,cover_url').eq('id', restaurantId).eq('status', 'active').single(),
      loadProductsWithGallery(includeGallery => supabase.from('products').select(`id,name,description,price,image_url${includeGallery ? ',image_urls' : ''},quantity,category_id,categories(name)`).eq('restaurant_id', restaurantId).eq('available', true).gt('quantity', 0).order('name')),
      supabase.from('categories').select('id,name').eq('restaurant_id', restaurantId).order('name'),
    ]);
    if (restaurantError) throw restaurantError; if (productsError) throw productsError; if (categoryError) throw categoryError;
    let cart = readCart();
    const syncCartBadge = () => { const badge = document.querySelector('.store-cart-link span'); if (badge) badge.textContent = String(itemCount(cart)); };
    const renderProducts = () => {
      const term = (document.querySelector('#menu-search')?.value || '').trim().toLowerCase();
      const category = document.querySelector('#menu-category')?.value || '';
      const sort = document.querySelector('#menu-sort')?.value || 'popular';
      const filtered = (products || []).filter(product => (!category || product.category_id === category) && (!term || `${product.name} ${product.description || ''} ${product.categories?.name || ''}`.toLowerCase().includes(term)));
      if (sort === 'price-low') filtered.sort((a, b) => Number(a.price) - Number(b.price));
      if (sort === 'price-high') filtered.sort((a, b) => Number(b.price) - Number(a.price));
      const grid = document.querySelector('#menu-products');
      grid.innerHTML = filtered.length ? filtered.map(product => {
        const photos = photosOf(product), detailUrl = `/customer/menu.html?restaurant=${encodeURIComponent(restaurantId)}&product=${encodeURIComponent(product.id)}`;
        return `<article class="dish-card"><a class="dish-open" href="${detailUrl}" aria-label="View ${esc(product.name)} details"><div class="dish-slideshow" data-slideshow>${photos.length ? photos.map((photo, index) => `<img class="dish-image dish-slide ${index === 0 ? 'is-active' : ''}" src="${esc(optimizeCloudinaryImage(photo, 640))}" alt="${esc(product.name)} · photo ${index + 1}" loading="lazy">`).join('') : '<div class="dish-image dish-image-placeholder"><span>✦</span></div>'}${photos.length > 1 ? `<span class="dish-photo-count">${photos.length} photos</span>` : ''}</div><div class="dish-content"><span class="dish-category">${esc(product.categories?.name || restaurant.cuisine_type || 'From the kitchen')}</span><h2>${esc(product.name)}</h2><p>${esc(product.description || 'Prepared fresh for your order.')}</p><span class="dish-details-link">View dish details <b>↗</b></span></div></a><div class="dish-bottom"><div><b>${money(product.price)}</b><small>${product.quantity} available</small></div><button class="btn btn-primary" data-add="${esc(product.id)}">${cart.find(item => item.id === product.id)?.quantity ? `Add more · ${cart.find(item => item.id === product.id).quantity}` : 'Add to cart'}</button></div></article>`;
      }).join('') : '<div class="store-empty"><span>⌕</span><h2>No dishes match those filters</h2><p>Try another search or category.</p></div>';
      clearInterval(grid.slideTimer);
      const slideshows = [...grid.querySelectorAll('[data-slideshow]')].filter(el => el.querySelectorAll('.dish-slide').length > 1);
      if (slideshows.length) grid.slideTimer = setInterval(() => slideshows.forEach(show => {
        const slides = [...show.querySelectorAll('.dish-slide')], current = slides.findIndex(slide => slide.classList.contains('is-active'));
        slides[current]?.classList.remove('is-active'); slides[(current + 1) % slides.length]?.classList.add('is-active');
      }), 3600);
      grid.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
        const product = products.find(item => item.id === button.dataset.add);
        if (!product) return;
        if (cart.some(item => item.restaurant_id !== restaurantId)) { if (!confirm('Your cart has dishes from another restaurant. Clear it and add this dish?')) return; cart = []; }
        const existing = cart.find(item => item.id === product.id);
        if ((existing?.quantity || 0) >= product.quantity) { toast('That is all the available stock for this dish.'); return; }
        if (existing) existing.quantity += 1; else cart.push({ id: product.id, restaurant_id: restaurantId, quantity: 1 });
        saveCart(cart); syncCartBadge(); renderProducts(); toast('Added to your cart.');
      }));
    };
    app.innerHTML = shell(esc(restaurant.name), esc(restaurant.description || `${restaurant.cuisine_type || 'A fresh menu'}, made for good moments.`), `<div class="menu-cover ${restaurant.cover_url ? 'has-cover' : ''}" ${restaurant.cover_url ? `style="background-image:url('${esc(optimizeCloudinaryImage(restaurant.cover_url, 1440))}')"` : ''}><span>${esc(restaurant.cuisine_type || 'A seat at the table')}</span><b>Thoughtful food. Made fresh.</b></div><section class="menu-tools"><label class="menu-search"><span>⌕</span><input id="menu-search" type="search" placeholder="Search dishes or ingredients" aria-label="Search dishes"></label><select id="menu-category" aria-label="Filter by category"><option value="">All categories</option>${(categories || []).map(category => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('')}</select><select id="menu-sort" aria-label="Sort menu"><option value="popular">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></section><div class="menu-results"><span>${(products || []).length} dishes available</span><a href="/customer/cart.html">View cart →</a></div><section id="menu-products" class="dish-grid"></section>`);
    app.removeAttribute('aria-busy');
    document.querySelectorAll('#menu-search,#menu-category,#menu-sort').forEach(control => control.addEventListener(control.id === 'menu-search' ? 'input' : 'change', renderProducts));
    renderProducts();
    return;
  }

  if (page === 'dish' || (page === 'menu' && new URLSearchParams(location.search).has('product'))) {
    const productId = new URLSearchParams(location.search).get('product');
    if (!restaurantId || !productId) throw new Error('Choose a dish to view its details.');
    const [{ data: restaurant, error: restaurantError }, { data: product, error: productError }] = await Promise.all([
      supabase.from('restaurants').select('id,name,cuisine_type').eq('id', restaurantId).eq('status', 'active').single(),
      loadProductsWithGallery(includeGallery => supabase.from('products').select(`id,name,description,price,image_url${includeGallery ? ',image_urls' : ''},quantity,available,categories(name)`).eq('id', productId).eq('restaurant_id', restaurantId).eq('available', true).single()),
    ]);
    if (restaurantError) throw restaurantError; if (productError) throw productError;
    const photos = photosOf(product), cart = readCart();
    app.innerHTML = shell('Meet your next favourite.', `A closer look at ${restaurant.name}.`, `<section class="dish-detail"><div class="dish-detail-gallery">${photos.length ? photos.map((photo, index) => `<img class="dish-detail-photo ${index === 0 ? 'is-active' : ''}" data-detail-slide src="${esc(optimizeCloudinaryImage(photo, 1000))}" alt="${esc(product.name)} · photo ${index + 1}" ${index ? 'hidden' : ''}>`).join('') : '<div class="dish-detail-placeholder">✦</div>'}${photos.length > 1 ? `<button class="dish-gallery-arrow previous" type="button" aria-label="Previous photo">‹</button><button class="dish-gallery-arrow next" type="button" aria-label="Next photo">›</button><div class="dish-gallery-dots">${photos.map((_, index) => `<button type="button" data-detail-dot="${index}" class="${index === 0 ? 'is-active' : ''}" aria-label="Show photo ${index + 1}"></button>`).join('')}</div>` : ''}</div><div class="dish-detail-copy"><a class="continue-shopping" href="/customer/menu.html?restaurant=${encodeURIComponent(restaurantId)}">${svgIcon('arrow-left')} Back to ${esc(restaurant.name)} menu</a><span class="dish-category">${esc(product.categories?.name || restaurant.cuisine_type || 'From the kitchen')}</span><h2>${esc(product.name)}</h2><b class="dish-detail-price">${money(product.price)}</b><p>${esc(product.description || 'Prepared fresh for your order.')}</p><div class="dish-detail-fresh">✦ Made fresh to order</div><button class="btn btn-primary" data-detail-add>${cart.find(item => item.id === product.id)?.quantity ? 'Add another to cart' : 'Add to cart'} · ${money(product.price)}</button></div></section>`);
    const detailSlides = [...document.querySelectorAll('[data-detail-slide]')], dots = [...document.querySelectorAll('[data-detail-dot]')];
    let activePhoto = 0;
    const showPhoto = index => { if (!detailSlides.length) return; activePhoto = (index + detailSlides.length) % detailSlides.length; detailSlides.forEach((slide, i) => { slide.hidden = i !== activePhoto; slide.classList.toggle('is-active', i === activePhoto); }); dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activePhoto)); };
    document.querySelector('.dish-gallery-arrow.previous')?.addEventListener('click', () => showPhoto(activePhoto - 1));
    document.querySelector('.dish-gallery-arrow.next')?.addEventListener('click', () => showPhoto(activePhoto + 1));
    dots.forEach((dot, index) => dot.addEventListener('click', () => showPhoto(index)));
    document.querySelector('[data-detail-add]')?.addEventListener('click', event => {
      let currentCart = readCart();
      if (currentCart.some(item => item.restaurant_id !== restaurantId)) { if (!confirm('Your cart has dishes from another restaurant. Clear it and add this dish?')) return; currentCart = []; }
      const existing = currentCart.find(item => item.id === product.id);
      if ((existing?.quantity || 0) >= product.quantity) { toast('That is all the available stock for this dish.'); return; }
      if (existing) existing.quantity++; else currentCart.push({ id: product.id, restaurant_id: restaurantId, quantity: 1 });
      saveCart(currentCart); event.currentTarget.textContent = 'Added · add another'; toast('Added to your cart.');
    });
    app.removeAttribute('aria-busy');
    return;
  }

  let cart = readCart();
  if (!cart.length) {
    app.innerHTML = shell(page === 'checkout' ? 'Your cart is empty.' : 'A little room for something delicious.', 'Add a few dishes to get started.', '<div class="store-empty"><span>＋</span><h2>Nothing on the order yet</h2><p>Browse a restaurant and add the dishes you love.</p><a class="btn btn-primary" href="/customer/restaurants.html">Browse restaurants</a></div>');
    app.removeAttribute('aria-busy');
    return;
  }
  const restaurantIdForCart = cart[0].restaurant_id;
  cart = cart.filter(item => item.restaurant_id === restaurantIdForCart);
  saveCart(cart);
  const ids = cart.map(item => item.id);
  const [{ data: products, error: productError }, { data: restaurant, error: restaurantError }] = await Promise.all([
    supabase.from('products').select('id,name,description,price,image_url,quantity,available').eq('restaurant_id', restaurantIdForCart).in('id', ids),
    supabase.from('restaurants').select('id,name,address,phone').eq('id', restaurantIdForCart).single(),
  ]);
  if (productError) throw productError; if (restaurantError) throw restaurantError;
  const liveProducts = products || [];
  const reconcile = () => cart = cart.filter(item => liveProducts.some(product => product.id === item.id && product.available && product.quantity > 0));
  reconcile(); saveCart(cart);
  const getLines = () => cart.map(item => ({ ...item, product: liveProducts.find(product => product.id === item.id) })).filter(item => item.product);
  const subtotal = () => getLines().reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  const renderCart = () => {
    const lines = getLines();
    app.innerHTML = shell(page === 'checkout' ? 'Make it yours.' : 'Your cart.', esc(restaurant.name), page === 'checkout' ? `<div class="checkout-layout"><section class="checkout-card"><form id="checkout-form"><span class="eyebrow">Almost there</span><h2>How should we prepare this?</h2><label class="checkout-label" for="order-type">Order type</label><select id="order-type" name="kind"><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option></select><div id="delivery-address-wrap" hidden><label class="checkout-label" for="delivery-address">Delivery address</label><textarea id="delivery-address" name="delivery_address" rows="2" maxlength="300" placeholder="House/flat, street, area and city"></textarea></div><label class="checkout-label" for="payment-method">Payment method</label><select id="payment-method" name="pay_method"><option value="cash_at_restaurant">Pay at the restaurant</option><option value="cash_on_delivery">Cash on delivery</option></select><label class="checkout-label" for="order-notes">Notes for the kitchen <span>Optional</span></label><textarea id="order-notes" name="notes" rows="3" maxlength="500" placeholder="Allergies, spice preference or anything else"></textarea><div id="checkout-error" role="alert"></div><button type="submit" class="btn btn-primary full">Place order · ${money(subtotal())}</button><p class="checkout-terms">You’ll pay when your food is served or delivered.</p></form></section>${summary(lines, restaurant)}</div>` : `<div class="cart-layout"><section class="cart-lines">${lines.map(item => `<article class="cart-line"><div class="cart-thumb">${item.product.image_url ? `<img src="${esc(optimizeCloudinaryImage(item.product.image_url, 240))}" alt="">` : `<span>${svgIcon('utensils')}</span>`}</div><div class="cart-line-info"><span>${esc(restaurant.name)}</span><h2>${esc(item.product.name)}</h2><p>${money(item.product.price)} each</p><button class="cart-remove" data-remove="${esc(item.id)}">${svgIcon('trash')} Remove</button></div><div class="quantity-control"><button type="button" data-qty="-1" data-id="${esc(item.id)}" aria-label="Decrease quantity">${svgIcon('minus')}</button><b>${item.quantity}</b><button type="button" data-qty="1" data-id="${esc(item.id)}" aria-label="Increase quantity" ${item.quantity >= item.product.quantity ? 'disabled' : ''}>${svgIcon('plus')}</button></div><b class="cart-line-total">${money(Number(item.product.price) * item.quantity)}</b></article>`).join('') || '<div class="store-empty">Your cart is empty.</div>'}<a class="continue-shopping" href="/customer/menu.html?restaurant=${encodeURIComponent(restaurantIdForCart)}">${svgIcon('arrow-left')} Keep exploring the menu</a></section>${summary(lines, restaurant, true)}</div>`);
    app.removeAttribute('aria-busy');
    const orderType = document.querySelector('#order-type');
    const addressWrap = document.querySelector('#delivery-address-wrap');
    const addressInput = document.querySelector('#delivery-address');
    const syncDeliveryFields = () => { const isDelivery = orderType?.value === 'delivery'; addressWrap.hidden = !isDelivery; addressInput.required = isDelivery; };
    orderType?.addEventListener('change', syncDeliveryFields);
    syncDeliveryFields();
    bindCart();
  };
  const bindCart = () => {
    document.querySelectorAll('[data-qty]').forEach(button => button.addEventListener('click', () => {
      const item = cart.find(row => row.id === button.dataset.id), product = liveProducts.find(row => row.id === button.dataset.id);
      if (!item || !product) return;
      const next = item.quantity + Number(button.dataset.qty);
      if (next < 1) cart = cart.filter(row => row !== item); else item.quantity = Math.min(product.quantity, next);
      saveCart(cart); renderCart();
    }));
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { cart = cart.filter(item => item.id !== button.dataset.remove); saveCart(cart); renderCart(); }));
    document.querySelector('#checkout-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('[type="submit"]'), error = form.querySelector('#checkout-error');
      if (!cart.length) return;
      loading(button); error.innerHTML = '';
      const data = new FormData(form);
      try {
        const sessionResult = await supabase.auth.getSession();
        if (!sessionResult.data.session) { location.href = `/login.html?next=${encodeURIComponent('/customer/checkout.html')}`; return; }
        let orderResult = await supabase.rpc('place_order', {
          rid: restaurantIdForCart,
          items: cart.map(item => ({ product_id: item.id, quantity: item.quantity })),
          kind: data.get('kind'), pay_method: data.get('pay_method'), order_notes: data.get('notes') || null, delivery_address: data.get('delivery_address') || null,
        });
        // Keep checkout usable against projects that have the original 4-argument RPC
        // until the checkout-details migration has been applied.
        if (orderResult.error && (orderResult.error.code === 'PGRST202' || /schema cache|function .*place_order/i.test(orderResult.error.message || ''))) {
          if (data.get('kind') === 'delivery') throw new Error('Delivery checkout is not enabled on this restaurant yet. Please choose takeaway or ask the restaurant to update its database.');
          orderResult = await supabase.rpc('place_order', {
            rid: restaurantIdForCart,
            items: cart.map(item => ({ product_id: item.id, quantity: item.quantity })),
            kind: data.get('kind'), pay_method: data.get('pay_method'),
          });
        }
        const { data: orderId, error: orderError } = orderResult;
        if (orderError) throw orderError;
        if (!orderId) throw new Error('The restaurant did not confirm the order. Please try again.');
        const { data: orderNumberRow, error: orderNumberError } = await supabase.from('orders').select('order_number').eq('id', orderId).single();
        if (orderNumberError) throw orderNumberError;
        localStorage.removeItem(cartKey);
        app.innerHTML = shell('Order sent to the kitchen.', 'Your restaurant has received the order.', `<div class="order-success"><div class="order-success-mark">✓</div><span class="eyebrow">Order confirmed</span><h2>We’re getting it ready.</h2><p>Order <b>#${esc(String(orderNumberRow.order_number).padStart(6, '0'))}</b> is now with ${esc(restaurant.name)}. Pay when you collect or receive it.</p><a class="btn btn-primary" href="/customer/orders.html">View your orders</a><a class="continue-shopping" href="/customer/restaurants.html">Back to restaurants</a></div>`, 0);
        toast('Your order has been placed.');
      } catch (error) {
        const message = error.message || 'We could not place your order. Please try again.';
        error.innerHTML = `<div class="error">${esc(message.includes('place_order') || message.includes('schema cache') ? 'Ordering is not enabled on the restaurant database yet. Please try again shortly.' : message)}</div>`;
        restore(button);
      }
    });
  };
  renderCart();
}

export function renderCustomerOrdersPanel(orders) {
  const activeOrders = orders.filter(order => !['completed', 'cancelled'].includes(order.status));
  const pastOrders = orders.filter(order => ['completed', 'cancelled'].includes(order.status));
  const statusLabel = status => ({ pending: 'Order placed', confirmed: 'Accepted', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' }[status] || status);
  const card = order => {
    const type = order.order_type || 'takeaway';
    const isDone = order.status === 'completed';
    const isCancelled = order.status === 'cancelled';
    const steps = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
    const currentStep = steps.indexOf(order.status);
    const items = order.order_items || [];
    return `<article class="customer-order-card ${isDone ? 'is-complete' : ''}"><header class="customer-order-card-head"><div><span class="eyebrow">${esc(type.replaceAll('_', ' '))} · ${esc(new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</span><h2>${esc(order.restaurants?.name || 'Restaurant')}</h2></div><span class="badge ${esc(order.status)}">${esc(type === 'delivery' && isDone ? 'Delivered' : statusLabel(order.status))}</span></header><div class="customer-order-meta"><span>Order #${esc(String(order.order_number).padStart(6, '0'))}</span><b>${money(order.total)}</b></div>${isCancelled ? `<p class="customer-order-cancelled">This order was cancelled.</p>` : `<ol class="order-progress" aria-label="Order status: ${esc(statusLabel(order.status))}">${steps.map((step, index) => `<li class="${index < currentStep || isDone ? 'is-done' : ''} ${index === currentStep ? 'is-current' : ''}"><span class="progress-dot">${index < currentStep || isDone ? '✓' : index + 1}</span><span>${step === 'completed' && type === 'delivery' ? 'Delivered' : step === 'completed' && type === 'dine_in' ? 'Served' : statusLabel(step)}</span></li>`).join('')}</ol>`}<details class="customer-order-details"><summary>Items in this order (${items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)})</summary><ul>${items.map(item => `<li><span>${esc(item.name_snapshot)} × ${esc(item.quantity)}</span><b>${money(Number(item.unit_price) * Number(item.quantity))}</b></li>`).join('') || '<li>Item details unavailable.</li>'}</ul>${order.notes ? `<p><b>Order notes:</b> ${esc(order.notes)}</p>` : ''}</details></article>`;
  };
  return `<section class="customer-orders-page"><div class="customer-orders-heading"><div><span class="eyebrow">Your orders</span><h2>Follow your meal</h2><p>Status updates appear here as the restaurant moves your order along.</p></div><a class="btn btn-ghost" href="/customer/restaurants.html">Order again</a></div>${activeOrders.length ? `<h3 class="customer-orders-section-title">In progress</h3><div class="customer-orders-list">${activeOrders.map(card).join('')}</div>` : `<div class="store-empty customer-no-orders"><span>✓</span><h2>No orders in progress</h2><p>Your active orders will show up here as soon as you place one.</p><a class="btn btn-primary" href="/customer/restaurants.html">Browse restaurants</a></div>`}${pastOrders.length ? `<h3 class="customer-orders-section-title past">Past orders</h3><div class="customer-orders-list">${pastOrders.map(card).join('')}</div>` : ''}</section>`;
}

function summary(lines, restaurant, showCheckout = false) {
  const total = lines.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  return `<aside class="order-summary"><span class="eyebrow">Order summary</span><h2>${esc(restaurant.name)}</h2><ul>${lines.map(item => `<li><span>${esc(item.product.name)} <small>× ${item.quantity}</small></span><b>${money(Number(item.product.price) * item.quantity)}</b></li>`).join('')}</ul><div class="summary-total"><span>Subtotal</span><b>${money(total)}</b></div><p>Taxes, if any, are calculated by the restaurant.</p>${showCheckout ? `<a class="btn btn-primary full" href="/customer/checkout.html">Continue to checkout <span>→</span></a>` : ''}</aside>`;
}
