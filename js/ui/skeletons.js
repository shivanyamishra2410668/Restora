const bar = (className = '') => `<span class="skeleton ${className}" aria-hidden="true"></span>`;

const skeletonRows = (count = 4, columns = 4) => Array.from({ length: count }, () => `
  <div class="skeleton-row" aria-hidden="true">
    ${Array.from({ length: columns }, (_, index) => bar(index === 0 ? 'sk-cell sk-cell-wide' : 'sk-cell')).join('')}
  </div>`).join('');

export function renderDynamicSkeleton({ title = '', showStats = false } = {}) {
  const stats = showStats ? `<section class="stat-grid" aria-hidden="true">${Array.from({ length: 4 }, () => `<article class="stat sk-stat">${bar('sk-label')}${bar('sk-number')}${bar('sk-note')}</article>`).join('')}</section>` : '';
  const productView = ['Products', 'Menu'].includes(title);
  const panel = productView
    ? `<section class="menu-product-grid" aria-hidden="true">${Array.from({ length: 6 }, () => `<article class="skeleton menu-product-skeleton"></article>`).join('')}</section>`
    : `<section class="panel sk-panel" aria-hidden="true"><div class="panel-head">${bar('sk-panel-title')}${bar('sk-panel-meta')}</div>${skeletonRows(title === 'Orders' ? 5 : 4, title === 'Orders' ? 6 : 5)}</section>`;
  return `<div class="dynamic-loading" aria-busy="true">${stats}${panel}<span class="sr-only" role="status">Loading ${title || 'workspace'} data</span></div>`;
}
