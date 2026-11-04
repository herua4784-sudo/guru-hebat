/* Tampilan aplikasi. Memakai React + htm, jadi tidak perlu proses build. */
(function (root) {
  const { useState, useEffect, useMemo, useRef, useCallback, createElement } = React;
  const html = htm.bind(createElement);
  const { Store, Sync, Importer, Sample, Schema, Teaching } = root.GM;
  const { HARI, SAMPLE_MARK } = Schema;
  const { KINDS, fold, activeYear, yearLabel } = Importer;
  const DEMO_BUILD = !!root.GM_DEMO;
  const DEMO_PIN = '123456';
  const CONFIG = root.APP_CONFIG || {};
  const num = (n) => Number(n).toLocaleString('id-ID');

  /* ---------- Bantuan umum ---------- */
  const useStoreVersion = () => {
    const [, setV] = useState(0);
    useEffect(() => {
      const bump = () => setV((x) => x + 1);
      const a = Store.subscribe(bump);
      const b = Sync.subscribe(bump);
      return () => { a(); b(); };
    }, []);
  };

  const bytesHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function derivePin(pin, saltHex) {
    const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return bytesHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256));
  }
  async function saveVerifier(pin) {
    const salt = bytesHex(crypto.getRandomValues(new Uint8Array(16)));
    await Store.setMeta('pin_salt', salt);
    await Store.setMeta('pin_hash', await derivePin(pin, salt));
  }
  const pinValid = (p) => /^\d{6}$/.test(p) && !/^(\d)\1{5}$/.test(p) && p !== '123456' && p !== '654321';

  function saveBook(wb, name, toast) {
    if (DEMO_BUILD) { toast('Unduhan aktif setelah aplikasi dipasang di GitHub Pages.', 'info'); return; }
    XLSX.writeFile(wb, name);
  }

  async function seedSamples() {
    await Store.commit(Sample.build().map((c) => ({ table: c.table, row: { ...c.row, id_import: SAMPLE_MARK } })));
  }
  async function seedDefaults() {
    await Store.saveSettings({ default_kktp: '75', default_bobot_formatif: '40', default_bobot_sumatif: '60' });
  }
  async function startDemo() {
    await Store.setMeta('mode', 'demo');
    await saveVerifier(DEMO_PIN);
    await seedDefaults();
    await Store.saveSettings({ nama_guru: 'Guru Contoh', sekolah: 'Sekolah Contoh' });
    await seedSamples();
  }

  /* Model tampilan */
  function views() {
    const year = Store.active('TahunAjaran').find((t) => t.aktif === '1') || null;
    const mapel = new Map(Store.active('Mapel').map((m) => [m.id_mapel, m]));
    const kelas = new Map(Store.active('Kelas').map((k) => [k.id_kelas, k]));
    const tahun = new Map(Store.active('TahunAjaran').map((t) => [t.id_tahun, t]));
    const ampu = Store.active('Pengampuan');
    const ampuMap = new Map(ampu.map((p) => [p.id_pengampuan, p]));
    const anggota = Store.active('AnggotaKelas').filter((a) => year && a.id_tahun === year.id_tahun);
    const kelasOf = new Map(anggota.map((a) => [a.id_siswa, a.id_kelas]));
    const siswaAktif = new Set(Store.active('Siswa').filter((s) => s.status === 'Aktif').map((s) => s.id_siswa));
    const countKelas = (id) => anggota.filter((a) => a.id_kelas === id && siswaAktif.has(a.id_siswa)).length;
    const ampuLabel = (p) => `${(mapel.get(p.id_mapel) || {}).nama_mapel || '?'} · ${(kelas.get(p.id_kelas) || {}).nama_kelas || '?'}`;
    return { year, mapel, kelas, tahun, ampu, ampuMap, anggota, kelasOf, countKelas, ampuLabel };
  }

  /* ---------- Komponen dasar ---------- */
  const Icon = ({ name }) => {
    const paths = {
      home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
      data: 'M5 4h14v16H5zM9 4v16M5 9h4M5 14h4',
      gear: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
      lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z',
      upload: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14',
      plus: 'M12 5v14M5 12h14',
      x: 'M6 6l12 12M18 6 6 18',
      sync: 'M4 11a8 8 0 0 1 14-4l2 2M20 5v4h-4M20 13a8 8 0 0 1-14 4l-2-2M4 19v-4h4',
      down: 'M12 5v11M7.5 11.5 12 16l4.5-4.5M5 20h14',
      check: 'M5 5h14v15H5zM9 3v4M15 3v4M8.5 13l2.5 2.5 4.5-5',
      pen: 'M5 19l1-4L16 5l3 3L9 18zM14 7l3 3',
    };
    return html`<svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${paths[name]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>`;
  };

  function Modal({ title, onClose, children, wide, footer }) {
    const ref = useRef(null);
    useEffect(() => {
      const prev = document.activeElement;
      if (ref.current) ref.current.focus();
      const key = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', key);
      return () => { document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
    }, []);
    return html`<div className="overlay" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className=${`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title} tabIndex="-1" ref=${ref}>
        <header className="modal-head"><h2>${title}</h2><button className="icon-btn" onClick=${onClose} aria-label="Tutup"><${Icon} name="x"/></button></header>
        <div className="modal-body">${children}</div>
        ${footer ? html`<footer className="modal-foot">${footer}</footer>` : null}
      </div>
    </div>`;
  }

  function Confirm({ title, text, action, danger, onCancel, onConfirm }) {
    const [busy, setBusy] = useState(false);
    return html`<${Modal} title=${title} onClose=${onCancel} footer=${html`
      <button className="btn ghost" onClick=${onCancel}>Batal</button>
      <button className=${`btn ${danger ? 'danger' : 'primary'}`} disabled=${busy} onClick=${async () => { setBusy(true); await onConfirm(); }}>${action}</button>`}>
      <p className="lead">${text}</p>
    <//>`;
  }

  function Toasts({ items }) {
    return html`<div className="toasts" role="status" aria-live="polite">${items.map((t) => html`<div key=${t.id} className=${`toast ${t.type}`}>${t.text}</div>`)}</div>`;
  }

  /* ---------- Masuk ---------- */
  function PinField({ id, label, value, onChange, autoFocus }) {
    return html`<label className="field" htmlFor=${id}><span>${label}</span>
      <input id=${id} className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength="6" value=${value} autoFocus=${autoFocus}
        onInput=${(e) => onChange(e.target.value.replace(/\D/g, ''))}/></label>`;
  }

  const Brand = () => html`<div className="brand-mark"><span className="brand-box">GM</span><div><strong>Guru Mapel</strong><small>Buku kerja guru mata pelajaran</small></div></div>`;

  function Connect({ onDone }) {
    const [url, setUrl] = useState(CONFIG.API_URL || '');
    const [pin, setPin] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState('');
    const submit = async (e) => {
      e.preventDefault();
      setErr('');
      const clean = url.trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(clean) && !CONFIG.ALLOW_ANY_URL) { setErr('Alamat Web App harus diakhiri /exec. Salin dari menu Deploy di Apps Script.'); return; }
      if (pin.length !== 6) { setErr('PIN terdiri dari 6 angka.'); return; }
      setBusy('Memeriksa PIN…');
      try {
        const token = await Sync.connect(clean, pin);
        await Store.setMeta('api_url', clean);
        await Store.setMeta('token', token);
        await Store.setMeta('mode', 'online');
        await saveVerifier(pin);
        setBusy('Mengambil data dari Spreadsheet…');
        await Sync.run();
        if (!Store.setting('default_kktp')) await seedDefaults();
        onDone();
      } catch (ex) { setErr(ex.message); setBusy(''); }
    };
    const demo = async () => { setBusy('Menyiapkan data contoh…'); await startDemo(); onDone(); };
    return html`<main className="gate"><form className="gate-card" onSubmit=${submit}>
      <${Brand}/>
      <h1>Hubungkan ke Spreadsheet</h1>
      <p className="muted">Sekali saja di setiap perangkat. Setelah itu aplikasi bisa dibuka tanpa internet.</p>
      <label className="field" htmlFor="api-url"><span>Alamat Web App</span>
        <input id="api-url" type="url" inputMode="url" placeholder="https://script.google.com/macros/s/…/exec" value=${url} onInput=${(e) => setUrl(e.target.value)}/></label>
      <${PinField} id="connect-pin" label="PIN" value=${pin} onChange=${setPin}/>
      ${err ? html`<p className="form-error" role="alert">${err}</p>` : null}
      <button className="btn primary block" disabled=${!!busy}>${busy || 'Hubungkan'}</button>
      <button type="button" className="btn ghost block" disabled=${!!busy} onClick=${demo}>Coba dengan data contoh</button>
    </form></main>`;
  }

  function Unlock({ onDone, toast }) {
    const [pin, setPin] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const fails = useRef(0);
    const waitUntil = useRef(0);
    const isDemo = Store.meta('mode') === 'demo';
    useEffect(() => {
      if (pin.length !== 6 || busy) return;
      (async () => {
        if (Date.now() < waitUntil.current) { setErr(`Tunggu ${Math.ceil((waitUntil.current - Date.now()) / 1000)} detik sebelum mencoba lagi.`); setPin(''); return; }
        setBusy(true);
        const hash = await derivePin(pin, Store.meta('pin_salt'));
        setBusy(false);
        if (hash === Store.meta('pin_hash')) { onDone(); return; }
        fails.current += 1;
        if (fails.current >= 5) { waitUntil.current = Date.now() + 30000; fails.current = 0; }
        setErr('PIN salah.');
        setPin('');
      })();
    }, [pin]);
    return html`<main className="gate"><div className="gate-card">
      <${Brand}/>
      <h1>Masukkan PIN</h1>
      ${isDemo ? html`<p className="demo-note">Versi coba. PIN: <b className="mono">${DEMO_PIN}</b></p>` : null}
      <${PinField} id="unlock-pin" label="PIN 6 angka" value=${pin} onChange=${(v) => { setErr(''); setPin(v); }} autoFocus=${true}/>
      ${err ? html`<p className="form-error" role="alert">${err}</p>` : null}
      <p className="muted small">${busy ? 'Memeriksa…' : 'PIN terbuka otomatis setelah angka keenam.'}</p>
    </div></main>`;
  }

  /* ---------- Status sinkron ---------- */
  function syncInfo() {
    const mode = Store.meta('mode');
    const s = Sync.status;
    const pending = Store.outboxCount();
    if (mode === 'demo') return { tone: 'neutral', label: 'Mode contoh', detail: 'Data hanya ada di perangkat ini' };
    if (s.phase === 'mengirim') return { tone: 'busy', label: 'Mengirim', detail: `${num(s.sent)} dari ${num(s.total)} baris` };
    if (s.phase === 'mengambil') return { tone: 'busy', label: 'Mengambil data', detail: 'Dari Spreadsheet' };
    if (s.phase === 'perlu-login') return { tone: 'bad', label: 'Perlu PIN', detail: s.error };
    if (s.error) return { tone: 'bad', label: 'Sinkron gagal', detail: s.error };
    if (s.phase === 'offline' || !navigator.onLine) return { tone: 'warn', label: 'Offline', detail: pending ? `${num(pending)} baris menunggu` : 'Semua data aman di perangkat' };
    if (pending) return { tone: 'warn', label: 'Menunggu kirim', detail: `${num(pending)} baris` };
    return { tone: 'good', label: 'Tersimpan', detail: Store.meta('last_sync') ? `Sinkron ${new Date(Store.meta('last_sync')).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Terhubung' };
  }
  const SyncPill = () => { const i = syncInfo(); return html`<span className=${`sync-pill ${i.tone}`}><i></i>${i.label}</span>`; };

  /* ---------- Beranda ---------- */
  function Home({ go, openImport, ask, toast, openSession }) {
    const v = views();
    const today = new Date();
    const hari = HARI[(today.getDay() + 6) % 7];
    const jadwal = Store.active('Jadwal').filter((j) => { const p = v.ampuMap.get(j.id_pengampuan); return p && v.year && p.id_tahun === v.year.id_tahun; });
    const hariIni = jadwal.filter((j) => j.hari === hari).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
    const nextDay = () => {
      for (let i = 1; i <= 7; i += 1) {
        const h = HARI[(HARI.indexOf(hari) + i) % 7];
        if (jadwal.some((j) => j.hari === h)) return h;
      }
      return null;
    };
    const siswaKelas = v.anggota.length;
    const db = Store.snapshotDb();
    const todayKey = Teaching.ymd(today);
    const pendingWork = v.year ? Teaching.reminders(db, v.year.id_tahun, todayKey) : [];
    const checks = [
      ['Tahun ajaran aktif', v.year ? yearLabel(v.year) : 'Belum dipilih', !!v.year, 'tahun'],
      ['Mapel', `${num(Store.active('Mapel').length)} mapel`, Store.active('Mapel').length > 0, 'mapel'],
      ['Kelas', `${num(Store.active('Kelas').length)} kelas`, Store.active('Kelas').length > 0, 'kelas'],
      ['Siswa', `${num(siswaKelas)} siswa di kelas`, siswaKelas > 0, 'siswa'],
      ['Pengampuan', `${num(v.ampu.filter((p) => v.year && p.id_tahun === v.year.id_tahun).length)} mapel-kelas`, v.ampu.some((p) => v.year && p.id_tahun === v.year.id_tahun), 'pengampuan'],
      ['Jadwal', `${num(jadwal.length)} jam mengajar`, jadwal.length > 0, 'jadwal'],
    ];
    const hasSamples = Schema.META_COLS && Object.keys(Schema.TABLES).some((t) => t !== 'ImportLog' && Store.active(t).some((r) => r.id_import === SAMPLE_MARK));
    const info = syncInfo();
    const nama = Store.setting('nama_guru');
    const removeSamples = () => ask({
      title: 'Hapus data contoh?', text: 'Semua baris bertanda Contoh akan dihapus. Data yang Anda isi sendiri tetap ada.', action: 'Hapus data contoh', danger: true,
      onConfirm: async () => { const r = await Store.removeSamples(); toast(r.kept ? `${num(r.removed)} baris dihapus. ${num(r.kept)} baris dipertahankan karena masih dipakai data Anda.` : `${num(r.removed)} baris contoh dihapus.`); },
    });
    return html`<div className="page">
      <header className="page-head">
        <div><p className="eyebrow">${today.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1>${nama ? `Selamat bekerja, ${nama}` : 'Selamat bekerja'}</h1></div>
        <button className="btn primary" onClick=${() => openImport('lengkap')}><${Icon} name="upload"/>Import Lengkap</button>
      </header>
      ${hasSamples ? html`<div className="sample-bar"><p><b>Ini data contoh.</b> Mapel, kelas, siswa, dan jadwal di sini fiktif.</p>
        <button className="btn small ghost" onClick=${removeSamples}>Hapus data contoh</button></div>` : null}
      <div className="home-grid">
        <section className="panel schedule">
          <div className="panel-head"><h2>Jadwal ${hari}</h2><span className="muted small">${hariIni.length ? `${num(hariIni.length)} jam mengajar` : ''}</span></div>
          ${hariIni.length ? html`<ol className="timeline">${hariIni.map((j) => {
            const p = v.ampuMap.get(j.id_pengampuan);
            const st = Teaching.sessionStatus(db, p.id_pengampuan, todayKey);
            const s = { id_pengampuan: p.id_pengampuan, tanggal: todayKey };
            return html`<li key=${j.id_jadwal}><span className="mono time">${j.jam_mulai}<small>${j.jam_selesai}</small></span>
              <div><strong>${(v.mapel.get(p.id_mapel) || {}).nama_mapel}</strong><span className="muted">Kelas ${(v.kelas.get(p.id_kelas) || {}).nama_kelas} · ${num(v.countKelas(p.id_kelas))} siswa${j.jam_ke ? ` · Jam ${j.jam_ke}` : ''}</span>
              <div className="task-btns">
                <button className=${st.presensi ? 'done' : ''} onClick=${() => openSession('presensi', s)}>${st.presensi ? '✓ ' : ''}Presensi</button>
                <button className=${st.jurnal ? 'done' : ''} onClick=${() => openSession('jurnal', s)}>${st.jurnal ? '✓ ' : ''}Jurnal</button>
              </div></div></li>`;
          })}</ol>` : html`<div className="empty"><p>Tidak ada jadwal hari ini.</p>${nextDay() ? html`<p className="muted small">Jadwal berikutnya hari ${nextDay()}.</p>` : html`<button className="btn small ghost" onClick=${() => go('data', 'jadwal')}>Isi jadwal</button>`}</div>`}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Kesiapan data</h2><span className="muted small">${checks.filter((c) => c[2]).length} dari ${checks.length}</span></div>
          <ul className="checks">${checks.map(([label, val, ok, tab]) => html`<li key=${label}><button onClick=${() => go('data', tab)}>
            <span className=${`dot ${ok ? 'ok' : ''}`} aria-hidden="true">${ok ? '✓' : ''}</span><span>${label}</span><span className="muted">${val}</span></button></li>`)}</ul>
        </section>
        ${pendingWork.length ? html`<section className="panel">
          <div className="panel-head"><h2>Perlu dilengkapi</h2><span className="muted small">7 hari terakhir</span></div>
          <ul className="todo">${pendingWork.slice(0, 5).map((w) => html`<li key=${`${w.id_pengampuan}|${w.tanggal}`}><button onClick=${() => openSession(w.presensi ? 'jurnal' : 'presensi', { id_pengampuan: w.id_pengampuan, tanggal: w.tanggal })}>
            <span><b>${v.ampuLabel(v.ampuMap.get(w.id_pengampuan))}</b><small className="muted">${shortDate(w.tanggal)}</small></span>
            <span className="chip cek">${!w.presensi && !w.jurnal ? 'Presensi, jurnal' : (w.presensi ? 'Jurnal' : 'Presensi')}</span></button></li>`)}</ul>
          ${pendingWork.length > 5 ? html`<p className="muted small">Ada ${num(pendingWork.length - 5)} lagi.</p>` : null}
          <p className="muted small">Abaikan jika hari itu libur atau tidak ada pelajaran.</p>
        </section>` : null}
        <section className="panel sync-panel">
          <div className="panel-head"><h2>Sinkronisasi</h2><span className=${`sync-pill ${info.tone}`}><i></i>${info.label}</span></div>
          <p className="muted">${info.detail}</p>
          ${Store.meta('mode') === 'online' ? html`<button className="btn ghost small" onClick=${() => Sync.run()}><${Icon} name="sync"/>Sinkron sekarang</button>` : null}
        </section>
      </div>
    </div>`;
  }

  /* ---------- Data Master ---------- */
  const TABS = [['tahun', 'Tahun Ajaran'], ['mapel', 'Mapel'], ['kelas', 'Kelas'], ['siswa', 'Siswa'], ['pengampuan', 'Pengampuan'], ['jadwal', 'Jadwal']];
  const SampleTag = ({ row }) => (row.id_import === SAMPLE_MARK ? html`<span className="tag">Contoh</span>` : null);

  function tabModel(tab, v) {
    const byName = (a, b, k) => String(a[k]).localeCompare(String(b[k]), 'id');
    switch (tab) {
      case 'tahun': return {
        table: 'TahunAjaran', pk: 'id_tahun',
        rows: Store.active('TahunAjaran').sort((a, b) => b.tahun.localeCompare(a.tahun) || a.semester.localeCompare(b.semester)),
        cols: [['Tahun ajaran', (r) => html`<b>${r.tahun}</b> <${SampleTag} row=${r}/>`], ['Semester', (r) => r.semester], ['Status', (r) => (r.aktif === '1' ? html`<span className="chip baru">Aktif</span>` : html`<span className="chip sama">Tidak aktif</span>`)]],
        search: (r) => `${r.tahun} ${r.semester}`, empty: 'Tambahkan tahun ajaran, misalnya 2026/2027 Ganjil.',
      };
      case 'mapel': return {
        table: 'Mapel', pk: 'id_mapel', rows: Store.active('Mapel').sort((a, b) => byName(a, b, 'nama_mapel')),
        cols: [['Nama mapel', (r) => html`<b>${r.nama_mapel}</b> <${SampleTag} row=${r}/>`], ['Kode', (r) => html`<span className="mono">${r.kode || '–'}</span>`], ['Dipakai di', (r) => `${num(v.ampu.filter((p) => p.id_mapel === r.id_mapel).length)} kelas`]],
        search: (r) => `${r.nama_mapel} ${r.kode}`, empty: 'Tambahkan mapel yang diajar.',
      };
      case 'kelas': return {
        table: 'Kelas', pk: 'id_kelas', rows: Store.active('Kelas').sort((a, b) => byName(a, b, 'nama_kelas')),
        cols: [['Kelas', (r) => html`<b>${r.nama_kelas}</b> <${SampleTag} row=${r}/>`], ['Tingkat', (r) => r.tingkat], ['Siswa aktif', (r) => num(v.countKelas(r.id_kelas))]],
        search: (r) => `${r.nama_kelas} ${r.tingkat}`, empty: 'Tambahkan kelas yang diajar.',
      };
      case 'siswa': return {
        table: 'Siswa', pk: 'id_siswa', rows: Store.active('Siswa').sort((a, b) => byName(a, b, 'nama')), filterKelas: true,
        cols: [['Nama', (r) => html`<b>${r.nama}</b> <${SampleTag} row=${r}/>`], ['Kelas', (r) => (v.kelas.get(v.kelasOf.get(r.id_siswa)) || {}).nama_kelas || '–'], ['NISN', (r) => html`<span className="mono">${r.nisn || '–'}</span>`], ['NIS', (r) => html`<span className="mono">${r.nis || '–'}</span>`], ['JK', (r) => r.jk], ['Status', (r) => r.status]],
        search: (r) => `${r.nama} ${r.nisn} ${r.nis}`, empty: 'Import daftar siswa dari Excel sekolah.',
      };
      case 'pengampuan': return {
        table: 'Pengampuan', pk: 'id_pengampuan', rows: v.ampu.slice().sort((a, b) => v.ampuLabel(a).localeCompare(v.ampuLabel(b), 'id')),
        cols: [['Mapel', (r) => html`<b>${(v.mapel.get(r.id_mapel) || {}).nama_mapel || '?'}</b> <${SampleTag} row=${r}/>`], ['Kelas', (r) => (v.kelas.get(r.id_kelas) || {}).nama_kelas || '?'], ['Tahun', (r) => { const t = v.tahun.get(r.id_tahun); return t ? yearLabel(t) : '?'; }], ['KKTP', (r) => r.kktp], ['Formatif : Sumatif', (r) => html`<span className="mono">${r.bobot_formatif} : ${r.bobot_sumatif}</span>`]],
        search: (r) => v.ampuLabel(r), empty: 'Hubungkan mapel dengan kelas yang diajar.',
      };
      default: return {
        table: 'Jadwal', pk: 'id_jadwal',
        rows: Store.active('Jadwal').filter((j) => { const p = v.ampuMap.get(j.id_pengampuan); return p && v.year && p.id_tahun === v.year.id_tahun; })
          .sort((a, b) => HARI.indexOf(a.hari) - HARI.indexOf(b.hari) || a.jam_mulai.localeCompare(b.jam_mulai)),
        cols: [['Hari', (r) => html`<b>${r.hari}</b> <${SampleTag} row=${r}/>`], ['Waktu', (r) => html`<span className="mono">${r.jam_mulai}–${r.jam_selesai}</span>`], ['Jam ke', (r) => r.jam_ke || '–'], ['Mapel · Kelas', (r) => { const p = v.ampuMap.get(r.id_pengampuan); return p ? v.ampuLabel(p) : '?'; }]],
        search: (r) => { const p = v.ampuMap.get(r.id_pengampuan); return `${r.hari} ${p ? v.ampuLabel(p) : ''}`; }, empty: 'Tambahkan jam mengajar tahun ajaran aktif.',
      };
    }
  }

  function formModel(tab, row, v) {
    const isNew = !row;
    const dup = (list, fn, id) => list.some((r) => fn(r) && r !== id);
    const kelasOpts = Store.active('Kelas').sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas, 'id')).map((k) => [k.id_kelas, k.nama_kelas]);
    switch (tab) {
      case 'tahun': return {
        title: isNew ? 'Tambah tahun ajaran' : 'Ubah tahun ajaran',
        fields: [{ key: 'tahun', label: 'Tahun ajaran', placeholder: '2026/2027' }, { key: 'semester', label: 'Semester', type: 'select', options: [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] }, { key: 'aktif', label: 'Status', type: 'select', options: [['1', 'Aktif'], ['0', 'Tidak aktif']] }],
        initial: row || { tahun: '', semester: 'Ganjil', aktif: v.year ? '0' : '1' },
        async save(d) {
          if (!/^\d{4}\/\d{4}$/.test(d.tahun.trim())) return 'Tahun harus seperti 2026/2027.';
          if (Store.active('TahunAjaran').some((t) => t.tahun === d.tahun.trim() && t.semester === d.semester && t.id_tahun !== (row && row.id_tahun))) return 'Tahun ajaran dan semester ini sudah ada.';
          const id = row ? row.id_tahun : Store.uuid();
          const ch = [{ table: 'TahunAjaran', row: { ...(row || {}), id_tahun: id, tahun: d.tahun.trim(), semester: d.semester, aktif: d.aktif } }];
          if (d.aktif === '1') Store.active('TahunAjaran').filter((t) => t.aktif === '1' && t.id_tahun !== id).forEach((t) => ch.push({ table: 'TahunAjaran', row: { ...t, aktif: '0' } }));
          await Store.commit(ch);
          return null;
        },
      };
      case 'mapel': return {
        title: isNew ? 'Tambah mapel' : 'Ubah mapel',
        fields: [{ key: 'nama_mapel', label: 'Nama mapel' }, { key: 'kode', label: 'Kode (boleh kosong)' }],
        initial: row || { nama_mapel: '', kode: '' },
        async save(d) {
          const nama = d.nama_mapel.trim();
          if (!nama) return 'Nama mapel wajib diisi.';
          if (Store.active('Mapel').some((m) => fold(m.nama_mapel) === fold(nama) && m.id_mapel !== (row && row.id_mapel))) return 'Mapel ini sudah ada.';
          await Store.commit([{ table: 'Mapel', row: { ...(row || {}), id_mapel: row ? row.id_mapel : Store.uuid(), nama_mapel: nama, kode: d.kode.trim() } }]);
          return null;
        },
      };
      case 'kelas': return {
        title: isNew ? 'Tambah kelas' : 'Ubah kelas',
        fields: [{ key: 'nama_kelas', label: 'Nama kelas', placeholder: 'VII-A' }, { key: 'tingkat', label: 'Tingkat', placeholder: 'VII' }],
        initial: row || { nama_kelas: '', tingkat: '' },
        async save(d) {
          const nama = d.nama_kelas.trim();
          const tingkat = d.tingkat.trim() || Importer.guessTingkat(nama);
          if (!nama) return 'Nama kelas wajib diisi.';
          if (!tingkat) return 'Tingkat wajib diisi.';
          if (Store.active('Kelas').some((k) => fold(k.nama_kelas) === fold(nama) && k.id_kelas !== (row && row.id_kelas))) return 'Kelas ini sudah ada.';
          await Store.commit([{ table: 'Kelas', row: { ...(row || {}), id_kelas: row ? row.id_kelas : Store.uuid(), nama_kelas: nama, tingkat } }]);
          return null;
        },
      };
      case 'siswa': return {
        title: isNew ? 'Tambah siswa' : 'Ubah siswa',
        fields: [{ key: 'nama', label: 'Nama lengkap' }, { key: 'nisn', label: 'NISN', mode: 'numeric' }, { key: 'nis', label: 'NIS' },
          { key: 'jk', label: 'Jenis kelamin', type: 'select', options: [['L', 'Laki-laki'], ['P', 'Perempuan']] },
          { key: 'id_kelas', label: v.year ? `Kelas (${yearLabel(v.year)})` : 'Kelas', type: 'select', options: [['', 'Pilih kelas'], ...kelasOpts] },
          { key: 'status', label: 'Status', type: 'select', options: ['Aktif', 'Pindah', 'Lulus', 'Keluar'].map((s) => [s, s]) }],
        initial: row ? { ...row, id_kelas: v.kelasOf.get(row.id_siswa) || '' } : { nama: '', nisn: '', nis: '', jk: 'L', id_kelas: '', status: 'Aktif' },
        async save(d) {
          const nama = d.nama.trim(); const nisn = d.nisn.trim(); const nis = d.nis.trim();
          const id = row ? row.id_siswa : Store.uuid();
          if (!nama) return 'Nama wajib diisi.';
          if (nisn && !/^\d{10}$/.test(nisn)) return 'NISN harus 10 angka.';
          if (!v.year) return 'Pilih tahun ajaran aktif dulu.';
          if (!d.id_kelas) return 'Pilih kelas.';
          const others = Store.active('Siswa').filter((s) => s.id_siswa !== id);
          if (nisn && others.some((s) => s.nisn === nisn)) return 'NISN ini sudah dipakai siswa lain.';
          if (nis && others.some((s) => s.nis === nis)) return 'NIS ini sudah dipakai siswa lain.';
          const ch = [{ table: 'Siswa', row: { ...(row || {}), id_siswa: id, nama, nisn, nis, jk: d.jk, status: d.status } }];
          const member = v.anggota.find((a) => a.id_siswa === id);
          if (!member) ch.push({ table: 'AnggotaKelas', row: { id_anggota: Store.uuid(), id_tahun: v.year.id_tahun, id_kelas: d.id_kelas, id_siswa: id } });
          else if (member.id_kelas !== d.id_kelas) ch.push({ table: 'AnggotaKelas', row: { ...member, id_kelas: d.id_kelas } });
          await Store.commit(ch);
          return null;
        },
      };
      case 'pengampuan': return {
        title: isNew ? 'Tambah pengampuan' : 'Ubah pengampuan',
        fields: [{ key: 'id_tahun', label: 'Tahun ajaran', type: 'select', options: [['', 'Pilih tahun'], ...Store.active('TahunAjaran').map((t) => [t.id_tahun, yearLabel(t)])] },
          { key: 'id_mapel', label: 'Mapel', type: 'select', options: [['', 'Pilih mapel'], ...Store.active('Mapel').map((m) => [m.id_mapel, m.nama_mapel])] },
          { key: 'id_kelas', label: 'Kelas', type: 'select', options: [['', 'Pilih kelas'], ...kelasOpts] },
          { key: 'kktp', label: 'KKTP', mode: 'decimal' }, { key: 'bobot_formatif', label: 'Bobot formatif (%)', mode: 'decimal' }, { key: 'bobot_sumatif', label: 'Bobot sumatif (%)', mode: 'decimal' }],
        initial: row || { id_tahun: v.year ? v.year.id_tahun : '', id_mapel: '', id_kelas: '', kktp: Store.setting('default_kktp', '75'), bobot_formatif: Store.setting('default_bobot_formatif', '40'), bobot_sumatif: Store.setting('default_bobot_sumatif', '60') },
        async save(d) {
          if (!d.id_tahun || !d.id_mapel || !d.id_kelas) return 'Pilih tahun, mapel, dan kelas.';
          const n = (x) => Number(String(x).replace(',', '.'));
          if (![d.kktp, d.bobot_formatif, d.bobot_sumatif].every((x) => String(x).trim() !== '' && n(x) >= 0 && n(x) <= 100)) return 'KKTP dan bobot harus angka 0 sampai 100.';
          if (n(d.bobot_formatif) + n(d.bobot_sumatif) !== 100) return 'Bobot formatif dan sumatif harus berjumlah 100.';
          if (Store.active('Pengampuan').some((p) => p.id_tahun === d.id_tahun && p.id_mapel === d.id_mapel && p.id_kelas === d.id_kelas && p.id_pengampuan !== (row && row.id_pengampuan))) return 'Pengampuan ini sudah ada.';
          await Store.commit([{ table: 'Pengampuan', row: { ...(row || {}), id_pengampuan: row ? row.id_pengampuan : Store.uuid(), id_tahun: d.id_tahun, id_mapel: d.id_mapel, id_kelas: d.id_kelas, kktp: String(n(d.kktp)), bobot_formatif: String(n(d.bobot_formatif)), bobot_sumatif: String(n(d.bobot_sumatif)) } }]);
          return null;
        },
      };
      default: {
        const opts = v.ampu.filter((p) => v.year && p.id_tahun === v.year.id_tahun).map((p) => [p.id_pengampuan, v.ampuLabel(p)]);
        return {
          title: isNew ? 'Tambah jadwal' : 'Ubah jadwal',
          fields: [{ key: 'id_pengampuan', label: 'Mapel dan kelas', type: 'select', options: [['', 'Pilih'], ...opts] }, { key: 'hari', label: 'Hari', type: 'select', options: HARI.map((h) => [h, h]) },
            { key: 'jam_mulai', label: 'Jam mulai', type: 'time' }, { key: 'jam_selesai', label: 'Jam selesai', type: 'time' }, { key: 'jam_ke', label: 'Jam ke (boleh kosong)', placeholder: '1-2' }],
          initial: row || { id_pengampuan: '', hari: 'Senin', jam_mulai: '07:30', jam_selesai: '09:00', jam_ke: '' },
          async save(d) {
            if (!d.id_pengampuan) return 'Pilih mapel dan kelas.';
            if (!d.jam_mulai || !d.jam_selesai || d.jam_mulai >= d.jam_selesai) return 'Jam selesai harus setelah jam mulai.';
            const db = Store.snapshotDb();
            const clash = Importer.findClash(db, d, v.year.id_tahun, row ? row.id_jadwal : null);
            if (clash) return `Bentrok dengan ${Importer.describeJadwal(db, clash)}.`;
            await Store.commit([{ table: 'Jadwal', row: { ...(row || {}), id_jadwal: row ? row.id_jadwal : Store.uuid(), id_pengampuan: d.id_pengampuan, hari: d.hari, jam_mulai: d.jam_mulai, jam_selesai: d.jam_selesai, jam_ke: d.jam_ke.trim() } }]);
            return null;
          },
        };
      }
    }
  }

  function FormModal({ model, onClose, toast }) {
    const [data, setData] = useState({ ...model.initial });
    const [err, setErr] = useState('');
    const submit = async (e) => {
      e.preventDefault();
      const message = await model.save(data);
      if (message) { setErr(message); return; }
      toast('Tersimpan.');
      onClose();
    };
    return html`<${Modal} title=${model.title} onClose=${onClose}>
      <form className="form-grid" onSubmit=${submit}>
        ${model.fields.map((f) => html`<label key=${f.key} className="field" htmlFor=${`f-${f.key}`}><span>${f.label}</span>
          ${f.type === 'select'
            ? html`<select id=${`f-${f.key}`} value=${data[f.key] || ''} onChange=${(e) => setData({ ...data, [f.key]: e.target.value })}>${f.options.map(([val, l]) => html`<option key=${val} value=${val}>${l}</option>`)}</select>`
            : html`<input id=${`f-${f.key}`} type=${f.type || 'text'} inputMode=${f.mode} placeholder=${f.placeholder} value=${data[f.key] || ''} onInput=${(e) => setData({ ...data, [f.key]: e.target.value })}/>`}</label>`)}
        ${err ? html`<p className="form-error full" role="alert">${err}</p>` : null}
        <div className="form-actions full"><button type="button" className="btn ghost" onClick=${onClose}>Batal</button><button className="btn primary">Simpan</button></div>
      </form>
    <//>`;
  }

  function Master({ tab, setTab, openImport, ask, toast }) {
    const v = views();
    const [q, setQ] = useState('');
    const [kelas, setKelas] = useState('');
    const [form, setForm] = useState(null);
    const [limit, setLimit] = useState(100);
    useEffect(() => { setQ(''); setKelas(''); setLimit(100); }, [tab]);
    const model = tabModel(tab, v);
    const filtered = model.rows.filter((r) => (!q || fold(model.search(r)).includes(fold(q))) && (!kelas || v.kelasOf.get(r.id_siswa) === kelas));
    const remove = (row) => {
      const id = row[model.pk];
      ask({
        title: 'Hapus data ini?', text: 'Data akan dihapus dari aplikasi dan Spreadsheet.', action: 'Hapus', danger: true,
        onConfirm: async () => {
          const targets = [{ table: model.table, id }];
          if (tab === 'siswa') Store.active('AnggotaKelas').filter((a) => a.id_siswa === id).forEach((a) => targets.push({ table: 'AnggotaKelas', id: a.id_anggota }));
          const res = Store.splitDeletable(targets);
          if (res.blocked.length) { toast('Tidak bisa dihapus karena masih dipakai data lain.', 'bad'); return; }
          await Store.softDelete(res.ok);
          toast('Terhapus.');
        },
      });
    };
    const activate = async (row) => {
      await Store.commit([{ table: 'TahunAjaran', row: { ...row, aktif: '1' } }, ...Store.active('TahunAjaran').filter((t) => t.aktif === '1').map((t) => ({ table: 'TahunAjaran', row: { ...t, aktif: '0' } }))]);
      toast(`${yearLabel(row)} menjadi tahun aktif.`);
    };
    const label = TABS.find((t) => t[0] === tab)[1];
    return html`<div className="page">
      <header className="page-head"><div><p className="eyebrow">Data Master</p><h1>${label}</h1></div>
        <div className="head-actions">
          <button className="btn ghost" onClick=${() => saveBook(Importer.template(XLSX, tab), `template-${tab}.xlsx`, toast)}><${Icon} name="down"/>Download Template</button>
          <button className="btn ghost" onClick=${() => openImport(tab)}><${Icon} name="upload"/>Import</button>
          <button className="btn primary" onClick=${() => setForm({ row: null })}><${Icon} name="plus"/>Tambah</button>
        </div></header>
      <nav className="tabs" aria-label="Jenis data">${TABS.map(([id, l]) => html`<button key=${id} className=${id === tab ? 'on' : ''} aria-current=${id === tab ? 'page' : undefined} onClick=${() => setTab(id)}>${l}</button>`)}</nav>
      <div className="tools">
        <input id="master-search" type="search" aria-label=${`Cari ${label}`} placeholder=${`Cari ${label.toLowerCase()}`} value=${q} onInput=${(e) => { setQ(e.target.value); setLimit(100); }}/>
        ${model.filterKelas ? html`<select id="master-kelas" aria-label="Saring kelas" value=${kelas} onChange=${(e) => setKelas(e.target.value)}><option value="">Semua kelas</option>${Store.active('Kelas').map((k) => html`<option key=${k.id_kelas} value=${k.id_kelas}>${k.nama_kelas}</option>`)}</select>` : null}
        <span className="muted small count">${num(filtered.length)} data</span>
      </div>
      ${filtered.length ? html`<div className="sheet"><table>
        <thead><tr><th className="no">No</th>${model.cols.map(([h]) => html`<th key=${h}>${h}</th>`)}<th aria-label="Aksi"></th></tr></thead>
        <tbody>${filtered.slice(0, limit).map((r, i) => html`<tr key=${r[model.pk]}><td className="no mono">${i + 1}</td>
          ${model.cols.map(([h, fn]) => html`<td key=${h} data-label=${h}>${fn(r)}</td>`)}
          <td className="row-actions">
            ${tab === 'tahun' && r.aktif !== '1' ? html`<button className="link" onClick=${() => activate(r)}>Jadikan aktif</button>` : null}
            <button className="link" onClick=${() => setForm({ row: r })}>Ubah</button>
            <button className="link danger" onClick=${() => remove(r)}>Hapus</button></td></tr>`)}</tbody>
      </table></div>
      ${filtered.length > limit ? html`<button className="btn ghost block" onClick=${() => setLimit(limit + 200)}>Tampilkan lebih banyak</button>` : null}`
      : html`<div className="panel empty"><p>${q || kelas ? 'Tidak ada data yang cocok.' : model.empty}</p></div>`}
      ${form ? html`<${FormModal} model=${formModel(tab, form.row, v)} onClose=${() => setForm(null)} toast=${toast}/>` : null}
    </div>`;
  }

  /* ---------- Import ---------- */
  const STATUS_LABEL = { baru: 'Baru', sama: 'Sama', berubah: 'Berubah', cek: 'Perlu dicek', masalah: 'Bermasalah' };

  function ImportModal({ kind, onClose, toast }) {
    const [file, setFile] = useState(null);
    const [parts, setParts] = useState(null);
    const [mode, setMode] = useState('lewati');
    const [confirmed, setConfirmed] = useState(new Set());
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('semua');
    const [done, setDone] = useState(null);
    const [busy, setBusy] = useState(false);
    const [drag, setDrag] = useState(false);
    const isFull = kind === 'lengkap';
    const title = isFull ? 'Import Lengkap' : `Import ${KINDS[kind].label}`;
    const analysis = useMemo(() => (parts ? Importer.analyze(parts, Store.snapshotDb(), { mode, confirmed }) : null), [parts, mode, confirmed]);

    const loadBook = (wb, name) => {
      const p = Importer.readParts(XLSX, wb, kind);
      const missing = p.filter((x) => x.missing.length);
      if (missing.length) { setError(`Kolom wajib belum ada di sheet ${missing[0].sheetName}: ${missing[0].missing.join(', ')}. Gunakan Download Template.`); return; }
      if (!p.some((x) => x.rows.length)) { setError('File tidak berisi baris data.'); return; }
      setError(''); setFile(name); setParts(p); setFilter('semua');
    };
    const onFile = async (f) => {
      if (!f) return;
      if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setError('Pilih file .xlsx atau .csv.'); return; }
      try { loadBook(Importer.readBook(XLSX, await f.arrayBuffer(), f.name), f.name); } catch (e) { setError(e.message || 'File tidak bisa dibaca. Simpan ulang sebagai .xlsx lalu coba lagi.'); }
    };
    const usePractice = () => {
      const bin = XLSX.write(Sample.practiceBook(XLSX), { type: 'array', bookType: 'xlsx' });
      loadBook(XLSX.read(bin, { type: 'array' }), 'file-latihan.xlsx');
    };
    const toggle = (k) => { const s = new Set(confirmed); if (s.has(k)) s.delete(k); else s.add(k); setConfirmed(s); };

    const save = async () => {
      setBusy(true);
      const id = Store.uuid();
      const stamp = new Date().toISOString();
      const ops = analysis.ops;
      const changes = ops.map((op) => ({ table: op.table, row: op.before ? op.row : { ...op.row, id_import: id } }));
      const saved = analysis.parts.flatMap((p) => p.rows.filter((r) => r.saved));
      const baru = saved.filter((r) => r.status !== 'berubah').length;
      const ubah = saved.filter((r) => r.status === 'berubah').length;
      const gagal = analysis.counts.masalah + (analysis.counts.cek - saved.filter((r) => r.status === 'cek').length);
      changes.push({ table: 'ImportLog', row: { id_import: id, tanggal: stamp, jenis_data: isFull ? 'Import Lengkap' : KINDS[kind].label, nama_file: file, jumlah_baru: String(baru), jumlah_diperbarui: String(ubah), jumlah_gagal: String(gagal), status: 'selesai' } });
      const snapshot = { id_import: id, stamp, created: ops.filter((o) => !o.before).map((o) => ({ table: o.table, id: o.row[Schema.TABLES[o.table].pk] })), updated: ops.filter((o) => o.before).map((o) => ({ table: o.table, before: o.before })) };
      await Store.commit(changes, { stamp, snapshot });
      setDone({ baru, ubah, gagal, id });
      setBusy(false);
    };

    if (done) {
      return html`<${Modal} title=${title} onClose=${onClose} footer=${html`
        ${done.gagal ? html`<button className="btn ghost" onClick=${() => saveBook(Importer.problemBook(XLSX, analysis), 'laporan-baris-bermasalah.xlsx', toast)}><${Icon} name="down"/>Unduh laporan</button>` : null}
        <button className="btn primary" onClick=${onClose}>Selesai</button>`}>
        <p className="lead"><b>${num(done.baru + done.ubah)} baris tersimpan</b> di perangkat${Store.meta('mode') === 'online' ? ' dan segera dikirim ke Spreadsheet saat online' : ''}.</p>
        <div className="tiles"><div><b>${num(done.baru)}</b><span>Baru</span></div><div><b>${num(done.ubah)}</b><span>Diperbarui</span></div><div><b>${num(done.gagal)}</b><span>Tidak disimpan</span></div></div>
        <p className="muted small">Import ini bisa dibatalkan dari Pengaturan, bagian Riwayat Import.</p>
      <//>`;
    }

    if (!analysis) {
      return html`<${Modal} title=${title} onClose=${onClose}>
        <label className=${`drop ${drag ? 'over' : ''}`} htmlFor="import-file"
          onDragOver=${(e) => { e.preventDefault(); setDrag(true); }} onDragLeave=${() => setDrag(false)}
          onDrop=${(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
          <${Icon} name="upload"/><b>Pilih file Excel atau CSV</b><span className="muted small">.xlsx atau .csv, maksimal 10 MB. File dibaca di perangkat ini.</span>
          <input id="import-file" type="file" accept=".xlsx,.xls,.csv" onChange=${(e) => onFile(e.target.files[0])}/>
        </label>
        ${error ? html`<p className="form-error" role="alert">${error}</p>` : null}
        <div className="drop-actions">
          <button className="btn ghost" onClick=${() => saveBook(Importer.template(XLSX, kind), `template-${kind}.xlsx`, toast)}><${Icon} name="down"/>Download Template</button>
          ${isFull && Store.meta('mode') === 'demo' ? html`<button className="btn ghost" onClick=${usePractice}>Coba dengan file latihan</button>` : null}
        </div>
        ${isFull ? html`<p className="muted small">Urutan otomatis: ${Importer.ORDER.map((k) => KINDS[k].label).join(', ')}.</p>` : null}
      <//>`;
    }

    const c = analysis.counts;
    const unconfirmed = analysis.parts.flatMap((p) => p.rows.filter((r) => r.status === 'cek' && !r.saved)).length;
    const list = analysis.parts.flatMap((p) => p.rows.map((r) => ({ ...r, part: p })))
      .filter((r) => filter === 'semua' || r.status === filter);
    const willSave = c.disimpan;
    return html`<${Modal} wide=${true} title=${title} onClose=${onClose} footer=${html`
      <span className="muted small foot-note">${num(willSave)} baris akan disimpan</span>
      <button className="btn ghost" onClick=${() => { setParts(null); setFile(null); setConfirmed(new Set()); }}>Ganti file</button>
      <button className="btn primary" disabled=${!willSave || busy} onClick=${save}>Simpan ${num(willSave)} baris</button>`}>
      <p className="muted small file-name">${file}</p>
      <div className="tiles five">${[['semua', 'Semua', c.baru + c.sama + c.berubah + c.cek + c.masalah], ['baru', 'Baru', c.baru], ['sama', 'Sama', c.sama], ['berubah', 'Berubah', c.berubah], ['cek', 'Perlu dicek', c.cek], ['masalah', 'Bermasalah', c.masalah]].map(([k, l, n]) => html`
        <button key=${k} className=${`${filter === k ? 'on' : ''} ${k}`} aria-pressed=${filter === k} onClick=${() => setFilter(k)}><b>${num(n)}</b><span>${l}</span></button>`)}</div>
      ${c.berubah ? html`<fieldset className="mode"><legend>Untuk ${num(c.berubah)} data yang sudah ada dan berbeda</legend>
        <label><input type="radio" name="mode" checked=${mode === 'lewati'} onChange=${() => setMode('lewati')}/> Lewati, data lama tetap</label>
        <label><input type="radio" name="mode" checked=${mode === 'perbarui'} onChange=${() => setMode('perbarui')}/> Perbarui dengan data file</label></fieldset>` : null}
      ${unconfirmed ? html`<p className="note warn">${num(unconfirmed)} baris perlu dicek dan belum ikut disimpan. Centang jika memang siswa baru.</p>` : null}
      <div className="sheet review"><table>
        <thead><tr><th>Sheet</th><th className="no">Baris</th><th>Data</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>${list.slice(0, 300).map((r) => {
          const k = `${r.kind}:${r.no}`;
          return html`<tr key=${k}><td data-label="Sheet">${KINDS[r.kind].label}</td><td className="no mono" data-label="Baris">${r.no}</td>
            <td data-label="Data">${Object.values(r.data).map(Importer.text).filter(Boolean).join(' · ')}</td>
            <td data-label="Status"><span className=${`chip ${r.status}`}>${STATUS_LABEL[r.status]}</span></td>
            <td data-label="Keterangan">${r.errors.concat(r.warnings).map((m) => html`<div key=${m}>${m}</div>`)}
              ${r.changes.map((m) => html`<div key=${m} className="muted">${m}</div>`)}
              ${r.status === 'cek' ? html`<label className="check"><input type="checkbox" checked=${confirmed.has(k)} onChange=${() => toggle(k)}/> Simpan sebagai siswa baru</label>` : null}
              ${r.status === 'baru' && !r.saved ? '' : null}</td></tr>`;
        })}</tbody></table></div>
      ${list.length > 300 ? html`<p className="muted small">Menampilkan 300 dari ${num(list.length)} baris.</p>` : null}
      <div><button className="btn small ghost" disabled=${!(c.masalah || unconfirmed)} onClick=${() => saveBook(Importer.problemBook(XLSX, analysis), 'laporan-baris-bermasalah.xlsx', toast)}><${Icon} name="down"/>Unduh baris bermasalah</button></div>
    <//>`;
  }

  /* ---------- Pengaturan ---------- */
  function Settings({ openImport, ask, toast, onLock, onReset }) {
    const keys = ['nama_guru', 'nip', 'sekolah', 'alamat_sekolah', 'kepala_sekolah', 'default_kktp', 'default_bobot_formatif', 'default_bobot_sumatif'];
    const [form, setForm] = useState(() => Object.fromEntries(keys.map((k) => [k, Store.setting(k)])));
    const [pinModal, setPinModal] = useState(false);
    const mode = Store.meta('mode');
    const info = syncInfo();
    const failed = Store.outboxEntries().filter(([, v]) => v.state === 'failed');
    const logs = Store.active('ImportLog').sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const hasSample = ['Siswa', 'Mapel', 'Kelas'].some((t) => Store.active(t).some((r) => r.id_import === SAMPLE_MARK));
    const field = (k, label, extra = {}) => html`<label className="field" htmlFor=${`s-${k}`} key=${k}><span>${label}</span><input id=${`s-${k}`} value=${form[k]} ...${extra} onInput=${(e) => setForm({ ...form, [k]: e.target.value })}/></label>`;
    const save = async (e) => {
      e.preventDefault();
      const f = Number(form.default_bobot_formatif); const s = Number(form.default_bobot_sumatif);
      if (f + s !== 100) { toast('Bobot formatif dan sumatif harus berjumlah 100.', 'bad'); return; }
      await Store.saveSettings(form);
      toast('Pengaturan tersimpan.');
    };
    const undo = (log) => ask({
      title: 'Batalkan import ini?', text: `${log.nama_file}: data baru dihapus dan data yang diperbarui dikembalikan. Baris yang sudah Anda ubah setelah import tidak disentuh.`, action: 'Batalkan import', danger: true,
      onConfirm: async () => {
        const r = await Store.undoImport(log.id_import);
        if (r.error) toast(r.error, 'bad');
        else toast(`${num(r.removed)} dihapus, ${num(r.restored)} dikembalikan${r.kept ? `, ${num(r.kept)} dipertahankan karena sudah berubah atau masih dipakai` : ''}.`);
      },
    });
    const exportAll = () => {
      const wb = XLSX.utils.book_new();
      Object.keys(Schema.TABLES).forEach((t) => {
        const rows = Store.active(t);
        if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t);
      });
      if (!wb.SheetNames.length) { toast('Belum ada data.', 'bad'); return; }
      saveBook(wb, `salinan-guru-mapel-${new Date().toISOString().slice(0, 10)}.xlsx`, toast);
    };
    const signOut = () => ask({
      title: mode === 'demo' ? 'Keluar dari mode contoh?' : 'Keluar dari perangkat ini?',
      text: Store.outboxCount() ? `${num(Store.outboxCount())} baris belum terkirim dan akan hilang dari perangkat ini.` : 'Data di perangkat ini dihapus. Data di Spreadsheet tetap aman.',
      action: 'Keluar', danger: true,
      onConfirm: async () => { if (mode === 'online' && navigator.onLine) await Sync.logout(); await Store.clearAll(); onReset(); },
    });
    return html`<div className="page narrow">
      <header className="page-head"><div><p className="eyebrow">Pengaturan</p><h1>Pengaturan</h1></div></header>
      ${!Store.isPersistent() ? html`<p className="note warn">Browser ini tidak mengizinkan penyimpanan. Data akan hilang saat halaman ditutup.</p>` : null}
      <form className="panel" onSubmit=${save}>
        <div className="panel-head"><h2>Identitas dan nilai</h2></div>
        <div className="form-grid">
          ${field('nama_guru', 'Nama guru')}${field('nip', 'NIP', { inputMode: 'numeric' })}${field('sekolah', 'Nama sekolah')}${field('kepala_sekolah', 'Kepala sekolah')}
          <div className="full">${field('alamat_sekolah', 'Alamat sekolah (untuk kop laporan)')}</div>
          ${field('default_kktp', 'KKTP bawaan', { inputMode: 'decimal' })}${field('default_bobot_formatif', 'Bobot formatif bawaan (%)', { inputMode: 'decimal' })}${field('default_bobot_sumatif', 'Bobot sumatif bawaan (%)', { inputMode: 'decimal' })}
          <div className="form-actions full"><button className="btn primary">Simpan pengaturan</button></div>
        </div>
      </form>
      <section className="panel">
        <div className="panel-head"><h2>Sinkronisasi</h2><span className=${`sync-pill ${info.tone}`}><i></i>${info.label}</span></div>
        <p className="muted">${info.detail}</p>
        ${failed.length ? html`<ul className="fail-list">${failed.slice(0, 20).map(([k, v]) => html`<li key=${k}>${v.table}: ${v.error}</li>`)}</ul>` : null}
        <div className="row-btns">
          ${mode === 'online' ? html`<button className="btn ghost small" onClick=${() => Sync.run()}><${Icon} name="sync"/>Sinkron sekarang</button>` : null}
          <button className="btn ghost small" onClick=${exportAll}><${Icon} name="down"/>Unduh salinan data (Excel)</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Import Lengkap</h2></div>
        <p className="muted">Satu file Excel untuk mengisi tahun ajaran, mapel, kelas, siswa, pengampuan, dan jadwal sekaligus.</p>
        <div className="row-btns"><button className="btn primary small" onClick=${() => openImport('lengkap')}><${Icon} name="upload"/>Import Lengkap</button>
        <button className="btn ghost small" onClick=${() => saveBook(Importer.template(XLSX, 'lengkap'), 'template-import-lengkap.xlsx', toast)}><${Icon} name="down"/>Download Template</button></div>
        <h3>Riwayat Import</h3>
        ${logs.length ? html`<ul className="logs">${logs.slice(0, 30).map((l) => html`<li key=${l.id_import}><div><b>${l.nama_file}</b>
          <span className="muted small">${l.jenis_data} · ${new Date(l.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          <span className="muted small">${l.jumlah_baru} baru · ${l.jumlah_diperbarui} diperbarui · ${l.jumlah_gagal} tidak disimpan</span></div>
          ${l.status === 'dibatalkan' ? html`<span className="chip sama">Dibatalkan</span>` : (Store.hasSnapshot(l.id_import) ? html`<button className="link danger" onClick=${() => undo(l)}>Batalkan</button>` : html`<span className="muted small">Bisa dibatalkan di perangkat asal</span>`)}</li>`)}</ul>` : html`<p className="muted small">Belum ada import.</p>`}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Data contoh</h2></div>
        <div className="row-btns">
          ${hasSample ? html`<button className="btn ghost small" onClick=${() => ask({ title: 'Hapus data contoh?', text: 'Hanya baris bertanda Contoh yang dihapus.', action: 'Hapus data contoh', danger: true, onConfirm: async () => { const r = await Store.removeSamples(); toast(`${num(r.removed)} baris dihapus${r.kept ? `, ${num(r.kept)} dipertahankan karena masih dipakai` : ''}.`); } })}>Hapus data contoh</button>`
          : html`<button className="btn ghost small" onClick=${async () => { await seedSamples(); toast('Data contoh dimuat.'); }}>Muat data contoh</button>`}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Keamanan</h2></div>
        <div className="row-btns">
          <button className="btn ghost small" onClick=${() => setPinModal(true)}>Ganti PIN</button>
          <button className="btn ghost small" onClick=${onLock}><${Icon} name="lock"/>Kunci aplikasi</button>
          <button className="btn ghost small danger-text" onClick=${signOut}>${mode === 'demo' ? 'Keluar dari mode contoh' : 'Keluar dari perangkat ini'}</button>
        </div>
      </section>
      ${pinModal ? html`<${PinModal} onClose=${() => setPinModal(false)} toast=${toast}/>` : null}
    </div>`;
  }

  function PinModal({ onClose, toast }) {
    const [a, setA] = useState(''); const [b, setB] = useState(''); const [c, setC] = useState('');
    const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const submit = async (e) => {
      e.preventDefault();
      setErr('');
      if (!pinValid(b)) { setErr('PIN baru harus 6 angka dan tidak mudah ditebak.'); return; }
      if (b !== c) { setErr('Ulangi PIN baru dengan angka yang sama.'); return; }
      setBusy(true);
      try {
        if ((await derivePin(a, Store.meta('pin_salt'))) !== Store.meta('pin_hash')) throw new Error('PIN lama salah.');
        if (Store.meta('mode') === 'online') {
          if (!navigator.onLine) throw new Error('Ganti PIN perlu internet.');
          const res = await Sync.changePin(a, b);
          await Store.setMeta('token', res.token);
        }
        await saveVerifier(b);
        toast('PIN diganti.');
        onClose();
      } catch (ex) { setErr(ex.message); setBusy(false); }
    };
    return html`<${Modal} title="Ganti PIN" onClose=${onClose}><form className="form-stack" onSubmit=${submit}>
      <${PinField} id="pin-old" label="PIN lama" value=${a} onChange=${setA}/>
      <${PinField} id="pin-new" label="PIN baru" value=${b} onChange=${setB}/>
      <${PinField} id="pin-new2" label="Ulangi PIN baru" value=${c} onChange=${setC}/>
      ${err ? html`<p className="form-error" role="alert">${err}</p>` : null}
      <div className="form-actions"><button type="button" className="btn ghost" onClick=${onClose}>Batal</button><button className="btn primary" disabled=${busy}>Simpan PIN</button></div>
    </form><//>`;
  }

  function Relogin({ onDone }) {
    const [pin, setPin] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const submit = async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try {
        const token = await Sync.connect(Store.meta('api_url'), pin);
        await Store.setMeta('token', token);
        await saveVerifier(pin);
        onDone();
        Sync.run();
      } catch (ex) { setErr(ex.message); setBusy(false); }
    };
    return html`<${Modal} title="Masukkan PIN untuk sinkron" onClose=${onDone}><form className="form-stack" onSubmit=${submit}>
      <p className="muted">Sesi di perangkat ini berakhir. Data Anda tetap aman dan akan dikirim setelah PIN benar.</p>
      <${PinField} id="relogin-pin" label="PIN" value=${pin} onChange=${setPin} autoFocus=${true}/>
      ${err ? html`<p className="form-error" role="alert">${err}</p>` : null}
      <div className="form-actions"><button className="btn primary" disabled=${busy || pin.length !== 6}>Sambungkan</button></div>
    </form><//>`;
  }

  /* ---------- Presensi dan Jurnal ---------- */
  const unsaved = { current: false };

  function teachingContext() {
    const v = views();
    const db = Store.snapshotDb();
    const list = v.ampu.filter((p) => v.year && p.id_tahun === v.year.id_tahun)
      .sort((a, b) => v.ampuLabel(a).localeCompare(v.ampuLabel(b), 'id'));
    return { v, db, list };
  }
  const longDate = (t) => Teaching.parseYmd(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = (t) => Teaching.parseYmd(t).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const percent = (n) => (n === null ? '–' : `${n.toLocaleString('id-ID')}%`);
  const jadwalOn = (db, list, tanggal) => {
    const ids = new Set(list.map((p) => p.id_pengampuan));
    const hari = Teaching.hariOf(tanggal);
    return db.Jadwal.filter((j) => j.hari === hari && ids.has(j.id_pengampuan)).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
  };

  function defaultSession() {
    const { db, list } = teachingContext();
    const tanggal = Teaching.ymd(new Date());
    const first = jadwalOn(db, list, tanggal)[0];
    return { tanggal, id_pengampuan: first ? first.id_pengampuan : (list[0] ? list[0].id_pengampuan : '') };
  }

  function SessionPicker({ session, onChange }) {
    const { v, db, list } = teachingContext();
    const today = Teaching.ymd(new Date());
    const onDay = jadwalOn(db, list, session.tanggal);
    return html`<section className="picker">
      <div className="picker-fields">
        <label className="field" htmlFor="sesi-tanggal"><span>Tanggal</span>
          <input id="sesi-tanggal" type="date" max=${today} value=${session.tanggal} onChange=${(e) => { if (e.target.value) onChange({ ...session, tanggal: e.target.value }); }}/></label>
        <label className="field" htmlFor="sesi-ampu"><span>Mapel dan kelas</span>
          <select id="sesi-ampu" value=${session.id_pengampuan} onChange=${(e) => onChange({ ...session, id_pengampuan: e.target.value })}>
            ${list.map((p) => html`<option key=${p.id_pengampuan} value=${p.id_pengampuan}>${v.ampuLabel(p)}</option>`)}
          </select></label>
      </div>
      ${onDay.length ? html`<div className="day-chips" aria-label="Jadwal pada tanggal ini">${onDay.map((j) => html`
        <button key=${j.id_jadwal} className=${j.id_pengampuan === session.id_pengampuan ? 'on' : ''} onClick=${() => onChange({ ...session, id_pengampuan: j.id_pengampuan })}>
          <span className="mono">${j.jam_mulai}</span>${v.ampuLabel(v.ampuMap.get(j.id_pengampuan))}</button>`)}</div>`
      : html`<p className="muted small">Tidak ada jadwal pada ${Teaching.hariOf(session.tanggal)}. Presensi tetap bisa diisi untuk jam pengganti.</p>`}
    </section>`;
  }

  const SubTabs = ({ tabs, value, onChange }) => html`<nav className="tabs" aria-label="Bagian">${tabs.map(([id, l]) => html`
    <button key=${id} className=${id === value ? 'on' : ''} aria-current=${id === value ? 'page' : undefined} onClick=${() => onChange(id)}>${l}</button>`)}</nav>`;

  const NeedSetup = ({ go }) => html`<div className="panel empty"><p>Belum ada Pengampuan pada tahun ajaran aktif.</p>
    <button className="btn small ghost" onClick=${() => go('data', 'pengampuan')}>Isi Pengampuan</button></div>`;

  function PresensiForm({ ampu, tanggal, ask, toast }) {
    const { db } = teachingContext();
    const idPt = Teaching.pertemuanId(ampu.id_pengampuan, tanggal);
    const students = useMemo(() => Teaching.roster(db, ampu, idPt), [idPt]);
    const initial = useMemo(() => {
      const saved = new Map(db.Presensi.filter((p) => p.id_pertemuan === idPt).map((p) => [p.id_siswa, p]));
      return Object.fromEntries(students.map((s) => {
        const r = saved.get(s.id_siswa);
        return [s.id_siswa, { status: r ? r.status : 'Hadir', keterangan: r ? r.keterangan || '' : '' }];
      }));
    }, [idPt]);
    const [form, setForm] = useState(initial);
    const [dirty, setDirty] = useState(false);
    const st = Teaching.sessionStatus(db, ampu.id_pengampuan, tanggal);
    useEffect(() => { unsaved.current = dirty; return () => { unsaved.current = false; }; }, [dirty]);
    const change = (id, patch) => { setForm((f) => ({ ...f, [id]: { ...f[id], ...patch } })); setDirty(true); };
    const allPresent = () => { setForm(Object.fromEntries(students.map((s) => [s.id_siswa, { status: 'Hadir', keterangan: '' }]))); setDirty(true); };
    const save = async () => {
      const entries = students.map((s) => ({ id_siswa: s.id_siswa, ...form[s.id_siswa] }));
      await Store.commit(Teaching.savePresensi(Store.snapshotDb(), ampu, tanggal, entries));
      setDirty(false);
      toast('Presensi tersimpan.');
    };
    const remove = () => ask({
      title: 'Hapus pertemuan ini?', text: 'Presensi dan jurnal pada pertemuan ini akan dihapus.', action: 'Hapus pertemuan', danger: true,
      onConfirm: async () => { const c = Teaching.deleteSession(Store.snapshotDb(), idPt); await Store.commit(c); setForm(Object.fromEntries(students.map((s) => [s.id_siswa, { status: 'Hadir', keterangan: '' }]))); setDirty(false); toast('Pertemuan dihapus.'); },
    });
    if (!students.length) return html`<div className="panel empty"><p>Belum ada siswa aktif di kelas ini.</p></div>`;
    const counts = Teaching.STATUS.map((s) => [s, Object.values(form).filter((x) => x.status === s).length]);
    return html`<div className="stack">
      <div className="tools"><p className="muted small grow">${st.pertemuan ? `Pertemuan ke-${st.pertemuan.pertemuan_ke}` : 'Pertemuan baru'} · ${num(students.length)} siswa · ${st.presensi ? 'Sudah tersimpan' : 'Belum disimpan'}</p>
        <button className="btn small ghost" onClick=${allPresent}>Semua hadir</button></div>
      <ol className="attendance">${students.map((s, i) => {
        const f = form[s.id_siswa];
        return html`<li key=${s.id_siswa}>
          <span className="mono no-cell">${i + 1}</span>
          <div className="att-name"><b>${s.nama}</b>${s.status !== 'Aktif' ? html`<span className="muted small">${s.status}</span>` : null}</div>
          <div className="seg" role="radiogroup" aria-label=${`Kehadiran ${s.nama}`}>${Teaching.STATUS.map((x) => html`
            <button key=${x} role="radio" aria-checked=${f.status === x} title=${x} className=${f.status === x ? `on ${x.toLowerCase()}` : ''} onClick=${() => change(s.id_siswa, { status: x })}>${x[0]}</button>`)}</div>
          ${f.status !== 'Hadir' ? html`<input className="att-note" id=${`ket-${s.id_siswa}`} aria-label=${`Keterangan ${s.nama}`} placeholder="Keterangan (boleh kosong)" value=${f.keterangan} onInput=${(e) => change(s.id_siswa, { keterangan: e.target.value })}/>` : null}
        </li>`;
      })}</ol>
      <div className="save-bar">
        <div className="tally">${counts.map(([k, n]) => html`<span key=${k}><b>${num(n)}</b> ${k}</span>`)}</div>
        ${st.presensi ? html`<button className="link danger" onClick=${remove}>Hapus pertemuan</button>` : null}
        <button className="btn primary" disabled=${st.presensi && !dirty} onClick=${save}>Simpan presensi</button>
      </div>
    </div>`;
  }

  function RecapView({ session, toast }) {
    const { v, db, list } = teachingContext();
    const [id, setId] = useState(session.id_pengampuan);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const ampu = v.ampuMap.get(id);
    const data = ampu ? Teaching.recap(db, ampu, from, to) : null;
    const exportRecap = () => {
      const rows = [['No', 'Nama', 'NISN', ...Teaching.STATUS, 'Tercatat', '% Hadir'], ...data.rows.map((r, i) => [i + 1, r.nama, r.nisn, r.Hadir, r.Sakit, r.Izin, r.Alpa, r.total, r.persen === null ? '' : r.persen])];
      rows.push(['', 'Rekap kelas', '', data.kelas.Hadir, data.kelas.Sakit, data.kelas.Izin, data.kelas.Alpa, data.kelas.total, data.kelas.persen === null ? '' : data.kelas.persen]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Rekap Presensi');
      saveBook(wb, `rekap-presensi-${v.ampuLabel(ampu).replace(/[^\w-]+/g, '-')}.xlsx`, toast);
    };
    return html`<div className="stack">
      <div className="recap-tools">
        <label className="field" htmlFor="rekap-ampu"><span>Mapel dan kelas</span><select id="rekap-ampu" value=${id} onChange=${(e) => setId(e.target.value)}>${list.map((p) => html`<option key=${p.id_pengampuan} value=${p.id_pengampuan}>${v.ampuLabel(p)}</option>`)}</select></label>
        <label className="field" htmlFor="rekap-dari"><span>Dari tanggal</span><input id="rekap-dari" type="date" value=${from} onChange=${(e) => setFrom(e.target.value)}/></label>
        <label className="field" htmlFor="rekap-sampai"><span>Sampai tanggal</span><input id="rekap-sampai" type="date" value=${to} onChange=${(e) => setTo(e.target.value)}/></label>
      </div>
      ${data ? html`<div className="tiles recap-tiles"><div><b>${num(data.sessions)}</b><span>Pertemuan</span></div><div><b>${percent(data.kelas.persen)}</b><span>Hadir kelas</span></div>
        <div><b>${num(data.kelas.Sakit + data.kelas.Izin)}</b><span>Sakit dan izin</span></div><div className="masalah"><b>${num(data.kelas.Alpa)}</b><span>Alpa</span></div></div>
      ${data.sessions ? html`<div className="sheet"><table className="recap-table"><thead><tr><th className="no">No</th><th>Nama</th><th className="num">H</th><th className="num">S</th><th className="num">I</th><th className="num">A</th><th className="num">% Hadir</th></tr></thead>
        <tbody>${data.rows.map((r, i) => html`<tr key=${r.id_siswa}><td className="no mono">${i + 1}</td><td>${r.nama}</td><td className="num">${r.Hadir}</td><td className="num">${r.Sakit}</td><td className="num">${r.Izin}</td><td className=${`num ${r.Alpa ? 'alert' : ''}`}>${r.Alpa}</td><td className="num">${percent(r.persen)}</td></tr>`)}</tbody></table></div>
        <div><button className="btn small ghost" onClick=${exportRecap}><${Icon} name="down"/>Unduh rekap (Excel)</button></div>`
      : html`<div className="panel empty"><p>Belum ada pertemuan pada rentang ini.</p></div>`}` : null}
    </div>`;
  }

  function PresensiPage({ session, setSession, ask, toast, go, guard }) {
    const { v, list } = teachingContext();
    const [tab, setTab] = useState('isi');
    const ampu = v.ampuMap.get(session.id_pengampuan);
    const label = ampu ? v.ampuLabel(ampu) : '';
    return html`<div className="page"><header className="page-head"><div><p className="eyebrow">${longDate(session.tanggal)}</p><h1>Presensi${label ? ` ${label}` : ''}</h1></div></header>
      ${list.length ? html`<${SubTabs} tabs=${[['isi', 'Isi presensi'], ['rekap', 'Rekap']]} value=${tab} onChange=${(t) => guard(() => setTab(t))}/>
      ${tab === 'isi' ? html`<${SessionPicker} session=${session} onChange=${(s) => guard(() => setSession(s))}/>
        ${ampu ? html`<${PresensiForm} key=${`${session.id_pengampuan}|${session.tanggal}`} ampu=${ampu} tanggal=${session.tanggal} ask=${ask} toast=${toast}/>` : null}`
      : html`<${RecapView} session=${session} toast=${toast}/>`}` : html`<${NeedSetup} go=${go}/>`}
    </div>`;
  }

  function JurnalForm({ ampu, tanggal, toast, onOpenPresensi }) {
    const { v, db } = teachingContext();
    const st = Teaching.sessionStatus(db, ampu.id_pengampuan, tanggal);
    const old = db.Jurnal.find((j) => j.id_pertemuan === st.id);
    const [form, setForm] = useState({ materi: old ? old.materi : '', kegiatan: old ? old.kegiatan : '', catatan: old ? old.catatan : '' });
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState('');
    useEffect(() => { unsaved.current = dirty; return () => { unsaved.current = false; }; }, [dirty]);
    const set = (k, val) => { setForm((f) => ({ ...f, [k]: val })); setDirty(true); };
    const save = async (e) => {
      e.preventDefault();
      if (!form.materi.trim()) { setErr('Materi wajib diisi.'); return; }
      setErr('');
      await Store.commit(Teaching.saveJurnal(Store.snapshotDb(), ampu, tanggal, form));
      setDirty(false);
      toast('Jurnal tersimpan.');
    };
    const hari = Teaching.hariOf(tanggal);
    const jam = db.Jadwal.filter((j) => j.id_pengampuan === ampu.id_pengampuan && j.hari === hari).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai))[0];
    const siswa = new Map(db.Siswa.map((s) => [s.id_siswa, s]));
    const absent = Teaching.absent(db, st.id);
    return html`<form className="stack" onSubmit=${save}>
      <dl className="facts">
        <div><dt>Kelas</dt><dd>${(v.kelas.get(ampu.id_kelas) || {}).nama_kelas}</dd></div>
        <div><dt>Jam</dt><dd>${jam ? `${jam.jam_mulai}–${jam.jam_selesai}${jam.jam_ke ? `, jam ${jam.jam_ke}` : ''}` : 'Di luar jadwal'}</dd></div>
        <div><dt>Pertemuan ke</dt><dd>${st.pertemuan ? st.pertemuan.pertemuan_ke : 'Baru'}</dd></div>
        <div className="wide"><dt>Tidak hadir</dt><dd>${st.presensi
          ? (absent.length ? absent.map((a) => `${(siswa.get(a.id_siswa) || {}).nama || '?'} (${a.status[0]})`).join(', ') : 'Semua hadir')
          : html`<button type="button" className="link" onClick=${onOpenPresensi}>Presensi belum diisi</button>`}</dd></div>
      </dl>
      <label className="field" htmlFor="jurnal-materi"><span>Materi</span><textarea id="jurnal-materi" rows="2" value=${form.materi} onInput=${(e) => set('materi', e.target.value)}></textarea></label>
      <label className="field" htmlFor="jurnal-kegiatan"><span>Kegiatan pembelajaran</span><textarea id="jurnal-kegiatan" rows="4" value=${form.kegiatan} onInput=${(e) => set('kegiatan', e.target.value)}></textarea></label>
      <label className="field" htmlFor="jurnal-catatan"><span>Catatan kelas</span><textarea id="jurnal-catatan" rows="3" value=${form.catatan} onInput=${(e) => set('catatan', e.target.value)}></textarea></label>
      ${err ? html`<p className="form-error" role="alert">${err}</p>` : null}
      <div className="form-actions"><button className="btn primary" disabled=${!!old && !dirty}>Simpan jurnal</button></div>
    </form>`;
  }

  function JurnalHistory({ onOpen, toast }) {
    const { v, db, list } = teachingContext();
    const [id, setId] = useState('');
    const allowed = new Set(list.map((p) => p.id_pengampuan));
    const rows = db.Pertemuan.filter((p) => allowed.has(p.id_pengampuan) && (!id || p.id_pengampuan === id)).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const jurnal = new Map(db.Jurnal.map((j) => [j.id_pertemuan, j]));
    const siswa = new Map(db.Siswa.map((s) => [s.id_siswa, s]));
    const names = (p) => Teaching.absent(db, p.id_pertemuan).map((a) => `${(siswa.get(a.id_siswa) || {}).nama || '?'} (${a.status[0]})`).join(', ');
    const exportAll = () => {
      const data = [['Tanggal', 'Mapel · Kelas', 'Pertemuan ke', 'Materi', 'Kegiatan', 'Catatan', 'Tidak hadir']];
      rows.slice().reverse().forEach((p) => { const j = jurnal.get(p.id_pertemuan) || {}; data.push([p.tanggal, v.ampuLabel(v.ampuMap.get(p.id_pengampuan)), Number(p.pertemuan_ke), j.materi || '', j.kegiatan || '', j.catatan || '', names(p)]); });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Jurnal Mengajar');
      saveBook(wb, 'jurnal-mengajar.xlsx', toast);
    };
    return html`<div className="stack">
      <div className="tools"><select id="riwayat-ampu" aria-label="Saring mapel dan kelas" value=${id} onChange=${(e) => setId(e.target.value)}><option value="">Semua mapel dan kelas</option>${list.map((p) => html`<option key=${p.id_pengampuan} value=${p.id_pengampuan}>${v.ampuLabel(p)}</option>`)}</select>
        <span className="muted small grow">${num(rows.length)} pertemuan</span>${rows.length ? html`<button className="btn small ghost" onClick=${exportAll}><${Icon} name="down"/>Unduh (Excel)</button>` : null}</div>
      ${rows.length ? html`<ul className="history">${rows.map((p) => {
        const j = jurnal.get(p.id_pertemuan);
        const a = names(p);
        return html`<li key=${p.id_pertemuan}><button onClick=${() => onOpen({ id_pengampuan: p.id_pengampuan, tanggal: p.tanggal })}>
          <span className="history-head"><b>${v.ampuLabel(v.ampuMap.get(p.id_pengampuan))}</b>${j ? null : html`<span className="chip cek">Jurnal belum diisi</span>`}</span>
          <span className="muted small">${shortDate(p.tanggal)} · Pertemuan ${p.pertemuan_ke}</span>
          ${j ? html`<span>${j.materi}</span>` : null}${a ? html`<span className="muted small">Tidak hadir: ${a}</span>` : null}</button></li>`;
      })}</ul>` : html`<div className="panel empty"><p>Pertemuan akan muncul di sini setelah presensi atau jurnal disimpan.</p></div>`}
    </div>`;
  }

  function JurnalPage({ session, setSession, toast, go, guard, openSession }) {
    const { v, list } = teachingContext();
    const [tab, setTab] = useState('isi');
    const ampu = v.ampuMap.get(session.id_pengampuan);
    return html`<div className="page narrow"><header className="page-head"><div><p className="eyebrow">${longDate(session.tanggal)}</p><h1>Jurnal Mengajar</h1></div></header>
      ${list.length ? html`<${SubTabs} tabs=${[['isi', 'Isi jurnal'], ['riwayat', 'Riwayat']]} value=${tab} onChange=${(t) => guard(() => setTab(t))}/>
      ${tab === 'isi' ? html`<${SessionPicker} session=${session} onChange=${(s) => guard(() => setSession(s))}/>
        ${ampu ? html`<${JurnalForm} key=${`${session.id_pengampuan}|${session.tanggal}`} ampu=${ampu} tanggal=${session.tanggal} toast=${toast} onOpenPresensi=${() => openSession('presensi', session)}/>` : null}`
      : html`<${JurnalHistory} toast=${toast} onOpen=${(s) => { setSession(s); setTab('isi'); window.scrollTo(0, 0); }}/>`}` : html`<${NeedSetup} go=${go}/>`}
    </div>`;
  }

  /* ---------- Kerangka ---------- */
  function App() {
    useStoreVersion();
    const [ready, setReady] = useState(false);
    const [gate, setGate] = useState('loading');
    const [page, setPage] = useState('home');
    const [tab, setTab] = useState('tahun');
    const [importKind, setImportKind] = useState(null);
    const [dialog, setDialog] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [relogin, setRelogin] = useState(false);
    const [session, setSession] = useState(null);

    const toast = useCallback((text, type = 'good') => {
      const id = Math.random();
      setToasts((t) => [...t, { id, text, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    }, []);

    const boot = useCallback(async () => {
      if (DEMO_BUILD && !Store.meta('mode')) await startDemo();
      setGate(Store.meta('pin_hash') ? 'unlock' : 'connect');
    }, []);

    useEffect(() => { (async () => { await Store.open(); await boot(); setReady(true); })(); }, []);
    useEffect(() => {
      if (gate === 'app' && Store.meta('mode') === 'online') { Sync.start(); if (!Store.meta('token')) Sync.status.phase = 'perlu-login'; }
    }, [gate]);

    const ask = (cfg) => setDialog(cfg);
    if (!ready || gate === 'loading') return html`<main className="gate"><p className="muted">Membuka aplikasi…</p></main>`;
    if (gate === 'connect') return html`<${Connect} onDone=${() => setGate('app')}/>`;
    if (gate === 'unlock') return html`<${Unlock} toast=${toast} onDone=${() => setGate('app')}/>`;

    const guard = (fn) => {
      if (!unsaved.current) { fn(); return; }
      ask({ title: 'Buang perubahan?', text: 'Perubahan yang belum disimpan akan hilang.', action: 'Buang perubahan', danger: true, onConfirm: async () => { unsaved.current = false; fn(); } });
    };
    const leave = (p, t) => { setPage(p); if (t) setTab(t); window.scrollTo(0, 0); };
    const go = (p, t) => guard(() => leave(p, t));
    const openSession = (p, s) => guard(() => { setSession(s); leave(p); });
    const current = session && session.id_pengampuan ? session : defaultSession();
    const nav = [['home', 'Beranda', 'home'], ['presensi', 'Presensi', 'check'], ['jurnal', 'Jurnal', 'pen'], ['data', 'Data Master', 'data'], ['settings', 'Pengaturan', 'gear']];
    const needLogin = Sync.status.phase === 'perlu-login';
    return html`<div className="shell">
      <aside className="side">
        <div className="side-brand"><span className="brand-box">GM</span><strong>Guru Mapel</strong></div>
        <nav aria-label="Menu utama">${nav.map(([id, l, ic]) => html`<button key=${id} className=${page === id ? 'on' : ''} aria-current=${page === id ? 'page' : undefined} onClick=${() => go(id)}><${Icon} name=${ic}/><span>${l}</span></button>`)}</nav>
        <div className="side-foot"><${SyncPill}/><button className="icon-btn on-dark" onClick=${() => guard(() => setGate('unlock'))} aria-label="Kunci aplikasi" title="Kunci aplikasi"><${Icon} name="lock"/></button></div>
      </aside>
      <div className="content">
        ${needLogin ? html`<div className="login-bar"><span>Sesi berakhir. Data menunggu dikirim.</span><button className="btn small primary" onClick=${() => setRelogin(true)}>Masukkan PIN</button></div>` : null}
        ${page === 'home' ? html`<${Home} go=${go} openImport=${setImportKind} ask=${ask} toast=${toast} openSession=${openSession}/>` : null}
        ${page === 'presensi' ? html`<${PresensiPage} session=${current} setSession=${setSession} ask=${ask} toast=${toast} go=${go} guard=${guard}/>` : null}
        ${page === 'jurnal' ? html`<${JurnalPage} session=${current} setSession=${setSession} toast=${toast} go=${go} guard=${guard} openSession=${openSession}/>` : null}
        ${page === 'data' ? html`<${Master} tab=${tab} setTab=${setTab} openImport=${setImportKind} ask=${ask} toast=${toast}/>` : null}
        ${page === 'settings' ? html`<${Settings} openImport=${setImportKind} ask=${ask} toast=${toast} onLock=${() => setGate('unlock')} onReset=${boot}/>` : null}
      </div>
      ${importKind ? html`<${ImportModal} kind=${importKind} onClose=${() => setImportKind(null)} toast=${toast}/>` : null}
      ${dialog ? html`<${Confirm} ...${dialog} onCancel=${() => setDialog(null)} onConfirm=${async () => { await dialog.onConfirm(); setDialog(null); }}/>` : null}
      ${relogin ? html`<${Relogin} onDone=${() => setRelogin(false)}/>` : null}
      <${Toasts} items=${toasts}/>
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App}/>`);
  if ('serviceWorker' in navigator && !DEMO_BUILD && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window);
