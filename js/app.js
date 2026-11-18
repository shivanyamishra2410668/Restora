import { configured, supabase } from './config/supabase.js';

import { getContext, requireUser, signOut } from './auth/session.js';

import { rows, insert, update, remove, count } from './services/data.js';
import { money } from './services/money.js';
import { renderDynamicSkeleton } from './ui/skeletons.js';
import { renderDashboardFrame, renderDashboardData } from './ui/dashboard-frame.js';
import { readPageCache, writePageCache, invalidatePageCache } from './services/cache.js';
import { uploadProductImage, optimizeCloudinaryImage } from './services/cloudinary.js';
import { renderStaffPanel, openStaffForm, renderKitchenPanel } from './ui/team.js';
import { renderTablesPanel, renderOrdersPanel, showTableQr, renderPublicTableMenu, renderPublicTableCart, renderPublicTableCheckout } from './ui/table-order.js';
import { renderCustomerOrdering, renderCustomerOrdersPanel } from './ui/customer-ordering.js';
import { svgIcon, setButtonLoading, restoreButton, loadingMarkup } from './ui/icons.js';



const app=document.querySelector('#app'); const path=location.pathname; const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let kitchenFilterState = { search: '', status: '', type: '', label: '' };

const brand=`<a class="brand" href="/"><span class="brand-mark">${svgIcon('utensils-crossed')}</span>restora</a>`;

function hydrateSvgIcons(root = app) {
  const candidates = root.matches?.('[data-svg-icon]') ? [root] : [];
  const found = root.querySelectorAll ? root.querySelectorAll('[data-svg-icon],a,.brand-mark,.feature-icon,.store-empty>span,.dish-image-placeholder span,.menu-product-placeholder,.restaurant-card-art span,.menu-search>span,.restaurant-card-cta b,.guest-step-icon,.progress-dot,.quantity-control button[data-qty],.cart-remove,.continue-shopping,.table-cart-fab strong,.order-success-mark,.table-order-placed-banner,.cart-thumb,.table-cart-thumb') : [];
  candidates.push(...found);
  for (const element of candidates) {
    if (element.dataset.svgIconized || element.querySelector('svg') || element.querySelector('img')) continue;
    const content = element.textContent.trim();
    let arrowMatch = element.matches('a') ? content.match(/(->|→|↗|←)\s*$/) : null;
    if (element.querySelector('.restaurant-card-cta b,.table-cart-fab strong')) arrowMatch = null;
    let name = element.dataset.svgIcon || (element.matches('.brand-mark') ? 'utensils-crossed'
      : element.matches('.feature-icon') ? ({ K: 'chef', '*': 'sparkle', '->': 'activity' }[content])
      : element.matches('.store-empty>span') ? ({ '✓': 'check', '✦': 'sparkle', '＋': 'plus', '⌕': 'search' }[content])
        : element.matches('.dish-image-placeholder span,.menu-product-placeholder,.cart-thumb,.table-cart-thumb') ? 'utensils'
          : element.matches('.restaurant-card-art span') ? 'store'
            : element.matches('.menu-search>span') ? 'search'
              : element.matches('.restaurant-card-cta b') ? 'arrow-up-right'
                : element.matches('.guest-step-icon') ? (element.closest('li')?.classList.contains('is-done') || content === '✓' ? 'check' : content === '◷' ? 'clock' : content === '♨' ? 'flame' : 'sparkle')
                : element.matches('.progress-dot,.order-success-mark,.table-order-placed-banner') && content.includes('✓') ? 'check'
                    : element.matches('.quantity-control button[data-qty]') ? (element.dataset.qty === '-1' ? 'minus' : 'plus')
                      : element.matches('.cart-remove') ? 'trash'
                        : element.matches('.continue-shopping') ? 'arrow-left'
                        : element.matches('.table-cart-fab strong') ? 'arrow-right' : null);
    if (!name && arrowMatch) name = ({ '->': 'arrow-right', '→': 'arrow-right', '↗': 'arrow-up-right', '←': 'arrow-left' })[arrowMatch[1]];
    if (!name) continue;
    if (element.matches('.cart-remove,.table-order-placed-banner')) element.innerHTML = `${svgIcon(name)} ${content.replace('✓', '').trim()}`;
    else if (element.matches('.continue-shopping,.table-cart-fab strong')) element.innerHTML = `${svgIcon(name)} ${content.replace(/^(←|→)\s*/, '')}`;
    else if (arrowMatch) {
      const last = [...element.childNodes].reverse().find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() || node.nodeType === Node.ELEMENT_NODE && node.textContent.trim());
      if (last) {
        if (last.nodeType === Node.TEXT_NODE) last.textContent = last.textContent.replace(/(->|→|↗|←)\s*$/, '').trimEnd();
        else last.textContent = last.textContent.replace(/(->|→|↗|←)\s*$/, '').trimEnd();
      }
      const wrapper = document.createElement('span'); wrapper.innerHTML = svgIcon(name); element.append(wrapper.firstElementChild);
    }
    else element.innerHTML = svgIcon(name);
    element.dataset.svgIconized = 'true';
  }
}

new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === Node.ELEMENT_NODE) hydrateSvgIcons(node);
}))).observe(app, { childList: true, subtree: true });

function toast(s){const n=document.createElement('div');n.className='toast';n.textContent=s;document.body.append(n);setTimeout(()=>n.remove(),3000)}
function renderLoadError(error){app.removeAttribute('aria-busy');app.innerHTML=`<main class="dash-content"><div class="error">${esc(error?.message||'Unable to load this page.')}</div></main>`;}

function landing(){app.innerHTML=`<div class="shell"><header class="topbar">${brand}<nav class="navlinks"><a href="#features">Platform</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="/login.html">Log in</a><a class="btn btn-primary" href="/register.html">Start free</a></nav></header><main><section class="hero"><div><div class="eyebrow">Restaurant operations, in rhythm</div><h1>Run your restaurant. <span>Beautifully.</span></h1><p>One calm, connected workspace for your menu, orders, people and performance. Built for the pace of hospitality.</p><div class="hero-actions"><a class="btn btn-primary" href="/register.html">Get started free -></a><a class="btn btn-ghost" href="#features">Explore the platform</a></div><p style="font-size:12px;margin-top:17px">One workspace. Every service. No operational blind spots.</p></div><div class="hero-art"><div class="plate"></div><div class="floating float-one">* &nbsp;Today's service <b>is flowing</b></div><div class="floating float-two">-> &nbsp;Orders on track <b>92%</b></div></div></section><section id="features" class="section"><div class="eyebrow">The whole house, connected</div><h2>More focus on the food.<br>Less time chasing details.</h2><p class="section-intro">Bring front of house, kitchen and back office into one clear view. Restora helps your team move together, from first order to close.</p><div class="feature-grid"><article class="feature"><div class="feature-icon">K</div><h3>Orders in motion</h3><p>See every order move from placed to ready in a live, shared view.</p></article><article class="feature"><div class="feature-icon">*</div><h3>A menu that works</h3><p>Keep dishes, categories, pricing and availability organized by restaurant.</p></article><article class="feature"><div class="feature-icon">-></div><h3>Know your numbers</h3><p>Understand service volume and business activity as your operation grows.</p></article></div></section><section id="how" class="section"><div class="eyebrow">Getting started</div><h2>Set up once. Get in sync.</h2><div class="feature-grid"><article class="feature"><h3>01 &nbsp; Create your workspace</h3><p>Register your restaurant and submit a short application.</p></article><article class="feature"><h3>02 &nbsp; Bring in your team</h3><p>Invite the people who make each service happen.</p></article><article class="feature"><h3>03 &nbsp; Run your service</h3><p>Manage menus and orders from a role-aware workspace.</p></article></div></section><section id="pricing" class="section"><div class="eyebrow">Plans that grow with you</div><h2>Start simple. Scale with confidence.</h2><div class="pricing"><article class="price-card"><h3>Free</h3><p>For getting your operation organized.</p><div class="price">₹0 <small>/ month</small></div><ul><li>Restaurant workspace</li><li>Menu and order basics</li><li>Team access</li></ul></article><article class="price-card" style="border-color:#e77b45"><h3>Basic</h3><p>For teams building a steady rhythm.</p><div class="price">₹29 <small>/ month</small></div><ul><li>Everything in Free</li><li>Operational reports</li><li>Inventory tools</li></ul></article><article class="price-card"><h3>Premium</h3><p>For multi-location ambition.</p><div class="price">₹79 <small>/ month</small></div><ul><li>Everything in Basic</li><li>Advanced analytics</li><li>Priority support</li></ul></article></div></section><section class="cta"><div><h2>Make room for a better service.</h2><p>Bring your operation into focus with Restora.</p></div><a class="btn btn-primary" href="/register.html">Create your workspace -></a></section></main><footer class="footer"><span>(c) 2026 Restora. Made for hospitality.</span><span>Restaurant operations, in rhythm.</span></footer></div>`;}

