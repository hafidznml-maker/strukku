(function (global) {
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  function compressImage(fileOrBlob, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          resolve({ dataUrl, base64, mimeType: 'image/jpeg', width, height });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(fileOrBlob);
    });
  }

  function buildPrompt() {
    const today = global.StrukKu.Categories.todayISO();
    const catIds = global.StrukKu.Categories.EXPENSE_CATEGORIES.map((c) => `${c.id} (${c.name})`).join(', ');
    return `Kamu adalah AI ahli pembaca struk belanja dan nota transaksi Indonesia.
Analisis gambar struk / nota / bukti bayar ini secara teliti dan keluarkan HANYA JSON valid (tanpa markdown) dengan struktur berikut:
{
  "merchant": "Nama toko/restoran/merchant singkat dan jelas",
  "date": "YYYY-MM-DD (gunakan ${today} jika tanggal tidak terbaca)",
  "time": "HH:mm (kosongkan jika tidak ada)",
  "total": 0,
  "subtotal": 0,
  "tax": 0,
  "discount": 0,
  "category": "pilih tepat satu ID dari daftar kategori",
  "paymentMethod": "cash | bank | ewallet",
  "items": [
    { "name": "Nama item", "qty": 1, "price": 0 }
  ],
  "notes": "Ringkasan singkat 1 kalimat isi transaksi",
  "confidence": 95
}

Aturan PENTING:
1. "total" WAJIB berupa angka integer Rupiah (tanpa titik, koma, atau Rp). Contoh: Rp 45.500 -> 45500.
2. Hati-hati membedakan TOTAL BELANJA / GRAND TOTAL dengan TUNAI / BAYAR (uang yang diserahkan) dan KEMBALI / CHANGE. Ambil nilai TOTAL yang benar-benar dibayarkan!
3. Pada struk Indonesia, tanda titik (.) sering merupakan pemisah ribuan (contoh 25.000 = dua puluh lima ribu).
4. Daftar ID kategori yang valid: ${catIds}.
5. Untuk paymentMethod: pilih "ewallet" jika tertulis QRIS/GoPay/OVO/DANA/ShopeePay/LinkAja; "bank" jika Debit/Kredit/Transfer/BCA/Mandiri/BRI/BNI; selain itu "cash".
6. Jika gambar bukan struk atau sama sekali tidak terbaca, tetap kembalikan JSON dengan confidence: 0 dan notes menjelaskan kendalanya.`;
  }

  function parseGeminiJSON(rawText) {
    let cleaned = String(rawText || '').trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned);
  }

  function normalizeResult(data) {
    const { EXPENSE_CATEGORIES, todayISO, parseIDR } = global.StrukKu.Categories;
    const validCatIds = new Set(EXPENSE_CATEGORIES.map((c) => c.id));
    const items = Array.isArray(data.items)
      ? data.items
          .filter((it) => it && it.name)
          .map((it) => ({
            name: String(it.name).trim(),
            qty: Number(it.qty) || 1,
            price: parseIDR(it.price)
          }))
      : [];

    let total = parseIDR(data.total);
    if (!total && items.length > 0) {
      total = items.reduce((sum, it) => sum + (it.price || 0), 0);
    }

    const dateValid = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date);
    return {
      merchant: String(data.merchant || 'Struk Belanja').trim(),
      date: dateValid ? data.date : todayISO(),
      time: typeof data.time === 'string' ? data.time.slice(0, 5) : '',
      total,
      subtotal: parseIDR(data.subtotal),
      tax: parseIDR(data.tax),
      discount: parseIDR(data.discount),
      category: validCatIds.has(data.category) ? data.category : 'other_expense',
      paymentMethod: ['cash', 'bank', 'ewallet'].includes(data.paymentMethod) ? data.paymentMethod : 'cash',
      items,
      notes: String(data.notes || '').trim(),
      confidence: Math.min(100, Math.max(0, Number(data.confidence) || 85))
    };
  }

  const PREFERRED_MODELS = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite'
  ];

  async function discoverBestModel(apiKey) {
    try {
      const url = `${GEMINI_BASE}?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url);
      if (!res.ok) return PREFERRED_MODELS[0];
      const data = await res.json();
      const models = (data.models || [])
        .filter((m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter((id) =>
          id.startsWith('gemini-') &&
          !/embedding|imagen|veo|tts|audio|live|robotics|computer-use|deep-research/i.test(id)
        );

      for (const pref of PREFERRED_MODELS) {
        if (models.includes(pref)) return pref;
      }
      const flash = models.find((id) => /gemini-3.*flash|gemini-2\.5.*flash/i.test(id));
      if (flash) return flash;
      const pro = models.find((id) => /gemini-3.*pro|gemini-2\.5.*pro/i.test(id));
      return pro || models[0] || PREFERRED_MODELS[0];
    } catch {
      return PREFERRED_MODELS[0];
    }
  }

  function isModelUnavailableError(status, msg) {
    const m = String(msg || '').toLowerCase();
    return status === 404 || m.includes('no longer available') || m.includes('not found') || m.includes('deprecated') || m.includes('is not supported');
  }

  async function postGenerateContent(model, apiKey, payload) {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }

  async function callWithAutoFallback(requestedModel, apiKey, payload) {
    const tried = new Set();
    const candidates = [];

    if (!requestedModel || requestedModel === 'auto') {
      const best = await discoverBestModel(apiKey);
      candidates.push(best, ...PREFERRED_MODELS);
    } else {
      candidates.push(requestedModel);
    }

    let lastError = 'Gagal terhubung ke Gemini API.';
    for (const model of candidates) {
      if (!model || tried.has(model)) continue;
      tried.add(model);
      const res = await postGenerateContent(model, apiKey, payload);
      if (res.ok) return { ok: true, model, json: res.json };

      const msg = res.json?.error?.message || `Error API Gemini (${res.status})`;
      lastError = msg;

      if (isModelUnavailableError(res.status, msg)) {
        if (candidates.length === 1) {
          const discovered = await discoverBestModel(apiKey);
          candidates.push(discovered, ...PREFERRED_MODELS);
        }
        continue;
      }
      // Non-model error (e.g., invalid API key, quota exceeded) -> fail immediately
      return { ok: false, model, message: msg };
    }
    return { ok: false, model: requestedModel, message: lastError };
  }

  async function scanReceiptWithGemini(base64Image, mimeType, apiKey, model = 'auto') {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('NO_API_KEY');
    }
    const payload = {
      contents: [
        {
          parts: [
            { text: buildPrompt() },
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const res = await callWithAutoFallback(model, apiKey, payload);
    if (!res.ok) {
      throw new Error(res.message);
    }

    const text = res.json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini tidak mengembalikan hasil pembacaan. Coba foto ulang dengan pencahayaan lebih jelas.');
    }

    const parsed = parseGeminiJSON(text);
    const normalized = normalizeResult(parsed);
    normalized.usedModel = res.model;
    return normalized;
  }

  async function testConnection(apiKey, model = 'auto') {
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, message: 'Masukkan Gemini API Key terlebih dahulu.' };
    }
    try {
      const payload = {
        contents: [{ parts: [{ text: 'Balas hanya kata: OK' }] }],
        generationConfig: { maxOutputTokens: 16 }
      };
      const res = await callWithAutoFallback(model, apiKey, payload);
      if (!res.ok) {
        return { ok: false, message: res.message };
      }
      return {
        ok: true,
        resolvedModel: res.model,
        message: `Koneksi berhasil! Menggunakan model: ${res.model}`
      };
    } catch (err) {
      return { ok: false, message: err.message || 'Gagal terhubung ke server Google Gemini.' };
    }
  }

  // ==================== SERVERLESS PROXY SUPPORT ====================
  function getEffectiveProxyUrl(customUrl) {
    const raw = String(customUrl || global.STRUKKU_CONFIG?.defaultProxyUrl || '/api/scan').trim();
    return raw || '/api/scan';
  }

  async function checkProxyStatus(customUrl) {
    const url = getEffectiveProxyUrl(customUrl);
    if (!url) return { checked: true, available: false, url: '' };
    if (location.protocol === 'file:' && url.startsWith('/')) {
      return { checked: true, available: false, url };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return { checked: true, available: false, url };
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return { checked: true, available: false, url };
      const data = await res.json();
      if (data && data.ok && data.configured) {
        return {
          checked: true,
          available: true,
          configured: true,
          requireAccessCode: Boolean(data.requireAccessCode),
          dailyLimit: Number(data.dailyLimit) || null,
          url
        };
      }
      return { checked: true, available: false, configured: false, url };
    } catch {
      clearTimeout(timer);
      return { checked: true, available: false, url };
    }
  }

  async function scanReceiptViaProxy(base64Image, mimeType, options = {}) {
    const url = getEffectiveProxyUrl(options.proxyUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (options.accessCode && options.accessCode.trim()) {
      headers['X-Access-Code'] = options.accessCode.trim();
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'scan',
        imageBase64: base64Image,
        mimeType: mimeType || 'image/jpeg',
        prompt: buildPrompt(),
        model: options.model || 'auto'
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      if (res.status === 401) {
        throw new Error(json.error || 'Kode akses tidak valid. Masukkan kode akses yang benar di menu Lainnya.');
      }
      if (res.status === 429) {
        throw new Error(json.error || 'Batas scan harian server tercapai. Coba lagi besok atau masukkan API Key pribadi.');
      }
      throw new Error(json.error || `Gagal menghubungi server AI (${res.status}).`);
    }

    if (!json.text) {
      throw new Error('AI server tidak mengembalikan hasil pembacaan. Coba foto ulang lebih jelas.');
    }

    const parsed = parseGeminiJSON(json.text);
    const normalized = normalizeResult(parsed);
    normalized.usedModel = json.model || 'server';
    normalized.viaProxy = true;
    if (typeof json.remaining === 'number') {
      normalized.remainingQuota = json.remaining;
    }
    return normalized;
  }

  async function testProxyConnection(options = {}) {
    const url = getEffectiveProxyUrl(options.proxyUrl);
    if (location.protocol === 'file:' && url.startsWith('/')) {
      return { ok: false, message: 'Server AI hanya aktif saat aplikasi sudah di-deploy online (Cloudflare Pages / Netlify) atau isi URL Worker lengkap.' };
    }
    const headers = { 'Content-Type': 'application/json' };
    if (options.accessCode && options.accessCode.trim()) {
      headers['X-Access-Code'] = options.accessCode.trim();
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'test', model: options.model || 'auto' })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        return { ok: false, message: json.error || `Server AI tidak merespons (${res.status}).` };
      }
      const quotaInfo = typeof json.remaining === 'number' ? ` (Sisa kuota hari ini: ${json.remaining}x)` : '';
      return {
        ok: true,
        resolvedModel: json.model || 'auto',
        message: `Terhubung ke Server AI! Model: ${json.model || 'otomatis'}${quotaInfo}`
      };
    } catch (err) {
      return { ok: false, message: err.message || 'Gagal terhubung ke Server AI.' };
    }
  }

  async function scanReceipt(base64Image, mimeType, settings = {}, proxyStatus = null) {
    const aiMode = settings.aiMode || 'auto';
    const hasPersonalKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());
    const proxyAvailable = Boolean(proxyStatus && proxyStatus.available);

    const shouldUseProxy =
      aiMode === 'proxy' ||
      (aiMode === 'auto' && !hasPersonalKey && proxyAvailable);

    if (shouldUseProxy) {
      return scanReceiptViaProxy(base64Image, mimeType, {
        proxyUrl: settings.proxyUrl,
        accessCode: settings.proxyAccessCode,
        model: settings.geminiModel || 'auto'
      });
    }

    if (hasPersonalKey) {
      return scanReceiptWithGemini(base64Image, mimeType, settings.geminiApiKey, settings.geminiModel || 'auto');
    }

    // Last chance: if auto mode and status wasn't checked yet, try proxy once
    if (aiMode === 'auto' && (!proxyStatus || !proxyStatus.checked)) {
      const liveStatus = await checkProxyStatus(settings.proxyUrl);
      if (liveStatus.available) {
        return scanReceiptViaProxy(base64Image, mimeType, {
          proxyUrl: settings.proxyUrl,
          accessCode: settings.proxyAccessCode,
          model: settings.geminiModel || 'auto'
        });
      }
    }

    throw new Error('NO_API_KEY');
  }

  // Generate a crisp thermal receipt canvas image for Demo Scan mode
  const SAMPLE_RECEIPTS = [
    {
      id: 'alfamart',
      label: 'Struk Alfamart',
      merchant: 'Alfamart Sudirman',
      address: 'Jl. Jend. Sudirman No. 45, Jakarta',
      category: 'groceries',
      paymentMethod: 'ewallet',
      paymentLabel: 'QRIS',
      tax: 0,
      discount: 3500,
      items: [
        { name: 'Ultra Milk Full Cream 1L', qty: 1, price: 21500 },
        { name: 'Roti Tawar Sari Roti', qty: 1, price: 16500 },
        { name: 'Indomie Goreng (5 pcs)', qty: 5, price: 16000 },
        { name: 'Le Minerale 1500ml', qty: 2, price: 13000 }
      ],
      notes: 'Belanja kebutuhan harian di Alfamart'
    },
    {
      id: 'cafe',
      label: 'Struk Kafe / Kopi',
      merchant: 'Fore Coffee',
      address: 'Grand Indonesia Mall Lt. LG',
      category: 'food',
      paymentMethod: 'ewallet',
      paymentLabel: 'GoPay QRIS',
      tax: 7800,
      discount: 0,
      items: [
        { name: 'Iced Butterscotch Sea Salt', qty: 1, price: 33000 },
        { name: 'Aren Latte Regular', qty: 1, price: 29000 },
        { name: 'Almond Croissant', qty: 1, price: 24000 }
      ],
      notes: 'Ngopi & croissant di Fore Coffee'
    },
    {
      id: 'apotek',
      label: 'Struk Apotek',
      merchant: 'Apotek K-24',
      address: 'Jl. Diponegoro No. 18',
      category: 'health',
      paymentMethod: 'cash',
      paymentLabel: 'TUNAI',
      tax: 0,
      discount: 0,
      items: [
        { name: 'Vitamin C 1000mg (10 tab)', qty: 1, price: 48000 },
        { name: 'Tolak Angin Cair (1 Box)', qty: 1, price: 46500 },
        { name: 'Masker Medis 3-Ply', qty: 1, price: 18000 }
      ],
      notes: 'Pembelian vitamin & obat di Apotek K-24'
    }
  ];

  function createSampleReceiptDemo(sampleIndex = 0) {
    const sample = SAMPLE_RECEIPTS[sampleIndex % SAMPLE_RECEIPTS.length];
    const subtotal = sample.items.reduce((s, i) => s + i.price, 0);
    const total = subtotal + (sample.tax || 0) - (sample.discount || 0);
    const today = global.StrukKu.Categories.todayISO();
    const nowTime = new Date().toTimeString().slice(0, 5);

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // Warm paper background
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = '#fffef9';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
    ctx.shadowBlur = 18;
    ctx.fillRect(42, 28, 396, 584);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(sample.merchant.toUpperCase(), 240, 82);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText(sample.address, 240, 108);
    ctx.fillText(`${today}  ${nowTime}  KASIR: RINA`, 240, 134);

    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(64, 156);
    ctx.lineTo(416, 156);
    ctx.stroke();

    let y = 192;
    ctx.textAlign = 'left';
    ctx.font = '15px monospace';
    ctx.fillStyle = '#0f172a';
    sample.items.forEach((it) => {
      ctx.fillText(it.name.slice(0, 26), 66, y);
      ctx.textAlign = 'right';
      ctx.fillText(`Rp ${it.price.toLocaleString('id-ID')}`, 414, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '13px monospace';
      ctx.fillText(`  ${it.qty} x Rp ${Math.round(it.price / it.qty).toLocaleString('id-ID')}`, 66, y + 20);
      ctx.fillStyle = '#0f172a';
      ctx.font = '15px monospace';
      y += 50;
    });

    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(416, y);
    ctx.stroke();
    y += 32;

    const drawRow = (label, val, bold = false) => {
      ctx.font = bold ? 'bold 18px monospace' : '15px monospace';
      ctx.fillStyle = bold ? '#0f172a' : '#334155';
      ctx.textAlign = 'left';
      ctx.fillText(label, 66, y);
      ctx.textAlign = 'right';
      ctx.fillText(val, 414, y);
      y += bold ? 34 : 26;
    };

    drawRow('SUBTOTAL', `Rp ${subtotal.toLocaleString('id-ID')}`);
    if (sample.tax) drawRow('PB1 / PPN 10%', `Rp ${sample.tax.toLocaleString('id-ID')}`);
    if (sample.discount) drawRow('DISKON PROMO', `-Rp ${sample.discount.toLocaleString('id-ID')}`);
    y += 6;
    drawRow('TOTAL BAYAR', `Rp ${total.toLocaleString('id-ID')}`, true);
    drawRow(`METODE (${sample.paymentLabel})`, `Rp ${total.toLocaleString('id-ID')}`);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '13px monospace';
    ctx.fillText('*** TERIMA KASIH ATAS KUNJUNGAN ANDA ***', 240, 575);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return {
      dataUrl,
      result: {
        merchant: sample.merchant,
        date: today,
        time: nowTime,
        total,
        subtotal,
        tax: sample.tax || 0,
        discount: sample.discount || 0,
        category: sample.category,
        paymentMethod: sample.paymentMethod,
        items: sample.items,
        notes: sample.notes,
        confidence: 98
      }
    };
  }

  global.StrukKu = global.StrukKu || {};
  global.StrukKu.Gemini = {
    compressImage,
    scanReceipt,
    scanReceiptWithGemini,
    scanReceiptViaProxy,
    testConnection,
    testProxyConnection,
    checkProxyStatus,
    getEffectiveProxyUrl,
    SAMPLE_RECEIPTS,
    createSampleReceiptDemo
  };
})(window);
