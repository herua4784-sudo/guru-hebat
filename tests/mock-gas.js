/* Menjalankan gas/Code.gs asli di Node dengan tiruan layanan Google. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const http = require('http');

function createGas() {
  const raw = new Map();
  const unquote = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  const rawWrites = [];
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.max = 1000; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return this.rows[0] ? this.rows[0].length : 0; }
    getMaxRows() { return this.max; }
    insertRowsAfter(_, n) { this.max += n; }
    setFrozenRows() {}
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i += 1) {
            const row = [];
            for (let j = 0; j < nc; j += 1) row.push(((self.rows[r - 1 + i] || [])[c - 1 + j]) ?? '');
            out.push(row);
          }
          return out;
        },
        setValues(values) {
          values.forEach((row, i) => {
            row.forEach((v, j) => {
              rawWrites.push(v);
              while (self.rows.length <= r - 1 + i) self.rows.push([]);
              const target = self.rows[r - 1 + i];
              while (target.length <= c - 1 + j) target.push('');
              target[c - 1 + j] = unquote(v);
            });
          });
          return this;
        },
        setNumberFormat() { return this; },
        setFontWeight() { return this; },
      };
    }
  }
  const sheets = new Map();
  const book = {
    getId: () => 'book-1',
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name),
  };
  const logs = [];
  const sandbox = {
    console,
    Logger: { log: (m) => logs.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book, openById: () => book, flush() {},
      getUi() { throw new Error('tanpa UI'); },
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (raw.has(k) ? raw.get(k) : null),
      setProperty: (k, v) => raw.set(k, String(v)),
      deleteProperty: (k) => raw.delete(k),
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (a, t) => [...crypto.createHash('sha256').update(t).digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8'), sandbox);
  const post = (body) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { sandbox, post, sheets, raw, logs, rawWrites, pin() { return logs.join('\n').match(/PIN Anda: (\d{6})/)[1]; } };
}

function serve(gas, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method !== 'POST') { res.end('{}'); return; }
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(gas.sandbox.doPost({ postData: { contents: body } }).text);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

module.exports = { createGas, serve };
