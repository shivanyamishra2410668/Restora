import { svgIcon } from './icons.js';
import { paginateTables } from './table-pagination.js';

export function renderDashboardFrame({ app, brand, c, role, title, links, routeMap, entity, subtitle, configWarning, loadingContent }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icons = { Overview: 'dashboard', Products: 'utensils', Categories: 'grid', Orders: 'orders', Inventory: 'boxes', Tables: 'table', Employees: 'users', Reports: 'activity', Settings: 'settings', Restaurants: 'store', Users: 'users', Subscriptions: 'card', Analytics: 'activity', 'Kitchen queue': 'chef', 'Order history': 'history', 'Ready orders': 'package-check', 'My orders': 'receipt', Reservations: 'calendar', Cart: 'cart' };
  const sidebarCollapsed = localStorage.getItem('restora_sidebar_collapsed') === 'true';
  app.setAttribute('aria-busy', 'true');
  const addLabel = { Products: 'Add product', Categories: 'Add category', Inventory: 'Add inventory item', Tables: 'Add table', Employees: 'Add staff' }[title] || 'Add';
  app.innerHTML = `<div class="workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}"><aside class="sidebar">${brand}<div class="side-label">Workspace</div>${links.map(item => `<a class="side-link ${item === title ? 'active' : ''}" href="${role === 'customer' && item === 'Restaurants' ? '/customer/restaurants.html' : routeMap[item] || '#'}" aria-label="${esc(item)}" title="${esc(item)}"><span class="side-icon">${svgIcon(icons[item])}</span><span class="side-link-label">${esc(item)}</span></a>`).join('')}<div class="sidebar-bottom"><a class="side-link" href="#" id="logout" aria-label="Log out" title="Log out"><span class="side-icon">${svgIcon('logout')}</span><span class="side-link-label">Log out</span></a><button class="side-collapse-toggle" id="sidebar-toggle" type="button" aria-label="${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-expanded="${!sidebarCollapsed}" title="${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">${svgIcon(sidebarCollapsed ? 'arrow-right' : 'arrow-left')}<span class="side-link-label">${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button></div></aside><main class="main"><header class="dash-top"><div><b>${esc(subtitle)}</b><div class="dash-account-name">${esc(c.profile?.full_name || c.user.email)}</div></div><button class="btn btn-ghost" id="switch">${c.memberships.length > 1 ? 'Switch workspace' : 'Account'} ${svgIcon('chevron')}</button></header><div class="dash-content"><div class="page-title"><div><h1>${esc(title === 'Overview' && role === 'super_admin' ? 'Restaurant onboarding' : title)}</h1><p>${title === 'Overview' && role === 'super_admin' ? 'Review restaurant applications and approve access to the management workspace.' : title === 'Overview' ? 'Here is what is happening across your workspace today.' : `Manage ${title.toLowerCase()} for ${esc(subtitle)}.`}</p></div>${title === 'Menu' ? `<button class="btn btn-primary" id="checkout">${svgIcon('cart')} Checkout cart</button>` : entity && ['Products', 'Categories', 'Inventory', 'Tables', 'Employees'].includes(title) ? `<button class="btn btn-primary" id="add">${svgIcon('plus')} ${addLabel}</button>` : ''}</div>${configWarning()}<div id="dashboard-data">${loadingContent}</div></div></main></div>`;
}

export function renderDashboardData({ app, statsHtml = '', errorHtml = '', contentHtml = '' }) {
  const container = app.querySelector('#dashboard-data');
  if (!container) return;
  app.removeAttribute('aria-busy');
  container.removeAttribute('aria-busy');
  container.innerHTML = `${statsHtml}${errorHtml}${contentHtml}`;
  paginateTables(container);
}
