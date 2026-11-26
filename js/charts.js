(function (global) {
  function renderDonutChart(segments, totalAmount, hideBalances = false) {
    const { formatIDR } = global.StrukKu.Categories;
    if (!segments.length || totalAmount <= 0) {
      return `
        <div class="empty-chart">
          <p>Belum ada data pengeluaran di bulan ini.</p>
        </div>`;
    }

    const size = 190;
    const stroke = 24;
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const circles = segments.map((seg) => {
      const pct = seg.amount / totalAmount;
      const dash = Math.max(pct * circumference - 2, 2);
      const circle = `<circle
        cx="${size / 2}" cy="${size / 2}" r="${r}"
        fill="transparent"
        stroke="${seg.color}"
        stroke-width="${stroke}"
        stroke-dasharray="${dash} ${circumference}"
        stroke-dashoffset="${-offset}"
        stroke-linecap="butt"
      />`;
      offset += pct * circumference;
      return circle;
    }).join('');

    const legend = segments.map((seg) => {
      const pct = Math.round((seg.amount / totalAmount) * 100);
      return `
        <div class="legend-item">
          <div class="legend-left">
            <span class="legend-dot" style="background:${seg.color}"></span>
            <span class="legend-name">${seg.name}</span>
          </div>
          <div class="legend-right">
            <span class="legend-val">${hideBalances ? '•••••' : formatIDR(seg.amount)}</span>
            <span class="legend-pct">${pct}%</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="donut-wrap">
        <div class="donut-svg-box">
          <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="transparent" stroke="var(--border)" stroke-width="${stroke}" opacity="0.35"/>
            <g transform="rotate(-90 ${size / 2} ${size / 2})">${circles}</g>
          </svg>
          <div class="donut-center">
            <span class="donut-center-label">Total Keluar</span>
            <strong class="donut-center-val">${hideBalances ? '••••••' : formatIDR(totalAmount, true)}</strong>
          </div>
        </div>
        <div class="legend-list">${legend}</div>
      </div>`;
  }

  function renderCashflowChart(monthsData, hideBalances = false) {
    const { formatIDR } = global.StrukKu.Categories;
    const maxVal = Math.max(
      100000,
      ...monthsData.flatMap((m) => [m.income, m.expense])
    );

    const bars = monthsData.map((m) => {
      const incH = Math.max(4, Math.round((m.income / maxVal) * 110));
      const expH = Math.max(4, Math.round((m.expense / maxVal) * 110));
      return `
        <div class="bar-col" title="${m.label}\nMasuk: ${formatIDR(m.income)}\nKeluar: ${formatIDR(m.expense)}">
          <div class="bar-pair">
            <div class="bar bar-income" style="height:${m.income > 0 ? incH : 3}px"></div>
            <div class="bar bar-expense" style="height:${m.expense > 0 ? expH : 3}px"></div>
          </div>
          <span class="bar-label">${m.short}</span>
        </div>`;
    }).join('');

    return `
      <div class="cashflow-chart">
        <div class="chart-key">
          <span><i class="key-dot income"></i> Pemasukan</span>
          <span><i class="key-dot expense"></i> Pengeluaran</span>
          <span class="chart-max">${hideBalances ? '' : 'Maks: ' + formatIDR(maxVal, true)}</span>
        </div>
        <div class="bars-grid">${bars}</div>
      </div>`;
  }

  global.StrukKu = global.StrukKu || {};
  global.StrukKu.Charts = {
    renderDonutChart,
    renderCashflowChart
  };
})(window);