function authPage(kind){const signup=kind==='register';const forgot=kind==='forgot-password';const reset=kind==='login'&&new URLSearchParams(location.search).has('reset');app.innerHTML=`<div class="auth-wrap"><aside class="auth-side">${brand}<div><div class="eyebrow">A clearer way to run service</div><h2>${signup?'Build a smoother service from day one.':forgot?'Back to business, soon.':'The details handled. The hospitality, all yours.'}</h2><p>One connected workspace for the team, the menu and every moment that makes a restaurant work.</p></div><small style="color:#94a098">(c) 2026 Restora</small></aside><main class="auth-form-wrap"><form class="auth-form" id="auth-form">${brand}<h1>${signup?'Create your workspace':forgot||reset?'Reset your password':'Welcome back'}</h1><p>${signup?'Tell us about you and your restaurant.':reset?'Choose a new password.':forgot?'We will email a secure reset link.':'Sign in to continue to your workspace.'}<br>${!configured?'<span style="color:#b46e25">Supabase setup is required to authenticate.</span>':''}</p>${signup?`<div class="field"><label>Your name</label><input name="name" required autocomplete="name" placeholder="Alex Morgan"></div><div class="field"><label>Account type</label><select name="account_type" id="account-type"><option value="owner">Restaurant owner</option><option value="customer">Customer</option><option value="staff">Staff member</option></select></div><div id="owner-fields"><div class="field"><label>Restaurant name</label><input name="restaurant" placeholder="The Olive Room"></div><div class="field"><label>Phone</label><input name="phone" placeholder="+1 555 000 0000"></div><div class="field"><label>Restaurant address</label><input name="address" placeholder="Street, city"></div><div class="field"><label>Cuisine type</label><input name="cuisine" placeholder="Mediterranean"></div></div>`:''}${!reset?`<div class="field"><label>Email address</label><input name="email" type="email" required autocomplete="email" placeholder="you@restaurant.com"></div>`:''}${!forgot?`<div class="field"><label>${reset?'New password':'Password'}</label><input name="password" type="password" required minlength="8" autocomplete="${signup||reset?'new-password':'current-password'}" placeholder="At least 8 characters"></div>`:''}${!signup&&!forgot&&!reset?`<div class="form-foot"><label><input type="checkbox" name="remember" checked> Remember me</label><a href="/forgot-password.html">Forgot password?</a></div>`:''}<div id="form-error"></div><button class="btn btn-primary full" ${!configured?'disabled':''}>${signup?'Create account':forgot?'Send reset link':reset?'Save new password':'Log in'}</button><div class="form-foot" style="justify-content:center;gap:5px">${signup?'Already have an account?':'New to Restora?'} <a href="${signup?'/login.html':'/register.html'}">${signup?'Log in':'Create an account'}</a></div></form></main></div>`;

const notice=sessionStorage.getItem('restora_notice');if(notice){sessionStorage.removeItem('restora_notice');toast(notice);}if(signup){const sel=document.querySelector('#account-type'),box=document.querySelector('#owner-fields');const refresh=()=>{box.hidden=sel.value!=='owner';box.querySelectorAll('input').forEach(i=>i.required=sel.value==='owner'&&(i.name==='restaurant'||i.name==='address'));};sel.addEventListener('change',refresh);refresh();}document.querySelector('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),err=document.querySelector('#form-error'),btn=e.currentTarget.querySelector('button');setButtonLoading(btn, signup ? 'Creating account' : forgot ? 'Sending link' : reset ? 'Saving password' : 'Signing in');err.innerHTML='';try{if(forgot){const {error}=await supabase.auth.resetPasswordForEmail(f.get('email'),{redirectTo:location.origin+'/login.html?reset=1'});if(error)throw error;toast('Password reset email sent.');restoreButton(btn);return;}if(reset){const {error}=await supabase.auth.updateUser({password:f.get('password')});if(error)throw error;toast('Password changed.');await routeAfterLogin();return;}if(signup){const accountType=f.get('account_type'),business=accountType==='owner',staffAccount=accountType==='staff';const metadata={full_name:f.get('name')};if(business)Object.assign(metadata,{restaurant_name:f.get('restaurant'),owner_name:f.get('name'),phone:f.get('phone'),address:f.get('address'),cuisine_type:f.get('cuisine')});const {data,error}=await supabase.auth.signUp({email:f.get('email'),password:f.get('password'),options:{data:metadata}});if(error)throw error;if(data.session){if(staffAccount){await supabase.auth.signOut();sessionStorage.setItem('restora_notice','Staff account created. Ask the restaurant admin to add this email, then sign in here.');location.href='/login.html';}else{toast('Account created.');await routeAfterLogin();}}else{sessionStorage.setItem('restora_notice',staffAccount?'Account created. Confirm your email if prompted, then ask the restaurant admin to add this email.':'Account created. Sign in to continue. If email confirmation is enabled, confirm your address first.');location.href=staffAccount?'/login.html':'/login.html';}return;}const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)throw error;await routeAfterLogin();}catch(ex){err.innerHTML=`<div class="error">${esc(ex.message)}</div>`;restoreButton(btn);}});}

const configWarning=()=>!configured?'<div class="panel"><b>Connect Supabase to continue</b><p>Copy .env.example to .env.local and add your project URL and publishable key, then restart Vite.</p></div>':'';

function membershipHome(member){return member?.role==='kitchen_staff'?'/kitchen/dashboard.html':member?.role==='waiter'?'/waiter/dashboard.html':'/restaurant/dashboard.html';}
async function routeAfterLogin(){const next=new URLSearchParams(location.search).get('next'),c=await getContext();if(!c){location.href='/login.html';return}const ms=c.memberships.filter(m=>m.active&&m.restaurants?.status==='active');if(c.isSuperAdmin){location.href='/super-admin/dashboard.html';return}if(next?.startsWith('/')&&!next.startsWith('//')){const isStaffArea=/^\/(kitchen|waiter|restaurant)\//.test(next);if(isStaffArea&&ms.length===1){const home=membershipHome(ms[0]),allowed=next.startsWith('/kitchen/')?home.startsWith('/kitchen/'):next.startsWith('/waiter/')?home.startsWith('/waiter/'):home.startsWith('/restaurant/');location.href=allowed?next:home;return}if(isStaffArea&&ms.length>1){location.href='/workspace.html';return}location.href=next;return}if(ms.length>1){location.href='/workspace.html';return}if(ms.length===1){location.href=membershipHome(ms[0]);return}const {data:apps}=await supabase.from('restaurant_applications').select('status').eq('owner_id',c.user.id).limit(1);if(apps?.length){location.href='/application.html';return}location.href='/customer/restaurants.html';}

const navByRole={restaurant_owner:['Overview','Products','Categories','Orders','Inventory','Tables','Employees','Reports','Settings'],manager:['Overview','Products','Categories','Orders','Inventory','Tables','Employees','Reports','Settings'],super_admin:['Overview','Restaurants'],kitchen_staff:['Kitchen queue','Order history'],waiter:['Tables','Orders','Ready orders'],customer:['Restaurants','My orders','Cart','Reservations']};

const routeMap={'Overview':'/restaurant/dashboard.html','Products':'/restaurant/products.html','Categories':'/restaurant/categories.html','Orders':'/restaurant/orders.html','Inventory':'/restaurant/inventory.html','Tables':'/restaurant/tables.html','Employees':'/restaurant/employees.html','Reports':'/restaurant/reports.html','Settings':'/restaurant/settings.html','Restaurants':'/super-admin/restaurants.html','Users':'/super-admin/users.html','Subscriptions':'/super-admin/subscriptions.html','Analytics':'/super-admin/analytics.html','Kitchen queue':'/kitchen/dashboard.html','Order history':'/kitchen/history.html','Ready orders':'/waiter/ready.html','My orders':'/customer/orders.html','Reservations':'/customer/reservations.html','Cart':'/customer/cart.html'};

function currentTitle(){if(path.includes('menu'))return 'Menu';if(path.includes('products'))return 'Products';if(path.includes('categories'))return 'Categories';if(path.includes('orders')||path.includes('waiter'))return path.includes('ready')?'Ready orders':'Orders';if(path.includes('inventory'))return 'Inventory';if(path.includes('tables'))return 'Tables';if(path.includes('employees'))return 'Employees';if(path.includes('reports'))return 'Reports';if(path.includes('settings'))return 'Settings';if(path.includes('restaurants'))return 'Restaurants';if(path.includes('users'))return 'Users';if(path.includes('subscriptions'))return 'Subscriptions';if(path.includes('analytics'))return 'Analytics';if(path.includes('kitchen'))return path.includes('history')?'Order history':'Kitchen queue';if(path.includes('customer'))return path.includes('reservations')?'Reservations':path.includes('orders')?'My orders':'Restaurants';return 'Overview';}

const entityFor=t=>({Products:'products',Categories:'categories',Orders:'orders','Kitchen queue':'orders','Order history':'orders','Ready orders':'orders','My orders':'orders',Inventory:'inventory_items',Tables:'restaurant_tables',Employees:'restaurant_memberships',Restaurants:'restaurants',Subscriptions:'subscriptions',Reservations:'reservations'}[t]);

async function dashboard() {
  const c = await requireUser();
  if (!c) return;
  const activeMembers = c.memberships.filter(member => member.active && member.restaurants?.status === 'active');
  const membership = activeMembers.find(member => member.id === localStorage.getItem('restora_membership')) || activeMembers[0];
  if (c.isSuperAdmin && path.includes('/restaurant/')) { location.href = '/super-admin/dashboard.html'; return; }
  if (path.includes('/super-admin/') && !c.isSuperAdmin) { location.href = membership ? (membership.role === 'kitchen_staff' ? '/kitchen/dashboard.html' : membership.role === 'waiter' ? '/waiter/dashboard.html' : '/restaurant/dashboard.html') : '/customer/dashboard.html'; return; }
  if (c.isSuperAdmin && path.includes('/super-admin/') && !['dashboard', 'restaurants'].some(page => path.includes(page))) { location.href = '/super-admin/dashboard.html'; return; }
  if (path.includes('/kitchen/') && membership?.role !== 'kitchen_staff') { location.href = membership ? membershipHome(membership) : '/customer/restaurants.html'; return; }
  if (path.includes('/waiter/') && membership?.role !== 'waiter') { location.href = membership ? membershipHome(membership) : '/customer/restaurants.html'; return; }
  if (path.includes('/restaurant/') && ['kitchen_staff','waiter'].includes(membership?.role)) { location.href = membershipHome(membership); return; }
  if (!c.isSuperAdmin && !membership && path.includes('/restaurant/')) {
    app.removeAttribute('aria-busy');
    app.innerHTML = `<main class="dash-content"><div class="panel"><h2>Application under review</h2><p>Your restaurant workspace becomes available after an administrator approves your application.</p><button class="btn btn-ghost" id="logout">Log out</button></div></main>`;
    document.querySelector('#logout').onclick = signOut;
    return;
  }

  const role = c.isSuperAdmin ? 'super_admin' : membership?.role || 'customer';
  const restaurantId = membership?.restaurant_id || new URLSearchParams(location.search).get('restaurant');
  const title = currentTitle();
  const links = navByRole[role] || navByRole.customer;
  const entity = role === 'super_admin' && title === 'Restaurants' ? 'restaurant_applications' : title === 'Menu' ? 'products' : entityFor(title);
  const subtitle = role === 'super_admin' ? 'Restaurant onboarding' : membership?.restaurants?.name || 'Restaurant workspace';
  const cacheKey = `${c.user.id}:${restaurantId || 'platform'}:${path}${title === 'My orders' ? ':tracking-v2-order-number' : ['Orders', 'Kitchen queue', 'Order history'].includes(title) ? ':order-number-v1' : ''}`;
  const ttl = ['Orders', 'Kitchen queue', 'Order history', 'Employees'].includes(title) ? 5_000 : 30_000;
  const cached = readPageCache(cacheKey, ttl);
  const createFrame = !app.querySelector('#dashboard-data') || app.dataset.dashboardFrame !== cacheKey;
  const loadingContent = renderDynamicSkeleton({ title, showStats: title === 'Overview' });
  if (createFrame) {
    renderDashboardFrame({ app, brand, c, role, title, links, routeMap, entity, subtitle, configWarning, loadingContent });
    app.dataset.dashboardFrame = cacheKey;
    bindDashboardFrame({ c, title, entity, restaurantId });
  } else {
    app.setAttribute('aria-busy', 'true');
  }

  const renderData = ({ list = [], restaurantSummary = [], stats = [], error = '', employeeDirectoryFallback = false }) => {
    const statsHtml = stats.length ? `<section class="stat-grid">${stats.map((value, index) => `<article class="stat"><div class="stat-label">${role === 'super_admin' ? 'Pending applications' : ['Total orders', 'Menu items', 'Inventory items', 'Tables'][index]}</div><div class="stat-value">${value}</div><div class="stat-note">${role === 'super_admin' ? 'Awaiting your review' : 'Live database count'}</div></article>`).join('')}</section>` : '';
    const errorHtml = error ? `<div class="panel"><div class="error">${esc(error)}</div></div>` : '';
    const contentHtml = role === 'super_admin' && ['Overview', 'Restaurants'].includes(title) ? superAdminRestaurantsPanel(list, restaurantSummary)
      : title === 'Employees' ? renderStaffPanel(list, role, { directoryFallback: employeeDirectoryFallback })
      : role === 'kitchen_staff' && ['Kitchen queue', 'Order history'].includes(title) ? renderKitchenPanel(list, title === 'Order history', kitchenFilterState)
      : role === 'customer' && title === 'My orders' ? renderCustomerOrdersPanel(list)
      : title === 'Settings' ? restaurantSettingsPanel(list[0])
      : title === 'Overview' ? overviewPanels(role, stats)
      : entity ? tablePanel(title, list, role, restaurantId)
      : `<section class="panel"><div class="empty">${title === 'Kitchen queue' ? 'Kitchen tickets will appear here as soon as customers place orders.' : 'This view is ready for your workspace data.'}</div></section>`;
    renderDashboardData({ app, statsHtml, errorHtml, contentHtml });
    bindDashboardActions({ c, role, title, entity, restaurantId, records: list });
    if (title === 'Settings' && list[0]) bindRestaurantSettings(list[0], restaurantId);
  };

  if (cached) {
    renderData(cached);
    subscribeToDashboardOrders({ role, title, restaurantId, userId: c.user.id });
    return;
  }

  try {
    const listPromise = async () => {
      if (role === 'super_admin' && ['Restaurants', 'Overview'].includes(title)) {
        const [list, overview] = await Promise.all([rows('restaurant_applications', { limit: 1000 }), supabase.rpc('platform_restaurant_overview')]);
        if (overview.error) throw overview.error;
        return { list, restaurantSummary: Array.isArray(overview.data) ? overview.data : [] };
      }
      if (title === 'Employees' && ['restaurant_owner', 'manager'].includes(role)) {
        const { data, error } = await supabase.rpc('restaurant_team_directory', { rid: restaurantId });
        if (error) {
          const { data: memberRows, error: membersError } = await supabase.from('restaurant_memberships').select('user_id,role,active,created_at').eq('restaurant_id', restaurantId).order('created_at');
          if (membersError) throw error;
          return { list: (memberRows || []).map(member => ({ ...member, email: null, full_name: 'Team member' })), employeeDirectoryFallback: true };
        }
        return { list: data || [] };
      }
      if (role === 'customer' && title === 'My orders') {
        const { data, error } = await supabase.from('orders').select('id,order_number,restaurant_id,order_type,status,subtotal,total,notes,created_at,restaurants(name),order_items(name_snapshot,quantity,unit_price)').eq('customer_id', c.user.id).order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return { list: data || [] };
      }
      if (title === 'Settings' && restaurantId) {
        const { data, error } = await supabase.from('restaurants').select('id,name,description,cuisine_type,address,phone,logo_url,cover_url').eq('id', restaurantId).single();
        if (error) throw error;
        return { list: [data] };
      }
      if (role === 'kitchen_staff' && ['Kitchen queue', 'Order history'].includes(title)) {
        const statuses = title === 'Kitchen queue' ? ['confirmed', 'preparing'] : ['ready', 'completed'];
        const { data, error } = await supabase.from('orders').select('*,restaurant_tables(table_number),order_items(*)').eq('restaurant_id', restaurantId).in('status', statuses).order('created_at', { ascending: title === 'Kitchen queue' });
        if (error) throw error;
        return { list: data || [] };
      }
      if (title === 'Orders') {
        const { data, error } = await supabase.from('orders').select('*,restaurant_tables(table_number),order_items(name_snapshot,quantity,unit_price)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return { list: data || [] };
      }
      if (entity) return { list: await rows(entity, { restaurant_id: restaurantId, filters: role === 'customer' && title === 'My orders' ? { customer_id: c.user.id } : undefined, limit: 100 }) };
      return { list: [] };
    };
    const statsPromise = async () => {
      if (title !== 'Overview') return [];
      if (c.isSuperAdmin) return [await count('restaurant_applications', { status: 'pending' })];
      return Promise.all([count('orders', { restaurant_id: restaurantId }), count('products', { restaurant_id: restaurantId }), count('inventory_items', { restaurant_id: restaurantId }), count('restaurant_tables', { restaurant_id: restaurantId })]);
    };
    const [data, stats] = await Promise.all([listPromise(), statsPromise()]);
    const result = { list: data.list, restaurantSummary: data.restaurantSummary || [], stats, error: '', employeeDirectoryFallback: !!data.employeeDirectoryFallback };
    writePageCache(cacheKey, result);
    renderData(result);
  } catch (error) {
    renderData({ list: [], restaurantSummary: [], stats: [], error: error.message || 'Unable to load this page.' });
  }
  subscribeToDashboardOrders({ role, title, restaurantId, userId: c.user.id });
}

function bindDashboardFrame({ c, title, entity, restaurantId }) {
  document.querySelector('#logout').onclick = event => { event.preventDefault(); signOut(); };
  document.querySelector('#switch').onclick = () => { location.href = '/workspace.html'; };
  document.querySelector('#add')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    setButtonLoading(button, title === 'Products' ? 'Loading menu options' : 'Opening form');
    try {
      if (title === 'Employees') openStaffForm({ restaurantId, supabase, onSaved: () => { invalidatePageCache(); dashboard(); }, toast });
      else if (title === 'Inventory') openInventoryForm(restaurantId);
      else await entityForm(entity, title, restaurantId);
    } finally { restoreButton(button); }
  });
  document.querySelector('#checkout')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    setButtonLoading(button, 'Checking your cart');
    await checkout(restaurantId);
    if (button.isConnected) restoreButton(button);
  });
}

function bindDashboardActions({ c, role, title, entity, restaurantId, records = [] }) {
  document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => {
    if (button.dataset.action === 'edit') {
      setButtonLoading(button, 'Loading item details');
      return entityForm(entity, title, restaurantId, records.find(record => record.id === button.dataset.id)).finally(() => restoreButton(button));
    }
    if (button.dataset.action === 'edit-staff') {
      const member = records.find(record => record.user_id === button.dataset.id);
      return openStaffForm({ restaurantId, supabase, initial: member, canAssignManager: role === 'restaurant_owner', onSaved: () => { invalidatePageCache(); dashboard(); }, toast });
    }
    return entityAction(button.dataset.action, button.dataset.id, entity, restaurantId, button.dataset.next, button);
  });
  if (title === 'Kitchen queue') {
    const filter = () => {
      const search = document.querySelector('[data-kitchen-search]')?.value.trim().toLowerCase() || '';
      const status = document.querySelector('[data-kitchen-status]')?.value || '';
      const type = document.querySelector('[data-kitchen-type]')?.value || '';
      const label = document.querySelector('[data-kitchen-label]')?.value || '';
      kitchenFilterState = { search, status, type, label };
      let visible = 0;
      document.querySelectorAll('[data-kitchen-order]').forEach(card => {
        const matches = (!status || card.dataset.orderStatus === status) && (!type || card.dataset.orderType === type) && (!label || card.dataset.orderLabel === label) && (!search || card.textContent.toLowerCase().includes(search));
        card.hidden = !matches;
        if (matches) visible++;
      });
      const count = document.querySelector('[data-kitchen-count]');
      if (count) count.textContent = `${visible} order${visible === 1 ? '' : 's'}`;
      const board = document.querySelector('.kitchen-board');
      let empty = document.querySelector('[data-kitchen-filter-empty]');
      if (board && !empty) { empty = document.createElement('div'); empty.className = 'empty panel'; empty.dataset.kitchenFilterEmpty = ''; empty.textContent = 'No orders match these filters.'; board.after(empty); }
      if (empty) empty.hidden = visible > 0;
    };
    document.querySelectorAll('[data-kitchen-search], [data-kitchen-status], [data-kitchen-type], [data-kitchen-label]').forEach(control => control.addEventListener(control.matches('input') ? 'input' : 'change', filter));
    filter();
  }
  if (role === 'super_admin' && ['Overview', 'Restaurants'].includes(title)) document.querySelectorAll('[data-action]').forEach(button => button.onclick = async () => {
    const approve = button.dataset.action === 'approve';
    if (!approve && !await askConfirmation({ title: 'Reject application?', message: 'This restaurant application will be marked as rejected.', confirmLabel: 'Reject', danger: true })) return;
    setButtonLoading(button, approve ? 'Approving' : 'Rejecting');
    try {
      const { error } = await supabase.rpc('review_restaurant_application', { app_id: button.dataset.id, approve, reason: approve ? null : 'Rejected by platform administrator' });
      if (error) throw error;
      invalidatePageCache();
      toast(approve ? 'Restaurant approved.' : 'Application rejected.');
      dashboard();
    } catch (error) { restoreButton(button); toast(error.message); }
  });
}

