/* Penyimpanan di perangkat. Semua data dimuat ke memori saat aplikasi dibuka,
   setiap perubahan ditulis ke IndexedDB bersama antrean sinkronisasi dalam satu transaksi. */
(function (root) {
  const { TABLES, REFS, SAMPLE_MARK } = root.GM.Schema;
  const DB_NAME = 'guru-mapel';
  const STORES = ['rows', 'meta', 'outbox', 'snapshots'];

  let idb = null;
  let persistent = false;
  const tables = {};
  const meta = new Map();
  const outbox = new Map();
  const snapshots = new Map();
  const listeners = new Set();
  Object.keys(TABLES).forEach((t) => { tables[t] = new Map(); });

  const reqP = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const txDone = (tx) => new Promise((ok, no) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => no(tx.error);
    tx.onabort = () => no(tx.error);
  });
  const key = (table, id) => `${table}|${id}`;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

  function emit() { listeners.forEach((fn) => fn()); }

  async function open() {
    try {
      idb = await new Promise((ok, no) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => STORES.forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
      });
      const tx = idb.transaction(STORES, 'readonly');
      const load = async (name, fn) => {
        const store = tx.objectStore(name);
        const [keys, vals] = await Promise.all([reqP(store.getAllKeys()), reqP(store.getAll())]);
        keys.forEach((k, i) => fn(k, vals[i]));
      };
      await Promise.all([
        load('rows', (k, v) => { const [t, ...id] = k.split('|'); if (tables[t]) tables[t].set(id.join('|'), v); }),
        load('meta', (k, v) => meta.set(k, v)),
        load('outbox', (k, v) => outbox.set(k, v)),
        load('snapshots', (k, v) => snapshots.set(k, v)),
      ]);
      persistent = true;
    } catch (e) {
      idb = null;
      persistent = false;
    }
    if (!meta.get('device_id')) await setMeta('device_id', uuid());
    return persistent;
  }

  async function write(fn) {
    if (!idb) return;
    const tx = idb.transaction(STORES, 'readwrite');
    fn(tx);
    await txDone(tx);
  }

  async function setMeta(k, v) {
    if (v === undefined || v === null) meta.delete(k); else meta.set(k, v);
    await write((tx) => {
      if (v === undefined || v === null) tx.objectStore('meta').delete(k); else tx.objectStore('meta').put(v, k);
    });
    emit();
  }

  /** changes: [{table, row}] berisi baris utuh. */
  async function commit(changes, opts = {}) {
    if (!changes.length) return null;
    const now = opts.stamp || new Date().toISOString();
    const device = meta.get('device_id');
    const useOutbox = meta.get('mode') === 'online';
    const saved = changes.map(({ table, row }) => {
      const id = row[TABLES[table].pk];
      const next = { ...row, updated_at: now, device_id: device, deleted: row.deleted === '1' ? '1' : '0', created_at: row.created_at || now };
      if (next.id_import === undefined) next.id_import = '';
      return { table, id, row: next };
    });
    saved.forEach(({ table, id, row }) => {
      tables[table].set(id, row);
      if (useOutbox) outbox.set(key(table, id), { table, id, updated_at: now, state: 'pending', error: '' });
    });
    await write((tx) => {
      saved.forEach(({ table, id, row }) => {
        tx.objectStore('rows').put(row, key(table, id));
        if (useOutbox) tx.objectStore('outbox').put(outbox.get(key(table, id)), key(table, id));
      });
      if (opts.snapshot) tx.objectStore('snapshots').put(opts.snapshot, opts.snapshot.id_import);
    });
    if (opts.snapshot) snapshots.set(opts.snapshot.id_import, opts.snapshot);
    emit();
    if (opts.notify !== false && root.GM.Sync) root.GM.Sync.schedule();
    return now;
  }

  /** Data dari server. Baris yang masih menunggu kiriman tidak ditimpa. */
  async function applyRemote(rows) {
    const accepted = rows.filter((r) => tables[r.table] && !outbox.has(key(r.table, r.row[TABLES[r.table].pk])));
    accepted.forEach((r) => tables[r.table].set(r.row[TABLES[r.table].pk], r.row));
    await write((tx) => accepted.forEach((r) => tx.objectStore('rows').put(r.row, key(r.table, r.row[TABLES[r.table].pk]))));
    if (accepted.length) emit();
  }

  /** results: [{k, updated_at, status, error}] */
  async function settleOutbox(results) {
    await write((tx) => {
      const store = tx.objectStore('outbox');
      results.forEach((r) => {
        const entry = outbox.get(r.k);
        if (!entry) return;
        if (r.status === 'failed') {
          const next = { ...entry, state: 'failed', error: r.error || 'Gagal disimpan.' };
          outbox.set(r.k, next);
          store.put(next, r.k);
        } else if (entry.updated_at === r.updated_at) {
          outbox.delete(r.k);
          store.delete(r.k);
        }
      });
    });
    emit();
  }

  async function retryFailed() {
    const failed = [...outbox.entries()].filter(([, v]) => v.state === 'failed');
    await write((tx) => failed.forEach(([k, v]) => {
      const next = { ...v, state: 'pending', error: '' };
      outbox.set(k, next);
      tx.objectStore('outbox').put(next, k);
    }));
    emit();
  }

  async function clearAll() {
    Object.values(tables).forEach((m) => m.clear());
    const device = meta.get('device_id');
    meta.clear(); outbox.clear(); snapshots.clear();
    if (idb) await write((tx) => STORES.forEach((s) => tx.objectStore(s).clear()));
    await setMeta('device_id', device);
  }

  const get = (table, id) => { const r = tables[table].get(id); return r && r.deleted !== '1' ? r : null; };
  const active = (table) => [...tables[table].values()].filter((r) => r.deleted !== '1');
  const snapshotDb = () => {
    const out = {};
    Object.keys(TABLES).forEach((t) => { out[t] = active(t).map((r) => ({ ...r })); });
    return out;
  };

  /** Dari kumpulan baris yang akan dihapus, pisahkan yang masih dipakai data lain. */
  function splitDeletable(targets) {
    const wanted = new Set(targets.map((t) => key(t.table, t.id)));
    let changed = true;
    while (changed) {
      changed = false;
      targets.forEach((t) => {
        const k = key(t.table, t.id);
        if (!wanted.has(k)) return;
        const used = (REFS[t.table] || []).some(([child, col]) => active(child)
          .some((row) => row[col] === t.id && !wanted.has(key(child, row[TABLES[child].pk]))));
        if (used) { wanted.delete(k); changed = true; }
      });
    }
    return {
      ok: targets.filter((t) => wanted.has(key(t.table, t.id))),
      blocked: targets.filter((t) => !wanted.has(key(t.table, t.id))),
    };
  }

  const softDelete = (list) => commit(list.map((t) => ({ table: t.table, row: { ...tables[t.table].get(t.id), deleted: '1' } })));

  async function undoImport(idImport) {
    const snap = snapshots.get(idImport);
    if (!snap) return { error: 'Riwayat pembatalan ada di perangkat yang dipakai saat import.' };
    const rowsNow = (table, id) => tables[table].get(id);
    const untouched = (table, id) => { const r = rowsNow(table, id); return r && r.updated_at === snap.stamp; };
    const changedLater = [];
    const created = [];
    snap.created.forEach((c) => {
      const row = rowsNow(c.table, c.id);
      if (!row || row.deleted === '1') return;
      if (untouched(c.table, c.id)) created.push(c); else changedLater.push(c);
    });
    const { ok, blocked } = splitDeletable(created);
    const restore = [];
    snap.updated.forEach((u) => {
      const id = u.before[TABLES[u.table].pk];
      if (untouched(u.table, id)) restore.push({ table: u.table, row: { ...u.before } });
      else changedLater.push({ table: u.table, id });
    });
    const log = get('ImportLog', idImport);
    const changes = [
      ...ok.map((t) => ({ table: t.table, row: { ...tables[t.table].get(t.id), deleted: '1' } })),
      ...restore,
    ];
    if (log) changes.push({ table: 'ImportLog', row: { ...log, status: 'dibatalkan' } });
    await commit(changes);
    return { removed: ok.length, restored: restore.length, kept: blocked.length + changedLater.length };
  }

  async function removeSamples() {
    const list = [];
    Object.keys(TABLES).forEach((t) => {
      if (t === 'ImportLog' || t === 'Pengaturan') return;
      active(t).filter((r) => r.id_import === SAMPLE_MARK).forEach((r) => list.push({ table: t, id: r[TABLES[t].pk] }));
    });
    const { ok, blocked } = splitDeletable(list);
    await softDelete(ok);
    return { removed: ok.length, kept: blocked.length };
  }

  root.GM.Store = {
    open, commit, applyRemote, settleOutbox, retryFailed, clearAll, get, active, snapshotDb, splitDeletable, softDelete,
    undoImport, removeSamples, uuid, setMeta, key,
    meta: (k) => meta.get(k),
    rawRow: (t, id) => tables[t].get(id),
    outboxEntries: () => [...outbox.entries()],
    outboxCount: () => outbox.size,
    hasSnapshot: (id) => snapshots.has(id),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isPersistent: () => persistent,
    setting(k, fallback = '') { const r = get('Pengaturan', k); return r ? r.value : fallback; },
    saveSettings(obj) {
      return commit(Object.entries(obj).map(([k, value]) => ({ table: 'Pengaturan', row: { ...(tables.Pengaturan.get(k) || {}), key: k, value: String(value) } })));
    },
  };
})(window);
