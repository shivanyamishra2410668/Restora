const PAGE_SIZES = [10, 25, 50];

export function paginateTables(root) {
  root.querySelectorAll('.table-wrap table').forEach(table => {
    if (table.dataset.paginationReady) return;
    const body = table.tBodies[0];
    if (!body || !body.rows.length) return;

    const rows = [...body.rows];
    const wrapper = table.closest('.table-wrap');
    const controls = document.createElement('div');
    controls.className = 'table-pagination';
    controls.innerHTML = `<span class="table-pagination-summary" aria-live="polite"></span><div class="table-pagination-actions"><label>Rows <select aria-label="Rows per page">${PAGE_SIZES.map(size => `<option value="${size}" ${size === 10 ? 'selected' : ''}>${size}</option>`).join('')}</select></label><button type="button" class="btn btn-ghost" data-page-prev aria-label="Previous page">Previous</button><span class="table-pagination-page" aria-live="polite"></span><button type="button" class="btn btn-ghost" data-page-next aria-label="Next page">Next</button></div>`;
    wrapper.append(controls);

    const sizeSelect = controls.querySelector('select');
    const previous = controls.querySelector('[data-page-prev]');
    const next = controls.querySelector('[data-page-next]');
    const summary = controls.querySelector('.table-pagination-summary');
    const pageLabel = controls.querySelector('.table-pagination-page');
    let page = 1;

    const update = () => {
      const pageSize = Number(sizeSelect.value);
      const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
      page = Math.min(page, pageCount);
      const first = (page - 1) * pageSize;
      const last = Math.min(first + pageSize, rows.length);
      rows.forEach((row, index) => { row.hidden = index < first || index >= last; });
      summary.textContent = `Showing ${first + 1}-${last} of ${rows.length}`;
      pageLabel.textContent = `Page ${page} of ${pageCount}`;
      previous.disabled = page <= 1;
      next.disabled = page >= pageCount;
    };

    previous.addEventListener('click', () => { page--; update(); });
    next.addEventListener('click', () => { page++; update(); });
    sizeSelect.addEventListener('change', () => { page = 1; update(); });
    table.dataset.paginationReady = 'true';
    update();
  });
}
