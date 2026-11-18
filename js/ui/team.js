import { setButtonLoading, restoreButton } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderStaffPanel(members, viewerRole) {
  return `<section class="panel"><div class="panel-head"><h3>Restaurant staff</h3><span>${members.length} team members</span></div>
    <p class="section-intro">Add a staff member using the email on their Restora account. If they are new, ask them to register first.</p>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${members.map(member => `<tr><td>${esc(member.full_name || 'Staff member')}</td><td>${member.email ? esc(member.email) : '—'}</td><td>${esc(member.role.replaceAll('_', ' '))}</td><td><span class="badge ${member.active ? 'active' : 'rejected'}">${member.active ? 'Active' : 'Inactive'}</span></td><td>${member.role === 'restaurant_owner' || (viewerRole !== 'restaurant_owner' && member.role === 'manager') || !member.email ? '—' : `<button class="btn btn-ghost" data-action="edit-staff" data-id="${esc(member.user_id)}">Edit role</button>`}</td></tr>`).join('')}
    </tbody></table>${members.length ? '' : '<div class="empty">No staff members found for this restaurant yet.</div>'}</div>
  </section>`;
}

export function openStaffForm({ restaurantId, supabase, onSaved, toast, initial = null, canAssignManager = true }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'staff-dialog';
  dialog.innerHTML = `<form id="staff-form"><h2>${initial ? 'Edit staff role' : 'Add staff'}</h2>
    <p>Enter an email already registered with Restora. New staff can <a href="/register.html">create an account</a> first.</p>
    <label for="staff-email">Staff email</label><input id="staff-email" name="email" type="email" required autocomplete="email" placeholder="staff@example.com" value="${esc(initial?.email || '')}" ${initial ? 'readonly' : ''}>
    <label for="staff-role">Role</label><select id="staff-role" name="role"><option value="kitchen_staff" ${initial?.role === 'kitchen_staff' ? 'selected' : ''}>Kitchen staff</option><option value="waiter" ${initial?.role === 'waiter' ? 'selected' : ''}>Waiter</option>${canAssignManager ? `<option value="manager" ${initial?.role === 'manager' ? 'selected' : ''}>Manager</option>` : initial?.role === 'manager' ? '<option value="manager" selected>Manager</option>' : ''}</select>
    <div id="staff-error" class="error" role="alert" hidden></div>
    <div class="staff-dialog-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${initial ? 'Save changes' : 'Add to restaurant'}</button></div>
  </form>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('#staff-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const errorBox = form.querySelector('#staff-error');
    errorBox.hidden = true;
    setButtonLoading(button, initial ? 'Saving role' : 'Adding staff');
    try {
      const values = new FormData(form);
      const { error } = await supabase.rpc('add_restaurant_staff', {
        rid: restaurantId,
        staff_email: values.get('email'),
        staff_role: values.get('role')
      });
      if (error) throw error;
      dialog.close();
      toast(initial ? 'Staff role updated.' : 'Staff added to the restaurant.');
      onSaved();
    } catch (error) {
      errorBox.textContent = error.message || 'Could not add this staff member.';
      errorBox.hidden = false;
      restoreButton(button, initial ? 'Save changes' : 'Add to restaurant');
    }
  });
}

export function renderKitchenPanel(orders, history = false, filters = {}) {
  if (!orders.length) {
    return `${!history ? `<section class="panel kitchen-filters"><div class="toolbar"><input data-kitchen-search value="${esc(filters.search || '')}" placeholder="Search orders or dishes"><select data-kitchen-status><option value="">All active orders</option><option value="confirmed" ${filters.status === 'confirmed' ? 'selected' : ''}>New orders</option><option value="preparing" ${filters.status === 'preparing' ? 'selected' : ''}>Preparing</option></select><select data-kitchen-type><option value="">Dine in + takeaway</option><option value="dine_in" ${filters.type === 'dine_in' ? 'selected' : ''}>Dine in</option><option value="takeaway" ${filters.type === 'takeaway' ? 'selected' : ''}>Takeaway</option></select><select data-kitchen-label><option value="">All labels</option></select><span data-kitchen-count>0 orders</span></div></section>` : ''}<section class="panel"><div class="empty">${history ? 'Completed kitchen orders will appear here.' : 'Kitchen is clear. Orders sent by the restaurant will appear here.'}</div></section>`;
  }
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  const labels = [...new Set(orders.map(order => String(order.label || '').trim()).filter(Boolean))].sort();
  return `${!history ? `<section class="panel kitchen-filters"><div class="toolbar"><input data-kitchen-search value="${esc(filters.search || '')}" placeholder="Search orders or dishes"><select data-kitchen-status><option value="">All active orders</option><option value="confirmed" ${filters.status === 'confirmed' ? 'selected' : ''}>New orders</option><option value="preparing" ${filters.status === 'preparing' ? 'selected' : ''}>Preparing</option></select><select data-kitchen-type><option value="">Dine in + takeaway</option><option value="dine_in" ${filters.type === 'dine_in' ? 'selected' : ''}>Dine in</option><option value="takeaway" ${filters.type === 'takeaway' ? 'selected' : ''}>Takeaway</option></select><select data-kitchen-label><option value="">All labels</option>${labels.map(label => `<option value="${esc(label)}" ${filters.label === label ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><span data-kitchen-count>${orders.length} orders</span></div></section>` : ''}<section class="kitchen-board" aria-label="${history ? 'Kitchen order history' : 'Kitchen queue'}">${orders.map(order => {
    const nextStatus = order.status === 'confirmed' ? 'preparing' : order.status === 'preparing' ? 'ready' : null;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    return `<article class="kitchen-ticket ${order.status === 'confirmed' ? 'kitchen-ticket-new' : ''}" data-kitchen-order data-order-status="${esc(order.status)}" data-order-type="${esc(order.order_type || 'takeaway')}" data-order-label="${esc(order.label || '')}"><header><div><span class="ticket-label">${order.status === 'confirmed' ? 'New order' : 'Order'}</span><h2>#${esc(String(order.order_number).padStart(6, '0'))}</h2></div><span class="badge ${esc(order.status)}">${esc(order.status === 'confirmed' ? 'NEW ORDER' : order.status)}</span></header>
      <div class="ticket-meta"><span>${esc(String(order.order_type || 'takeaway').replaceAll('_', ' '))}</span><time>${esc(new Date(order.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</time></div>
      ${order.restaurant_tables?.table_number || order.guest_name ? `<div class="ticket-location">${order.restaurant_tables?.table_number ? `Table ${esc(order.restaurant_tables.table_number)}` : ''}${order.restaurant_tables?.table_number && order.guest_name ? ' · ' : ''}${esc(order.guest_name || '')}</div>` : ''}
      ${order.label ? `<div class="order-label-chip">${esc(order.label)}</div>` : ''}
      <ul class="ticket-items">${items.map(item => `<li><span><b>${esc(item.quantity)} x</b> ${esc(item.name_snapshot)}${item.variant ? ` <small>(${esc(item.variant)})</small>` : ''}</span><span>${money.format(Number(item.unit_price || 0) * Number(item.quantity || 0))}</span></li>`).join('') || '<li>No item details available.</li>'}</ul>
      ${order.notes ? `<p class="ticket-notes"><b>Notes:</b> ${esc(order.notes)}</p>` : ''}
      ${!history ? `<div class="order-label-editor"><input data-order-label value="${esc(order.label || '')}" maxlength="40" placeholder="Add a label (e.g. Allergy, VIP)" aria-label="Order label"><button class="btn btn-ghost" data-action="save-order-label" data-id="${esc(order.id)}">Save label</button></div>` : ''}
      <footer><b>Total ${money.format(Number(order.total || 0))}</b>${!history && nextStatus ? `<button class="btn btn-primary" data-action="kitchen-status" data-id="${esc(order.id)}" data-next="${nextStatus}">${nextStatus === 'preparing' ? 'Start preparing' : 'Mark prepared'}</button>` : ''}</footer>
    </article>`;
  }).join('')}</section>`;
}
