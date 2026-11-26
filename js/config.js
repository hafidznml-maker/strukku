(function (global) {
  /**
   * Konfigurasi default StrukKu untuk distribusi ke pengguna lain.
   *
   * - defaultProxyUrl:
   *   Biarkan '/api/scan' jika aplikasi di-deploy ke Cloudflare Pages atau Netlify
   *   (folder functions/ atau netlify/functions/ otomatis aktif).
   *   Jika kamu memakai Cloudflare Worker di domain terpisah, ubah menjadi URL worker tersebut,
   *   misalnya: 'https://strukku-ai.namamu.workers.dev/api/scan'
   */
  global.STRUKKU_CONFIG = {
    appName: 'StrukKu',
    defaultProxyUrl: '/api/scan',
    defaultShareText: 'Cobain StrukKu — aplikasi keuangan & scan struk belanja otomatis pakai AI. Gratis, ringan, langsung bisa di-install di HP!'
  };
})(window);
