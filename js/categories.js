(function (global) {
  const EXPENSE_CATEGORIES = [
    { id: 'food', name: 'Makanan & Minuman', short: 'Makan', color: '#f97316', bg: '#fff7ed', icon: 'utensils' },
    { id: 'groceries', name: 'Belanja Harian', short: 'Harian', color: '#10b981', bg: '#ecfdf5', icon: 'shopping-basket' },
    { id: 'transport', name: 'Transportasi & BBM', short: 'Transport', color: '#3b82f6', bg: '#eff6ff', icon: 'car' },
    { id: 'bills', name: 'Tagihan & Utilitas', short: 'Tagihan', color: '#eab308', bg: '#fefce8', icon: 'zap' },
    { id: 'shopping', name: 'Belanja & Fashion', short: 'Belanja', color: '#ec4899', bg: '#fdf2f8', icon: 'shopping-bag' },
    { id: 'health', name: 'Kesehatan & Obat', short: 'Kesehatan', color: '#ef4444', bg: '#fef2f2', icon: 'heart-pulse' },
    { id: 'entertainment', name: 'Hiburan & Nongkrong', short: 'Hiburan', color: '#8b5cf6', bg: '#f5f3ff', icon: 'film' },
    { id: 'home', name: 'Rumah Tangga', short: 'Rumah', color: '#14b8a6', bg: '#f0fdfa', icon: 'home' },
    { id: 'education', name: 'Pendidikan & Buku', short: 'Edukasi', color: '#6366f1', bg: '#eef2ff', icon: 'graduation-cap' },
    { id: 'other_expense', name: 'Lainnya', short: 'Lainnya', color: '#64748b', bg: '#f8fafc', icon: 'tag' }
  ];

  const INCOME_CATEGORIES = [
    { id: 'salary', name: 'Gaji / Penghasilan', short: 'Gaji', color: '#059669', bg: '#ecfdf5', icon: 'briefcase' },
    { id: 'freelance', name: 'Freelance / Proyek', short: 'Proyek', color: '#0284c7', bg: '#f0f9ff', icon: 'laptop' },
    { id: 'business', name: 'Hasil Usaha', short: 'Usaha', color: '#7c3aed', bg: '#f5f3ff', icon: 'store' },
    { id: 'investment', name: 'Investasi / Dividen', short: 'Investasi', color: '#d97706', bg: '#fffbeb', icon: 'trending-up' },
    { id: 'bonus', name: 'Bonus / THR / Komisi', short: 'Bonus', color: '#db2777', bg: '#fdf2f8', icon: 'gift' },
    { id: 'refund', name: 'Cashback / Refund', short: 'Refund', color: '#0d9488', bg: '#f0fdfa', icon: 'rotate-ccw' },
    { id: 'other_income', name: 'Pemasukan Lainnya', short: 'Lainnya', color: '#475569', bg: '#f8fafc', icon: 'plus-circle' }
  ];

  const DEFAULT_WALLETS = [
    { id: 'w_cash', name: 'Dompet Tunai', type: 'cash', initialBalance: 450000, color: '#059669', icon: 'banknote' },
    { id: 'w_bank', name: 'Rekening Bank', type: 'bank', initialBalance: 4250000, color: '#2563eb', icon: 'landmark' },
    { id: 'w_ewallet', name: 'E-Wallet / QRIS', type: 'ewallet', initialBalance: 680000, color: '#7c3aed', icon: 'smartphone' }
  ];

  const ICONS = {
    'utensils': '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    'shopping-basket': '<path d="m5 11 4-7"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8c.9 0 1.8-.7 2-1.6l1.7-7.4"/><path d="m9 11 1 9"/><path d="M4.5 15.5h15"/><path d="m15 11-1 9"/>',
    'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    'heart-pulse': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    'film': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'graduation-cap': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    'tag': '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
    'briefcase': '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    'laptop': '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    'store': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'plus-circle': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    'banknote': '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    'landmark': '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    'smartphone': '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    'arrow-left-right': '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'sparkles': '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'calendar': '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    'check': '<polyline points="20 6 9 17 4 12"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    'wallet': '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'
  };

  function iconSvg(name, size = 18, strokeWidth = 2) {
    const path = ICONS[name] || ICONS['tag'];
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function getCategory(id, type) {
    if (type === 'transfer') {
      return { id: 'transfer', name: 'Transfer Antar Dompet', short: 'Transfer', color: '#0284c7', bg: '#f0f9ff', icon: 'arrow-left-right' };
    }
    const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return list.find((c) => c.id === id) || list[list.length - 1];
  }

  function formatIDR(amount, compact = false) {
    const num = Number(amount) || 0;
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (compact) {
      if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toFixed(1).replace('.', ',')} M`;
      if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toFixed(1).replace('.', ',')} jt`;
      if (abs >= 1e3) return `${sign}Rp ${Math.round(abs / 1e3)} rb`;
    }
    return `${sign}Rp ${Math.round(abs).toLocaleString('id-ID')}`;
  }

  function parseIDR(val) {
    if (typeof val === 'number') return Math.round(val);
    const clean = String(val || '').replace(/[^\d]/g, '');
    return parseInt(clean, 10) || 0;
  }

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function currentMonthKey() {
    return todayISO().slice(0, 7);
  }

  function formatDateID(isoDate) {
    if (!isoDate) return '-';
    const today = todayISO();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestISO = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
    if (isoDate === today) return 'Hari Ini';
    if (isoDate === yestISO) return 'Kemarin';
    const [y, m, d] = isoDate.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d} ${months[(m || 1) - 1]} ${y}`;
  }

  function formatMonthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${months[(m || 1) - 1]} ${y}`;
  }

  global.StrukKu = global.StrukKu || {};
  global.StrukKu.Categories = {
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    DEFAULT_WALLETS,
    iconSvg,
    getCategory,
    formatIDR,
    parseIDR,
    todayISO,
    currentMonthKey,
    formatDateID,
    formatMonthLabel
  };
})(window);