let activeDashboardChannel = null;
function subscribeToDashboardOrders({ role, title, restaurantId, userId }) {
  if (activeDashboardChannel && supabase) supabase.removeChannel(activeDashboardChannel);
  activeDashboardChannel = null;
  if (!supabase) return;
  if (role === 'customer' && title === 'My orders' && userId) {
    activeDashboardChannel = supabase.channel(`customer-orders-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` }, () => {
        invalidatePageCache();
        dashboard();
      }).subscribe();
    return;
  }
  if (!restaurantId) return;
  if (role !== 'kitchen_staff' && title !== 'Orders') return;
  activeDashboardChannel = supabase.channel(`dashboard-orders-${restaurantId}-${role}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => {
      invalidatePageCache();
      dashboard();
    }).subscribe();
}


function overviewPanels(role,stats){if(role==='super_admin')return `<section class="panel"><div class="panel-head"><h3>Restaurant applications</h3><a href="/super-admin/restaurants.html">Review requests -></a></div><p class="section-intro">Approve an application to activate the restaurant and grant its owner access to the management workspace. Rejected applications stay inactive.</p><div class="toolbar"><a class="btn btn-primary" href="/super-admin/restaurants.html">Open onboarding requests</a></div></section>`;return `<section class="panel"><div class="panel-head"><h3>Recent orders</h3><a href="/restaurant/orders.html">View all -></a></div><div id="recent" class="empty">Your live activity will appear here as records are created.</div></section><section class="panel"><div class="panel-head"><h3>Quick actions</h3></div><div class="toolbar">${['Add a product','View orders','Manage inventory'].map((x,i)=>`<a class="btn btn-ghost" href="${['/restaurant/products.html','/restaurant/orders.html','/restaurant/inventory.html'][i]}">${x} -></a>`).join('')}</div></section>`}

function restaurantSettingsPanel(restaurant) {
  if (!restaurant) return '<section class="panel"><div class="empty">Restaurant settings are unavailable.</div></section>';
  const imageField = (key, label) => `<div class="restaurant-image-field"><label for="${key}-file">${label}</label><input id="${key}-file" data-restaurant-image="${key}" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><input type="hidden" name="${key}" value="${esc(restaurant[key] || '')}"><div id="${key}-preview" class="product-image-preview">${restaurant[key] ? `<img src="${esc(optimizeCloudinaryImage(restaurant[key], 320))}" alt="${label} preview">` : ''}</div><small id="${key}-status" class="upload-status">${restaurant[key] ? 'Current image saved. Choose a new image to replace it.' : 'JPG, PNG, WebP, or AVIF · up to 8 MB'}</small></div>`;
  return `<section class="panel"><div class="panel-head"><h3>Restaurant profile</h3></div><form id="restaurant-settings-form" class="restaurant-settings-form"><label for="restaurant-name">Restaurant name</label><input id="restaurant-name" name="name" required maxlength="160" value="${esc(restaurant.name)}"><label for="restaurant-description">Description</label><textarea id="restaurant-description" name="description" rows="3">${esc(restaurant.description || '')}</textarea><label for="restaurant-cuisine">Cuisine type</label><input id="restaurant-cuisine" name="cuisine_type" value="${esc(restaurant.cuisine_type || '')}"><label for="restaurant-address">Address</label><input id="restaurant-address" name="address" value="${esc(restaurant.address || '')}"><label for="restaurant-phone">Phone</label><input id="restaurant-phone" name="phone" value="${esc(restaurant.phone || '')}"><div class="restaurant-image-grid">${imageField('logo_url', 'Restaurant logo')}${imageField('cover_url', 'Restaurant cover image')}</div><div id="restaurant-settings-error" role="alert"></div><button class="btn btn-primary" type="submit">Save changes</button></form></section>`;
}

function bindRestaurantSettings(restaurant, restaurantId) {
  const form = document.querySelector('#restaurant-settings-form');
  if (!form) return;
  let uploadsInProgress = 0;
  form.querySelectorAll('[data-restaurant-image]').forEach(input => input.addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const key = event.currentTarget.dataset.restaurantImage, status = form.querySelector(`#${key}-status`), preview = form.querySelector(`#${key}-preview`), errorBox = form.querySelector('#restaurant-settings-error');
    const button = form.querySelector('[type="submit"]');
    uploadsInProgress++; setButtonLoading(button, 'Uploading image'); errorBox.textContent = ''; status.innerHTML = loadingMarkup('Uploading image');
    try {
      const url = await uploadProductImage(file);
      form.elements[key].value = url;
      preview.innerHTML = `<img src="${esc(optimizeCloudinaryImage(url, 320))}" alt="${key.replace('_url', '')} preview">`;
      status.textContent = 'Image uploaded to Cloudinary.';
    } catch (error) {
      event.currentTarget.value = '';
      errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`;
      status.textContent = 'Choose an image to upload.';
    } finally { uploadsInProgress--; if (!uploadsInProgress) restoreButton(button); }
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (uploadsInProgress) return;
    const button = form.querySelector('[type="submit"]'), errorBox = form.querySelector('#restaurant-settings-error'), data = new FormData(form);
    const values = Object.fromEntries(['name', 'description', 'cuisine_type', 'address', 'phone', 'logo_url', 'cover_url'].map(key => [key, data.get(key) || null]));
    setButtonLoading(button, 'Saving changes'); errorBox.textContent = '';
    try { await update('restaurants', restaurantId, values); invalidatePageCache(); toast('Restaurant profile updated.'); dashboard(); }
    catch (error) { errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`; restoreButton(button, 'Save changes'); }
  });
}

