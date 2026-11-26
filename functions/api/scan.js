/**
 * StrukKu — Cloudflare Pages Function (/api/scan)
 *
 * Menyimpan GEMINI_API_KEY secara aman di sisi server sehingga pengguna
 * bisa langsung scan struk tanpa perlu membuat API Key sendiri.
 *
 * Environment Variables di Cloudflare Pages (Settings -> Environment variables):
 * - GEMINI_API_KEY   (Wajib)    : API Key dari https://aistudio.google.com/apikey
 * - DAILY_LIMIT      (Opsional) : Batas scan per IP per hari (default: 15)
 * - ACCESS_CODE      (Opsional) : Kode akses rahasia jika hanya untuk keluarga/teman
 * - ALLOWED_ORIGIN   (Opsional) : Domain yang diizinkan untuk CORS (default: *)
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PREFERRED_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash-lite'
];

// Fallback in-memory counter per isolate (atau gunakan KV binding bernama STRUKKU_KV jika tersedia)
const memoryQuota = new Map();

function corsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGIN || '').trim();
  const origin = request.headers.get('Origin') || '*';
  const allowOrigin = allowed || origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(body, status, env, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env, request)
    }
  });
}

function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    'unknown'
  );
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getUsageCount(env, ip) {
  const key = `quota:${getTodayKey()}:${ip}`;
  if (env.STRUKKU_KV) {
    const val = await env.STRUKKU_KV.get(key);
    return Number(val) || 0;
  }
  return memoryQuota.get(key) || 0;
}

async function incrementUsage(env, ip) {
  const key = `quota:${getTodayKey()}:${ip}`;
  if (env.STRUKKU_KV) {
    const current = Number(await env.STRUKKU_KV.get(key)) || 0;
    const next = current + 1;
    await env.STRUKKU_KV.put(key, String(next), { expirationTtl: 86400 });
    return next;
  }
  const next = (memoryQuota.get(key) || 0) + 1;
  memoryQuota.set(key, next);
  return next;
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

export async function onRequestOptions({ request, env }) {
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

export async function onRequestGet({ request, env }) {
  const configured = Boolean((env.GEMINI_API_KEY || '').trim());
  const dailyLimit = Math.max(1, Number(env.DAILY_LIMIT) || 15);
  const requireAccessCode = Boolean((env.ACCESS_CODE || '').trim());
  return jsonResponse({ ok: true, mode: 'proxy', configured, requireAccessCode, dailyLimit }, 200, env, request);
}

export async function onRequestPost({ request, env }) {
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: 'GEMINI_API_KEY belum diatur di Environment Variables server.' },
      503,
      env,
      request
    );
  }

  const requiredCode = (env.ACCESS_CODE || '').trim();
  if (requiredCode) {
    const givenCode = (request.headers.get('X-Access-Code') || '').trim();
    if (givenCode !== requiredCode) {
      return jsonResponse(
        { ok: false, error: 'Kode akses tidak valid. Minta kode akses ke pemilik aplikasi.' },
        401,
        env,
        request
      );
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Payload JSON tidak valid.' }, 400, env, request);
  }

  const action = body?.action || 'scan';
  const requestedModel = typeof body?.model === 'string' ? body.model : 'auto';
  const dailyLimit = Math.max(1, Number(env.DAILY_LIMIT) || 15);
  const ip = getClientIp(request);
  const used = await getUsageCount(env, ip);

  if (action === 'test') {
    const res = await callGeminiWithFallback(apiKey, requestedModel, {
      contents: [{ parts: [{ text: 'Balas hanya kata: OK' }] }],
      generationConfig: { maxOutputTokens: 16 }
    });
    if (!res.ok) {
      return jsonResponse({ ok: false, error: res.message }, res.status || 502, env, request);
    }
    return jsonResponse({ ok: true, model: res.model, remaining: Math.max(0, dailyLimit - used) }, 200, env, request);
  }

  if (used >= dailyLimit) {
    return jsonResponse(
      { ok: false, error: `Batas scan gratis (${dailyLimit}x/hari) telah tercapai. Coba lagi besok atau gunakan API Key pribadi di menu Lainnya.` },
      429,
      env,
      request
    );
  }

  const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';

  if (!imageBase64 || !prompt) {
    return jsonResponse({ ok: false, error: 'Gambar struk atau prompt tidak lengkap.' }, 400, env, request);
  }
  if (imageBase64.length > 6_000_000) {
    return jsonResponse({ ok: false, error: 'Ukuran gambar terlalu besar (maksimal 4 MB).' }, 413, env, request);
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
    return jsonResponse({ ok: false, error: res.message }, res.status || 502, env, request);
  }

  const text = res.json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    return jsonResponse({ ok: false, error: 'Gemini tidak mengembalikan teks hasil scan.' }, 502, env, request);
  }

  const nextUsed = await incrementUsage(env, ip);
  return jsonResponse(
    {
      ok: true,
      model: res.model,
      text,
      remaining: Math.max(0, dailyLimit - nextUsed)
    },
    200,
    env,
    request
  );
}
