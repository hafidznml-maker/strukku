/**
 * StrukKu — Netlify Function (/.netlify/functions/scan -> /api/scan via netlify.toml)
 *
 * Environment Variables di Netlify (Site configuration -> Environment variables):
 * - GEMINI_API_KEY   (Wajib)    : API Key dari https://aistudio.google.com/apikey
 * - DAILY_LIMIT      (Opsional) : Batas scan per IP per hari (default: 15)
 * - ACCESS_CODE      (Opsional) : Kode akses rahasia jika hanya untuk keluarga/teman
 * - ALLOWED_ORIGIN   (Opsional) : Domain CORS (default: *)
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PREFERRED_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash-lite'
];

const memoryQuota = new Map();

function corsHeaders(event) {
  const allowed = (process.env.ALLOWED_ORIGIN || '').trim();
  const origin = event.headers?.origin || event.headers?.Origin || '*';
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowed || origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Cache-Control': 'no-store'
  };
}

function respond(statusCode, body, event) {
  return {
    statusCode,
    headers: corsHeaders(event),
    body: JSON.stringify(body)
  };
}

function getClientIp(event) {
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function discoverBestModel(apiKey) {
  try {
    const res = await fetch(`${GEMINI_BASE}?key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return PREFERRED_MODELS[0];
    const data = await res.json();
    const models = (data.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((id) => id.startsWith('gemini-') && !/embedding|imagen|veo|tts|audio|live|robotics|computer-use|deep-research/i.test(id));

    for (const pref of PREFERRED_MODELS) {
      if (models.includes(pref)) return pref;
    }
    const flash = models.find((id) => /gemini-3.*flash|gemini-2\.5.*flash/i.test(id));
    return flash || models[0] || PREFERRED_MODELS[0];
  } catch {
    return PREFERRED_MODELS[0];
  }
}

function isModelUnavailableError(status, msg) {
  const m = String(msg || '').toLowerCase();
  return status === 404 || m.includes('no longer available') || m.includes('not found') || m.includes('deprecated') || m.includes('is not supported');
}

async function callGeminiWithFallback(apiKey, requestedModel, payload) {
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

    const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, model, json };

    const msg = json?.error?.message || `Error API Gemini (${res.status})`;
    lastError = msg;

    if (isModelUnavailableError(res.status, msg)) {
      if (candidates.length === 1) {
        const discovered = await discoverBestModel(apiKey);
        candidates.push(discovered, ...PREFERRED_MODELS);
      }
      continue;
    }
    return { ok: false, status: res.status, message: msg };
  }

  return { ok: false, status: 502, message: lastError };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const dailyLimit = Math.max(1, Number(process.env.DAILY_LIMIT) || 15);
  const requiredCode = (process.env.ACCESS_CODE || '').trim();

  if (event.httpMethod === 'GET') {
    return respond(
      200,
      {
        ok: true,
        mode: 'proxy',
        configured: Boolean(apiKey),
        requireAccessCode: Boolean(requiredCode),
        dailyLimit
      },
      event
    );
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { ok: false, error: 'Method tidak didukung.' }, event);
  }

  if (!apiKey) {
    return respond(503, { ok: false, error: 'GEMINI_API_KEY belum diatur di Environment Variables Netlify.' }, event);
  }

  if (requiredCode) {
    const givenCode = (event.headers?.['x-access-code'] || event.headers?.['X-Access-Code'] || '').trim();
    if (givenCode !== requiredCode) {
      return respond(401, { ok: false, error: 'Kode akses tidak valid. Minta kode akses ke pemilik aplikasi.' }, event);
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { ok: false, error: 'Payload JSON tidak valid.' }, event);
  }

  const action = body?.action || 'scan';
  const requestedModel = typeof body?.model === 'string' ? body.model : 'auto';
  const ip = getClientIp(event);
  const quotaKey = `${getTodayKey()}:${ip}`;
  const used = memoryQuota.get(quotaKey) || 0;

  if (action === 'test') {
    const res = await callGeminiWithFallback(apiKey, requestedModel, {
      contents: [{ parts: [{ text: 'Balas hanya kata: OK' }] }],
      generationConfig: { maxOutputTokens: 16 }
    });
    if (!res.ok) {
      return respond(res.status || 502, { ok: false, error: res.message }, event);
    }
    return respond(200, { ok: true, model: res.model, remaining: Math.max(0, dailyLimit - used) }, event);
  }

  if (used >= dailyLimit) {
    return respond(
      429,
      { ok: false, error: `Batas scan gratis (${dailyLimit}x/hari) telah tercapai. Coba lagi besok atau gunakan API Key pribadi di menu Lainnya.` },
      event
    );
  }

  const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';

  if (!imageBase64 || !prompt) {
    return respond(400, { ok: false, error: 'Gambar struk atau prompt tidak lengkap.' }, event);
  }
  if (imageBase64.length > 6_000_000) {
    return respond(413, { ok: false, error: 'Ukuran gambar terlalu besar (maksimal 4 MB).' }, event);
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const res = await callGeminiWithFallback(apiKey, requestedModel, payload);
  if (!res.ok) {
    return respond(res.status || 502, { ok: false, error: res.message }, event);
  }

  const text = res.json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    return respond(502, { ok: false, error: 'Gemini tidak mengembalikan teks hasil scan.' }, event);
  }

  const nextUsed = used + 1;
  memoryQuota.set(quotaKey, nextUsed);
  return respond(
    200,
    {
      ok: true,
      model: res.model,
      text,
      remaining: Math.max(0, dailyLimit - nextUsed)
    },
    event
  );
};
