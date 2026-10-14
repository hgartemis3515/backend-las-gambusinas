'use strict';

const TAGS = new Set(['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'font', 'img', 'h1', 'h2', 'h3']);
const FAMILIAS = /^(system-ui|georgia|ui-monospace|sans-serif|serif|monospace|inter|arial|courier new)(\s*,\s*(system-ui|georgia|sans-serif|serif|monospace|inter|arial|courier new))*$/i;

function colorSeguro(v) {
    const s = String(v || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(s);
    if (!rgb) return '';
    const n = rgb.slice(1).map((x) => Math.min(255, Number(x)));
    return `rgb(${n[0]}, ${n[1]}, ${n[2]})`;
}

function estiloSeguro(raw) {
    const out = [];
    String(raw || '').split(';').forEach((part) => {
        const idx = part.indexOf(':');
        if (idx < 0) return;
        const k = part.slice(0, idx).trim().toLowerCase();
        const v = part.slice(idx + 1).trim();
        if (k === 'font-size') {
            const m = /^(\d{1,2})px$/.exec(v);
            const n = m ? Number(m[1]) : 0;
            if (n >= 12 && n <= 36) out.push(`font-size:${n}px`);
        } else if (k === 'font-family' && FAMILIAS.test(v)) {
            out.push(`font-family:${v}`);
        } else if (k === 'color') {
            const c = colorSeguro(v);
            if (c) out.push(`color:${c}`);
        } else if (k === 'text-align' && /^(left|center|right)$/i.test(v)) {
            out.push(`text-align:${v.toLowerCase()}`);
        } else if (k === 'font-weight' && /^(bold|normal|[1-9]00)$/i.test(v)) {
            out.push(`font-weight:${v.toLowerCase()}`);
        } else if (k === 'font-style' && /^(italic|normal)$/i.test(v)) {
            out.push(`font-style:${v.toLowerCase()}`);
        } else if (k === 'text-decoration' && /^(underline|none)$/i.test(v)) {
            out.push(`text-decoration:${v.toLowerCase()}`);
        }
    });
    return out.length ? `style="${out.join(';')}"` : '';
}

function attr(attrs, name) {
    const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs || '');
    return m ? (m[2] != null ? m[2] : m[3]) : '';
}

function sanitizarHtmlNoticia(html) {
    let s = String(html || '').slice(0, 40000);
    s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta|svg)[^>]*\/?\s*>/gi, '');
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/javascript\s*:/gi, '');
    s = s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
        const t = String(tag || '').toLowerCase();
        if (!TAGS.has(t)) return '';
        if (full.startsWith('</')) return t === 'br' ? '' : `</${t}>`;
        if (t === 'br') return '<br>';
        if (t === 'img') {
            const src = attr(attrs, 'src');
            if (!/^\/uploads\/noticias\/[a-zA-Z0-9._-]+$/.test(src)) return '';
            return `<img src="${src}" alt="">`;
        }
        const bits = [];
        const st = estiloSeguro(attr(attrs, 'style'));
        if (st) bits.push(st);
        if (t === 'font') {
            const face = attr(attrs, 'face');
            if (face && FAMILIAS.test(face)) bits.push(`face="${face}"`);
            const size = attr(attrs, 'size');
            if (/^[1-7]$/.test(size)) bits.push(`size="${size}"`);
            const col = colorSeguro(attr(attrs, 'color'));
            if (col) bits.push(`color="${col}"`);
        }
        if (t === 'div' || t === 'p') {
            const al = attr(attrs, 'align');
            if (/^(left|center|right)$/i.test(al)) bits.push(`align="${al.toLowerCase()}"`);
        }
        return bits.length ? `<${t} ${bits.join(' ')}>` : `<${t}>`;
    });
    return s;
}

function textoPlanoNoticia(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function imagenesDeHtml(html) {
    const out = [];
    const re = /src="(\/uploads\/noticias\/[^"]+)"/g;
    let m;
    while ((m = re.exec(html || ''))) {
        if (!out.includes(m[1])) out.push(m[1]);
        if (out.length >= 8) break;
    }
    return out;
}

module.exports = { sanitizarHtmlNoticia, textoPlanoNoticia, imagenesDeHtml };
