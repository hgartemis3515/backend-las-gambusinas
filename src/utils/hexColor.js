const HEX_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

function parseHexColor(raw, fallback = '') {
  const s = String(raw || '').trim();
  if (!HEX_RE.test(s)) return fallback;
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

module.exports = { parseHexColor };
