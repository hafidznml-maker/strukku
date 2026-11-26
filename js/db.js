(function (global) {
  const DB_NAME = 'StrukKuDB';
  const DB_VERSION = 1;
  const STORE_STATE = 'app_state';
  const STORE_IMAGES = 'receipt_images';
  const LS_KEY = 'strukku_state_v1';

  let idb = null;

  function openIDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = setTimeout(() => done(null), 1200);
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_STATE)) {
            db.createObjectStore(STORE_STATE);
          }
          if (!db.objectStoreNames.contains(STORE_IMAGES)) {
            db.createObjectStore(STORE_IMAGES);
          }
        };
        req.onsuccess = (e) => {
          idb = e.target.result;
          done(idb);
        };
        req.onerror = () => done(null);
        req.onblocked = () => done(null);
      } catch (err) {
        done(null);
      }
    });
  }

  function idbGet(storeName, key) {
    return new Promise((resolve) => {
      if (!idb) return resolve(null);
      try {
        const tx = idb.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function idbPut(storeName, key, value) {
    return new Promise((resolve) => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function idbDelete(storeName, key) {
    return new Promise((resolve) => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function idbClear(storeName) {
    return new Promise((resolve) => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function daysAgoISO(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function monthsAgoISO(months, day = 15) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    d.setDate(Math.min(day, 28));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function createDemoState() {
    const { DEFAULT_WALLETS } = global.StrukKu.Categories;
    return {
      isDemo: true,
      settings: {
        aiMode: 'auto',
        proxyUrl: '',
        proxyAccessCode: '',
        geminiApiKey: '',
        geminiModel: 'auto',
        darkMode: false,
        hideBalances: false,
        onboardingDone: false,
        userName: 'Pengguna'
      },
      wallets: JSON.parse(JSON.stringify(DEFAULT_WALLETS)),
      transactions: [
        {
          id: uid('tx'),
          type: 'income',
          amount: 8500000,
          category: 'salary',
          walletId: 'w_bank',
          merchant: 'Gaji Bulanan',
          date: daysAgoISO(12),
          time: '09:00',
          notes: 'Transfer gaji bulan ini',
          items: [],
          source: 'manual',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 142500,
          category: 'groceries',
          walletId: 'w_ewallet',
          merchant: 'Indomaret Fresh',
          date: daysAgoISO(0),
          time: '14:22',
          notes: 'Belanja kebutuhan harian (Scan Struk)',
          items: [
            { name: 'Beras Ramos 5kg', qty: 1, price: 74500 },
            { name: 'Minyak Goreng 2L', qty: 1, price: 36000 },
            { name: 'Telur Ayam 1kg', qty: 1, price: 32000 }
          ],
          tax: 0,
          discount: 4500,
          source: 'scan',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 58000,
          category: 'food',
          walletId: 'w_ewallet',
          merchant: 'Kopi Kenangan',
          date: daysAgoISO(1),
          time: '16:10',
          notes: 'Kopi sore & roti',
          items: [
            { name: 'Kopi Kenangan Mantan (L)', qty: 2, price: 42000 },
            { name: 'Roti Coklat Klasik', qty: 1, price: 16000 }
          ],
          tax: 5272,
          discount: 0,
          source: 'scan',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 150000,
          category: 'transport',
          walletId: 'w_cash',
          merchant: 'SPBU Pertamina',
          date: daysAgoISO(2),
          time: '08:15',
          notes: 'Isi Pertamax',
          items: [{ name: 'Pertamax 11.5L', qty: 1, price: 150000 }],
          source: 'scan',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'income',
          amount: 1250000,
          category: 'freelance',
          walletId: 'w_bank',
          merchant: 'Desain Landing Page',
          date: daysAgoISO(4),
          time: '19:40',
          notes: 'DP proyek klien',
          items: [],
          source: 'manual',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 385000,
          category: 'bills',
          walletId: 'w_bank',
          merchant: 'PLN & WiFi Rumah',
          date: daysAgoISO(5),
          time: '10:05',
          notes: 'Token listrik & internet bulanan',
          items: [],
          source: 'manual',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 215000,
          category: 'food',
          walletId: 'w_ewallet',
          merchant: 'Warung Bakmi & Sate',
          date: daysAgoISO(6),
          time: '19:20',
          notes: 'Makan malam bareng keluarga',
          items: [],
          source: 'manual',
          hasReceipt: false
        },
        {
          id: uid('tx'),
          type: 'expense',
          amount: 320000,
          category: 'shopping',
          walletId: 'w_bank',
          merchant: 'Tokopedia',
          date: daysAgoISO(8),
          time: '21:11',
          notes: 'Kemeja kerja & kabel charger',
          items: [],
          source: 'manual',
          hasReceipt: false
        },
        // Previous months summary records so 6-month trend looks realistic
        { id: uid('tx'), type: 'income', amount: 8500000, category: 'salary', walletId: 'w_bank', merchant: 'Gaji Bulan Lalu', date: monthsAgoISO(1, 2), time: '09:00', notes: '', items: [], source: 'manual' },
        { id: uid('tx'), type: 'expense', amount: 4650000, category: 'food', walletId: 'w_bank', merchant: 'Rekap Pengeluaran', date: monthsAgoISO(1, 18), time: '12:00', notes: 'Makan, harian & tagihan', items: [], source: 'manual' },
        { id: uid('tx'), type: 'income', amount: 8900000, category: 'salary', walletId: 'w_bank', merchant: 'Gaji & Bonus', date: monthsAgoISO(2, 2), time: '09:00', notes: '', items: [], source: 'manual' },
        { id: uid('tx'), type: 'expense', amount: 5200000, category: 'groceries', walletId: 'w_bank', merchant: 'Rekap Pengeluaran', date: monthsAgoISO(2, 16), time: '12:00', notes: 'Belanja & kebutuhan', items: [], source: 'manual' },
        { id: uid('tx'), type: 'income', amount: 8200000, category: 'salary', walletId: 'w_bank', merchant: 'Gaji Bulanan', date: monthsAgoISO(3, 2), time: '09:00', notes: '', items: [], source: 'manual' },
        { id: uid('tx'), type: 'expense', amount: 4100000, category: 'bills', walletId: 'w_bank', merchant: 'Rekap Pengeluaran', date: monthsAgoISO(3, 19), time: '12:00', notes: 'Pengeluaran rutin', items: [], source: 'manual' }
      ],
      budgets: [
        { id: uid('bg'), category: 'food', limit: 1500000 },
        { id: uid('bg'), category: 'groceries', limit: 1200000 },
        { id: uid('bg'), category: 'transport', limit: 600000 },
        { id: uid('bg'), category: 'entertainment', limit: 500000 }
      ],
      goals: [
        { id: uid('gl'), name: 'Dana Darurat', target: 15000000, current: 6500000, deadline: '2027-06-01', color: '#059669' },
        { id: uid('gl'), name: 'Liburan Akhir Tahun', target: 5000000, current: 2200000, deadline: '2026-12-20', color: '#2563eb' }
      ],
      recurring: [
        { id: uid('rc'), name: 'Internet WiFi Rumah', amount: 285000, category: 'bills', walletId: 'w_bank', dueDay: 20, lastPaidMonth: '' },
        { id: uid('rc'), name: 'Listrik PLN / Token', amount: 200000, category: 'bills', walletId: 'w_ewallet', dueDay: 5, lastPaidMonth: '' },
        { id: uid('rc'), name: 'Langganan Musik & Cloud', amount: 79000, category: 'entertainment', walletId: 'w_ewallet', dueDay: 15, lastPaidMonth: '' }
      ]
    };
  }

  function createEmptyState(keepSettings) {
    const { DEFAULT_WALLETS } = global.StrukKu.Categories;
    return {
      isDemo: false,
      settings: keepSettings
        ? { ...keepSettings, onboardingDone: true }
        : {
            aiMode: 'auto',
            proxyUrl: '',
            proxyAccessCode: '',
            geminiApiKey: '',
            geminiModel: 'auto',
            darkMode: false,
            hideBalances: false,
            onboardingDone: true,
            userName: 'Pengguna'
          },
      wallets: DEFAULT_WALLETS.map((w) => ({ ...w, initialBalance: 0 })),
      transactions: [],
      budgets: [],
      goals: [],
      recurring: []
    };
  }

  async function init() {
    await openIDB();
    let state = await idbGet(STORE_STATE, 'main');
    if (!state) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) state = JSON.parse(raw);
      } catch {
        state = null;
      }
    }
    if (!state) {
      state = createDemoState();
      await saveState(state);
    } else {
      // Backfill new settings keys for existing users without triggering onboarding again
      state.settings = Object.assign(
        {
          aiMode: 'auto',
          proxyUrl: '',
          proxyAccessCode: '',
          geminiApiKey: '',
          geminiModel: 'auto',
          darkMode: false,
          hideBalances: false,
          onboardingDone: true,
          userName: 'Pengguna'
        },
        state.settings || {}
      );
    }
    return state;
  }

  async function saveState(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota error in localStorage, IndexedDB handles large state
    }
    await idbPut(STORE_STATE, 'main', state);
  }

  async function saveReceiptImage(txId, dataUrl) {
    if (!dataUrl) return;
    const saved = await idbPut(STORE_IMAGES, txId, dataUrl);
    if (!saved) {
      try {
        localStorage.setItem(`strukku_img_${txId}`, dataUrl);
      } catch {}
    }
  }

  async function getReceiptImage(txId) {
    const img = await idbGet(STORE_IMAGES, txId);
    if (img) return img;
    try {
      return localStorage.getItem(`strukku_img_${txId}`);
    } catch {
      return null;
    }
  }

  async function deleteReceiptImage(txId) {
    await idbDelete(STORE_IMAGES, txId);
    try {
      localStorage.removeItem(`strukku_img_${txId}`);
    } catch {}
  }

  async function clearAllImages() {
    await idbClear(STORE_IMAGES);
  }

  function computeWalletBalances(state) {
    const map = {};
    state.wallets.forEach((w) => {
      map[w.id] = Number(w.initialBalance) || 0;
    });
    state.transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') {
        if (map[tx.walletId] !== undefined) map[tx.walletId] += amt;
      } else if (tx.type === 'expense') {
        if (map[tx.walletId] !== undefined) map[tx.walletId] -= amt;
      } else if (tx.type === 'transfer') {
        if (map[tx.walletId] !== undefined) map[tx.walletId] -= amt;
        if (map[tx.toWalletId] !== undefined) map[tx.toWalletId] += amt;
      }
    });
    return map;
  }

  global.StrukKu = global.StrukKu || {};
  global.StrukKu.DB = {
    uid,
    init,
    saveState,
    saveReceiptImage,
    getReceiptImage,
    deleteReceiptImage,
    clearAllImages,
    createDemoState,
    createEmptyState,
    computeWalletBalances
  };
})(window);