function superAdminRestaurantsPanel(applications,restaurants){const requestCols=[['restaurant_name','Restaurant'],['owner_name','Owner'],['email','Email'],['phone','Phone'],['address','Address'],['cuisine_type','Cuisine'],['description','Description'],['status','Status']];const restaurantCols=[['name','Restaurant'],['status','Status'],['email','Email'],['phone','Phone'],['address','Address'],['cuisine_type','Cuisine'],['description','Description'],['logo_url','Logo'],['cover_url','Cover'],['opening_hours','Hours'],['created_at','Created'],['owner_name','Owner'],['owner_email','Owner email'],['application_status','Application'],['product_count','Products'],['order_count','Orders'],['reservation_count','Reservations'],['inventory_count','Inventory'],['table_count','Tables'],['member_count','Team']];const table=(rows,cols,actions)=>`<div class="table-wrap"><table><thead><tr>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(([key])=>`<td>${key==='status'||key==='application_status'?`<span class="badge ${esc(row[key])}">${esc(row[key]||'-')}</span>`:esc(row[key]==null?'-':typeof row[key]==='object'?JSON.stringify(row[key]):row[key])}</td>`).join('')}<td>${actions?row.status==='pending'?`<button class="btn btn-ghost" data-action="approve" data-id="${esc(row.id)}">Approve</button> <button class="btn btn-ghost" data-action="reject" data-id="${esc(row.id)}">Reject</button>`:'Reviewed':''}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">No records yet.</div>'}</div>`;return `<section class="panel"><div class="panel-head"><h3>Onboarding requests</h3><span>${applications.length} requests</span></div><p class="section-intro">Approve a pending request to create the restaurant workspace and give its owner full management access.</p>${table(applications,requestCols,true)}</section><section class="panel"><div class="panel-head"><h3>All restaurants</h3><span>${restaurants.length} restaurants</span></div><p class="section-intro">Restaurant profile and operational totals across the platform.</p>${table(restaurants,restaurantCols,false)}</section>`}

