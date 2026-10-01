const express = require('express');
const http = require('http');
const logger = require('../utils/logger');

const router = express.Router();
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

function ipPrivada(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return false;
  const n = m.slice(1).map(Number);
  if (n.some((x) => x > 255)) return false;
  if (n[0] === 10 || n[0] === 127) return true;
  if (n[0] === 192 && n[1] === 168) return true;
  if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
  return false;
}

function envolverSoap(xml) {
  const inner = String(xml || '').trim();
  if (/Envelope/i.test(inner)) return inner;
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="${SOAP_NS}"><s:Body>${inner}</s:Body></s:Envelope>`;
}

function postXml(ip, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: ip,
      port: 80,
      path: `/cgi-bin/epos/service.cgi?devid=local_printer&timeout=${timeoutMs}`,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '""',
        'Content-Length': Buffer.byteLength(body),
        'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
      },
      timeout: timeoutMs + 2000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

/** El navegador de cocina no puede hablar directo con la Epson (CORS). */
router.post('/impresion/epos', async (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  const xml = String(req.body?.xml || '');
  if (!ipPrivada(ip)) {
    return res.status(400).json({ message: 'IP de impresora no permitida.' });
  }
  if (!xml.includes('epos-print') || xml.length > 1500000) {
    return res.status(400).json({ message: 'Ticket inválido.' });
  }
  try {
    const text = await postXml(ip, envolverSoap(xml), 10000);
    const ok = /success\s*=\s*["']true["']/i.test(text);
    if (!ok) {
      const code = (text.match(/code\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
      return res.status(502).json({
        message: code ? `La impresora rechazó el ticket (${code}).` : 'La impresora no aceptó el ticket.',
      });
    }
    return res.json({ ok: true });
  } catch (error) {
    logger.warn('impresion epos', { ip, error: error.message });
    return res.status(502).json({ message: 'No se alcanzó la impresora de cocina.' });
  }
});

module.exports = router;
