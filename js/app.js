(function (global) {
  const { Categories, DB, Gemini, Charts } = global.StrukKu;
  const {
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    iconSvg,
    getCategory,
    formatIDR,
    parseIDR,
    todayISO,
    currentMonthKey,
    formatDateID,
    formatMonthLabel
  } = Categories;

  let state = null;
  let activeTab = 'home';
  let activeAnalyticsSubTab = 'report';
  let selectedMonth = currentMonthKey();
  let historyFilter = { q: '', type: 'all', walletId: 'all' };
  let deferredInstallPrompt = null;
  let proxyStatus = { checked: false, available: false, requireAccessCode: false, dailyLimit: null, url: '' };
  let installBannerDismissed = (() => {
    try {
      return localStorage.getItem('strukku_install_dismissed') === '1';
    } catch {
      return false;
    }
  })();

  function isStandaloneMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIOSDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function willUseProxy() {
    const mode = state?.settings?.aiMode || 'auto';
    const hasPersonalKey = Boolean(state?.settings?.geminiApiKey?.trim());
    if (mode === 'proxy') return true;
    if (mode === 'direct') return false;
    return !hasPersonalKey && proxyStatus.available;
  }

  function isAiReady() {
    const mode = state?.settings?.aiMode || 'auto';
    const hasPersonalKey = Boolean(state?.settings?.geminiApiKey?.trim());
    if (mode === 'proxy') return proxyStatus.available || Boolean(state?.settings?.proxyUrl?.trim());
    if (mode === 'direct') return hasPersonalKey;
    return hasPersonalKey || proxyStatus.available;
  }

  // Temp state for receipt scan session
  let scanSession = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function applyTheme() {
    const dark = Boolean(state?.settings?.darkMode);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#059669');
  }

  function shiftMonth(monthKey, delta) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getMonthTransactions(monthKey) {
    return state.transactions
      .filter((t) => (t.date || '').startsWith(monthKey))
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  }

  function formatMoney(amount, compact = false) {
    if (state.settings.hideBalances) return 'Rp ••••••';
    return formatIDR(amount, compact);
  }

  function updateHeader() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    $('#currentMonthLabel').textContent = `${shortMonths[(m || 1) - 1]} ${y}`;
    $$('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
  }

  async function persistAndRender() {
    await DB.saveState(state);
    render();
  }

  function openModal(html) {
    const backdrop = $('#modalBackdrop');
    const sheet = $('#modalSheet');
    sheet.innerHTML = `<div class="sheet-handle"></div>${html}`;
    backdrop.classList.add('open');
  }

  function closeModal() {
    $('#modalBackdrop').classList.remove('open');
  }

  // ==================== RENDER VIEWS ====================
  function render() {
    updateHeader();
    const main = $('#appMain');
    if (activeTab === 'home') main.innerHTML = renderHomeView();
    else if (activeTab === 'history') main.innerHTML = renderHistoryView();
    else if (activeTab === 'analytics') main.innerHTML = renderAnalyticsView();
    else if (activeTab === 'settings') main.innerHTML = renderSettingsView();
    bindViewEvents();
  }

  function renderTxRow(tx) {
    const cat = getCategory(tx.category, tx.type);
    const wallet = state.wallets.find((w) => w.id === tx.walletId);
    const toWallet = tx.toWalletId ? state.wallets.find((w) => w.id === tx.toWalletId) : null;
    const prefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
    const subLabel = tx.type === 'transfer'
      ? `${wallet?.name || 'Dompet'} → ${toWallet?.name || 'Dompet'}`
      : `${cat.short} • ${wallet?.name || 'Dompet'}${tx.items?.length ? ` • ${tx.items.length} item` : ''}`;

    return `
      <div class="tx-item" data-tx-id="${esc(tx.id)}">
        <div class="tx-icon" style="background:${cat.bg};color:${cat.color}">
          ${iconSvg(cat.icon, 20)}
        </div>
        <div class="tx-body">
          <div class="tx-title">
            <span>${esc(tx.merchant || cat.name)}</span>
            ${tx.source === 'scan' ? '<span class="tx-badge">Struk AI</span>' : ''}
          </div>
          <div class="tx-meta">${esc(subLabel)}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${tx.type}">${prefix}${formatMoney(tx.amount)}</div>
          <div class="tx-date-mini">${esc(formatDateID(tx.date))}</div>
        </div>
      </div>`;
  }

  function renderHomeView() {
    const balances = DB.computeWalletBalances(state);
    const totalBalance = Object.values(balances).reduce((s, v) => s + v, 0);
    const monthTxs = getMonthTransactions(selectedMonth);
    const monthIncome = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Budget summary (top 2 highest usage)
    const expByCat = {};
    monthTxs.filter((t) => t.type === 'expense').forEach((t) => {
      expByCat[t.category] = (expByCat[t.category] || 0) + t.amount;
    });
    const budgetAlerts = state.budgets
      .map((b) => {
        const spent = expByCat[b.category] || 0;
        const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
        return { ...b, spent, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2);

    // Unpaid recurring bills for selectedMonth
    const unpaidBills = state.recurring.filter((r) => r.lastPaidMonth !== selectedMonth);

    return `
      <!-- Hero Balance Card -->
      <section class="hero-card">
        <div class="hero-top">
          <span>Total Saldo Bersih</span>
          <button id="btnTogglePrivacy" class="hero-eye" title="Sembunyikan/Tampilkan Saldo">
            ${state.settings.hideBalances
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>'
              : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'}
          </button>
        </div>
        <div class="hero-balance">${formatMoney(totalBalance)}</div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-label">↓ Pemasukan (${esc(selectedMonth.slice(5))}/${esc(selectedMonth.slice(2, 4))})</div>
            <div class="hero-stat-val">${formatMoney(monthIncome)}</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-label">↑ Pengeluaran (${esc(selectedMonth.slice(5))}/${esc(selectedMonth.slice(2, 4))})</div>
            <div class="hero-stat-val">${formatMoney(monthExpense)}</div>
          </div>
        </div>
      </section>

      ${!isStandaloneMode() && !installBannerDismissed ? `
        <div class="install-banner">
          <div class="install-banner-left">
            <img src="./icons/icon-192.png" alt="StrukKu" class="install-banner-icon" />
            <div class="install-banner-text">
              <strong>Pasang StrukKu di Layar Utama</strong>
              <span>${deferredInstallPrompt ? 'Akses instan 1-ketukan seperti aplikasi native.' : isIOSDevice() ? 'Tambah ke Home Screen iPhone biar lebih cepat & layar penuh.' : 'Buka lebih cepat & bisa dipakai offline di HP.'}</span>
            </div>
          </div>
          <div class="install-banner-actions">
            <button id="btnHomeInstall" class="btn btn-primary btn-sm">${deferredInstallPrompt ? 'Install' : 'Caranya'}</button>
            <button id="btnDismissInstall" class="banner-dismiss" title="Tutup" aria-label="Tutup">&times;</button>
          </div>
        </div>` : ''}

      ${state.isDemo ? `
        <div class="info-banner">
          <div>
            <strong>Mode Data Contoh</strong>
            <span>Data simulasi aktif agar grafik &amp; fitur langsung terlihat.</span>
          </div>
          <button id="btnClearDemo" class="banner-btn">Mulai Kosong</button>
        </div>` : ''}

      ${!isAiReady() ? `
        <div class="info-banner ai-banner">
          <div>
            <strong>Aktifkan Gemini AI Vision</strong>
            <span>Masukkan API Key untuk scan foto struk asli secara otomatis.</span>
          </div>
          <button id="btnGoApiSetting" class="banner-btn">Atur Key</button>
        </div>` : ''}

      <!-- Quick Actions -->
      <section class="quick-grid">
        <button class="quick-btn" data-action="scan">
          <div class="quick-icon" style="background:var(--primary-soft);color:var(--primary)">${iconSvg('camera', 20)}</div>
          <span>Foto Struk</span>
        </button>
        <button class="quick-btn" data-action="income">
          <div class="quick-icon" style="background:var(--income-soft);color:var(--income)">${iconSvg('plus-circle', 20)}</div>
          <span>Pemasukan</span>
        </button>
        <button class="quick-btn" data-action="expense">
          <div class="quick-icon" style="background:var(--expense-soft);color:var(--expense)">${iconSvg('receipt', 20)}</div>
          <span>Pengeluaran</span>
        </button>
        <button class="quick-btn" data-action="transfer">
          <div class="quick-icon" style="background:var(--info-soft);color:var(--info)">${iconSvg('arrow-left-right', 20)}</div>
          <span>Transfer</span>
        </button>
      </section>

      <!-- Wallets -->
      <section>
        <div class="section-head">
          <span class="section-title">Dompet &amp; Rekening</span>
          <button class="link-btn" data-nav="settings">+ Kelola</button>
        </div>
        <div class="wallets-scroll">
          ${state.wallets.map((w) => `
            <div class="wallet-chip">
              <div class="wallet-chip-top">
                <span class="wallet-dot" style="background:${w.color}">${iconSvg(w.icon, 14)}</span>
                <span>${esc(w.name)}</span>
              </div>
              <div class="wallet-chip-bal">${formatMoney(balances[w.id] || 0)}</div>
            </div>`).join('')}
        </div>
      </section>

      ${unpaidBills.length > 0 ? `
        <section>
          <div class="section-head">
            <span class="section-title">Tagihan Rutin Bulan Ini</span>
            <button class="link-btn" data-nav="settings">Atur</button>
          </div>
          <div class="tx-list">
            ${unpaidBills.slice(0, 2).map((bill) => `
              <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;">
                <div>
                  <div style="font-weight:700;font-size:13.5px">${esc(bill.name)}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Jatuh tempo tgl ${bill.dueDay} • ${formatMoney(bill.amount)}</div>
                </div>
                <button class="btn btn-primary btn-sm" data-pay-bill="${esc(bill.id)}">Catat Bayar</button>
              </div>`).join('')}
          </div>
        </section>` : ''}

      ${budgetAlerts.length > 0 ? `
        <section>
          <div class="section-head">
            <span class="section-title">Pantauan Anggaran</span>
            <button class="link-btn" id="btnSeeBudgets">Lihat Semua</button>
          </div>
          <div class="tx-list">
            ${budgetAlerts.map((b) => {
              const cat = getCategory(b.category, 'expense');
              const barColor = b.pct >= 100 ? 'var(--expense)' : b.pct >= 75 ? 'var(--warning)' : 'var(--primary)';
              return `
                <div class="progress-item">
                  <div class="progress-top">
                    <span style="font-weight:700;font-size:13px">${esc(cat.name)}</span>
                    <span style="font-weight:800;font-size:12px;color:${barColor}">${b.pct}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${Math.min(100, b.pct)}%;background:${barColor}"></div>
                  </div>
                  <div class="progress-sub">
                    <span>Terpakai ${formatMoney(b.spent)}</span>
                    <span>Batas ${formatMoney(b.limit)}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </section>` : ''}

      <!-- Recent Transactions -->
      <section>
        <div class="section-head">
          <span class="section-title">Transaksi Terbaru</span>
          <button class="link-btn" data-nav="history">Lihat Semua</button>
        </div>
        ${monthTxs.length === 0
          ? `<div class="card empty-state">Belum ada transaksi di ${esc(formatMonthLabel(selectedMonth))}.<br/>Ketuk tombol kamera <b>Scan Struk</b> di bawah untuk mulai!</div>`
          : `<div class="tx-list">${monthTxs.slice(0, 6).map(renderTxRow).join('')}</div>`}
      </section>
    `;
  }

  function renderHistoryView() {
    let txs = getMonthTransactions(selectedMonth);
    if (historyFilter.type === 'receipt') {
      txs = txs.filter((t) => t.source === 'scan' || t.hasReceipt);
    } else if (historyFilter.type !== 'all') {
      txs = txs.filter((t) => t.type === historyFilter.type);
    }
    if (historyFilter.walletId !== 'all') {
      txs = txs.filter((t) => t.walletId === historyFilter.walletId || t.toWalletId === historyFilter.walletId);
    }
    if (historyFilter.q.trim()) {
      const q = historyFilter.q.trim().toLowerCase();
      txs = txs.filter((t) => {
        const cat = getCategory(t.category, t.type);
        const itemText = (t.items || []).map((i) => i.name).join(' ').toLowerCase();
        return (
          (t.merchant || '').toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q) ||
          cat.name.toLowerCase().includes(q) ||
          itemText.includes(q)
        );
      });
    }

    const totalIn = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalOut = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net = totalIn - totalOut;

    // Group by date
    const groups = {};
    txs.forEach((t) => {
      const key = t.date || 'Lainnya';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    return `
      <div class="search-box">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="historySearch" type="search" placeholder="Cari toko, item struk, atau catatan..." value="${esc(historyFilter.q)}" />
      </div>

      <div class="chips-row">
        ${[
          ['all', 'Semua'],
          ['expense', 'Pengeluaran'],
          ['income', 'Pemasukan'],
          ['transfer', 'Transfer'],
          ['receipt', 'Scan Struk']
        ].map(([val, label]) => `
          <button class="chip ${historyFilter.type === val ? 'active' : ''}" data-filter-type="${val}">${label}</button>`).join('')}
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <select id="historyWalletFilter" class="form-select" style="padding:8px 10px;font-size:12.5px;">
          <option value="all">Semua Dompet</option>
          ${state.wallets.map((w) => `<option value="${esc(w.id)}" ${historyFilter.walletId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
        </select>
        <button id="btnExportCsv" class="btn btn-secondary btn-sm" style="white-space:nowrap;">${iconSvg('download', 14)} Export CSV</button>
      </div>

      <div class="card" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;padding:11px 8px;">
        <div>
          <div style="font-size:11px;color:var(--text-muted)">Masuk</div>
          <div style="font-size:13px;font-weight:800;color:var(--income)">${formatMoney(totalIn, true)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted)">Keluar</div>
          <div style="font-size:13px;font-weight:800;color:var(--expense)">${formatMoney(totalOut, true)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted)">Selisih</div>
          <div style="font-size:13px;font-weight:800;color:${net >= 0 ? 'var(--primary)' : 'var(--expense)'}">${net >= 0 ? '+' : ''}${formatMoney(net, true)}</div>
        </div>
      </div>

      ${sortedDates.length === 0
        ? `<div class="card empty-state">Tidak ada transaksi yang cocok dengan filter ini.</div>`
        : sortedDates.map((dateKey) => {
            const list = groups[dateKey];
            const dayOut = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            const dayIn = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const dayNet = dayIn - dayOut;
            return `
              <div>
                <div class="tx-group-head">
                  <span>${esc(formatDateID(dateKey))}</span>
                  <span>${dayNet >= 0 ? '+' : ''}${formatMoney(dayNet)}</span>
                </div>
                <div class="tx-list">${list.map(renderTxRow).join('')}</div>
              </div>`;
          }).join('')}
    `;
  }

  function renderAnalyticsView() {
    return `
      <div class="seg-tabs">
        <button class="seg-tab ${activeAnalyticsSubTab === 'report' ? 'active' : ''}" data-subtab="report">Laporan</button>
        <button class="seg-tab ${activeAnalyticsSubTab === 'budget' ? 'active' : ''}" data-subtab="budget">Anggaran</button>
        <button class="seg-tab ${activeAnalyticsSubTab === 'goals' ? 'active' : ''}" data-subtab="goals">Target</button>
      </div>
      ${activeAnalyticsSubTab === 'report' ? renderReportSubTab() : ''}
      ${activeAnalyticsSubTab === 'budget' ? renderBudgetSubTab() : ''}
      ${activeAnalyticsSubTab === 'goals' ? renderGoalsSubTab() : ''}
    `;
  }

  function renderReportSubTab() {
    const monthTxs = getMonthTransactions(selectedMonth);
    const totalIn = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalOut = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const savingsRate = totalIn > 0 ? Math.round(((totalIn - totalOut) / totalIn) * 100) : 0;

    // Average daily spend in selected month
    const [y, m] = selectedMonth.split('-').map(Number);
    const today = new Date();
    const isCurrentMonth = selectedMonth === currentMonthKey();
    const daysElapsed = isCurrentMonth ? Math.max(1, today.getDate()) : new Date(y, m, 0).getDate();
    const avgDaily = Math.round(totalOut / daysElapsed);

    // Category breakdown
    const catTotals = {};
    monthTxs.filter((t) => t.type === 'expense').forEach((t) => {
      catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    });
    const segments = Object.entries(catTotals)
      .map(([catId, amount]) => {
        const cat = getCategory(catId, 'expense');
        return { id: catId, name: cat.name, color: cat.color, amount };
      })
      .sort((a, b) => b.amount - a.amount);

    // 6-month trend
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthsData = [];
    for (let i = 5; i >= 0; i--) {
      const mk = shiftMonth(selectedMonth, -i);
      const txs = getMonthTransactions(mk);
      const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const mm = Number(mk.slice(5, 7));
      monthsData.push({ key: mk, label: formatMonthLabel(mk), short: shortMonths[mm - 1], income: inc, expense: exp });
    }

    // Smart insight text
    let insightText = 'Catat transaksi rutin atau scan struk belanja untuk melihat analisis kebiasaan keuanganmu.';
    if (totalOut > 0 && segments.length > 0) {
      const top = segments[0];
      const topPct = Math.round((top.amount / totalOut) * 100);
      if (savingsRate >= 30) {
        insightText = `Keuangan sangat sehat! Rasio tabunganmu ${savingsRate}% bulan ini. Pengeluaran terbesar ada di ${top.name} (${topPct}%).`;
      } else if (savingsRate >= 10) {
        insightText = `Arus kas positif (${savingsRate}% tersimpan). Pos terbesar bulan ini adalah ${top.name} sebesar ${formatMoney(top.amount)}.`;
      } else if (totalIn > 0) {
        insightText = `Perhatian: Pengeluaran hampir menyamai atau melebihi pemasukan. Coba evaluasi pos ${top.name} (${topPct}% dari total keluar).`;
      } else {
        insightText = `Pos pengeluaran terbesar bulan ini adalah ${top.name} (${topPct}%). Jangan lupa catat pemasukanmu juga!`;
      }
    }

    const topExpenses = monthTxs
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return `
      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">Rasio Tabungan</div>
          <div class="kpi-val" style="color:${savingsRate >= 20 ? 'var(--income)' : savingsRate >= 0 ? 'var(--warning)' : 'var(--expense)'}">${savingsRate}%</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Rata-rata / Hari</div>
          <div class="kpi-val">${formatMoney(avgDaily, true)}</div>
        </div>
      </div>

      <div class="card" style="background:var(--primary-soft);border-color:color-mix(in srgb,var(--primary) 25%,transparent);">
        <div style="font-size:12px;font-weight:800;color:var(--primary);margin-bottom:4px;">Insight Keuangan</div>
        <div style="font-size:13px;">${esc(insightText)}</div>
      </div>

      <div class="card">
        <div class="section-head"><span class="section-title">Pengeluaran per Kategori</span></div>
        ${Charts.renderDonutChart(segments, totalOut, state.settings.hideBalances)}
      </div>

      <div class="card">
        <div class="section-head"><span class="section-title">Arus Kas 6 Bulan Terakhir</span></div>
        ${Charts.renderCashflowChart(monthsData, state.settings.hideBalances)}
      </div>

      <div class="card">
        <div class="section-head"><span class="section-title">Pengeluaran Terbesar</span></div>
        ${topExpenses.length === 0
          ? '<div class="empty-chart">Belum ada pengeluaran bulan ini.</div>'
          : `<div class="tx-list">${topExpenses.map(renderTxRow).join('')}</div>`}
      </div>
    `;
  }

  function renderBudgetSubTab() {
    const monthTxs = getMonthTransactions(selectedMonth);
    const expByCat = {};
    monthTxs.filter((t) => t.type === 'expense').forEach((t) => {
      expByCat[t.category] = (expByCat[t.category] || 0) + t.amount;
    });

    const totalLimit = state.budgets.reduce((s, b) => s + b.limit, 0);
    const totalSpentInBudgets = state.budgets.reduce((s, b) => s + (expByCat[b.category] || 0), 0);

    return `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div>
          <div style="font-size:12px;color:var(--text-muted)">Total Anggaran Bulanan</div>
          <div style="font-size:18px;font-weight:800">${formatMoney(totalSpentInBudgets)} <span style="font-size:12px;font-weight:600;color:var(--text-muted)">/ ${formatMoney(totalLimit)}</span></div>
        </div>
        <button id="btnAddBudget" class="btn btn-primary btn-sm">+ Atur</button>
      </div>

      ${state.budgets.length === 0
        ? '<div class="card empty-state">Belum ada anggaran kategori. Ketuk <b>+ Atur</b> untuk membatasi pengeluaran bulananmu.</div>'
        : `<div class="tx-list">
            ${state.budgets.map((b) => {
              const cat = getCategory(b.category, 'expense');
              const spent = expByCat[b.category] || 0;
              const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
              const remain = b.limit - spent;
              const barColor = pct >= 100 ? 'var(--expense)' : pct >= 75 ? 'var(--warning)' : 'var(--primary)';
              return `
                <div class="progress-item">
                  <div class="progress-top">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="wallet-dot" style="background:${cat.color}">${iconSvg(cat.icon, 14)}</span>
                      <span style="font-weight:700;font-size:13.5px">${esc(cat.name)}</span>
                    </div>
                    <button class="link-btn" style="color:var(--expense)" data-del-budget="${esc(b.id)}">Hapus</button>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${Math.min(100, pct)}%;background:${barColor}"></div>
                  </div>
                  <div class="progress-sub">
                    <span>Terpakai ${formatMoney(spent)} (${pct}%)</span>
                    <span style="color:${remain < 0 ? 'var(--expense)' : 'var(--text-muted)'};font-weight:700">
                      ${remain >= 0 ? `Sisa ${formatMoney(remain)}` : `Lebih ${formatMoney(Math.abs(remain))}`}
                    </span>
                  </div>
                </div>`;
            }).join('')}
          </div>`}
    `;
  }

  function renderGoalsSubTab() {
    return `
      <div class="section-head">
        <span class="section-title">Target Tabungan</span>
        <button id="btnAddGoal" class="btn btn-primary btn-sm">+ Target Baru</button>
      </div>

      ${state.goals.length === 0
        ? '<div class="card empty-state">Belum ada target tabungan. Buat target seperti Dana Darurat, Gadget, atau Liburan!</div>'
        : `<div class="tx-list">
            ${state.goals.map((g) => {
              const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
              return `
                <div class="progress-item">
                  <div class="progress-top">
                    <div>
                      <div style="font-weight:800;font-size:14.5px">${esc(g.name)}</div>
                      <div style="font-size:11.5px;color:var(--text-muted)">Target tgl: ${esc(g.deadline || '-')}</div>
                    </div>
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-primary btn-sm" data-deposit-goal="${esc(g.id)}">+ Nabung</button>
                      <button class="btn btn-secondary btn-sm" data-del-goal="${esc(g.id)}" title="Hapus">${iconSvg('trash', 14)}</button>
                    </div>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%;background:${g.color || 'var(--primary)'}"></div>
                  </div>
                  <div class="progress-sub">
                    <span>Terkumpul <b>${formatMoney(g.current)}</b> (${pct}%)</span>
                    <span>Target ${formatMoney(g.target)}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>`}
    `;
  }

  function renderSettingsView() {
    const balances = DB.computeWalletBalances(state);
    const aiMode = state.settings.aiMode || 'auto';
    const usingProxy = willUseProxy();
    const badgeLabel = usingProxy
      ? 'Server AI Aktif'
      : state.settings.geminiApiKey
        ? 'Key Pribadi Aktif'
        : 'Belum Diatur';

    return `
      <!-- Gemini AI Vision Config -->
      <section class="card">
        <div class="section-head">
          <span class="section-title">Gemini AI Vision (Scan Struk)</span>
          <span class="tx-badge">${badgeLabel}</span>
        </div>

        ${proxyStatus.available ? `
          <div class="ai-status-box">
            <strong>✓ Server AI Siap Pakai (Tanpa API Key)</strong><br/>
            Pengguna bisa langsung foto &amp; scan struk tanpa perlu membuat API Key sendiri.${proxyStatus.dailyLimit ? ` Kuota gratis server: <b>${proxyStatus.dailyLimit}x/hari</b>.` : ''}
          </div>` : ''}

        <div class="form-group">
          <label class="form-label" for="selectAiMode">Mode Koneksi AI</label>
          <select id="selectAiMode" class="form-select">
            <option value="auto" ${aiMode === 'auto' ? 'selected' : ''}>Otomatis (Server AI jika tersedia / Key Pribadi)</option>
            <option value="proxy" ${aiMode === 'proxy' ? 'selected' : ''}>Server AI StrukKu (Tanpa API Key)</option>
            <option value="direct" ${aiMode === 'direct' ? 'selected' : ''}>API Key Pribadi (Google AI Studio)</option>
          </select>
        </div>

        ${(aiMode === 'proxy' || (aiMode === 'auto' && proxyStatus.available)) ? `
          <div class="form-group">
            <label class="form-label" for="inputProxyUrl">URL Server Proxy AI (Opsional)</label>
            <input id="inputProxyUrl" type="url" class="form-input" placeholder="${esc(Gemini.getEffectiveProxyUrl())}" value="${esc(state.settings.proxyUrl || '')}" />
          </div>
          ${(proxyStatus.requireAccessCode || state.settings.proxyAccessCode || aiMode === 'proxy') ? `
            <div class="form-group">
              <label class="form-label" for="inputProxyAccessCode">Kode Akses Server ${proxyStatus.requireAccessCode ? '(Wajib)' : '(Jika ada)'}</label>
              <input id="inputProxyAccessCode" type="password" class="form-input" placeholder="Masukkan kode undangan jika diminta" value="${esc(state.settings.proxyAccessCode || '')}" />
            </div>` : ''}
        ` : ''}

        ${aiMode !== 'proxy' ? `
          <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px;">
            ${proxyStatus.available ? 'Opsional: isi API Key pribadi jika ingin kuota scan tanpa batas.' : 'API Key disimpan lokal di perangkatmu (tidak dikirim ke server lain selain Google Gemini).'} Dapatkan gratis di <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700;">Google AI Studio</a>.
          </p>
          <div class="form-group">
            <label class="form-label" for="inputGeminiKey">Gemini API Key ${proxyStatus.available ? '(Opsional)' : ''}</label>
            <input id="inputGeminiKey" type="password" class="form-input" placeholder="AIzaSy..." value="${esc(state.settings.geminiApiKey || '')}" />
          </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label" for="selectGeminiModel">Model Gemini Vision</label>
          <select id="selectGeminiModel" class="form-select">
            <option value="auto" ${(!state.settings.geminiModel || state.settings.geminiModel === 'auto') ? 'selected' : ''}>Otomatis (Pilih Model Aktif Terbaik - Rekomendasi)</option>
            <option value="gemini-3-flash-preview" ${state.settings.geminiModel === 'gemini-3-flash-preview' ? 'selected' : ''}>gemini-3-flash-preview (Cepat &amp; Akurat)</option>
            <option value="gemini-3.1-pro-preview" ${state.settings.geminiModel === 'gemini-3.1-pro-preview' ? 'selected' : ''}>gemini-3.1-pro-preview (Struk Panjang / Tulisan Tangan)</option>
            <option value="gemini-2.5-flash" ${state.settings.geminiModel === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash (Stabil)</option>
          </select>
        </div>
        <div class="btn-row">
          <button id="btnSaveApi" class="btn btn-primary btn-sm" style="width:100%">Simpan</button>
          <button id="btnTestApi" class="btn btn-secondary btn-sm" style="width:100%">Tes Koneksi</button>
        </div>
        <div id="apiTestStatus" style="font-size:12px;margin-top:8px;"></div>
      </section>

      <!-- Wallets Management -->
      <section class="card">
        <div class="section-head">
          <span class="section-title">Kelola Dompet / Rekening</span>
          <button id="btnAddWallet" class="link-btn">+ Tambah</button>
        </div>
        <div>
          ${state.wallets.map((w) => `
            <div class="setting-row">
              <div style="display:flex;align-items:center;gap:9px;">
                <span class="wallet-dot" style="background:${w.color}">${iconSvg(w.icon, 14)}</span>
                <div>
                  <div style="font-weight:700;font-size:13.5px">${esc(w.name)}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Saldo: ${formatMoney(balances[w.id] || 0)}</div>
                </div>
              </div>
              ${state.wallets.length > 1
                ? `<button class="link-btn" style="color:var(--expense)" data-del-wallet="${esc(w.id)}">Hapus</button>`
                : ''}
            </div>`).join('')}
        </div>
      </section>

      <!-- Recurring Bills -->
      <section class="card">
        <div class="section-head">
          <span class="section-title">Tagihan Rutin Bulanan</span>
          <button id="btnAddRecurring" class="link-btn">+ Tambah</button>
        </div>
        ${state.recurring.length === 0
          ? '<div style="font-size:12.5px;color:var(--text-muted)">Belum ada pengingat tagihan rutin.</div>'
          : state.recurring.map((r) => {
              const paid = r.lastPaidMonth === selectedMonth;
              return `
                <div class="setting-row">
                  <div>
                    <div style="font-weight:700;font-size:13.5px">${esc(r.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted)">Tgl ${r.dueDay} • ${formatMoney(r.amount)}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    ${paid
                      ? '<span class="tx-badge">Lunas</span>'
                      : `<button class="btn btn-primary btn-sm" data-pay-bill="${esc(r.id)}">Bayar</button>`}
                    <button class="link-btn" style="color:var(--expense)" data-del-recurring="${esc(r.id)}">Hapus</button>
                  </div>
                </div>`;
            }).join('')}
      </section>

      <!-- Preferences -->
      <section class="card">
        <div class="section-head"><span class="section-title">Tampilan &amp; Privasi</span></div>
        <div class="setting-row">
          <div>
            <div style="font-weight:700;font-size:13.5px">Mode Gelap (Dark Mode)</div>
            <div style="font-size:12px;color:var(--text-muted)">Nyaman dipakai malam hari</div>
          </div>
          <button id="switchDark" class="switch ${state.settings.darkMode ? 'on' : ''}" aria-label="Mode Gelap"></button>
        </div>
        <div class="setting-row">
          <div>
            <div style="font-weight:700;font-size:13.5px">Sembunyikan Nominal Saldo</div>
            <div style="font-size:12px;color:var(--text-muted)">Lindungi privasi di tempat umum</div>
          </div>
          <button id="switchPrivacy" class="switch ${state.settings.hideBalances ? 'on' : ''}" aria-label="Sembunyikan Saldo"></button>
        </div>
      </section>

      <!-- PWA Install & Data Backup -->
      <section class="card">
        <div class="section-head"><span class="section-title">Aplikasi Mobile (PWA) &amp; Data</span></div>
        <div class="btn-row" style="margin-bottom:10px;">
          <button id="btnInstallPwa" class="btn btn-primary btn-sm" style="width:100%">
            ${isStandaloneMode() ? '✓ Sudah Terpasang' : deferredInstallPrompt ? 'Install ke Layar Utama' : 'Cara Install di HP'}
          </button>
          <button id="btnShareSettings" class="btn btn-secondary btn-sm" style="width:100%">Bagikan Aplikasi</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px;">
          <button id="btnBackupJson" class="btn btn-secondary btn-sm" style="width:100%">${iconSvg('download', 14)} Backup JSON</button>
          <button id="btnRestoreJson" class="btn btn-secondary btn-sm" style="width:100%">${iconSvg('upload', 14)} Restore JSON</button>
        </div>
        <div class="btn-row">
          <button id="btnLoadDemo" class="btn btn-secondary btn-sm" style="width:100%">Muat Data Demo</button>
          <button id="btnResetAll" class="btn btn-danger btn-sm" style="width:100%">Reset Kosong</button>
        </div>
      </section>
    `;
  }

  // ==================== SCAN STRUK FLOW ====================
  function openScanModal() {
    scanSession = { imageDataUrl: null, base64: null, mimeType: 'image/jpeg', loading: false, error: '', result: null };
    renderScanModal();
  }

  function renderScanModal() {
    const aiReady = isAiReady();
    const usingProxy = willUseProxy();
    const needsAccessCode = usingProxy && proxyStatus.requireAccessCode && !state.settings.proxyAccessCode;
    const s = scanSession;

    if (!s.imageDataUrl && !s.result) {
      openModal(`
        <div class="sheet-header">
          <div class="sheet-title">Scan Struk dengan Gemini AI</div>
          <button class="close-btn" id="btnCloseModal">&times;</button>
        </div>

        <div class="scan-dropzone">
          <div style="width:54px;height:54px;border-radius:16px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;">
            ${iconSvg('camera', 26)}
          </div>
          <div style="font-weight:800;font-size:15.5px;">Foto Struk atau Pilih dari Galeri</div>
          <div style="font-size:12.5px;color:var(--text-muted);max-width:300px;">
            Gemini Vision akan membaca nama toko, tanggal, daftar item, diskon/pajak, dan total bayar secara otomatis.
          </div>
          <div class="btn-row" style="width:100%;margin-top:6px;">
            <button id="btnPickCamera" class="btn btn-primary">${iconSvg('camera', 17)} Kamera</button>
            <button id="btnPickGallery" class="btn btn-secondary">Galeri Foto</button>
          </div>
        </div>

        ${needsAccessCode ? `
          <div class="info-banner ai-banner" style="margin-top:12px;">
            <div>
              <strong>Masukkan Kode Akses Server</strong>
              <span>Server AI aktif, tapi butuh kode akses dari pemilik aplikasi.</span>
            </div>
            <button id="btnScanQuickApi" class="banner-btn">Isi Kode</button>
          </div>` : !aiReady ? `
          <div class="info-banner ai-banner" style="margin-top:12px;">
            <div>
              <strong>Belum ada Gemini API Key</strong>
              <span>Atur API Key di menu Lainnya untuk scan struk nyata, atau coba simulasi di bawah.</span>
            </div>
            <button id="btnScanQuickApi" class="banner-btn">Isi Key</button>
          </div>` : `
          <div style="margin-top:10px;font-size:12px;color:var(--primary);font-weight:700;text-align:center;">
            ${usingProxy
              ? `✓ AI Scan Siap Pakai (Server Otomatis${proxyStatus.dailyLimit ? ` • Maks ${proxyStatus.dailyLimit}x/hari` : ''})`
              : `✓ Terhubung ke ${esc(state.settings.geminiModel === 'auto' || !state.settings.geminiModel ? 'Gemini AI (Otomatis)' : state.settings.geminiModel)}`}
          </div>`}

        <div style="margin-top:14px;">
          <div class="form-label">Atau Coba Simulasi Scan Struk Contoh:</div>
          <div class="chips-row">
            ${Gemini.SAMPLE_RECEIPTS.map((sr, idx) => `
              <button class="chip" data-demo-scan="${idx}">${esc(sr.label)}</button>`).join('')}
          </div>
        </div>
      `);

      $('#btnCloseModal').onclick = closeModal;
      $('#btnPickCamera').onclick = () => $('#inputCameraFile').click();
      $('#btnPickGallery').onclick = () => $('#inputGalleryFile').click();
      const quickApi = $('#btnScanQuickApi');
      if (quickApi) {
        quickApi.onclick = () => {
          closeModal();
          activeTab = 'settings';
          render();
        };
      }
      $$('[data-demo-scan]').forEach((btn) => {
        btn.onclick = () => runDemoScan(Number(btn.dataset.demoScan));
      });
      return;
    }

    if (s.loading) {
      openModal(`
        <div class="sheet-header">
          <div class="sheet-title">Menganalisis Struk...</div>
          <button class="close-btn" id="btnCloseModal">&times;</button>
        </div>
        <div class="scan-preview-box">
          <img src="${s.imageDataUrl}" alt="Preview Struk" />
          <div class="scan-laser"></div>
          <div class="scan-overlay-status">
            <div class="spinner"></div>
            <span>Gemini AI sedang membaca struk...</span>
          </div>
        </div>
        <p style="text-align:center;font-size:12.5px;color:var(--text-muted);margin-top:12px;">
          Mendeteksi toko, rincian item, pajak, dan total pembayaran...
        </p>
      `);
      $('#btnCloseModal').onclick = closeModal;
      return;
    }

    // Review & Save Form (works after AI scan OR fallback manual with photo)
    const r = s.result || {
      merchant: '',
      date: todayISO(),
      time: new Date().toTimeString().slice(0, 5),
      total: 0,
      category: 'food',
      paymentMethod: 'cash',
      items: [],
      notes: '',
      confidence: 0
    };

    const matchedWallet =
      state.wallets.find((w) => w.type === r.paymentMethod) || state.wallets[0];

    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Konfirmasi Hasil Struk</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>

      ${s.error ? `
        <div class="info-banner" style="margin-bottom:12px;">
          <div>
            <strong>${s.error === 'NO_API_KEY' ? 'API Key Gemini Belum Diisi' : 'Kendala Pembacaan AI'}</strong>
            <span>${esc(s.error === 'NO_API_KEY' ? 'Foto struk tetap tersimpan! Kamu bisa isi nominal di bawah atau atur API Key dulu.' : s.error)}</span>
          </div>
        </div>` : `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span class="tx-badge">✓ Gemini AI Selesai (${r.confidence}% yakin${typeof r.remainingQuota === 'number' ? ` • Sisa ${r.remainingQuota}x` : ''})</span>
          <button class="link-btn" id="btnRescan">Foto Ulang</button>
        </div>`}

      ${s.imageDataUrl ? `
        <div class="scan-preview-box" style="max-height:175px;margin-bottom:12px;">
          <img src="${s.imageDataUrl}" alt="Struk" style="max-height:175px;" />
        </div>` : ''}

      <form id="formScanSave">
        <div class="form-group">
          <label class="form-label">Total Pengeluaran</label>
          <div class="amount-input-wrap">
            <span class="amount-prefix">Rp</span>
            <input id="scanTotal" type="text" inputmode="numeric" class="amount-big-input" value="${r.total ? r.total.toLocaleString('id-ID') : ''}" placeholder="0" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Nama Toko / Merchant</label>
          <input id="scanMerchant" type="text" class="form-input" value="${esc(r.merchant)}" placeholder="Contoh: Indomaret, Kopi Kenangan" required />
        </div>

        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Tanggal</label>
            <input id="scanDate" type="date" class="form-input" value="${esc(r.date)}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Dompet / Pembayaran</label>
            <select id="scanWallet" class="form-select">
              ${state.wallets.map((w) => `<option value="${esc(w.id)}" ${w.id === matchedWallet?.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Kategori</label>
          <select id="scanCategory" class="form-select">
            ${EXPENSE_CATEGORIES.map((c) => `<option value="${esc(c.id)}" ${c.id === r.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>

        ${r.items && r.items.length > 0 ? `
          <div class="form-group">
            <label class="form-label">Rincian Item Terbaca (${r.items.length} item)</label>
            <div class="items-box">
              ${r.items.map((it) => `
                <div class="receipt-item-row">
                  <span>${esc(it.name)} <small style="color:var(--text-muted)">x${it.qty}</small></span>
                  <b>${formatIDR(it.price)}</b>
                </div>`).join('')}
              ${r.tax ? `<div class="receipt-item-row" style="color:var(--text-muted)"><span>Pajak / PB1</span><span>${formatIDR(r.tax)}</span></div>` : ''}
              ${r.discount ? `<div class="receipt-item-row" style="color:var(--income)"><span>Diskon</span><span>-${formatIDR(r.discount)}</span></div>` : ''}
            </div>
          </div>` : ''}

        <div class="form-group">
          <label class="form-label">Catatan</label>
          <input id="scanNotes" type="text" class="form-input" value="${esc(r.notes)}" placeholder="Catatan tambahan (opsional)" />
        </div>

        <button type="submit" class="btn btn-primary">Simpan Pengeluaran</button>
      </form>
    `);

    $('#btnCloseModal').onclick = closeModal;
    const rescanBtn = $('#btnRescan');
    if (rescanBtn) rescanBtn.onclick = openScanModal;

    const totalInput = $('#scanTotal');
    totalInput.addEventListener('input', () => {
      const n = parseIDR(totalInput.value);
      totalInput.value = n ? n.toLocaleString('id-ID') : '';
    });

    $('#formScanSave').onsubmit = async (e) => {
      e.preventDefault();
      const amount = parseIDR($('#scanTotal').value);
      if (amount <= 0) {
        showToast('Masukkan nominal total pengeluaran.');
        return;
      }
      const txId = DB.uid('tx');
      const newTx = {
        id: txId,
        type: 'expense',
        amount,
        merchant: $('#scanMerchant').value.trim() || 'Struk Belanja',
        date: $('#scanDate').value || todayISO(),
        time: r.time || new Date().toTimeString().slice(0, 5),
        walletId: $('#scanWallet').value,
        category: $('#scanCategory').value,
        notes: $('#scanNotes').value.trim(),
        items: r.items || [],
        tax: r.tax || 0,
        discount: r.discount || 0,
        source: 'scan',
        hasReceipt: Boolean(s.imageDataUrl)
      };

      if (s.imageDataUrl) {
        await DB.saveReceiptImage(txId, s.imageDataUrl);
      }
      state.transactions.unshift(newTx);
      selectedMonth = newTx.date.slice(0, 7);
      closeModal();
      await persistAndRender();
      showToast(`Pengeluaran ${formatIDR(amount)} berhasil direkap!`);
    };
  }

  async function handlePickedReceiptFile(file) {
    if (!file) return;
    try {
      const compressed = await Gemini.compressImage(file);
      scanSession = {
        imageDataUrl: compressed.dataUrl,
        base64: compressed.base64,
        mimeType: compressed.mimeType,
        loading: true,
        error: '',
        result: null
      };
      renderScanModal();

      const parsed = await Gemini.scanReceipt(compressed.base64, compressed.mimeType, state.settings, proxyStatus);
      scanSession.loading = false;
      scanSession.result = parsed;
      renderScanModal();
    } catch (err) {
      scanSession.loading = false;
      scanSession.error = err.message || 'Gagal memproses gambar.';
      renderScanModal();
    }
  }

  function runDemoScan(index) {
    const demo = Gemini.createSampleReceiptDemo(index);
    scanSession = {
      imageDataUrl: demo.dataUrl,
      base64: null,
      mimeType: 'image/jpeg',
      loading: true,
      error: '',
      result: null
    };
    renderScanModal();
    setTimeout(() => {
      if (!scanSession) return;
      scanSession.loading = false;
      scanSession.result = demo.result;
      renderScanModal();
    }, 1100);
  }

  // ==================== MANUAL INCOME / EXPENSE / TRANSFER MODAL ====================
  function openTxFormModal(initialType = 'income', editTx = null) {
    let type = editTx ? editTx.type : initialType;
    let selectedCat = editTx ? editTx.category : (type === 'income' ? 'salary' : 'food');

    function renderForm() {
      const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      if (type !== 'transfer' && !cats.some((c) => c.id === selectedCat)) {
        selectedCat = cats[0].id;
      }

      const title = editTx
        ? 'Edit Transaksi'
        : type === 'income' ? 'Catat Pemasukan Cepat' : type === 'expense' ? 'Catat Pengeluaran' : 'Transfer Antar Dompet';

      openModal(`
        <div class="sheet-header">
          <div class="sheet-title">${title}</div>
          <button class="close-btn" id="btnCloseModal">&times;</button>
        </div>

        ${!editTx ? `
          <div class="seg-tabs" style="margin-bottom:14px;">
            <button type="button" class="seg-tab ${type === 'income' ? 'active' : ''}" data-tx-type="income">Pemasukan</button>
            <button type="button" class="seg-tab ${type === 'expense' ? 'active' : ''}" data-tx-type="expense">Pengeluaran</button>
            <button type="button" class="seg-tab ${type === 'transfer' ? 'active' : ''}" data-tx-type="transfer">Transfer</button>
          </div>` : ''}

        <form id="formManualTx">
          <div class="form-group">
            <label class="form-label">Nominal</label>
            <div class="amount-input-wrap">
              <span class="amount-prefix">Rp</span>
              <input id="txAmount" type="text" inputmode="numeric" class="amount-big-input" value="${editTx ? editTx.amount.toLocaleString('id-ID') : ''}" placeholder="0" required autofocus />
            </div>
            <div class="quick-amounts">
              ${[25000, 50000, 100000, 500000, 1000000].map((v) => `
                <button type="button" class="quick-amt-pill" data-add-amt="${v}">+${v >= 1000000 ? '1 jt' : (v / 1000) + ' rb'}</button>`).join('')}
            </div>
          </div>

          ${type === 'transfer' ? `
            <div class="two-col">
              <div class="form-group">
                <label class="form-label">Dari Dompet</label>
                <select id="txWallet" class="form-select">
                  ${state.wallets.map((w) => `<option value="${esc(w.id)}" ${editTx?.walletId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Ke Dompet</label>
                <select id="txToWallet" class="form-select">
                  ${state.wallets.map((w, i) => `<option value="${esc(w.id)}" ${(editTx ? editTx.toWalletId === w.id : i === 1) ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
                </select>
              </div>
            </div>` : `
            <div class="form-group">
              <label class="form-label">Kategori</label>
              <div class="cat-grid">
                ${cats.map((c) => `
                  <button type="button" class="cat-option ${selectedCat === c.id ? 'selected' : ''}" data-cat-id="${c.id}">
                    <span style="color:${c.color}">${iconSvg(c.icon, 18)}</span>
                    <span>${esc(c.short)}</span>
                  </button>`).join('')}
              </div>
            </div>

            <div class="two-col">
              <div class="form-group">
                <label class="form-label">${type === 'income' ? 'Sumber / Keterangan' : 'Toko / Keterangan'}</label>
                <input id="txMerchant" type="text" class="form-input" value="${esc(editTx?.merchant || '')}" placeholder="${type === 'income' ? 'Misal: Gaji, Proyek' : 'Misal: Warteg, Parkir'}" />
              </div>
              <div class="form-group">
                <label class="form-label">Dompet</label>
                <select id="txWallet" class="form-select">
                  ${state.wallets.map((w) => `<option value="${esc(w.id)}" ${editTx?.walletId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
                </select>
              </div>
            </div>`}

          <div class="two-col">
            <div class="form-group">
              <label class="form-label">Tanggal</label>
              <input id="txDate" type="date" class="form-input" value="${esc(editTx?.date || todayISO())}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Catatan (Opsional)</label>
              <input id="txNotes" type="text" class="form-input" value="${esc(editTx?.notes || '')}" placeholder="Catatan singkat..." />
            </div>
          </div>

          <button type="submit" class="btn btn-primary">${editTx ? 'Simpan Perubahan' : 'Simpan Transaksi'}</button>
        </form>
      `);

      $('#btnCloseModal').onclick = closeModal;
      $$('[data-tx-type]').forEach((b) => {
        b.onclick = () => {
          type = b.dataset.txType;
          renderForm();
        };
      });
      $$('[data-cat-id]').forEach((b) => {
        b.onclick = () => {
          selectedCat = b.dataset.catId;
          $$('[data-cat-id]').forEach((x) => x.classList.toggle('selected', x.dataset.catId === selectedCat));
        };
      });

      const amtInput = $('#txAmount');
      amtInput.addEventListener('input', () => {
        const n = parseIDR(amtInput.value);
        amtInput.value = n ? n.toLocaleString('id-ID') : '';
      });
      $$('[data-add-amt]').forEach((b) => {
        b.onclick = () => {
          const cur = parseIDR(amtInput.value);
          const next = cur + Number(b.dataset.addAmt);
          amtInput.value = next.toLocaleString('id-ID');
        };
      });

      $('#formManualTx').onsubmit = async (e) => {
        e.preventDefault();
        const amount = parseIDR(amtInput.value);
        if (amount <= 0) {
          showToast('Masukkan nominal yang valid.');
          return;
        }
        const walletId = $('#txWallet').value;
        const toWalletId = type === 'transfer' ? $('#txToWallet').value : undefined;
        if (type === 'transfer' && walletId === toWalletId) {
          showToast('Pilih dompet tujuan yang berbeda.');
          return;
        }
        const cat = getCategory(selectedCat, type);
        const merchant = type === 'transfer'
          ? 'Transfer Dompet'
          : ($('#txMerchant').value.trim() || cat.name);
        const date = $('#txDate').value || todayISO();
        const notes = $('#txNotes').value.trim();

        if (editTx) {
          Object.assign(editTx, { type, amount, category: type === 'transfer' ? 'transfer' : selectedCat, walletId, toWalletId, merchant, date, notes });
          showToast('Transaksi diperbarui.');
        } else {
          state.transactions.unshift({
            id: DB.uid('tx'),
            type,
            amount,
            category: type === 'transfer' ? 'transfer' : selectedCat,
            walletId,
            toWalletId,
            merchant,
            date,
            time: new Date().toTimeString().slice(0, 5),
            notes,
            items: [],
            source: 'manual',
            hasReceipt: false
          });
          selectedMonth = date.slice(0, 7);
          showToast(`${type === 'income' ? 'Pemasukan' : type === 'expense' ? 'Pengeluaran' : 'Transfer'} ${formatIDR(amount)} tersimpan!`);
        }
        closeModal();
        await persistAndRender();
      };
    }

    renderForm();
  }

  // ==================== TRANSACTION DETAIL MODAL ====================
  async function openTxDetailModal(txId) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;
    const cat = getCategory(tx.category, tx.type);
    const wallet = state.wallets.find((w) => w.id === tx.walletId);
    const toWallet = tx.toWalletId ? state.wallets.find((w) => w.id === tx.toWalletId) : null;
    const receiptImg = tx.hasReceipt ? await DB.getReceiptImage(tx.id) : null;

    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Detail Transaksi</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>

      <div style="text-align:center;margin-bottom:14px;">
        <div class="tx-icon" style="background:${cat.bg};color:${cat.color};margin:0 auto 8px;width:52px;height:52px;border-radius:16px;">
          ${iconSvg(cat.icon, 24)}
        </div>
        <div style="font-size:17px;font-weight:800;">${esc(tx.merchant || cat.name)}</div>
        <div class="tx-amount ${tx.type}" style="font-size:26px;margin-top:4px;">
          ${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${formatIDR(tx.amount)}
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">
          ${esc(formatDateID(tx.date))}${tx.time ? ` • ${esc(tx.time)}` : ''} • ${esc(cat.name)}
        </div>
      </div>

      <div class="items-box" style="margin-bottom:12px;">
        <div class="receipt-item-row">
          <span style="color:var(--text-muted)">Dompet</span>
          <b>${esc(wallet?.name || '-')}${toWallet ? ` → ${esc(toWallet.name)}` : ''}</b>
        </div>
        <div class="receipt-item-row">
          <span style="color:var(--text-muted)">Sumber Input</span>
          <b>${tx.source === 'scan' ? 'Scan Foto Struk AI' : 'Input Manual'}</b>
        </div>
        ${tx.notes ? `<div class="receipt-item-row"><span style="color:var(--text-muted)">Catatan</span><b>${esc(tx.notes)}</b></div>` : ''}
      </div>

      ${tx.items && tx.items.length > 0 ? `
        <div class="form-group">
          <label class="form-label">Rincian Item Struk</label>
          <div class="items-box">
            ${tx.items.map((it) => `
              <div class="receipt-item-row">
                <span>${esc(it.name)} <small style="color:var(--text-muted)">x${it.qty}</small></span>
                <b>${formatIDR(it.price)}</b>
              </div>`).join('')}
            ${tx.tax ? `<div class="receipt-item-row" style="color:var(--text-muted)"><span>Pajak / PB1</span><span>${formatIDR(tx.tax)}</span></div>` : ''}
            ${tx.discount ? `<div class="receipt-item-row" style="color:var(--income)"><span>Diskon</span><span>-${formatIDR(tx.discount)}</span></div>` : ''}
          </div>
        </div>` : ''}

      ${receiptImg ? `
        <div class="form-group">
          <label class="form-label">Foto Struk Tersimpan</label>
          <div class="scan-preview-box" style="max-height:300px;">
            <img src="${receiptImg}" alt="Foto Struk" style="max-height:300px;" />
          </div>
        </div>` : ''}

      <div class="btn-row">
        <button id="btnEditTx" class="btn btn-secondary">Edit</button>
        <button id="btnDeleteTx" class="btn btn-danger">Hapus</button>
      </div>
    `);

    $('#btnCloseModal').onclick = closeModal;
    $('#btnEditTx').onclick = () => openTxFormModal(tx.type, tx);
    $('#btnDeleteTx').onclick = async () => {
      if (!confirm('Hapus transaksi ini?')) return;
      state.transactions = state.transactions.filter((t) => t.id !== tx.id);
      if (tx.hasReceipt) await DB.deleteReceiptImage(tx.id);
      closeModal();
      await persistAndRender();
      showToast('Transaksi dihapus.');
    };
  }

  // ==================== SECONDARY MODALS (Budget, Goal, Wallet, Bill) ====================
  function openBudgetModal() {
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Atur Anggaran Bulanan</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <form id="formBudget">
        <div class="form-group">
          <label class="form-label">Kategori Pengeluaran</label>
          <select id="bgCat" class="form-select">
            ${EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Batas Maksimal / Bulan (Rp)</label>
          <input id="bgLimit" type="text" inputmode="numeric" class="form-input" placeholder="1.000.000" required />
        </div>
        <button type="submit" class="btn btn-primary">Simpan Anggaran</button>
      </form>
    `);
    $('#btnCloseModal').onclick = closeModal;
    const lim = $('#bgLimit');
    lim.addEventListener('input', () => {
      const n = parseIDR(lim.value);
      lim.value = n ? n.toLocaleString('id-ID') : '';
    });
    $('#formBudget').onsubmit = async (e) => {
      e.preventDefault();
      const category = $('#bgCat').value;
      const limit = parseIDR(lim.value);
      if (limit <= 0) return showToast('Masukkan batas anggaran.');
      const existing = state.budgets.find((b) => b.category === category);
      if (existing) existing.limit = limit;
      else state.budgets.push({ id: DB.uid('bg'), category, limit });
      closeModal();
      await persistAndRender();
      showToast('Anggaran disimpan!');
    };
  }

  function openGoalModal() {
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Buat Target Tabungan</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <form id="formGoal">
        <div class="form-group">
          <label class="form-label">Nama Target</label>
          <input id="glName" type="text" class="form-input" placeholder="Misal: Dana Darurat, Beli Laptop" required />
        </div>
        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Target Nominal (Rp)</label>
            <input id="glTarget" type="text" inputmode="numeric" class="form-input" placeholder="5.000.000" required />
          </div>
          <div class="form-group">
            <label class="form-label">Sudah Terkumpul</label>
            <input id="glCurrent" type="text" inputmode="numeric" class="form-input" placeholder="0" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Target Tanggal</label>
          <input id="glDate" type="date" class="form-input" />
        </div>
        <button type="submit" class="btn btn-primary">Simpan Target</button>
      </form>
    `);
    $('#btnCloseModal').onclick = closeModal;
    ['#glTarget', '#glCurrent'].forEach((sel) => {
      const inp = $(sel);
      inp.addEventListener('input', () => {
        const n = parseIDR(inp.value);
        inp.value = n ? n.toLocaleString('id-ID') : '';
      });
    });
    $('#formGoal').onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#glName').value.trim();
      const target = parseIDR($('#glTarget').value);
      const current = parseIDR($('#glCurrent').value);
      if (!name || target <= 0) return showToast('Lengkapi nama & nominal target.');
      const colors = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#db2777'];
      state.goals.push({
        id: DB.uid('gl'),
        name,
        target,
        current,
        deadline: $('#glDate').value || '',
        color: colors[state.goals.length % colors.length]
      });
      closeModal();
      await persistAndRender();
      showToast('Target tabungan dibuat!');
    };
  }

  function openDepositGoalModal(goalId) {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return;
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Tambah Tabungan: ${esc(g.name)}</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <form id="formGoalDep">
        <div class="form-group">
          <label class="form-label">Nominal Setoran (Rp)</label>
          <input id="depAmt" type="text" inputmode="numeric" class="form-input" placeholder="250.000" required autofocus />
        </div>
        <button type="submit" class="btn btn-primary">Tambahkan ke Target</button>
      </form>
    `);
    $('#btnCloseModal').onclick = closeModal;
    const inp = $('#depAmt');
    inp.addEventListener('input', () => {
      const n = parseIDR(inp.value);
      inp.value = n ? n.toLocaleString('id-ID') : '';
    });
    $('#formGoalDep').onsubmit = async (e) => {
      e.preventDefault();
      const amt = parseIDR(inp.value);
      if (amt <= 0) return;
      g.current = (g.current || 0) + amt;
      closeModal();
      await persistAndRender();
      showToast(`+${formatIDR(amt)} ditambahkan ke ${g.name}!`);
    };
  }

  function openWalletModal() {
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Tambah Dompet / Rekening</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <form id="formWallet">
        <div class="form-group">
          <label class="form-label">Nama Dompet / Bank</label>
          <input id="wlName" type="text" class="form-input" placeholder="Misal: BCA, GoPay, Dana, Dompet Saku" required />
        </div>
        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Jenis</label>
            <select id="wlType" class="form-select">
              <option value="bank">Rekening Bank</option>
              <option value="ewallet">E-Wallet / QRIS</option>
              <option value="cash">Tunai</option>
              <option value="card">Kartu Kredit</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Saldo Awal (Rp)</label>
            <input id="wlBal" type="text" inputmode="numeric" class="form-input" placeholder="0" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Simpan Dompet</button>
      </form>
    `);
    $('#btnCloseModal').onclick = closeModal;
    const bal = $('#wlBal');
    bal.addEventListener('input', () => {
      const n = parseIDR(bal.value);
      bal.value = n ? n.toLocaleString('id-ID') : '';
    });
    $('#formWallet').onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#wlName').value.trim();
      const type = $('#wlType').value;
      const initialBalance = parseIDR(bal.value);
      if (!name) return;
      const meta = {
        cash: { icon: 'banknote', color: '#059669' },
        bank: { icon: 'landmark', color: '#2563eb' },
        ewallet: { icon: 'smartphone', color: '#7c3aed' },
        card: { icon: 'credit-card', color: '#db2777' }
      }[type];
      state.wallets.push({ id: DB.uid('w'), name, type, initialBalance, ...meta });
      closeModal();
      await persistAndRender();
      showToast(`Dompet ${name} ditambahkan.`);
    };
  }

  function openRecurringModal() {
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Tambah Tagihan Rutin</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <form id="formRecurring">
        <div class="form-group">
          <label class="form-label">Nama Tagihan</label>
          <input id="rcName" type="text" class="form-input" placeholder="Misal: WiFi IndiHome, Kos, Cicilan Motor" required />
        </div>
        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Nominal (Rp)</label>
            <input id="rcAmt" type="text" inputmode="numeric" class="form-input" placeholder="300.000" required />
          </div>
          <div class="form-group">
            <label class="form-label">Tanggal Jatuh Tempo</label>
            <input id="rcDay" type="number" min="1" max="31" class="form-input" value="15" required />
          </div>
        </div>
        <div class="two-col">
          <div class="form-group">
            <label class="form-label">Kategori</label>
            <select id="rcCat" class="form-select">
              ${EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === 'bills' ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Dompet</label>
            <select id="rcWallet" class="form-select">
              ${state.wallets.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Simpan Tagihan</button>
      </form>
    `);
    $('#btnCloseModal').onclick = closeModal;
    const amt = $('#rcAmt');
    amt.addEventListener('input', () => {
      const n = parseIDR(amt.value);
      amt.value = n ? n.toLocaleString('id-ID') : '';
    });
    $('#formRecurring').onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#rcName').value.trim();
      const amount = parseIDR(amt.value);
      if (!name || amount <= 0) return;
      state.recurring.push({
        id: DB.uid('rc'),
        name,
        amount,
        dueDay: Math.min(31, Math.max(1, Number($('#rcDay').value) || 1)),
        category: $('#rcCat').value,
        walletId: $('#rcWallet').value,
        lastPaidMonth: ''
      });
      closeModal();
      await persistAndRender();
      showToast('Tagihan rutin ditambahkan!');
    };
  }

  async function payRecurringBill(billId) {
    const bill = state.recurring.find((r) => r.id === billId);
    if (!bill) return;
    bill.lastPaidMonth = selectedMonth;
    state.transactions.unshift({
      id: DB.uid('tx'),
      type: 'expense',
      amount: bill.amount,
      category: bill.category || 'bills',
      walletId: bill.walletId || state.wallets[0]?.id,
      merchant: bill.name,
      date: todayISO(),
      time: new Date().toTimeString().slice(0, 5),
      notes: `Pembayaran tagihan rutin (${formatMonthLabel(selectedMonth)})`,
      items: [],
      source: 'manual',
      hasReceipt: false
    });
    await persistAndRender();
    showToast(`Tagihan ${bill.name} dicatat lunas!`);
  }

  // ==================== EXPORT / BACKUP ====================
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const txs = getMonthTransactions(selectedMonth);
    const headers = ['Tanggal', 'Jam', 'Tipe', 'Toko/Keterangan', 'Kategori', 'Dompet', 'Nominal', 'Sumber', 'Catatan'];
    const rows = txs.map((t) => {
      const cat = getCategory(t.category, t.type);
      const w = state.wallets.find((x) => x.id === t.walletId);
      return [
        t.date,
        t.time || '',
        t.type,
        t.merchant || '',
        cat.name,
        w?.name || '',
        t.amount,
        t.source || 'manual',
        t.notes || ''
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    downloadFile(`StrukKu-${selectedMonth}.csv`, csv, 'text/csv;charset=utf-8;');
    showToast(`Export StrukKu-${selectedMonth}.csv berhasil!`);
  }

  // ==================== INSTALL, SHARE & ONBOARDING MODALS ====================
  async function triggerInstallPwa() {
    if (isStandaloneMode()) {
      showToast('StrukKu sudah terpasang di perangkat ini!');
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice?.outcome === 'accepted') {
        showToast('StrukKu sedang dipasang ke layar utama...');
      }
      render();
      return;
    }
    openInstallGuideModal();
  }

  function openInstallGuideModal() {
    const ios = isIOSDevice();
    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Pasang StrukKu di Layar Utama</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 8px;">
        StrukKu bisa dipasang langsung seperti aplikasi biasa tanpa lewat Play Store / App Store, sangat ringan, dan bisa dipakai offline.
      </p>

      ${ios ? `
        <div class="form-label" style="margin-top:10px;">Panduan iPhone / iPad (Safari):</div>
        <div class="install-steps">
          <div class="install-step">
            <span class="install-step-num">1</span>
            <div>Pastikan link ini dibuka di browser <b>Safari</b>.</div>
          </div>
          <div class="install-step">
            <span class="install-step-num">2</span>
            <div>Ketuk tombol <b>Share</b> (ikon kotak dengan panah ke atas <b>↑</b>) di bagian bawah layar.</div>
          </div>
          <div class="install-step">
            <span class="install-step-num">3</span>
            <div>Geser ke bawah, lalu pilih <b>Add to Home Screen (Tambah ke Layar Utama)</b> → ketuk <b>Add</b>.</div>
          </div>
        </div>
      ` : `
        <div class="form-label" style="margin-top:10px;">Panduan Android (Chrome / Edge):</div>
        <div class="install-steps">
          <div class="install-step">
            <span class="install-step-num">1</span>
            <div>Buka halaman ini menggunakan browser <b>Google Chrome</b>.</div>
          </div>
          <div class="install-step">
            <span class="install-step-num">2</span>
            <div>Ketuk ikon menu titik tiga <b>⋮</b> di pojok kanan atas.</div>
          </div>
          <div class="install-step">
            <span class="install-step-num">3</span>
            <div>Pilih <b>Install app</b> atau <b>Tambahkan ke Layar Utama</b>, lalu konfirmasi <b>Install</b>.</div>
          </div>
        </div>
      `}

      ${deferredInstallPrompt ? `<button id="btnGuideInstallNow" class="btn btn-primary" style="margin-bottom:8px;">Install Sekarang (1-Ketukan)</button>` : ''}
      <button id="btnGuideDone" class="btn btn-secondary">Mengerti</button>
    `);

    $('#btnCloseModal').onclick = closeModal;
    $('#btnGuideDone').onclick = closeModal;
    const btnNow = $('#btnGuideInstallNow');
    if (btnNow) {
      btnNow.onclick = async () => {
        closeModal();
        await triggerInstallPwa();
      };
    }
  }

  function getShareUrl() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.origin}${location.pathname}`;
    }
    return location.href;
  }

  async function handleShareApp() {
    const shareUrl = getShareUrl();
    const shareText = global.STRUKKU_CONFIG?.defaultShareText || 'Cobain StrukKu — aplikasi keuangan & scan struk AI!';
    if (navigator.share && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      try {
        await navigator.share({
          title: 'StrukKu — Rekap Keuangan & Scan Struk AI',
          text: shareText,
          url: shareUrl
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    openShareModal();
  }

  function openShareModal() {
    const shareUrl = getShareUrl();
    const shareText = global.STRUKKU_CONFIG?.defaultShareText || 'Cobain StrukKu — aplikasi keuangan & scan struk AI!';
    const isLocalFile = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;

    openModal(`
      <div class="sheet-header">
        <div class="sheet-title">Bagikan StrukKu</div>
        <button class="close-btn" id="btnCloseModal">&times;</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin:0;">
        Kirim link StrukKu ke teman atau keluarga agar mereka bisa langsung pakai dan install di HP masing-masing.
      </p>

      ${isLocalFile ? `
        <div class="info-banner" style="margin-top:10px;">
          <div>
            <strong>Sedang berjalan lokal</strong>
            <span>Upload folder <b>strukku</b> ke Cloudflare Pages / Netlify dulu supaya link bisa dibuka dari HP orang lain.</span>
          </div>
        </div>` : ''}

      <div class="share-url-box">
        <span class="share-url-text">${esc(shareUrl)}</span>
        <button id="btnCopyShareUrl" class="btn btn-primary btn-sm">Salin</button>
      </div>

      <div class="btn-row" style="margin-bottom:10px;">
        <a href="${esc(waUrl)}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;">Kirim WhatsApp</a>
        <button id="btnShareInstallGuide" class="btn btn-secondary">Cara Install HP</button>
      </div>
    `);

    $('#btnCloseModal').onclick = closeModal;
    $('#btnCopyShareUrl').onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link StrukKu berhasil disalin!');
      } catch {
        showToast('Salin link secara manual dari kotak di atas.');
      }
    };
    $('#btnShareInstallGuide').onclick = () => openInstallGuideModal();
  }

  function openOnboardingModal() {
    openModal(`
      <div class="onboarding-hero">
        <img src="./icons/icon-192.png" alt="StrukKu" class="onboarding-logo" />
        <div class="onboarding-title">Selamat Datang di StrukKu!</div>
        <div class="onboarding-sub">
          Catat keuangan harian &amp; rekap pengeluaran otomatis hanya dengan memfoto struk belanja.
        </div>
      </div>

      <div class="onboarding-features">
        <div class="onboarding-feature">
          <span class="onboarding-feature-icon">${iconSvg('camera', 18)}</span>
          <div>
            <strong>Scan Struk Otomatis AI</strong>
            <span>Foto struk dari kamera atau galeri — nama toko, item, diskon &amp; total langsung terbaca.</span>
          </div>
        </div>
        <div class="onboarding-feature">
          <span class="onboarding-feature-icon">${iconSvg('wallet', 18)}</span>
          <div>
            <strong>Multi-Dompet, Anggaran &amp; Grafik</strong>
            <span>Pantau saldo Tunai, Bank, E-Wallet, batas anggaran bulanan, hingga target tabungan.</span>
          </div>
        </div>
        <div class="onboarding-feature">
          <span class="onboarding-feature-icon">${iconSvg('shield', 18)}</span>
          <div>
            <strong>100% Privasi Lokal di Perangkat</strong>
            <span>Semua catatan keuangan &amp; foto struk tersimpan aman di HP kamu sendiri.</span>
          </div>
        </div>
      </div>

      <button id="btnOnboardFresh" class="btn btn-primary" style="margin-bottom:8px;">Mulai Catatan Baru (Kosong)</button>
      <button id="btnOnboardDemo" class="btn btn-secondary">Lihat-lihat Dulu (Data Contoh)</button>
    `);

    $('#btnOnboardFresh').onclick = async () => {
      await DB.clearAllImages();
      const keepSettings = { ...state.settings, onboardingDone: true };
      state = DB.createEmptyState(keepSettings);
      closeModal();
      await persistAndRender();
      showToast('Siap! Mulai catat keuangan atau foto struk pertamamu.');
    };

    $('#btnOnboardDemo').onclick = async () => {
      state.settings.onboardingDone = true;
      closeModal();
      await persistAndRender();
      showToast('Mode data contoh aktif. Kamu bisa reset kapan saja.');
    };
  }

  // ==================== EVENT BINDING ====================
  function bindViewEvents() {
    // Shared click handlers
    $$('[data-tx-id]').forEach((el) => {
      el.onclick = () => openTxDetailModal(el.dataset.txId);
    });
    $$('[data-nav]').forEach((el) => {
      el.onclick = () => {
        activeTab = el.dataset.nav;
        render();
      };
    });
    $$('[data-pay-bill]').forEach((el) => {
      el.onclick = () => payRecurringBill(el.dataset.payBill);
    });

    // Home view
    const btnHomeInstall = $('#btnHomeInstall');
    if (btnHomeInstall) {
      btnHomeInstall.onclick = triggerInstallPwa;
    }
    const btnDismissInstall = $('#btnDismissInstall');
    if (btnDismissInstall) {
      btnDismissInstall.onclick = () => {
        installBannerDismissed = true;
        try {
          localStorage.setItem('strukku_install_dismissed', '1');
        } catch {}
        render();
      };
    }
    const btnPrivacy = $('#btnTogglePrivacy');
    if (btnPrivacy) {
      btnPrivacy.onclick = async () => {
        state.settings.hideBalances = !state.settings.hideBalances;
        await persistAndRender();
      };
    }
    const btnClearDemo = $('#btnClearDemo');
    if (btnClearDemo) {
      btnClearDemo.onclick = async () => {
        if (!confirm('Hapus data contoh dan mulai dengan catatan bersih?')) return;
        await DB.clearAllImages();
        state = DB.createEmptyState(state.settings);
        await persistAndRender();
        showToast('Siap! Data bersih telah disiapkan.');
      };
    }
    const btnGoApi = $('#btnGoApiSetting');
    if (btnGoApi) {
      btnGoApi.onclick = () => {
        activeTab = 'settings';
        render();
      };
    }
    const btnSeeBudgets = $('#btnSeeBudgets');
    if (btnSeeBudgets) {
      btnSeeBudgets.onclick = () => {
        activeTab = 'analytics';
        activeAnalyticsSubTab = 'budget';
        render();
      };
    }
    $$('[data-action]').forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.action;
        if (act === 'scan') openScanModal();
        else openTxFormModal(act);
      };
    });

    // History view
    const searchEl = $('#historySearch');
    if (searchEl) {
      searchEl.oninput = () => {
        historyFilter.q = searchEl.value;
        const pos = searchEl.selectionStart;
        render();
        const nextInput = $('#historySearch');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(pos, pos);
        }
      };
    }
    $$('[data-filter-type]').forEach((btn) => {
      btn.onclick = () => {
        historyFilter.type = btn.dataset.filterType;
        render();
      };
    });
    const wFilter = $('#historyWalletFilter');
    if (wFilter) {
      wFilter.onchange = () => {
        historyFilter.walletId = wFilter.value;
        render();
      };
    }
    const btnCsv = $('#btnExportCsv');
    if (btnCsv) btnCsv.onclick = exportCsv;

    // Analytics view
    $$('[data-subtab]').forEach((btn) => {
      btn.onclick = () => {
        activeAnalyticsSubTab = btn.dataset.subtab;
        render();
      };
    });
    const btnAddBudget = $('#btnAddBudget');
    if (btnAddBudget) btnAddBudget.onclick = openBudgetModal;
    $$('[data-del-budget]').forEach((btn) => {
      btn.onclick = async () => {
        state.budgets = state.budgets.filter((b) => b.id !== btn.dataset.delBudget);
        await persistAndRender();
        showToast('Anggaran dihapus.');
      };
    });
    const btnAddGoal = $('#btnAddGoal');
    if (btnAddGoal) btnAddGoal.onclick = openGoalModal;
    $$('[data-deposit-goal]').forEach((btn) => {
      btn.onclick = () => openDepositGoalModal(btn.dataset.depositGoal);
    });
    $$('[data-del-goal]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Hapus target tabungan ini?')) return;
        state.goals = state.goals.filter((g) => g.id !== btn.dataset.delGoal);
        await persistAndRender();
      };
    });

    // Settings view
    const selectAiMode = $('#selectAiMode');
    if (selectAiMode) {
      selectAiMode.onchange = async () => {
        state.settings.aiMode = selectAiMode.value;
        await persistAndRender();
      };
    }
    const btnSaveApi = $('#btnSaveApi');
    if (btnSaveApi) {
      btnSaveApi.onclick = async () => {
        const modeEl = $('#selectAiMode');
        const keyEl = $('#inputGeminiKey');
        const proxyEl = $('#inputProxyUrl');
        const codeEl = $('#inputProxyAccessCode');
        const modelEl = $('#selectGeminiModel');

        if (modeEl) state.settings.aiMode = modeEl.value;
        if (keyEl) state.settings.geminiApiKey = keyEl.value.trim();
        if (proxyEl) state.settings.proxyUrl = proxyEl.value.trim();
        if (codeEl) state.settings.proxyAccessCode = codeEl.value.trim();
        if (modelEl) state.settings.geminiModel = modelEl.value;

        await DB.saveState(state);
        proxyStatus = await Gemini.checkProxyStatus(state.settings.proxyUrl);
        render();
        showToast('Pengaturan Gemini AI disimpan!');
      };
    }
    const btnTestApi = $('#btnTestApi');
    if (btnTestApi) {
      btnTestApi.onclick = async () => {
        const mode = $('#selectAiMode')?.value || state.settings.aiMode || 'auto';
        const key = ($('#inputGeminiKey')?.value ?? state.settings.geminiApiKey ?? '').trim();
        const proxyUrl = ($('#inputProxyUrl')?.value ?? state.settings.proxyUrl ?? '').trim();
        const accessCode = ($('#inputProxyAccessCode')?.value ?? state.settings.proxyAccessCode ?? '').trim();
        const model = $('#selectGeminiModel')?.value || 'auto';
        const statusEl = $('#apiTestStatus');

        state.settings.aiMode = mode;
        state.settings.geminiApiKey = key;
        state.settings.proxyUrl = proxyUrl;
        state.settings.proxyAccessCode = accessCode;

        statusEl.style.color = 'var(--text-muted)';
        const testProxy = mode === 'proxy' || (mode === 'auto' && !key);
        statusEl.textContent = testProxy ? 'Menguji koneksi ke Server AI StrukKu...' : 'Menguji koneksi ke Gemini API...';

        const res = testProxy
          ? await Gemini.testProxyConnection({ proxyUrl, accessCode, model })
          : await Gemini.testConnection(key, model);

        statusEl.style.color = res.ok ? 'var(--income)' : 'var(--expense)';
        statusEl.textContent = res.message;
        if (res.ok) {
          state.settings.geminiModel = model === 'auto' ? 'auto' : (res.resolvedModel || model);
          await DB.saveState(state);
          if (testProxy) {
            proxyStatus = await Gemini.checkProxyStatus(proxyUrl);
          }
        }
      };
    }
    const btnAddWallet = $('#btnAddWallet');
    if (btnAddWallet) btnAddWallet.onclick = openWalletModal;
    $$('[data-del-wallet]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Hapus dompet ini?')) return;
        state.wallets = state.wallets.filter((w) => w.id !== btn.dataset.delWallet);
        await persistAndRender();
        showToast('Dompet dihapus.');
      };
    });
    const btnAddRec = $('#btnAddRecurring');
    if (btnAddRec) btnAddRec.onclick = openRecurringModal;
    $$('[data-del-recurring]').forEach((btn) => {
      btn.onclick = async () => {
        state.recurring = state.recurring.filter((r) => r.id !== btn.dataset.delRecurring);
        await persistAndRender();
      };
    });
    const swDark = $('#switchDark');
    if (swDark) {
      swDark.onclick = async () => {
        state.settings.darkMode = !state.settings.darkMode;
        applyTheme();
        await persistAndRender();
      };
    }
    const swPrivacy = $('#switchPrivacy');
    if (swPrivacy) {
      swPrivacy.onclick = async () => {
        state.settings.hideBalances = !state.settings.hideBalances;
        await persistAndRender();
      };
    }
    const btnInstall = $('#btnInstallPwa');
    if (btnInstall) {
      btnInstall.onclick = triggerInstallPwa;
    }
    const btnShareSettings = $('#btnShareSettings');
    if (btnShareSettings) {
      btnShareSettings.onclick = handleShareApp;
    }
    const btnBackup = $('#btnBackupJson');
    if (btnBackup) {
      btnBackup.onclick = () => {
        const safeCopy = JSON.parse(JSON.stringify(state));
        safeCopy.settings.geminiApiKey = ''; // Do not export secret API key in backup file
        safeCopy.settings.proxyAccessCode = ''; // Do not export server access code in backup file
        downloadFile(`StrukKu-Backup-${todayISO()}.json`, JSON.stringify(safeCopy, null, 2), 'application/json');
        showToast('Backup JSON berhasil diunduh!');
      };
    }
    const btnRestore = $('#btnRestoreJson');
    if (btnRestore) btnRestore.onclick = () => $('#inputRestoreJson').click();

    const btnLoadDemo = $('#btnLoadDemo');
    if (btnLoadDemo) {
      btnLoadDemo.onclick = async () => {
        if (!confirm('Muat ulang data contoh? Data saat ini akan diganti.')) return;
        const keepSettings = { ...state.settings };
        state = DB.createDemoState();
        state.settings = keepSettings;
        await persistAndRender();
        showToast('Data contoh dimuat.');
      };
    }
    const btnResetAll = $('#btnResetAll');
    if (btnResetAll) {
      btnResetAll.onclick = async () => {
        if (!confirm('Hapus semua transaksi & mulai dari nol?')) return;
        await DB.clearAllImages();
        state = DB.createEmptyState(state.settings);
        await persistAndRender();
        showToast('Semua data telah direset.');
      };
    }
  }

  // ==================== BOOTSTRAP ====================
  async function bootstrap() {
    state = await DB.init();
    if (state.settings.geminiModel === 'gemini-2.5-pro' || state.settings.geminiModel === 'gemini-2.0-flash') {
      state.settings.geminiModel = 'auto';
      await DB.saveState(state);
    }
    applyTheme();
    render();

    // Global static controls
    $('#btnPrevMonth').onclick = () => {
      selectedMonth = shiftMonth(selectedMonth, -1);
      render();
    };
    $('#btnNextMonth').onclick = () => {
      selectedMonth = shiftMonth(selectedMonth, 1);
      render();
    };
    $('#btnShareApp').onclick = handleShareApp;
    $('#btnThemeToggle').onclick = async () => {
      state.settings.darkMode = !state.settings.darkMode;
      applyTheme();
      await persistAndRender();
    };
    $$('.nav-item').forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.dataset.tab;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
    $('#btnOpenScanFab').onclick = openScanModal;

    $('#modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') closeModal();
    });

    // File pickers
    $('#inputCameraFile').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) handlePickedReceiptFile(file);
    });
    $('#inputGalleryFile').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) handlePickedReceiptFile(file);
    });
    $('#inputRestoreJson').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.wallets)) {
          throw new Error('Format file backup tidak valid.');
        }
        const keepKey = state.settings.geminiApiKey;
        state = parsed;
        if (!state.settings) state.settings = {};
        if (!state.settings.geminiApiKey && keepKey) state.settings.geminiApiKey = keepKey;
        applyTheme();
        await persistAndRender();
        showToast('Data berhasil dipulihkan!');
      } catch (err) {
        showToast(err.message || 'Gagal membaca file backup.');
      }
    });

    // PWA shortcuts hash handling & first-run onboarding
    if (window.location.hash === '#scan') openScanModal();
    else if (window.location.hash === '#income') openTxFormModal('income');
    else if (!state.settings.onboardingDone) openOnboardingModal();

    // Auto-detect serverless AI proxy (Cloudflare Pages / Netlify / Worker)
    Gemini.checkProxyStatus(state.settings.proxyUrl).then((status) => {
      proxyStatus = status;
      if (status.available) render();
    });

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      render();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      showToast('StrukKu berhasil terpasang di layar utama!');
      render();
    });

    // Register Service Worker (when served over HTTP/HTTPS)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})(window);