function tablePanel(title,data,role,restaurantId){if(title==='Tables')return renderTablesPanel(data,restaurantId,role);if(title==='Orders')return renderOrdersPanel(data,role);const canEditRows=(['restaurant_owner','manager'].includes(role)&&['products','categories','inventory_items'].includes(entityFor(title)))||(title==='Tables'&&['restaurant_owner','manager','waiter'].includes(role))||(title==='Reservations'&&['restaurant_owner','manager','waiter'].includes(role));const cols=title==='Products'?['short_code','image_url','name','price','quantity','available']:title==='Categories'?['short_code','name','description']:data[0]?Object.keys(data[0]).filter(k=>!['id','restaurant_id','owner_id','user_id','created_at','updated_at'].includes(k)).slice(0,5):[];return `<section class="panel"><div class="panel-head"><h3>${title}</h3><span>${data.length} records</span></div><div class="toolbar"><input id="search" placeholder="Search ${title.toLowerCase()}..."><select id="status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div><div class="table-wrap"><table><thead><tr>${cols.map(k=>`<th>${esc(k==='short_code'?'Code':k==='image_url'?'Image':k.replaceAll('_',' '))}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${data.map(row=>`<tr>${cols.map(k=>`<td>${k==='image_url'?row[k]?`<img class="product-list-thumb" src="${esc(optimizeCloudinaryImage(row[k],120))}" alt="${esc(row.name)}">`:'—':k==='status'||k==='available'?`<span class="badge ${esc(row[k])}">${esc(String(row[k]))}</span>`:esc(typeof row[k]==='object'?JSON.stringify(row[k]):row[k])}</td>`).join('')}<td>${title==='Orders'&&['restaurant_owner','manager'].includes(role)?row.status==='pending'?`<button class="btn btn-primary" data-action="forward" data-id="${row.id}">Send to kitchen</button>`:`<span class="badge ${esc(row.status)}">${row.status==='confirmed'?'In kitchen':esc(row.status)}</span>`:['Orders','Kitchen queue','Ready orders'].includes(title)?`<button class="btn btn-ghost" data-action="next" data-id="${row.id}">Update status</button>`:title==='Restaurants'&&role==='super_admin'?`<button class="btn btn-ghost" data-action="approve" data-id="${row.id}">Approve</button> <button class="btn btn-ghost" data-action="reject" data-id="${row.id}">Reject</button>`:title==='Restaurants'?`<a class="btn btn-ghost" href="/customer/menu.html?restaurant=${row.id}">View menu</a>`:title==='Menu'?`<button class="btn btn-ghost" data-action="cart" data-id="${row.id}">Add to cart</button>`:title==='My orders'||title==='Order history'?`<span>Track in restaurant</span>`:canEditRows?`<button class="btn btn-ghost" data-action="edit" data-id="${row.id}">Edit</button> <button class="btn btn-ghost" data-action="delete" data-id="${row.id}">Delete</button>`:`<button class="btn btn-ghost" data-action="delete" data-id="${row.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table>${data.length?'':'<div class="empty">No records yet. Add your first item to get started.</div>'}</div></section>`}

async function checkout(restaurantId){try{const cart=JSON.parse(localStorage.getItem('restora_cart')||'[]').filter(x=>x.restaurant_id===restaurantId);if(!cart.length){toast('Your cart is empty. Add menu items first.');return}const {data,error}=await supabase.rpc('place_order',{rid:restaurantId,items:cart.map(x=>({product_id:x.id,quantity:x.quantity})),kind:'takeaway',pay_method:'cash_at_restaurant'});if(error)throw error;localStorage.removeItem('restora_cart');toast('Order placed. Pay at the restaurant when you collect it.');location.href='/customer/orders.html';}catch(e){toast(e.message)}}

function openInventoryForm(restaurantId) {
  const dialog = document.createElement('dialog');
  dialog.className = 'inventory-dialog';
  dialog.innerHTML = `<form id="inventory-form"><div><span class="eyebrow">Stock management</span><h2>Add inventory item</h2><p class="inventory-help">Add an ingredient and set the amount currently on hand.</p></div><label for="inventory-name">Ingredient name</label><input id="inventory-name" name="name" required maxlength="120" placeholder="e.g. Basmati rice"><div class="inventory-fields"><div><label for="inventory-quantity">Current quantity</label><input id="inventory-quantity" name="quantity" type="number" min="0" step="0.001" value="0" required></div><div><label for="inventory-unit">Unit</label><input id="inventory-unit" name="unit" required maxlength="30" value="kg" placeholder="kg, L, pieces"></div></div><label for="inventory-threshold">Low stock alert at</label><input id="inventory-threshold" name="low_stock_threshold" type="number" min="0" step="0.001" value="0" required><div id="inventory-error" role="alert"></div><div class="inventory-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Add item</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector('#inventory-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('[type="submit"]'), errorBox = form.querySelector('#inventory-error'), fields = new FormData(form);
    setButtonLoading(button, 'Saving changes'); errorBox.textContent = '';
    try {
      await insert('inventory_items', { restaurant_id: restaurantId, name: String(fields.get('name')).trim(), quantity: Number(fields.get('quantity')), unit: String(fields.get('unit')).trim(), low_stock_threshold: Number(fields.get('low_stock_threshold')) });
      dialog.close(); toast('Inventory item added.'); dashboard();
    } catch (error) { errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`; restoreButton(button, 'Add item'); }
  });
  dialog.showModal();
}

