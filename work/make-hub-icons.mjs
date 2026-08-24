import sharp from 'sharp';

const source=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#242a58"/><stop offset="1" stop-color="#101226"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#050611" flood-opacity=".5"/></filter></defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="330" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="8"/>
  <circle cx="512" cy="512" r="245" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="6" stroke-dasharray="18 28"/>
  <g filter="url(#shadow)"><rect x="316" y="316" width="392" height="392" rx="118" fill="#c8ff5b"/><text x="512" y="575" text-anchor="middle" font-family="Arial,sans-serif" font-size="190" font-weight="900" letter-spacing="-18" fill="#15182f">GH</text></g>
  <circle cx="220" cy="338" r="70" fill="#557cf7" stroke="#aabcfb" stroke-width="10"/>
  <path d="M785 236 855 276 855 356 785 396 715 356 715 276Z" fill="#6fa56a" stroke="#bbd9a9" stroke-width="10"/>
  <path d="M812 710 884 782 812 854 740 782Z" fill="#b66ee0" stroke="#e1b2fb" stroke-width="10"/>
</svg>`);

const outputs=[['public/icons/icon-512.png',512],['public/icons/icon-192.png',192],['public/icons/apple-touch-icon.png',180],['public/icons/icon-maskable-512.png',512]];
await Promise.all(outputs.map(([path,size])=>sharp(source).resize(size,size).png().toFile(path)));
console.log('Game Hub icons generated');
