/* Komunikasi dengan GAS. Isi dikirim sebagai text/plain agar tidak perlu preflight CORS. */
(function (root) {
  const Store = root.GM.Store;
  const { TABLES } = root.GM.Schema;
  const BATCH = 200;
  let running = false;
  let timer = null;
  let interval = null;
  const listeners = new Set();
  const status = { phase: 'idle', sent: 0, total: 0, error: '', lastAt: null };

  const set = (patch) => { Object.assign(status, patch); listeners.forEach((fn) => fn()); };

  async function call(url, body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      const err = new Error('Tidak bisa menghubungi server. Periksa internet atau alamat Web App.');
      err.code = 'NETWORK';
      throw err;
    }
    let data;
    try { data = await res.json(); } catch (e) {
      const err = new Error('Alamat Web App tidak menjawab dengan benar. Pastikan aksesnya diatur ke "Anyone".');
      err.code = 'BAD_RESPONSE';
      throw err;
    }
    if (!data.ok) {
      const err = new Error(data.error || 'Server menolak permintaan.');
      err.code = data.code;
      throw err;
    }
    return data;
  }

  const api = (body) => call(Store.meta('api_url'), { ...body, token: Store.meta('token'), device_id: Store.meta('device_id') });

  async function pushAll() {
    await Store.retryFailed();
    const queue = Store.outboxEntries().filter(([, v]) => v.state === 'pending');
    set({ phase: 'mengirim', sent: 0, total: queue.length });
    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH).map(([k, v]) => ({ k, table: v.table, updated_at: v.updated_at, row: Store.rawRow(v.table, v.id) }));
      const res = await api({ action: 'push', rows: batch.map((b) => {
        const { _rev, ...row } = b.row;
        return { table: b.table, row };
      }) });
      await Store.settleOutbox(batch.map((b, idx) => ({ k: b.k, updated_at: b.row.updated_at, status: res.results[idx].status, error: res.results[idx].error })));
      set({ sent: Math.min(i + BATCH, queue.length) });
    }
  }

  async function pullAll() {
    set({ phase: 'mengambil' });
    let since = Number(Store.meta('last_rev') || 0);
    for (;;) {
      const res = await api({ action: 'pull', since });
      await Store.applyRemote(res.rows);
      since = res.next;
      await Store.setMeta('last_rev', since);
      if (!res.hasMore) break;
    }
  }

  async function run() {
    if (running || Store.meta('mode') !== 'online' || !Store.meta('token')) return false;
    if (!navigator.onLine) { set({ phase: 'offline', error: '' }); return false; }
    running = true;
    try {
      const server = await call(Store.meta('api_url'), { action: 'ping' });
      await Store.setMeta('server_version', server.version);
      await pushAll();
      await pullAll();
      const failed = Store.outboxEntries().filter(([, v]) => v.state === 'failed').length;
      set({ phase: 'idle', error: failed ? `${failed} baris gagal dikirim.` : '', lastAt: new Date().toISOString() });
      await Store.setMeta('last_sync', status.lastAt);
      return true;
    } catch (e) {
      if (e.code === 'AUTH') {
        await Store.setMeta('token', null);
        set({ phase: 'perlu-login', error: e.message });
      } else if (e.code === 'NETWORK') {
        set({ phase: 'offline', error: '' });
      } else {
        set({ phase: 'gagal', error: e.message });
      }
      return false;
    } finally {
      running = false;
    }
  }

  function schedule(delay = 2500) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  function start() {
    window.addEventListener('online', () => schedule(500));
    window.addEventListener('offline', () => set({ phase: 'offline', error: '' }));
    clearInterval(interval);
    interval = setInterval(run, 5 * 60 * 1000);
    schedule(300);
  }

  async function connect(url, pin) {
    const res = await call(url, { action: 'login', pin, device_id: Store.meta('device_id') });
    return res.token;
  }

  root.GM.Sync = {
    run, schedule, start, connect, status,
    changePin: (oldPin, newPin) => api({ action: 'changePin', old_pin: oldPin, new_pin: newPin }),
    logout: () => api({ action: 'logout' }).catch(() => null),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    TABLES,
  };
})(window);