async function entityForm(entity, title, restaurantId, record = null) {
  const editing = Boolean(record);
  const definitions = {
    products: [['name', 'Product name', 'text', true], ['description', 'Description', 'textarea'], ['price', 'Price', 'number', true, { min: 0, step: '0.01' }], ['quantity', 'Available quantity', 'number', true, { min: 0, step: 1 }], ['category_id', 'Category', 'select'], ['available', 'Available on menu', 'checkbox']],
    categories: [['name', 'Category name', 'text', true], ['description', 'Description', 'textarea']],
    orders: [['order_type', 'Order type', 'order-type-select'], ['guest_name', 'Guest name', 'text'], ['notes', 'Kitchen notes', 'textarea']],
    restaurant_tables: [['table_number', 'Table number', 'text', true], ['capacity', 'Seating capacity', 'number', true, { min: 1, step: 1 }], ['status', 'Status', 'status-select']],
    inventory_items: [['name', 'Ingredient name', 'text', true], ['quantity', 'Current quantity', 'number', true, { min: 0, step: '0.001' }], ['unit', 'Unit', 'text', true], ['low_stock_threshold', 'Low stock alert at', 'number', true, { min: 0, step: '0.001' }]],
    reservations: [['party_size', 'Party size', 'number', true, { min: 1, step: 1 }], ['reserved_for', 'Reservation time', 'datetime-local', true], ['status', 'Status', 'reservation-status'], ['notes', 'Notes', 'textarea']]
  };
  const fields = definitions[entity] || [['name', 'Name', 'text', true]];
  let categories = [];
  if (entity === 'products') {
    const { data, error } = await supabase.from('categories').select('id,name').eq('restaurant_id', restaurantId).order('name');
    if (error) { toast(error.message); return; }
    categories = data || [];
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'inventory-dialog';
  const noun = { Products: 'product', Categories: 'category', Tables: 'table', Inventory: 'inventory item', Reservations: 'reservation' }[title] || 'item';
  const inputMarkup = ([key, label, type, required, attrs = {}]) => {
    const value = record?.[key];
    if (type === 'textarea') return `<label for="entity-${key}">${esc(label)}</label><textarea id="entity-${key}" name="${key}" rows="3">${esc(value || '')}</textarea>`;
    if (type === 'select') return `<label for="entity-${key}">${esc(label)}</label><select id="entity-${key}" name="${key}"><option value="">No category</option>${categories.map(category => `<option value="${esc(category.id)}" ${value === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select>`;
    if (type === 'status-select' || type === 'reservation-status' || type === 'order-type-select') {
      const choices = type === 'status-select' ? ['available', 'occupied', 'reserved'] : type === 'order-type-select' ? ['dine_in', 'takeaway', 'delivery'] : ['pending', 'confirmed', 'seated', 'cancelled', 'completed'];
      return `<label for="entity-${key}">${esc(label)}</label><select id="entity-${key}" name="${key}">${choices.map(choice => `<option value="${choice}" ${value === choice ? 'selected' : ''}>${choice.replaceAll('_', ' ')}</option>`).join('')}</select>`;
    }
    if (type === 'checkbox') return `<label class="entity-checkbox"><input id="entity-${key}" name="${key}" type="checkbox" ${editing ? value ? 'checked' : '' : 'checked'}> ${esc(label)}</label>`;
    const displayValue = type === 'datetime-local' && value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : value ?? '';
    return `<label for="entity-${key}">${esc(label)}</label><input id="entity-${key}" name="${key}" type="${type}" value="${esc(displayValue)}" ${required ? 'required' : ''} ${Object.entries(attrs).map(([name, attrValue]) => `${name}="${esc(attrValue)}"`).join(' ')}>`;
  };
  const currentImage = record?.image_url || '';
  dialog.innerHTML = `<form id="entity-form"><div><span class="eyebrow">${esc(title)}</span><h2>${editing ? 'Edit' : 'Add'} ${noun}</h2><p class="inventory-help">${editing ? 'Update the details and save your changes.' : 'Enter the details below.'}</p></div>${fields.map(inputMarkup).join('')}${entity === 'products' ? `<label for="product-image-file">Product image (optional)</label><input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><input type="hidden" name="image_url" value="${esc(currentImage)}"><div id="product-image-preview" class="product-image-preview">${currentImage ? `<img src="${esc(optimizeCloudinaryImage(currentImage, 320))}" alt="Product image preview">` : ''}</div><small id="product-image-status" class="upload-status">${currentImage ? 'Current image saved. Choose a new image to replace it.' : 'JPG, PNG, WebP, or AVIF · up to 8 MB'}</small>` : ''}<div id="entity-error" role="alert"></div><div class="inventory-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">${editing ? 'Save changes' : 'Add'}</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  let imageUploading = false;
  dialog.querySelector('#product-image-file')?.addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const status = dialog.querySelector('#product-image-status'), preview = dialog.querySelector('#product-image-preview'), errorBox = dialog.querySelector('#entity-error');
    const button = dialog.querySelector('[type="submit"]');
    imageUploading = true; setButtonLoading(button, 'Uploading image'); errorBox.textContent = ''; status.innerHTML = loadingMarkup('Uploading image');
    try {
      const url = await uploadProductImage(file);
      dialog.querySelector('[name="image_url"]').value = url;
      preview.innerHTML = `<img src="${esc(optimizeCloudinaryImage(url, 320))}" alt="Product image preview">`;
      status.textContent = 'Image uploaded to Cloudinary.';
    } catch (error) {
      event.currentTarget.value = '';
      errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`;
      status.textContent = 'Choose an image to upload.';
    } finally { imageUploading = false; restoreButton(button, editing ? 'Save changes' : 'Add'); }
  });
  dialog.querySelector('#entity-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('[type="submit"]'), errorBox = form.querySelector('#entity-error'), formData = new FormData(form), values = {};
    if (imageUploading) return;
    for (const [key, , type] of fields) values[key] = type === 'checkbox' ? form.elements[key].checked : type === 'number' ? Number(formData.get(key)) : type === 'datetime-local' && formData.get(key) ? new Date(formData.get(key)).toISOString() : formData.get(key) || null;
    if (entity === 'products') { values.image_url = formData.get('image_url') || null; if (!values.category_id) values.category_id = null; }
    if (!editing) values.restaurant_id = restaurantId;
    setButtonLoading(button, 'Saving changes'); errorBox.textContent = '';
    try {
      if (editing) await update(entity, record.id, values); else await insert(entity, values);
      dialog.close(); toast(`${noun[0].toUpperCase()}${noun.slice(1)} ${editing ? 'updated' : 'added'}.`); dashboard();
    } catch (error) { errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`; restoreButton(button, editing ? 'Save changes' : 'Add'); }
  });
  dialog.showModal();
}

function askConfirmation({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'inventory-dialog';
    dialog.innerHTML = `<form method="dialog"><div><span class="eyebrow">Please confirm</span><h2>${esc(title)}</h2><p class="inventory-help">${esc(message)}</p></div><div class="inventory-actions"><button class="btn btn-ghost" value="cancel">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="confirm">${esc(confirmLabel)}</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'confirm'; dialog.remove(); resolve(confirmed); }, { once: true });
    dialog.showModal();
  });
}

async function openOrderItemsEditor(orderId, restaurantId) {
  const [{ data: items, error: itemError }, { data: products, error: productError }] = await Promise.all([
    supabase.from('order_items').select('product_id,name_snapshot,quantity,variant').eq('order_id', orderId),
    supabase.from('products').select('id,name,price,quantity,available').eq('restaurant_id', restaurantId).order('name'),
  ]);
  if (itemError) { toast(itemError.message); return; }
  if (productError) { toast(productError.message); return; }
  const menu = products || [];
  const lines = (items || []).map(item => ({ product_id: item.product_id, quantity: Number(item.quantity), variant: item.variant || null }));
  const dialog = document.createElement('dialog');
  dialog.className = 'inventory-dialog order-editor-dialog';
  const draw = () => {
    const body = dialog.querySelector('#order-editor-lines');
    body.innerHTML = lines.map((line, index) => {
      const options = menu.filter(product => (product.available || product.id === line.product_id) && !lines.some((other, otherIndex) => otherIndex !== index && other.product_id === product.id)).map(product => `<option value="${esc(product.id)}" ${line.product_id === product.id ? 'selected' : ''}>${esc(product.name)} · ${money(product.price)}${product.available ? '' : ' · currently unavailable'}</option>`).join('');
      const unavailable = line.product_id && !menu.some(product => product.id === line.product_id);
      return `<div class="order-editor-line"><label><span>Menu item ${index + 1}</span><select data-order-product="${index}" required><option value="">Choose menu item${unavailable ? ` (was: ${esc(items[index]?.name_snapshot || 'removed dish')})` : ''}</option>${options}</select></label><label><span>Qty</span><input data-order-quantity="${index}" type="number" min="1" max="50" value="${line.quantity}" required></label><button type="button" class="cart-remove" data-order-remove="${index}">Remove</button></div>`;
    }).join('') || '<div class="empty">No dishes in the order. Add one from the menu.</div>';
    const canAddItem = menu.some(product => product.available && !lines.some(line => line.product_id === product.id));
    dialog.querySelector('#order-editor-add').disabled = lines.length >= 30;
    dialog.querySelector('#order-editor-help').textContent = lines.length >= 30 ? 'This order has reached the 30 item limit.' : canAddItem ? 'Add a row, then select a dish from the live menu.' : 'No other available dishes to add. Increase a quantity above or remove an item first.';
    body.querySelectorAll('[data-order-product]').forEach(select => select.addEventListener('change', () => { lines[Number(select.dataset.orderProduct)].product_id = select.value || null; }));
    body.querySelectorAll('[data-order-quantity]').forEach(input => input.addEventListener('input', () => { lines[Number(input.dataset.orderQuantity)].quantity = Number(input.value); }));
    body.querySelectorAll('[data-order-remove]').forEach(button => button.addEventListener('click', () => { lines.splice(Number(button.dataset.orderRemove), 1); draw(); }));
  };
  dialog.innerHTML = `<form id="order-editor-form"><div><span class="eyebrow">Verify order</span><h2>Edit order items</h2><p class="inventory-help">Correct the dishes and quantities before sending this order to the kitchen. The total is recalculated from the live menu.</p></div><div id="order-editor-lines"></div><button type="button" id="order-editor-add" class="btn btn-ghost">＋ Add item</button><small id="order-editor-help" class="inventory-help"></small><div id="order-editor-error" role="alert"></div><div class="inventory-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save verified items</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('#order-editor-add').addEventListener('click', () => {
    const available = menu.find(product => product.available && !lines.some(line => line.product_id === product.id));
    const errorBox = dialog.querySelector('#order-editor-error');
    if (lines.length >= 30) { errorBox.innerHTML = '<div class="error">An order can contain up to 30 menu items.</div>'; return; }
    if (!available) { errorBox.innerHTML = '<div class="error">There are no other available menu items. Increase an existing quantity or remove a row first.</div>'; return; }
    lines.push({ product_id: null, quantity: 1 });
    errorBox.innerHTML = '';
    draw();
    dialog.querySelector(`[data-order-product="${lines.length - 1}"]`)?.focus();
  });
  dialog.querySelector('#order-editor-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = dialog.querySelector('[type="submit"]'), errorBox = dialog.querySelector('#order-editor-error');
    const ids = lines.map(line => line.product_id);
    if (!lines.length || lines.some(line => !line.product_id || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) || new Set(ids).size !== ids.length) {
      errorBox.innerHTML = '<div class="error">Choose one menu item per row and set a quantity from 1 to 50.</div>'; return;
    }
    setButtonLoading(button, 'Saving verified order'); errorBox.innerHTML = '';
    try {
      const { error } = await supabase.rpc('admin_replace_order_items', { p_order_id: orderId, items: lines.map(line => ({ product_id: line.product_id, quantity: line.quantity, variant: line.variant })) });
      if (error) throw error;
      dialog.close(); invalidatePageCache(); toast('Order items and total updated.'); await dashboard();
    } catch (error) { errorBox.innerHTML = `<div class="error">${esc(error.message)}</div>`; restoreButton(button, 'Save verified items'); }
  });
  draw(); dialog.showModal();
}

async function entityAction(action, id, entity, restaurantId, nextStatus, actionButton = null) {
  const loadingLabels = { qr: 'Preparing QR', 'edit-order-items': 'Loading items', forward: 'Sending to kitchen', deliver: 'Marking delivered', 'kitchen-status': 'Updating order', 'save-order-label': 'Saving label', next: 'Updating status', approve: 'Approving', reject: 'Rejecting' };
  if (loadingLabels[action]) setButtonLoading(actionButton, loadingLabels[action]);
  try {
    if (action === 'qr') { await showTableQr({ supabase, restaurantId, tableId: id }); restoreButton(actionButton); return; }
    if (action === 'edit-order-items') { await openOrderItemsEditor(id, restaurantId); restoreButton(actionButton); return; }
    if (action === 'forward') { const { error } = await supabase.rpc('forward_order_to_kitchen', { order_id: id }); if (error) throw error; invalidatePageCache(); toast('Order sent to kitchen.'); await dashboard(); return; }
    if (action === 'deliver') { const { error } = await supabase.rpc('admin_complete_order', { p_order_id: id }); if (error) throw error; invalidatePageCache(); toast('Order marked delivered.'); await dashboard(); return; }
    if (action === 'kitchen-status') { const { error } = await supabase.rpc('update_kitchen_order_status', { order_id: id, next_status: nextStatus }); if (error) throw error; invalidatePageCache(); toast(nextStatus === 'ready' ? 'Order marked ready.' : 'Order is being prepared.'); await dashboard(); return; }
    if (action === 'save-order-label') {
      const button = document.querySelector(`[data-action="save-order-label"][data-id="${id}"]`);
      const label = button?.closest('tr, .kitchen-ticket')?.querySelector('[data-order-label]')?.value.trim() || null;
      const { error } = await supabase.rpc('set_order_label', { p_order_id: id, p_label: label });
      if (error) throw error;
      invalidatePageCache(); toast(label ? 'Order label saved.' : 'Order label cleared.'); await dashboard(); return;
    }
    if (action === 'cart') { const cart = JSON.parse(localStorage.getItem('restora_cart') || '[]'), existing = cart.find(item => item.id === id); if (existing) existing.quantity++; else cart.push({ id, restaurant_id: restaurantId, quantity: 1 }); localStorage.setItem('restora_cart', JSON.stringify(cart)); toast('Added to cart.'); return; }
    if (action === 'delete') { if (!await askConfirmation({ title: 'Delete this record?', message: 'This item will be removed from this restaurant.', confirmLabel: 'Delete', danger: true })) { restoreButton(actionButton); return; } await remove(entity, id); }
    else { const { data, error } = await supabase.from('orders').select('status').eq('id', id).single(); if (error) throw error; const next = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'completed' }[data.status] || 'completed'; await update('orders', id, { status: next }); }
    toast('Saved.'); dashboard();
  } catch (error) { restoreButton(actionButton); toast(error.message); }
}


async function applicationPage() {
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = `<div class="auth-form-wrap"><section class="auth-form">${brand}<h1>Restaurant application</h1><div id="application-data"><div class="panel sk-panel" aria-busy="true"><div class="panel-head">${'<span class="skeleton sk-panel-title"></span>'}</div><span class="skeleton sk-description"></span></div></div><button class="btn btn-ghost full" id="logout">Log out</button></section></div>`;
  const c = await requireUser();
  if (!c) return;
  const { data, error } = await supabase.from('restaurant_applications').select('restaurant_name,status,rejection_reason,created_at').eq('owner_id', c.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  app.removeAttribute('aria-busy');
  document.querySelector('#application-data').innerHTML = error ? `<div class="error">${esc(error.message)}</div>` : data ? `<p><b>${esc(data.restaurant_name)}</b></p><div class="panel"><span class="badge ${esc(data.status)}">${esc(data.status)}</span><p>${data.status === 'pending' ? 'Your details are with the Restora team. We will activate your workspace after review.' : data.status === 'rejected' ? esc(data.rejection_reason || 'Please contact support for next steps.') : 'Approved - your owner workspace is ready.'}</p></div>${data.status === 'approved' ? '<a class="btn btn-primary" href="/restaurant/dashboard.html">Open restaurant workspace</a>' : ''}` : '<div class="panel">No application is associated with this account.</div>';
  document.querySelector('#logout').onclick = signOut;
}

async function workspace() {
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = `<div class="auth-form-wrap"><section class="auth-form"><h1>Choose a workspace</h1><p>Select a restaurant you are authorized to access.</p><div id="workspace-list" aria-busy="true">${Array.from({ length: 3 }, () => '<div class="sk-workspace-choice"><span class="skeleton sk-workspace-name"></span><span class="skeleton sk-workspace-role"></span></div>').join('')}</div><button class="btn btn-ghost full" id="logout">Log out</button></section></div>`;
  const c = await requireUser();
  if (!c) return;
  app.removeAttribute('aria-busy');
  const workspaces = c.memberships.filter(member => member.active && member.restaurants?.status === 'active');
  document.querySelector('#workspace-list').innerHTML = workspaces.map(member => `<button class="btn btn-ghost full" style="margin:7px 0" data-mid="${esc(member.id)}">${esc(member.restaurants.name)} | ${esc(member.role)}</button>`).join('') || '<div class="panel">No active restaurant memberships. Customers can browse available restaurants from the dashboard.</div>';
  document.querySelectorAll('[data-mid]').forEach(button => button.onclick = () => {
    localStorage.setItem('restora_membership', button.dataset.mid);
    const member = c.memberships.find(item => item.id === button.dataset.mid);
    location.href = membershipHome(member);
  });
  document.querySelector('#logout').onclick = signOut;
}


const tableParams = new URLSearchParams(location.search), tableRoute = { restaurantId: tableParams.get('restaurant'), tableId: tableParams.get('table') };
if(path==='/menu.html')renderPublicTableMenu({app,supabase,...tableRoute}).catch(renderLoadError);
else if(path==='/table-cart.html')renderPublicTableCart({app,supabase,...tableRoute}).catch(renderLoadError);
else if(path==='/table-checkout.html')renderPublicTableCheckout({app,supabase,...tableRoute,toast}).catch(renderLoadError);
else if(['/customer/restaurants.html','/customer/menu.html','/customer/cart.html','/customer/checkout.html'].includes(path))renderCustomerOrdering({app,supabase,page:path.split('/').pop().replace('.html',''),restaurantId:tableParams.get('restaurant'),toast}).catch(renderLoadError);
else if(path==='/'||path==='/index.html')landing();
else if(path==='/kitchen/login.html')location.replace('/login.html');
else if(['/login.html','/register.html','/forgot-password.html'].includes(path)){const kind=path.replace('/','').replace('.html','');authPage(kind);if(configured&&kind==='login'&&!location.search)getContext().then(c=>{if(c)routeAfterLogin()}).catch(()=>{});}
else if(path==='/application.html')applicationPage().catch(renderLoadError);
else if(path==='/workspace.html')workspace().catch(renderLoadError);
else dashboard().catch(renderLoadError);

