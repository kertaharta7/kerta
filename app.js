import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, set, off } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCrOjni5iJt64C2_YLRL1DOv7tfGAz7m9o",
    authDomain: "kerta-58b48.firebaseapp.com",
    databaseURL: "https://kerta-58b48-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kerta-58b48",
    storageBucket: "kerta-58b48.firebasestorage.app",
    messagingSenderId: "595616991854",
    appId: "1:595616991854:web:8263732c147b0e5b08347f"
  };

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

// Mode: 'keluarga' atau 'pribadi'
let modeAktif = localStorage.getItem('modeAktif') || 'keluarga';
let currentUser = null;

// Referensi database — berubah sesuai mode
let transaksiRef, budgetRef, hpRef, targetRef;

function getBasePath() {
  return '';
}

function updateRefs() {
  transaksiRef = ref(db, 'transaksi');
  budgetRef = ref(db, 'budget');
  hpRef = ref(db, 'hutangpiutang');
  targetRef = ref(db, 'target');
  pengaturanRef = ref(db, 'pengaturan');
  saldoAwalRef = ref(db, 'saldoAwal'); // ← tambah ini
}

let transaksi = [];
let tipeAktif = 'masuk';
let grafikInstance = null;
let grafikSaldoInstance = null;
let grafikSaldoHarianInstance = null;
let grafikPengeluaranHarianInstance = null;
let grafikDonutInstance = null;
let budget = {};
let hpData = [];
let hpTab = 'piutang';
let cicilanTargetKey = null;
let targetData = [];
let targetDanaKey = null;
let filterType = 'semua';
let listenerRefs = [];

// Default kategori & bank
const defaultKatKeluar = ['LAG','Sembako','Toiletris','Pengasuh','Kebutuhan Anak','Sekolah Anak','Liburan','Makan','Transport','BBM','Belanja','Listrik','Air','Internet','Pulsa','Kesehatan','Pajak','Asuransi','Sedekah','Investasi','Hiburan','Pendidikan','Hutang','Lainnya'];
const defaultKatMasuk = ['Gaji','Usaha','Investasi','Piutang','Tabungan','Lainnya'];
const defaultBank = ['Cash','BNI','BSI','DANA','OVO','SeaBank','GoPay'];

let katKeluar = [...defaultKatKeluar];
let katMasuk = [...defaultKatMasuk];
let bankList = [...defaultBank];
let pengaturanRef;
let saldoAwalRef;
let saldoAwal = {};

const metodeList = ['Cash', 'BNI', 'BSI', 'DANA', 'OVO', 'SeaBank', 'GoPay'];

// ======= AUTH =======
// Tampilkan loading saat pertama buka
document.getElementById('loading-screen').style.display = 'flex';

onAuthStateChanged(auth, (user) => {
  document.getElementById('loading-screen').style.display = 'none';
  if (user) {
    currentUser = user;
    document.getElementById('halaman-login').style.display = 'none';
    document.getElementById('aplikasi-utama').style.display = 'block';
    updateRefs();
    updateModeUI();
    mulaiListeners();
    document.getElementById('tanggal').valueAsDate = new Date();
  } else {
    currentUser = null;
    document.getElementById('halaman-login').style.display = 'flex';
    document.getElementById('aplikasi-utama').style.display = 'none';
    hentikanListeners();
  }
});

function mulaiListeners() {
  hentikanListeners();

  const l1 = onValue(transaksiRef, (snapshot) => {
    transaksi = [];
    snapshot.forEach((child) => {
      transaksi.unshift({ _key: child.key, ...child.val() });
    });
    console.log('transaksi update:', transaksi.length); // ← tambah ini
    render();
    renderBudget();
    renderInsight();
    renderGrafikSaldoHarian();
    renderGrafikPengeluaranHarian();
    renderGrafikDonut();
    renderRekeningList();
    cekDanKirimNotifikasi();
  });

  const l2 = onValue(budgetRef, (snapshot) => {
    budget = snapshot.val() || {};
    renderBudget();
    renderInsight();
  });

  const l3 = onValue(hpRef, (snapshot) => {
    hpData = [];
    snapshot.forEach((child) => {
      hpData.unshift({ _key: child.key, ...child.val() });
    });
    renderHP();
  });

  const l4 = onValue(targetRef, (snapshot) => {
    targetData = [];
    snapshot.forEach((child) => {
      targetData.unshift({ _key: child.key, ...child.val() });
    });
    renderTarget();
  });

  const l5 = onValue(pengaturanRef, (snapshot) => {
    const data = snapshot.val() || {};
    katKeluar = data.katKeluar || [...defaultKatKeluar];
    katMasuk = data.katMasuk || [...defaultKatMasuk];
    bankList = data.bankList || [...defaultBank];
    renderPengaturan();
    updateFormOptions();
  });

  const l6 = onValue(saldoAwalRef, (snapshot) => {
  saldoAwal = snapshot.val() || {};
  render();
  renderRekeningList();
});

  listenerRefs = [
  { ref: transaksiRef, fn: l1 },
  { ref: budgetRef, fn: l2 },
  { ref: hpRef, fn: l3 },
  { ref: targetRef, fn: l4 },
  { ref: pengaturanRef, fn: l5 },
  { ref: saldoAwalRef, fn: l6 }, // ← tambah ini
];
  
}

function hentikanListeners() {
  listenerRefs.forEach(({ ref: r }) => off(r));
  listenerRefs = [];
}

// ======= MODE SWITCH =======
function gantiMode() {
  modeAktif = modeAktif === 'keluarga' ? 'pribadi' : 'keluarga';
  localStorage.setItem('modeAktif', modeAktif);
  updateRefs();
  updateModeUI();
  mulaiListeners();

  // Reset data lokal
  transaksi = [];
  budget = {};
  hpData = [];
  targetData = [];
}

function updateModeUI() {
  const btn = document.getElementById('btn-mode');
  if (!btn) return;
  if (modeAktif === 'keluarga') {
    btn.textContent = '🏠 Mode Keluarga';
    btn.style.color = '#6366f1';
  } else {
    btn.textContent = '👤 Mode Pribadi';
    btn.style.color = '#16a34a';
  }
}

// ======= TAB =======
function gotoTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
  el.classList.add('active');
  if (tabId === 'grafik') renderGrafikAll();
}

// ======= FORMAT =======
function formatRupiah(angka) {
  return 'Rp ' + Math.round(angka).toLocaleString('id-ID');
}

// ======= FILTER =======
function setFilterType(type, el) {
  filterType = type;
  document.querySelectorAll('.filter-type-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('filter-bulan-wrap').style.display = 'none';
  document.getElementById('filter-rentang-wrap').style.display = 'none';
  document.getElementById('filter-tanggal-wrap').style.display = 'none';
  if (type === 'bulan') document.getElementById('filter-bulan-wrap').style.display = 'block';
  if (type === 'rentang') document.getElementById('filter-rentang-wrap').style.display = 'flex';
  if (type === 'tanggal') document.getElementById('filter-tanggal-wrap').style.display = 'block';
  render();
}

// ======= TRANSAKSI =======
function setType(tipe) {
  tipeAktif = tipe;
  document.getElementById('btn-masuk').className = '';
  document.getElementById('btn-keluar').className = '';
  document.getElementById('btn-transfer').className = '';
  document.getElementById('form-transfer').style.display = 'none';
  document.getElementById('form-utama').style.display = 'block';

  if (tipe === 'masuk') {
    document.getElementById('btn-masuk').className = 'active-income';
    document.getElementById('kategori').innerHTML =
      katMasuk.map(k => `<option value="${k}">${k}</option>`).join('');

  } else if (tipe === 'keluar') {
    document.getElementById('btn-keluar').className = 'active-expense';
    document.getElementById('kategori').innerHTML =
      katKeluar.map(k => `<option value="${k}">${k}</option>`).join('');

  } else if (tipe === 'transfer') {
    document.getElementById('btn-transfer').className = 'active-transfer';
    document.getElementById('form-utama').style.display = 'none';
    document.getElementById('form-transfer').style.display = 'block';
    document.getElementById('transfer-tanggal').valueAsDate = new Date();
  }
}

function tambahTransaksi() {
  const keterangan = document.getElementById('keterangan').value.trim();
  const jumlah = parseFloat(document.getElementById('jumlah').value);
  const kategori = document.getElementById('kategori').value;
  const tanggal = document.getElementById('tanggal').value;
  const metode = document.getElementById('metode').value;
  if (!keterangan || !jumlah || jumlah <= 0 || !tanggal) { alert('Lengkapi semua kolom!'); return; }
  push(transaksiRef, { id: Date.now(), tipe: tipeAktif, keterangan, jumlah, kategori, tanggal, metode });
  document.getElementById('keterangan').value = '';
  document.getElementById('jumlah').value = '';
}

function hapus(key) {
  if (!confirm('Hapus transaksi ini?')) return;
  remove(ref(db, `transaksi/${key}`));
}

function editTransaksi(key) {
  const t = transaksi.find(t => t._key === key);
  if (!t) return;
  document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
  document.getElementById('tab-transaksi').classList.add('active');
  document.querySelectorAll('.nav-tab')[1].classList.add('active');
  setType(t.tipe === 'keluar' ? 'keluar' : 'masuk');
  document.getElementById('keterangan').value = t.keterangan;
  document.getElementById('jumlah').value = t.jumlah;
  document.getElementById('tanggal').value = t.tanggal;
  document.getElementById('metode').value = t.metode;
  setTimeout(() => { document.getElementById('kategori').value = t.kategori; }, 50);
  const btn = document.getElementById('btn-simpan-transaksi');
  btn.textContent = '✏️ Update Transaksi';
  btn.onclick = () => updateTransaksi(key);
  document.getElementById('keterangan').scrollIntoView({ behavior: 'smooth' });
}

function updateTransaksi(key) {
  const keterangan = document.getElementById('keterangan').value.trim();
  const jumlah = parseFloat(document.getElementById('jumlah').value);
  const kategori = document.getElementById('kategori').value;
  const tanggal = document.getElementById('tanggal').value;
  const metode = document.getElementById('metode').value;
  if (!keterangan || !jumlah || jumlah <= 0 || !tanggal) { alert('Lengkapi semua kolom!'); return; }
  set(ref(db, `transaksi/${key}`), { id: Date.now(), tipe: tipeAktif, keterangan, jumlah, kategori, tanggal, metode });
  const btn = document.getElementById('btn-simpan-transaksi');
  btn.textContent = '+ Simpan Transaksi';
  btn.onclick = tambahTransaksi;
  document.getElementById('keterangan').value = '';
  document.getElementById('jumlah').value = '';
}

function lakukanTransfer() {
  const dari = document.getElementById('transfer-dari').value;
  const ke = document.getElementById('transfer-ke').value;
  const jumlah = parseFloat(document.getElementById('transfer-jumlah').value);
  const tanggal = document.getElementById('transfer-tanggal').value;
  if (dari === ke) { alert('Akun asal dan tujuan tidak boleh sama!'); return; }
  if (!jumlah || jumlah <= 0) { alert('Isi jumlah transfer!'); return; }
  if (!tanggal) { alert('Isi tanggal!'); return; }
  push(transaksiRef, { id: Date.now(), tipe: 'keluar', keterangan: `Transfer ke ${ke}`, jumlah, kategori: 'Transfer', tanggal, metode: dari });
  push(transaksiRef, { id: Date.now() + 1, tipe: 'masuk', keterangan: `Transfer dari ${dari}`, jumlah, kategori: 'Transfer', tanggal, metode: ke });
  document.getElementById('transfer-jumlah').value = '';
  alert(`Transfer ${formatRupiah(jumlah)} dari ${dari} ke ${ke} berhasil!`);
}

// ======= RENDER =======
function render() {
  const now = new Date();
  const bulanIni = now.toISOString().slice(0, 7);

  const semuaBulan = [...new Set(transaksi.map(t => t.tanggal.slice(0, 7)))].sort().reverse();
  const filterEl = document.getElementById('filter-bulan');
  const dipilih = filterEl ? filterEl.value : '';
  if (filterEl) {
    filterEl.innerHTML = '<option value="">Pilih Bulan</option>' +
      semuaBulan.map(b => {
        const [th, bl] = b.split('-');
        const label = new Date(th, bl - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        return `<option value="${b}" ${dipilih === b ? 'selected' : ''}>${label}</option>`;
      }).join('');
  }

  let filtered = transaksi;
  if (filterType === 'bulan' && dipilih) {
    filtered = transaksi.filter(t => t.tanggal.slice(0, 7) === dipilih);
  } else if (filterType === 'rentang') {
    const dari = document.getElementById('filter-dari')?.value;
    const sampai = document.getElementById('filter-sampai')?.value;
    if (dari && sampai) filtered = transaksi.filter(t => t.tanggal >= dari && t.tanggal <= sampai);
    else if (dari) filtered = transaksi.filter(t => t.tanggal >= dari);
    else if (sampai) filtered = transaksi.filter(t => t.tanggal <= sampai);
  } else if (filterType === 'tanggal') {
    const tgl = document.getElementById('filter-tanggal-val')?.value;
    if (tgl) filtered = transaksi.filter(t => t.tanggal === tgl);
  }

  const cari = document.getElementById('filter-cari')?.value.toLowerCase().trim();
  if (cari) {
    filtered = filtered.filter(t =>
      t.keterangan.toLowerCase().includes(cari) ||
      t.kategori.toLowerCase().includes(cari) ||
      t.metode.toLowerCase().includes(cari)
    );
  }

  const filteredBulanIni = transaksi.filter(t => t.tanggal.slice(0, 7) === bulanIni);
  const totalMasuk = filteredBulanIni.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const totalKeluar = filteredBulanIni.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const allMasuk = transaksi.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const allKeluar = transaksi.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const saldo = allMasuk - allKeluar;

  document.getElementById('total-masuk').textContent = formatRupiah(totalMasuk);
  document.getElementById('total-keluar').textContent = formatRupiah(totalKeluar);
  document.getElementById('saldo').textContent = formatRupiah(Math.abs(saldo));
  document.getElementById('saldo').style.color = saldo < 0 ? '#dc2626' : '#1e293b';

  const avgMasuk = totalMasuk > 0 ? totalMasuk / now.getDate() : 0;
  const avgKeluar = totalKeluar > 0 ? totalKeluar / now.getDate() : 0;
  const elAvgMasuk = document.getElementById('avg-masuk');
  const elAvgKeluar = document.getElementById('avg-keluar');
  if (elAvgMasuk) elAvgMasuk.textContent = formatRupiah(avgMasuk);
  if (elAvgKeluar) elAvgKeluar.textContent = formatRupiah(avgKeluar);

  const jmlKeluar = filteredBulanIni.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').length;
  const elJmlKeluar = document.getElementById('jml-transaksi-keluar');
  if (elJmlKeluar) elJmlKeluar.textContent = `Total ${jmlKeluar} transaksi`;

  const cashflow = totalMasuk - totalKeluar;
  const savingRate = totalMasuk > 0 ? ((cashflow / totalMasuk) * 100).toFixed(1) : 0;

  const elCashflow = document.getElementById('cashflow-bersih');
  if (elCashflow) { elCashflow.textContent = formatRupiah(Math.abs(cashflow)); elCashflow.style.color = cashflow < 0 ? '#dc2626' : '#16a34a'; }

  const elSaving = document.getElementById('saving-rate');
  if (elSaving) { elSaving.textContent = savingRate + '%'; elSaving.style.color = savingRate < 0 ? '#dc2626' : savingRate < 20 ? '#f59e0b' : '#6366f1'; }

  const elSavingLabel = document.getElementById('saving-rate-label');
  const elSavingStatus = document.getElementById('saving-rate-status');
  if (elSavingLabel) {
    if (savingRate >= 50) { elSavingLabel.textContent = 'Sangat Baik ⭐'; elSavingLabel.className = 'kartu-stat-badge'; }
    else if (savingRate >= 20) { elSavingLabel.textContent = 'Baik 👍'; elSavingLabel.className = 'kartu-stat-badge'; }
    else if (savingRate >= 0) { elSavingLabel.textContent = 'Perlu Ditingkatkan'; elSavingLabel.className = 'kartu-stat-badge sedang'; }
    else { elSavingLabel.textContent = 'Defisit ⚠️'; elSavingLabel.className = 'kartu-stat-badge kurang'; }
  }
  if (elSavingStatus) { elSavingStatus.textContent = savingRate >= 20 ? 'Tercapai ✓' : 'Belum Tercapai'; elSavingStatus.style.color = savingRate >= 20 ? '#16a34a' : '#dc2626'; }

  metodeList.forEach(m => {
    const kartu = document.getElementById('saldo-' + m);
    if (!kartu) return;
    const wrapper = kartu.closest('.card');
    const masuk = transaksi.filter(t => t.tipe === 'masuk' && t.metode === m).reduce((s,t) => s+t.jumlah, 0);
    const keluar = transaksi.filter(t => t.tipe === 'keluar' && t.metode === m).reduce((s,t) => s+t.jumlah, 0);
    const saldoM = masuk - keluar;
    if (masuk === 0 && keluar === 0) { if (wrapper) wrapper.style.display = 'none'; return; }
    if (wrapper) wrapper.style.display = 'block';
    kartu.textContent = formatRupiah(Math.abs(saldoM));
    kartu.style.color = saldoM < 0 ? '#dc2626' : '#1e293b';
  });

  const list = document.getElementById('list-transaksi');
  if (filtered.length === 0) {
    list.innerHTML = '<li class="kosong">Tidak ada transaksi.</li>';
  } else {
    list.innerHTML = filtered.map(t => {
      const tgl = new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const sign = t.tipe === 'masuk' ? '+' : '-';
      return `
        <li>
          <div class="tx-info">
            <div class="tx-nama">${t.keterangan}</div>
            <div class="tx-meta">${t.kategori} · ${t.metode} · ${tgl}</div>
          </div>
          <div class="tx-nominal ${t.tipe}">${sign}${formatRupiah(t.jumlah)}</div>
          <button class="tx-edit" onclick="editTransaksi('${t._key}')">✏️</button>
          <button class="tx-hapus" onclick="hapus('${t._key}')">🗑</button>
        </li>
      `;
    }).join('');
  }

  const ikonKategori = {
    Gaji:'💼', Usaha:'🏪', Investasi:'📈', Piutang:'💰', Tabungan:'🏦', LAG:'🏠',
    Sembako:'🛒', Toiletris:'🧴', Pengasuh:'👶', 'Kebutuhan Anak':'🍼', Liburan:'✈️',
    Makan:'🍽️', Transport:'🚗', BBM:'⛽', Belanja:'🛍️', Listrik:'💡', Air:'💧',
    Internet:'📶', Pulsa:'📱', 'Sekolah Anak':'📚', Kesehatan:'❤️', Pajak:'📋',
    Asuransi:'🛡️', Sedekah:'🤲', Hiburan:'🎬', Pendidikan:'🎓', Hutang:'💸',
    Transfer:'↔️', Lainnya:'📦'
  };

  const mini = document.getElementById('list-transaksi-mini');
  const last5 = transaksi.slice(0, 5);
  if (last5.length === 0) {
    mini.innerHTML = '<li class="kosong">Belum ada transaksi.</li>';
  } else {
    mini.innerHTML = last5.map(t => {
      const sign = t.tipe === 'masuk' ? '+' : '-';
      const color = t.tipe === 'masuk' ? '#16a34a' : '#dc2626';
      const bgColor = t.tipe === 'masuk' ? '#dcfce7' : '#fee2e2';
      const ikon = ikonKategori[t.kategori] || '📦';
      const tgl = new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <li style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f8fafc">
          <div style="width:38px;height:38px;border-radius:10px;background:${bgColor};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${ikon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.keterangan}</div>
            <div style="font-size:11px;color:#94a3b8">${t.kategori} · ${t.metode} · ${tgl}</div>
          </div>
          <div style="font-size:13px;font-weight:600;color:${color};flex-shrink:0">${sign}${formatRupiah(t.jumlah)}</div>
        </li>
      `;
    }).join('');
  }
}

// ======= BUDGET =======
function simpanBudget() {
  const kat = document.getElementById('budget-kat').value;
  const nominal = parseFloat(document.getElementById('budget-nominal').value);
  if (!nominal || nominal <= 0) { alert('Isi nominal anggaran!'); return; }
  set(ref(db, `budget/${kat}`), nominal);
  document.getElementById('budget-nominal').value = '';
}

function hapusBudget(kat) { remove(ref(db, `budget/${kat}`)); }

function editBudget(kat, nominal) {
  document.getElementById('budget-kat').value = kat;
  document.getElementById('budget-nominal').value = nominal;
  document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
  document.getElementById('tab-anggaran').classList.add('active');
  document.querySelectorAll('.nav-tab')[2].classList.add('active');
  const btn = document.getElementById('btn-simpan-budget');
  btn.textContent = '✏️ Update Anggaran';
  btn.onclick = () => updateBudget(kat);
  document.getElementById('budget-nominal').scrollIntoView({ behavior: 'smooth' });
}

function updateBudget(kat) {
  const nominal = parseFloat(document.getElementById('budget-nominal').value);
  if (!nominal || nominal <= 0) { alert('Isi nominal anggaran!'); return; }
  set(ref(db, `budget/${kat}`), nominal);
  const btn = document.getElementById('btn-simpan-budget');
  btn.textContent = 'Set Anggaran';
  btn.onclick = simpanBudget;
  document.getElementById('budget-nominal').value = '';
}

function renderBudget() {
  const bulanIni = new Date().toISOString().slice(0, 7);
  const keys = Object.keys(budget);
  const totalAnggaran = Object.values(budget).reduce((s, v) => s + v, 0);
  const totalTerpakai = transaksi.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer' && t.tanggal.slice(0, 7) === bulanIni).reduce((s, t) => s + t.jumlah, 0);
  const totalSisa = totalAnggaran - totalTerpakai;

  const elAnggaran = document.getElementById('total-anggaran');
  const elSisa = document.getElementById('sisa-anggaran');
  if (elAnggaran) elAnggaran.textContent = formatRupiah(totalAnggaran);
  if (elSisa) { elSisa.textContent = formatRupiah(Math.abs(totalSisa)); elSisa.style.color = totalSisa < 0 ? '#dc2626' : '#1e293b'; }

  const elAnggaranTab = document.getElementById('total-anggaran-tab');
  const elSisaTab = document.getElementById('sisa-anggaran-tab');
  if (elAnggaranTab) elAnggaranTab.textContent = formatRupiah(totalAnggaran);
  if (elSisaTab) { elSisaTab.textContent = formatRupiah(Math.abs(totalSisa)); elSisaTab.style.color = totalSisa < 0 ? '#dc2626' : '#1e293b'; }

  const budgetMini = document.getElementById('budget-mini');
  if (budgetMini) {
    if (keys.length === 0) { budgetMini.innerHTML = '<p style="font-size:13px;color:#94a3b8">Belum ada anggaran.</p>'; }
    else {
      budgetMini.innerHTML = keys.map(kat => {
        const batas = budget[kat];
        const terpakai = transaksi.filter(t => t.tipe === 'keluar' && t.kategori === kat && t.tanggal.slice(0, 7) === bulanIni).reduce((s, t) => s + t.jumlah, 0);
        const persen = Math.min((terpakai / batas) * 100, 100).toFixed(0);
        const warna = terpakai > batas ? '#ef4444' : persen >= 80 ? '#f59e0b' : '#10b981';
        return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="font-weight:500">${kat}</span><span style="color:#94a3b8">${formatRupiah(terpakai)} / ${formatRupiah(batas)}</span></div><div style="height:6px;background:#f1f5f9;border-radius:4px;overflow:hidden"><div style="height:100%;width:${persen}%;background:${warna};border-radius:4px;transition:width 0.4s"></div></div></div>`;
      }).join('');
    }
  }

  const container = document.getElementById('budget-list');
  if (!container) return;
  if (keys.length === 0) { container.innerHTML = '<p style="font-size:13px;color:#aaa">Belum ada anggaran yang diset.</p>'; return; }
  container.innerHTML = keys.map(kat => {
    const batas = budget[kat];
    const terpakai = transaksi.filter(t => t.tipe === 'keluar' && t.kategori === kat && t.tanggal.slice(0, 7) === bulanIni).reduce((s, t) => s + t.jumlah, 0);
    const persen = Math.min((terpakai / batas) * 100, 100).toFixed(0);
    let kelas = '', status = '';
    if (terpakai > batas) { kelas = 'lewat'; status = `⚠️ Melebihi ${formatRupiah(terpakai - batas)}`; }
    else if (persen >= 80) { kelas = 'hampir'; status = `⚠️ Hampir batas (${persen}%)`; }
    else { status = `Sisa ${formatRupiah(batas - terpakai)}`; }
    return `<div class="budget-item"><div class="budget-header"><span>${kat} <button class="budget-hapus" onclick="editBudget('${kat}',${batas})" style="color:#3b82f6;margin-right:2px">✏️</button><button class="budget-hapus" onclick="hapusBudget('${kat}')">✕</button></span><span class="budget-angka">${formatRupiah(terpakai)} / ${formatRupiah(batas)}</span></div><div class="budget-bar-track"><div class="budget-bar-fill ${kelas}" style="width:${persen}%"></div></div><div class="budget-status ${kelas}">${status}</div></div>`;
  }).join('');
}

// ======= GRAFIK =======
function renderGrafikAll() {
  const sumber = transaksi;
  const dataKategori = {};
  sumber.filter(t => t.kategori !== 'Transfer').forEach(t => {
    if (!dataKategori[t.kategori]) dataKategori[t.kategori] = { masuk: 0, keluar: 0 };
    dataKategori[t.kategori][t.tipe] += t.jumlah;
  });
  const labels = Object.keys(dataKategori);
  if (grafikInstance) grafikInstance.destroy();
  if (labels.length > 0) {
    const ctx = document.getElementById('grafikKategori').getContext('2d');
    grafikInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Pemasukan', data: labels.map(k => dataKategori[k].masuk), backgroundColor: '#10b981', borderRadius: 6, borderSkipped: false }, { label: 'Pengeluaran', data: labels.map(k => dataKategori[k].keluar), backgroundColor: '#ef4444', borderRadius: 6, borderSkipped: false }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: Rp ${c.raw.toLocaleString('id-ID')}` } } }, scales: { y: { ticks: { callback: v => 'Rp ' + v.toLocaleString('id-ID') } } } } });
  }
  const aktif = metodeList.filter(m => sumber.some(t => t.metode === m));
  const masukAktif = aktif.map(m => sumber.filter(t => t.tipe === 'masuk' && t.metode === m && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0));
  const keluarAktif = aktif.map(m => sumber.filter(t => t.tipe === 'keluar' && t.metode === m && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0));
  if (grafikSaldoInstance) grafikSaldoInstance.destroy();
  if (aktif.length > 0) {
    const ctx2 = document.getElementById('grafikSaldo').getContext('2d');
    grafikSaldoInstance = new Chart(ctx2, { type: 'bar', data: { labels: aktif, datasets: [{ label: 'Pemasukan', data: masukAktif, backgroundColor: '#10b981', borderRadius: 6, borderSkipped: false }, { label: 'Pengeluaran', data: keluarAktif, backgroundColor: '#ef4444', borderRadius: 6, borderSkipped: false }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: Rp ${c.raw.toLocaleString('id-ID')}` } } }, scales: { y: { ticks: { callback: v => 'Rp ' + v.toLocaleString('id-ID') } } } } });
  }
}

function renderGrafikSaldoHarian() {
  const ctx = document.getElementById('grafikSaldoHarian');
  if (!ctx) return;
  const hari30 = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); hari30.push(d.toISOString().slice(0, 10)); }
  let saldoKumulatif = 0;
  const allSorted = [...transaksi].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const batas = hari30[0];
  allSorted.filter(t => t.tanggal < batas && t.kategori !== 'Transfer').forEach(t => { saldoKumulatif += t.tipe === 'masuk' ? t.jumlah : -t.jumlah; });
  const saldoPerHari = hari30.map(tgl => { allSorted.filter(t => t.tanggal === tgl && t.kategori !== 'Transfer').forEach(t => { saldoKumulatif += t.tipe === 'masuk' ? t.jumlah : -t.jumlah; }); return saldoKumulatif; });
  const bulanIni = new Date().toISOString().slice(0, 7);
  const bulanLalu = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const masukIni = transaksi.filter(t => t.tipe === 'masuk' && t.tanggal.slice(0,7) === bulanIni && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const keluarIni = transaksi.filter(t => t.tipe === 'keluar' && t.tanggal.slice(0,7) === bulanIni && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const masukLalu = transaksi.filter(t => t.tipe === 'masuk' && t.tanggal.slice(0,7) === bulanLalu && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const keluarLalu = transaksi.filter(t => t.tipe === 'keluar' && t.tanggal.slice(0,7) === bulanLalu && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const diffNominal = (masukIni - keluarIni) - (masukLalu - keluarLalu);
  const diffPersen = (masukLalu - keluarLalu) !== 0 ? ((diffNominal / Math.abs(masukLalu - keluarLalu)) * 100).toFixed(1) : 0;
  const elDiff = document.getElementById('saldo-diff');
  const elPersen = document.getElementById('saldo-diff-persen');
  const elIcon = document.getElementById('saldo-diff-icon');
  if (elDiff && elPersen && elIcon) {
    const naik = diffNominal >= 0;
    elDiff.textContent = (naik ? '+ ' : '- ') + formatRupiah(Math.abs(diffNominal));
    elDiff.style.color = naik ? '#16a34a' : '#dc2626';
    elIcon.textContent = naik ? '↑' : '↓';
    elIcon.style.color = naik ? '#16a34a' : '#dc2626';
    elPersen.textContent = (naik ? '+' : '') + diffPersen + '%';
    elPersen.className = 'hero-badge' + (naik ? '' : ' turun');
  }
  if (grafikSaldoHarianInstance) grafikSaldoHarianInstance.destroy();
  const labels = hari30.map(tgl => { const d = new Date(tgl); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); });
  grafikSaldoHarianInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ data: saldoPerHari, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.4 }] }, options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + formatRupiah(c.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 6 } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: v => v >= 1000000 ? (v/1000000).toFixed(1) + ' jt' : v >= 1000 ? (v/1000).toFixed(0) + ' rb' : v } } } } });
}

function renderGrafikPengeluaranHarian() {
  const ctx = document.getElementById('grafikPengeluaranHarian');
  if (!ctx) return;
  const hari30 = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); hari30.push(d.toISOString().slice(0, 10)); }
  const dataPerHari = hari30.map(tgl => transaksi.filter(t => t.tanggal === tgl && t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0));
  const labels = hari30.map(tgl => { const d = new Date(tgl); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); });
  if (grafikPengeluaranHarianInstance) grafikPengeluaranHarianInstance.destroy();
  grafikPengeluaranHarianInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ data: dataPerHari, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#6366f1', pointHoverRadius: 5, fill: true, tension: 0.4 }] }, options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + formatRupiah(c.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8 } }, y: { grid: { color: '#f8fafc' }, ticks: { font: { size: 10 }, callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'jt' : v >= 1000 ? (v/1000).toFixed(0)+'rb' : v } } } } });
}

function renderGrafikDonut() {
  const ctx = document.getElementById('grafikDonut');
  const legend = document.getElementById('donut-legend');
  if (!ctx) return;
  const bulanIni = new Date().toISOString().slice(0, 7);
  const txBulanIni = transaksi.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer' && t.tanggal.slice(0,7) === bulanIni);
  const total = txBulanIni.reduce((s,t) => s+t.jumlah, 0);
  const kategoriMap = {};
  txBulanIni.forEach(t => { kategoriMap[t.kategori] = (kategoriMap[t.kategori]||0) + t.jumlah; });
  const sorted = Object.entries(kategoriMap).sort((a,b) => b[1]-a[1]);
  if (sorted.length === 0) return;
  const top5 = sorted.slice(0, 5);
  const lainnya = sorted.slice(5).reduce((s,x) => s+x[1], 0);
  if (lainnya > 0) top5.push(['Lainnya', lainnya]);
  const warna = ['#10b981','#6366f1','#f59e0b','#ec4899','#3b82f6','#94a3b8'];
  if (grafikDonutInstance) grafikDonutInstance.destroy();
  grafikDonutInstance = new Chart(ctx, { type: 'doughnut', data: { labels: top5.map(x=>x[0]), datasets: [{ data: top5.map(x=>x[1]), backgroundColor: warna, borderWidth: 2, borderColor: 'white' }] }, options: { responsive: true, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${formatRupiah(c.raw)}` } } } }, plugins: [{ id: 'centerText', beforeDraw(chart) { const { width, height, ctx } = chart; ctx.save(); ctx.font = `bold ${Math.min(width,height)*0.1}px Inter`; ctx.fillStyle = '#1e293b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Total', width/2, height/2 - 10); ctx.font = `bold ${Math.min(width,height)*0.09}px Inter`; ctx.fillStyle = '#6366f1'; const totalStr = total >= 1000000 ? 'Rp '+(total/1000000).toFixed(1)+'jt' : formatRupiah(total); ctx.fillText(totalStr, width/2, height/2 + 12); ctx.restore(); } }] });
  if (legend) { legend.innerHTML = top5.map((x,i) => { const persen = total > 0 ? ((x[1]/total)*100).toFixed(0) : 0; return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:${warna[i]};flex-shrink:0"></div><span style="color:#475569">${x[0]}</span></div><div style="text-align:right"><span style="font-weight:600;color:#1e293b">${persen}%</span><div style="color:#94a3b8;font-size:11px">${formatRupiah(x[1])}</div></div></div>`; }).join(''); }
}

function renderRekeningList() {
  console.log('metodeList:', metodeList); // ← tambah ini
  console.log('saldoAwal:', saldoAwal);   // ← tambah ini
  const container = document.getElementById('rekening-list');
  const elTotal = document.getElementById('total-saldo-rekening');
  if (!container) return;
  let totalSaldo = 0;
  const rekeningAktif = [];
  metodeList.forEach(m => {
    const masuk = transaksi.filter(t => t.tipe === 'masuk' && t.metode === m).reduce((s,t) => s+t.jumlah, 0);
    const keluar = transaksi.filter(t => t.tipe === 'keluar' && t.metode === m).reduce((s,t) => s+t.jumlah, 0);
    const awal = saldoAwal[m] || 0;
const saldo = awal + masuk - keluar;
if (awal > 0 || masuk > 0 || keluar > 0) { rekeningAktif.push({ nama: m, saldo }); totalSaldo += saldo; }
  });
  if (elTotal) elTotal.textContent = formatRupiah(totalSaldo);
  if (rekeningAktif.length === 0) { container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:12px">Belum ada rekening.</p>'; return; }
  const ikonRekening = { Cash: '💵', BNI: '🏦', BSI: '🏦', DANA: '💙', OVO: '💜', SeaBank: '🌊', GoPay: '💚' };
  container.innerHTML = rekeningAktif.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f8fafc"><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:10px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:18px">${ikonRekening[r.nama]||'🏦'}</div><span style="font-size:13px;font-weight:500;color:#1e293b">${r.nama}</span></div><span style="font-size:13px;font-weight:600;color:${r.saldo < 0 ? '#dc2626' : '#1e293b'}">${formatRupiah(r.saldo)}</span></div>`).join('');
}

// ======= HUTANG PIUTANG =======
function setHPTab(tab, el) {
  hpTab = tab;
  document.querySelectorAll('.hp-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderHP();
}

function tambahHP() {
  const nama = document.getElementById('hp-nama').value.trim();
  const jumlah = parseFloat(document.getElementById('hp-jumlah').value);
  const tanggal = document.getElementById('hp-tanggal').value;
  const keterangan = document.getElementById('hp-keterangan').value.trim();
  if (!nama || !jumlah || jumlah <= 0 || !tanggal) { alert('Lengkapi nama, jumlah, dan tanggal!'); return; }
  push(hpRef, { nama, jumlah, tanggal, keterangan, tipe: hpTab, terbayar: 0 });
  document.getElementById('hp-nama').value = '';
  document.getElementById('hp-jumlah').value = '';
  document.getElementById('hp-keterangan').value = '';
}

function tandaiLunas(key) {
  if (!confirm('Hapus data ini?')) return;
  remove(ref(db, `hutangpiutang/${key}`));
}

function editHP(key) {
  const h = hpData.find(h => h._key === key);
  if (!h) return;
  document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
  document.getElementById('tab-hutang').classList.add('active');
  document.querySelectorAll('.nav-tab')[3].classList.add('active');
  hpTab = h.tipe;
  document.querySelectorAll('.hp-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.hp-tab')[h.tipe === 'piutang' ? 0 : 1].classList.add('active');
  document.getElementById('hp-nama').value = h.nama;
  document.getElementById('hp-jumlah').value = h.jumlah;
  document.getElementById('hp-tanggal').value = h.tanggal;
  document.getElementById('hp-keterangan').value = h.keterangan || '';
  const btn = document.getElementById('btn-simpan-hp');
  btn.textContent = '✏️ Update';
  btn.onclick = () => updateHP(key);
  document.getElementById('hp-nama').scrollIntoView({ behavior: 'smooth' });
}

function updateHP(key) {
  const nama = document.getElementById('hp-nama').value.trim();
  const jumlah = parseFloat(document.getElementById('hp-jumlah').value);
  const tanggal = document.getElementById('hp-tanggal').value;
  const keterangan = document.getElementById('hp-keterangan').value.trim();
  if (!nama || !jumlah || jumlah <= 0 || !tanggal) { alert('Lengkapi semua kolom!'); return; }
  const target = hpData.find(h => h._key === key);
  set(ref(db, `hutangpiutang/${key}`), { nama, jumlah, tanggal, keterangan, tipe: hpTab, terbayar: target.terbayar || 0 });
  const btn = document.getElementById('btn-simpan-hp');
  btn.textContent = '+ Tambah';
  btn.onclick = tambahHP;
  document.getElementById('hp-nama').value = '';
  document.getElementById('hp-jumlah').value = '';
  document.getElementById('hp-keterangan').value = '';
}

function bukaCicilan(key, nama, sisa) {
  cicilanTargetKey = key;
  document.getElementById('cicilan-label').textContent = `Bayar ${hpTab === 'piutang' ? 'piutang' : 'hutang'} — ${nama} (Sisa: ${formatRupiah(sisa)})`;
  document.getElementById('cicilan-jumlah').value = '';
  document.getElementById('cicilan-keterangan').value = '';
  document.getElementById('cicilan-tanggal').valueAsDate = new Date();

  // Update pilihan metode pembayaran
  const metodeEl = document.getElementById('cicilan-metode');
  if (metodeEl) metodeEl.innerHTML = bankList.map(b => `<option value="${b}">${b}</option>`).join('');

  document.getElementById('form-cicilan').style.display = 'block';
}

function tutupCicilan() {
  cicilanTargetKey = null;
  document.getElementById('form-cicilan').style.display = 'none';
}

function simpanCicilan() {
  if (!cicilanTargetKey) return;
  const jumlah = parseFloat(document.getElementById('cicilan-jumlah').value);
  const tanggal = document.getElementById('cicilan-tanggal').value;
  const metode = document.getElementById('cicilan-metode')?.value || 'Cash';
  const keterangan = document.getElementById('cicilan-keterangan').value.trim();

  if (!jumlah || jumlah <= 0) { alert('Isi jumlah bayar!'); return; }
  if (!tanggal) { alert('Isi tanggal!'); return; }

  const hp = hpData.find(h => h._key === cicilanTargetKey);
  if (!hp) return;

  // Update terbayar
  const terbayarBaru = (hp.terbayar || 0) + jumlah;
  set(ref(db, `hutangpiutang/${cicilanTargetKey}/terbayar`), terbayarBaru);

  // Simpan histori pembayaran ke Firebase
  const sisaSetelahBayar = hp.jumlah - terbayarBaru;
  push(ref(db, `hutangpiutang/${cicilanTargetKey}/histori`), {
    tanggal,
    jumlah,
    metode,
    keterangan: keterangan || (hp.tipe === 'hutang' ? `Bayar hutang — ${hp.nama}` : `Terima piutang — ${hp.nama}`),
    sisaSetelah: sisaSetelahBayar < 0 ? 0 : sisaSetelahBayar
  });

  // Catat otomatis ke transaksi
  if (hp.tipe === 'hutang') {
    push(transaksiRef, {
      id: Date.now(),
      tipe: 'keluar',
      keterangan: keterangan || `Bayar hutang — ${hp.nama}`,
      jumlah,
      kategori: 'Hutang',
      tanggal,
      metode
    });
  } else {
    push(transaksiRef, {
      id: Date.now(),
      tipe: 'masuk',
      keterangan: keterangan || `Terima piutang — ${hp.nama}`,
      jumlah,
      kategori: 'Piutang',
      tanggal,
      metode
    });
  }

  tutupCicilan();
  alert(`✅ ${hp.tipe === 'hutang' ? 'Pembayaran hutang' : 'Penerimaan piutang'} sebesar ${formatRupiah(jumlah)} berhasil dicatat!`);
}

function renderHP() {
  const container = document.getElementById('hp-list');
  const grafikContainer = document.getElementById('hp-grafik-list');
  const filtered = hpData.filter(h => h.tipe === hpTab);
  const totalPiutang = hpData.filter(h => h.tipe === 'piutang').reduce((s,h) => s + (h.jumlah - (h.terbayar || 0)), 0);
  const totalHutang = hpData.filter(h => h.tipe === 'hutang').reduce((s,h) => s + (h.jumlah - (h.terbayar || 0)), 0);
  const elP = document.getElementById('total-piutang');
  const elH = document.getElementById('total-hutang');
  if (elP) elP.textContent = formatRupiah(totalPiutang);
  if (elH) elH.textContent = formatRupiah(totalHutang);
  if (filtered.length === 0) { container.innerHTML = `<p style="font-size:13px;color:#aaa;text-align:center;padding:12px">Tidak ada ${hpTab === 'piutang' ? 'piutang' : 'hutang'}.</p>`; if (grafikContainer) grafikContainer.innerHTML = ''; return; }
  const totalSisa = filtered.reduce((s, h) => s + (h.jumlah - (h.terbayar || 0)), 0);
  container.innerHTML = `<div style="font-size:13px;color:#94a3b8;margin-bottom:10px">Sisa: <strong style="color:${hpTab==='piutang'?'#16a34a':'#dc2626'}">${formatRupiah(totalSisa)}</strong></div>` +
    filtered.map(h => {
  const terbayar = h.terbayar || 0;
  const sisa = h.jumlah - terbayar;
  const persen = Math.min((terbayar / h.jumlah) * 100, 100).toFixed(0);
  const warna = hpTab === 'piutang' ? '#10b981' : '#ef4444';
  const tgl = new Date(h.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const lunas = sisa <= 0;

  // Render histori pembayaran
  const historiList = h.histori ? Object.values(h.histori) : [];
  historiList.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const historiHTML = historiList.length === 0
    ? `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:8px">Belum ada pembayaran.</p>`
    : historiList.map(item => {
        const tglItem = new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        return `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
            <div>
              <div style="font-weight:500;color:#1e293b">${item.keterangan}</div>
              <div style="color:#94a3b8;margin-top:2px">${tglItem} · ${item.metode}</div>
              <div style="color:#94a3b8;margin-top:1px">Sisa setelah bayar: <strong>${formatRupiah(item.sisaSetelah)}</strong></div>
            </div>
            <div style="font-weight:600;color:${hpTab === 'piutang' ? '#16a34a' : '#dc2626'};flex-shrink:0;margin-left:8px">
              ${formatRupiah(item.jumlah)}
            </div>
          </div>
        `;
      }).join('');

  return `
    <div class="budget-item">
      <div class="budget-header">
        <span style="font-weight:500">${h.nama} ${lunas ? '✅' : ''}</span>
        <span class="budget-angka">${formatRupiah(terbayar)} / ${formatRupiah(h.jumlah)}</span>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${h.keterangan || ''} · ${tgl}</div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill" style="width:${persen}%;background:${warna}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <div class="budget-status">Sisa ${formatRupiah(sisa)} (${persen}% terbayar)</div>
        <div style="display:flex;gap:6px">
          ${!lunas ? `<button class="hp-lunas" onclick="bukaCicilan('${h._key}','${h.nama}',${sisa})">+ Bayar</button>` : ''}
          <button class="hp-lunas" onclick="editHP('${h._key}')">✏️ Edit</button>
          <button class="hp-lunas" onclick="tandaiLunas('${h._key}')" style="color:#dc2626;border-color:#dc2626">🗑 Hapus</button>
        </div>
      </div>

      <!-- ACCORDION HISTORI -->
      <div style="margin-top:10px;border-top:1px solid #f1f5f9;padding-top:8px">
        <button onclick="toggleHistori('histori-${h._key}')"
          style="width:100%;text-align:left;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;color:#6366f1;font-family:'Inter',sans-serif;padding:0;display:flex;justify-content:space-between;align-items:center">
          <span>📋 Histori Pembayaran (${historiList.length})</span>
          <span id="icon-${h._key}">▼</span>
        </button>
        <div id="histori-${h._key}" style="display:none;margin-top:8px">
          ${historiHTML}
        </div>
      </div>
    </div>
  `;
}).join('')
  if (grafikContainer) {
    grafikContainer.innerHTML = filtered.map(h => {
      const terbayar = h.terbayar || 0;
      const sisa = h.jumlah - terbayar;
      const persen = Math.min((terbayar / h.jumlah) * 100, 100).toFixed(0);
      const warna = hpTab === 'piutang' ? '#10b981' : '#ef4444';
      return `<div class="budget-item"><div class="budget-header"><span style="font-weight:500">${h.nama}</span><span class="budget-angka">Sisa ${formatRupiah(sisa)}</span></div><div class="budget-bar-track"><div class="budget-bar-fill" style="width:${persen}%;background:${warna}"></div></div><div class="budget-status">${persen}% terbayar dari ${formatRupiah(h.jumlah)}</div></div>`;
    }).join('');
  }
}

// ======= TARGET =======
function tambahTarget() {
  const nama = document.getElementById('target-nama').value.trim();
  const jumlah = parseFloat(document.getElementById('target-jumlah').value);
  const emoji = document.getElementById('target-emoji').value.trim() || '🎯';
  const deadline = document.getElementById('target-deadline').value;
  if (!nama || !jumlah || jumlah <= 0) { alert('Isi nama dan jumlah target!'); return; }
  push(targetRef, { nama, jumlah, emoji, deadline: deadline || null, terkumpul: 0, createdAt: Date.now() });
  document.getElementById('target-nama').value = '';
  document.getElementById('target-jumlah').value = '';
  document.getElementById('target-emoji').value = '';
  document.getElementById('target-deadline').value = '';
}

function hapusTarget(key) {
  if (!confirm('Hapus target ini?')) return;
  remove(ref(db, `target/${key}`));
}

function editTarget(key) {
  const t = targetData.find(t => t._key === key);
  if (!t) return;
  document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
  document.getElementById('tab-target').classList.add('active');
  document.querySelectorAll('.nav-tab')[4].classList.add('active');
  document.getElementById('target-nama').value = t.nama;
  document.getElementById('target-jumlah').value = t.jumlah;
  document.getElementById('target-emoji').value = t.emoji || '';
  document.getElementById('target-deadline').value = t.deadline || '';
  const btn = document.getElementById('btn-simpan-target');
  btn.textContent = '✏️ Update Target';
  btn.onclick = () => updateTarget(key);
  document.getElementById('target-nama').scrollIntoView({ behavior: 'smooth' });
}

function updateTarget(key) {
  const nama = document.getElementById('target-nama').value.trim();
  const jumlah = parseFloat(document.getElementById('target-jumlah').value);
  const emoji = document.getElementById('target-emoji').value.trim() || '🎯';
  const deadline = document.getElementById('target-deadline').value;
  if (!nama || !jumlah || jumlah <= 0) { alert('Isi nama dan jumlah target!'); return; }
  const target = targetData.find(t => t._key === key);
  set(ref(db, `target/${key}`), { nama, jumlah, emoji, deadline: deadline || null, terkumpul: target.terkumpul || 0, createdAt: target.createdAt });
  const btn = document.getElementById('btn-simpan-target');
  btn.textContent = '+ Tambah Target';
  btn.onclick = tambahTarget;
  document.getElementById('target-nama').value = '';
  document.getElementById('target-jumlah').value = '';
  document.getElementById('target-emoji').value = '';
  document.getElementById('target-deadline').value = '';
}

function bukaDanaTarget(key, nama, sisa) {
  targetDanaKey = key;
  document.getElementById('target-dana-label').textContent = `Tambah dana untuk: ${nama} (Kurang: ${formatRupiah(sisa)})`;
  document.getElementById('target-dana-jumlah').value = '';
  document.getElementById('target-dana-tanggal').valueAsDate = new Date();

  const dariEl = document.getElementById('target-dana-dari');
  const keEl = document.getElementById('target-dana-ke');
  if (dariEl) dariEl.innerHTML = bankList.map(b => `<option value="${b}">${b}</option>`).join('');
  if (keEl) keEl.innerHTML = bankList.map(b => `<option value="${b}">${b}</option>`).join('');

  document.getElementById('form-target-dana').style.display = 'block';
  document.getElementById('form-target-dana').scrollIntoView({ behavior: 'smooth' });
}

function tutupDanaTarget() {
  targetDanaKey = null;
  document.getElementById('form-target-dana').style.display = 'none';
}

function simpanDanaTarget() {
  if (!targetDanaKey) return;
  const jumlah = parseFloat(document.getElementById('target-dana-jumlah').value);
  const tanggal = document.getElementById('target-dana-tanggal').value;
  const dari = document.getElementById('target-dana-dari')?.value || 'Cash';
  const ke = document.getElementById('target-dana-ke')?.value || 'Cash';

  if (!jumlah || jumlah <= 0) { alert('Isi jumlah dana!'); return; }
  if (!tanggal) { alert('Isi tanggal!'); return; }
  if (dari === ke) { alert('Rekening asal dan tujuan tidak boleh sama!'); return; }

  const target = targetData.find(t => t._key === targetDanaKey);
  if (!target) return;

  const terkumpulBaru = (target.terkumpul || 0) + jumlah;

  // Update terkumpul
  set(ref(db, `target/${targetDanaKey}/terkumpul`), terkumpulBaru);

  // Simpan histori
  push(ref(db, `target/${targetDanaKey}/histori`), {
    tanggal,
    jumlah,
    dari,
    ke,
    keterangan: `Tabungan target — ${target.emoji} ${target.nama}`,
    totalSetelah: terkumpulBaru > target.jumlah ? target.jumlah : terkumpulBaru
  });

  // Catat sebagai transfer (keluar dari rekening asal, masuk ke rekening tujuan)
  push(transaksiRef, {
    id: Date.now(),
    tipe: 'keluar',
    keterangan: `Transfer tabungan target — ${target.emoji} ${target.nama}`,
    jumlah,
    kategori: 'Transfer',
    tanggal,
    metode: dari
  });
  push(transaksiRef, {
    id: Date.now() + 1,
    tipe: 'masuk',
    keterangan: `Transfer tabungan target — ${target.emoji} ${target.nama}`,
    jumlah,
    kategori: 'Transfer',
    tanggal,
    metode: ke
  });

  tutupDanaTarget();
  alert(`✅ Dana ${formatRupiah(jumlah)} berhasil ditransfer dari ${dari} ke ${ke} untuk target ${target.nama}!`);
}

function renderTarget() {
  const list = document.getElementById('target-list');
  const ringkasan = document.getElementById('target-ringkasan');
  if (!list) return;
  const totalTarget = targetData.length;
  const tercapai = targetData.filter(t => (t.terkumpul || 0) >= t.jumlah).length;
  const totalDana = targetData.reduce((s, t) => s + (t.terkumpul || 0), 0);
  const totalDibutuhkan = targetData.reduce((s, t) => s + t.jumlah, 0);
  if (ringkasan) {
    ringkasan.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:#94a3b8">Total target</span><strong>${totalTarget} target</strong></div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:#94a3b8">Sudah tercapai</span><strong style="color:#16a34a">${tercapai} target ✅</strong></div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:#94a3b8">Total terkumpul</span><strong style="color:#6366f1">${formatRupiah(totalDana)}</strong></div><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#94a3b8">Total dibutuhkan</span><strong>${formatRupiah(totalDibutuhkan)}</strong></div>`;
  }
  if (targetData.length === 0) { list.innerHTML = '<p style="font-size:13px;color:#aaa;text-align:center;padding:20px">Belum ada target. Tambahkan target keuanganmu!</p>'; return; }
  list.innerHTML = targetData.map(t => {
    const terkumpul = t.terkumpul || 0;
    const sisa = t.jumlah - terkumpul;
    const persen = Math.min((terkumpul / t.jumlah) * 100, 100).toFixed(1);
    const tercapai = sisa <= 0;
    const warna = tercapai ? '#16a34a' : persen >= 75 ? '#6366f1' : persen >= 40 ? '#f59e0b' : '#94a3b8';
    let deadlineInfo = '';
    if (t.deadline) {
      const tgl = new Date(t.deadline);
      const hari = Math.ceil((tgl - new Date()) / (1000 * 60 * 60 * 24));
      const tglFormat = tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (hari < 0) deadlineInfo = `<span style="color:#dc2626;font-size:11px">⚠️ Deadline terlewat ${Math.abs(hari)} hari lalu</span>`;
      else if (hari <= 30) deadlineInfo = `<span style="color:#f59e0b;font-size:11px">⏰ ${hari} hari lagi (${tglFormat})</span>`;
      else deadlineInfo = `<span style="color:#94a3b8;font-size:11px">📅 ${tglFormat}</span>`;
    }
    const historiList = t.histori ? Object.values(t.histori) : [];
historiList.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
const historiHTML = historiList.length === 0
  ? `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:8px">Belum ada dana masuk.</p>`
  : historiList.map(item => {
      const tglItem = new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
          <div>
            <div style="font-weight:500;color:#1e293b">${item.keterangan}</div>
            <div style="color:#94a3b8;margin-top:2px">${tglItem} · ${item.dari} → ${item.ke}</div>
            <div style="color:#94a3b8;margin-top:1px">Total terkumpul: <strong>${formatRupiah(item.totalSetelah)}</strong></div>
          </div>
          <div style="font-weight:600;color:#16a34a;flex-shrink:0;margin-left:8px">${formatRupiah(item.jumlah)}</div>
        </div>
      `;
    }).join('');

return `<div class="budget-item" style="background:white;border:1px solid #f1f5f9;border-radius:12px;padding:16px;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
    <div>
      <span style="font-size:20px;margin-right:8px">${t.emoji}</span>
      <span style="font-size:15px;font-weight:600;color:#1e293b">${t.nama} ${tercapai ? '✅' : ''}</span>
    </div>
    <div style="display:flex;gap:4px">
      <button class="budget-hapus" onclick="editTarget('${t._key}')" style="font-size:14px;color:#3b82f6">✏️</button>
      <button class="budget-hapus" onclick="hapusTarget('${t._key}')" style="font-size:14px">🗑</button>
    </div>
  </div>
  ${deadlineInfo ? `<div style="margin-bottom:8px">${deadlineInfo}</div>` : ''}
  <div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:6px">
    <span>Terkumpul: <strong style="color:#1e293b">${formatRupiah(terkumpul)}</strong></span>
    <span>Target: <strong style="color:#1e293b">${formatRupiah(t.jumlah)}</strong></span>
  </div>
  <div class="budget-bar-track" style="height:10px">
    <div class="budget-bar-fill" style="width:${persen}%;background:${warna}"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
    <span style="font-size:12px;color:${warna};font-weight:600">${persen}% tercapai</span>
    <div style="display:flex;gap:6px">
      ${!tercapai
        ? `<span style="font-size:12px;color:#94a3b8">Kurang ${formatRupiah(sisa)}</span>
           <button class="hp-lunas" onclick="bukaDanaTarget('${t._key}','${t.nama}',${sisa})">+ Tambah Dana</button>`
        : `<span style="font-size:12px;color:#16a34a;font-weight:600">Target tercapai! 🎉</span>`
      }
    </div>
  </div>

  <!-- ACCORDION HISTORI -->
  <div style="margin-top:10px;border-top:1px solid #f1f5f9;padding-top:8px">
    <button onclick="toggleHistoriTarget('histori-target-${t._key}')"
      style="width:100%;text-align:left;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;color:#6366f1;font-family:'Inter',sans-serif;padding:0;display:flex;justify-content:space-between;align-items:center">
      <span>📋 Histori Dana (${historiList.length})</span>
      <span id="icon-target-${t._key}">▼</span>
    </button>
    <div id="histori-target-${t._key}" style="display:none;margin-top:8px">
      ${historiHTML}
    </div>
  </div>
</div>`;
  }).join('');
}

// ======= INSIGHT =======
function renderInsight() {
  const container = document.getElementById('insight-list');
  if (!container) return;
  const now = new Date();
  const bulanIni = now.toISOString().slice(0, 7);
  const bulanLalu = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const txBulanIni = transaksi.filter(t => t.tanggal.slice(0, 7) === bulanIni);
  const txBulanLalu = transaksi.filter(t => t.tanggal.slice(0, 7) === bulanLalu);
  const insights = [];
  const keluarIni = txBulanIni.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const keluarLalu = txBulanLalu.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const masukIni = txBulanIni.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const masukLalu = txBulanLalu.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  if (keluarLalu > 0) { const diff = ((keluarIni - keluarLalu) / keluarLalu * 100).toFixed(0); if (diff > 0) insights.push({ icon: '⚠️', warna: '#f59e0b', teks: `Pengeluaran bulan ini meningkat <strong>${diff}%</strong> dibanding bulan lalu.` }); else if (diff < 0) insights.push({ icon: '✅', warna: '#16a34a', teks: `Pengeluaran bulan ini turun <strong>${Math.abs(diff)}%</strong> dibanding bulan lalu. Bagus!` }); }
  const savingIni = masukIni > 0 ? ((masukIni - keluarIni) / masukIni * 100).toFixed(1) : 0;
  const savingLalu = masukLalu > 0 ? ((masukLalu - keluarLalu) / masukLalu * 100).toFixed(1) : 0;
  if (savingLalu > 0 && savingIni > 0) { const diffSaving = (savingIni - savingLalu).toFixed(1); if (diffSaving > 0) insights.push({ icon: '🎉', warna: '#16a34a', teks: `Bulan ini saving rate <strong>${savingIni}%</strong>, naik ${diffSaving}% dari bulan lalu!` }); }
  const kategoriMap = {};
  txBulanIni.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').forEach(t => { kategoriMap[t.kategori] = (kategoriMap[t.kategori] || 0) + t.jumlah; });
  const kategoriTerbesar = Object.entries(kategoriMap).sort((a,b) => b[1]-a[1])[0];
  if (kategoriTerbesar) { const persen = keluarIni > 0 ? ((kategoriTerbesar[1] / keluarIni) * 100).toFixed(0) : 0; insights.push({ icon: '📊', warna: '#6366f1', teks: `Pengeluaran terbesar: <strong>${kategoriTerbesar[0]}</strong> (${persen}% dari total pengeluaran).` }); }
  Object.keys(budget).forEach(kat => {
    const batas = budget[kat];
    const terpakai = transaksi.filter(t => t.tipe === 'keluar' && t.kategori === kat && t.tanggal.slice(0, 7) === bulanIni).reduce((s,t) => s+t.jumlah, 0);
    const persen = batas > 0 ? ((terpakai / batas) * 100).toFixed(0) : 0;
    if (terpakai > batas) insights.push({ icon: '🚨', warna: '#dc2626', teks: `Anggaran <strong>${kat}</strong> melebihi batas! Terpakai ${formatRupiah(terpakai)} dari ${formatRupiah(batas)}.` });
    else if (persen >= 80) insights.push({ icon: '⚡', warna: '#f59e0b', teks: `Anggaran <strong>${kat}</strong> sudah terpakai <strong>${persen}%</strong>.` });
  });
  targetData.forEach(t => {
    if (!t.deadline) return;
    const hari = Math.ceil((new Date(t.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    const persen = t.jumlah > 0 ? ((t.terkumpul || 0) / t.jumlah * 100).toFixed(0) : 0;
    if (hari > 0 && hari <= 30 && persen < 100) insights.push({ icon: '⏰', warna: '#6366f1', teks: `Target <strong>${t.emoji} ${t.nama}</strong> deadline <strong>${hari} hari lagi</strong>, baru ${persen}% tercapai.` });
  });
  const totalHutang = hpData.filter(h => h.tipe === 'hutang').reduce((s,h) => s + (h.jumlah - (h.terbayar||0)), 0);
  if (totalHutang > 0) insights.push({ icon: '💸', warna: '#ef4444', teks: `Masih ada hutang sebesar <strong>${formatRupiah(totalHutang)}</strong> yang belum lunas.` });
  if (insights.length === 0) { container.innerHTML = '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:12px">Belum ada insight.</p>'; return; }
  container.innerHTML = insights.map(i => `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:#f8fafc;border-radius:10px;margin-bottom:8px;border-left:3px solid ${i.warna}"><span style="font-size:18px;flex-shrink:0">${i.icon}</span><p style="font-size:13px;color:#1e293b;line-height:1.5">${i.teks}</p></div>`).join('');
}

// ======= NOTIFIKASI =======
async function mintaIzinNotifikasi() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function kirimNotifikasi(judul, isi) {
  if (Notification.permission !== 'granted') return;
  new Notification(judul, { body: isi, icon: '/favicon.ico' });
}

async function cekDanKirimNotifikasi() {
  const izin = await mintaIzinNotifikasi();
  if (!izin) return;
  const bulanIni = new Date().toISOString().slice(0, 7);
  Object.keys(budget).forEach(kat => {
    const batas = budget[kat];
    const terpakai = transaksi.filter(t => t.tipe === 'keluar' && t.kategori === kat && t.tanggal.slice(0, 7) === bulanIni).reduce((s, t) => s + t.jumlah, 0);
    const persen = batas > 0 ? ((terpakai / batas) * 100).toFixed(0) : 0;
    if (terpakai > batas) kirimNotifikasi(`🚨 Anggaran ${kat} Melebihi Batas!`, `Terpakai ${formatRupiah(terpakai)} dari ${formatRupiah(batas)}.`);
    else if (persen >= 80 && persen < 100) kirimNotifikasi(`⚡ Anggaran ${kat} Hampir Habis`, `Sudah terpakai ${persen}%.`);
  });
  targetData.forEach(t => {
    if (!t.deadline) return;
    const hari = Math.ceil((new Date(t.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    const persen = t.jumlah > 0 ? ((t.terkumpul || 0) / t.jumlah * 100).toFixed(0) : 0;
    if (hari > 0 && hari <= 30 && persen < 100) kirimNotifikasi(`⏰ Target ${t.nama} Mendekati Deadline`, `${hari} hari lagi, baru ${persen}% tercapai.`);
  });
}

async function aktifkanNotifikasi() {
  const izin = await mintaIzinNotifikasi();
  if (izin) { kirimNotifikasi('🔔 Notifikasi Aktif!', 'Kerta akan memberi tahu kamu kalau anggaran hampir habis.'); alert('✅ Notifikasi berhasil diaktifkan!'); }
  else { alert('❌ Izin notifikasi ditolak. Aktifkan manual di pengaturan browser.'); }
  toggleMenu();
}

// ======= BACKUP & RESTORE =======
function backupData() {
  const data = { versi: '1.0', tanggalBackup: new Date().toISOString(), mode: modeAktif, transaksi, budget, hutangpiutang: hpData, target: targetData };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const tgl = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `backup-kerta-${modeAktif}-${tgl}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert(`✅ Backup berhasil!`);
}

async function restoreData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.transaksi && !data.budget) { alert('❌ File tidak valid!'); return; }
      const konfirmasi = confirm(`Restore data?\n\nTransaksi: ${data.transaksi?.length || 0}\nAnggaran: ${Object.keys(data.budget || {}).length} kategori\nHutang/Piutang: ${data.hutangpiutang?.length || 0}\nTarget: ${data.target?.length || 0}\n\n⚠️ Data sekarang akan DIGANTI!`);
      if (!konfirmasi) { document.getElementById('input-restore').value = ''; return; }
      if (data.transaksi?.length > 0) { await set(ref(db, `transaksi`), null); for (const t of data.transaksi) { const { _key, ...d } = t; await push(transaksiRef, d); } }
      if (data.budget && Object.keys(data.budget).length > 0) await set(ref(db, `budget`), data.budget);
      if (data.hutangpiutang?.length > 0) { await set(ref(db, `hutangpiutang`), null); for (const h of data.hutangpiutang) { const { _key, ...d } = h; await push(hpRef, d); } }
      if (data.target?.length > 0) { await set(ref(db, `target`), null); for (const t of data.target) { const { _key, ...d } = t; await push(targetRef, d); } }
      document.getElementById('input-restore').value = '';
      alert('✅ Restore berhasil!');
    } catch (err) { alert('❌ Gagal restore.'); console.error(err); }
  };
  reader.readAsText(file);
}

// ======= DROPDOWN MENU =======
function toggleMenu() {
  const menu = document.getElementById('dropdown-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('dropdown-menu');
  const btn = document.querySelector('.btn-menu');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) menu.style.display = 'none';
});

// ======= AUTH FUNCTIONS =======
function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');
  if (!email || !password) { errEl.style.display = 'block'; errEl.textContent = 'Isi email dan password!'; return; }
  btnLogin.textContent = 'Memuat...';
  btnLogin.disabled = true;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => { errEl.style.display = 'none'; })
    .catch((error) => {
      btnLogin.textContent = 'Masuk';
      btnLogin.disabled = false;
      errEl.style.display = 'block';
      if (error.code === 'auth/invalid-credential') errEl.textContent = 'Email atau password salah!';
      else if (error.code === 'auth/too-many-requests') errEl.textContent = 'Terlalu banyak percobaan. Coba lagi nanti.';
      else if (error.code === 'auth/network-request-failed') errEl.textContent = 'Tidak ada koneksi internet. Periksa jaringan kamu.';
      else errEl.textContent = 'Gagal masuk. Coba lagi.';
    });
}

function logoutUser() {
  if (!confirm('Yakin mau keluar?')) return;
  signOut(auth);
}
// ======= ERROR HANDLING =======
function tampilkanError(pesan) {
  const banner = document.getElementById('error-banner');
  const text = document.getElementById('error-banner-text');
  if (banner && text) {
    text.textContent = '⚠️ ' + pesan;
    banner.style.display = 'flex';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
  }
}

// Deteksi koneksi internet
window.addEventListener('online', () => {
  const banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
});

window.addEventListener('offline', () => {
  tampilkanError('Tidak ada koneksi internet. Data mungkin tidak tersinkron.');
});
// ======= PENGATURAN =======
function simpanPengaturan() {
  set(pengaturanRef, { katKeluar, katMasuk, bankList });
}

function tambahKategori(tipe) {
  const inputId = tipe === 'keluar' ? 'input-kat-keluar' : 'input-kat-masuk';
  const nama = document.getElementById(inputId).value.trim();
  if (!nama) { alert('Isi nama kategori!'); return; }

  if (tipe === 'keluar') {
    if (katKeluar.includes(nama)) { alert('Kategori sudah ada!'); return; }
    katKeluar.push(nama);
  } else {
    if (katMasuk.includes(nama)) { alert('Kategori sudah ada!'); return; }
    katMasuk.push(nama);
  }

  document.getElementById(inputId).value = '';
  simpanPengaturan();
}

function hapusKategori(tipe, nama) {
  if (!confirm(`Hapus kategori "${nama}"?`)) return;
  if (tipe === 'keluar') {
    katKeluar = katKeluar.filter(k => k !== nama);
  } else {
    katMasuk = katMasuk.filter(k => k !== nama);
  }
  simpanPengaturan();
}

function tambahBank() {
  const nama = document.getElementById('input-bank').value.trim();
  if (!nama) { alert('Isi nama bank!'); return; }
  if (bankList.includes(nama)) { alert('Bank/dompet sudah ada!'); return; }
  bankList.push(nama);
  document.getElementById('input-bank').value = '';
  simpanPengaturan();
}

function hapusBank(nama) {
  if (!confirm(`Hapus "${nama}" dari daftar bank?`)) return;
  bankList = bankList.filter(b => b !== nama);
  simpanPengaturan();
}

function renderPengaturan() {
  const listKeluar = document.getElementById('list-kat-keluar');
  const listMasuk = document.getElementById('list-kat-masuk');
  const listBank = document.getElementById('list-bank');

  if (listKeluar) {
    listKeluar.innerHTML = katKeluar.map(k => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f8fafc;border-radius:8px;margin-bottom:5px;font-size:13px">
        <span>${k}</span>
        <button onclick="hapusKategori('keluar','${k}')" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px">✕</button>
      </div>
    `).join('');
  }

  if (listMasuk) {
    listMasuk.innerHTML = katMasuk.map(k => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f8fafc;border-radius:8px;margin-bottom:5px;font-size:13px">
        <span>${k}</span>
        <button onclick="hapusKategori('masuk','${k}')" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px">✕</button>
      </div>
    `).join('');
  }

  if (listBank) {
    listBank.innerHTML = bankList.map(b => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f8fafc;border-radius:8px;margin-bottom:5px;font-size:13px">
        <span>${b}</span>
        <button onclick="hapusBank('${b}')" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px">✕</button>
      </div>
    `).join('');
  }
}

function updateFormOptions() {
  // Update dropdown kategori di form transaksi
  const katEl = document.getElementById('kategori');
  if (katEl) {
    const list = tipeAktif === 'masuk' ? katMasuk : katKeluar;
    const current = katEl.value;
    katEl.innerHTML = list.map(k => `<option value="${k}" ${k === current ? 'selected' : ''}>${k}</option>`).join('');
  }

  // Update dropdown metode di form transaksi
  const metodeEl = document.getElementById('metode');
  if (metodeEl) {
    const current = metodeEl.value;
    metodeEl.innerHTML = bankList.map(b => `<option value="${b}" ${b === current ? 'selected' : ''}>${b}</option>`).join('');
  }

  // Update dropdown transfer
  const transferDari = document.getElementById('transfer-dari');
  const transferKe = document.getElementById('transfer-ke');
  if (transferDari) transferDari.innerHTML = bankList.map(b => `<option value="${b}">${b}</option>`).join('');
  if (transferKe) transferKe.innerHTML = bankList.map(b => `<option value="${b}">${b}</option>`).join('');

  // Update dropdown budget kategori
  const budgetKat = document.getElementById('budget-kat');
  if (budgetKat) budgetKat.innerHTML = katKeluar.map(k => `<option value="${k}">${k}</option>`).join('');

  // Update metodeList global
  metodeList.length = 0;
  bankList.forEach(b => metodeList.push(b));
}
// ======= LAPORAN PDF =======
function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const bulanIni = new Date().toISOString().slice(0, 7);
  const namaBulan = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const tglCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  // ======= HEADER =======
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('◈ Kerta', margin, 13);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Laporan Keuangan Bulanan', margin, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(namaBulan, pageW - margin, 13, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dicetak: ${tglCetak}`, pageW - margin, 20, { align: 'right' });

  let y = 42;

  // ======= RINGKASAN =======
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN KEUANGAN', margin, y);
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const txBulanIni = transaksi.filter(t => t.tanggal.slice(0, 7) === bulanIni);
  const totalMasuk = txBulanIni.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const totalKeluar = txBulanIni.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
  const allMasuk = transaksi.filter(t => t.tipe === 'masuk' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
const allKeluar = transaksi.filter(t => t.tipe === 'keluar' && t.kategori !== 'Transfer').reduce((s,t) => s+t.jumlah, 0);
const totalSaldoAwal = Object.values(saldoAwal).reduce((s, v) => s + v, 0);
const saldo = totalSaldoAwal + allMasuk - allKeluar;
  const cashflow = totalMasuk - totalKeluar;
  const savingRate = totalMasuk > 0 ? ((cashflow / totalMasuk) * 100).toFixed(1) : 0;
  const hariIni = new Date().getDate();

  const ringkasan = [
    ['Saldo Total', formatRupiah(saldo), 'Pemasukan Bulan Ini', formatRupiah(totalMasuk)],
    ['Pengeluaran Bulan Ini', formatRupiah(totalKeluar), 'Cashflow Bersih', (cashflow >= 0 ? '+ ' : '- ') + formatRupiah(Math.abs(cashflow))],
    ['Saving Rate', savingRate + '%', 'Rata-rata Harian', formatRupiah(totalKeluar / hariIni)],
  ];

  doc.autoTable({
    startY: y,
    head: [],
    body: ringkasan,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold', textColor: [100, 116, 139] },
      1: { cellWidth: 45, textColor: [30, 41, 59] },
      2: { cellWidth: 45, fontStyle: 'bold', textColor: [100, 116, 139] },
      3: { cellWidth: 45, textColor: [30, 41, 59] }
    },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 10;

  // ======= ANGGARAN =======
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('REALISASI ANGGARAN', margin, y);
  y += 2;
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const anggaranRows = Object.keys(budget).map(kat => {
    const batas = budget[kat];
    const terpakai = txBulanIni.filter(t => t.tipe === 'keluar' && t.kategori === kat).reduce((s,t) => s+t.jumlah, 0);
    const persen = batas > 0 ? ((terpakai / batas) * 100).toFixed(0) : 0;
    const status = terpakai > batas ? '⚠ Melebihi' : persen >= 80 ? '⚡ Hampir' : '✓ Aman';
    return [kat, formatRupiah(terpakai), formatRupiah(batas), persen + '%', status];
  });

  if (anggaranRows.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['Kategori', 'Terpakai', 'Anggaran', '%', 'Status']],
      body: anggaranRows,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ======= TRANSAKSI =======
  if (y > 220) { doc.addPage(); y = 20; }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`RIWAYAT TRANSAKSI (${txBulanIni.length} transaksi)`, margin, y);
  y += 2;
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const txRows = txBulanIni.map(t => {
    const tgl = new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const sign = t.tipe === 'masuk' ? '+' : '-';
    return [tgl, t.keterangan.slice(0, 30), t.kategori, t.metode, sign + formatRupiah(t.jumlah)];
  });

  if (txRows.length > 0) {
    doc.autoTable({
      startY: y,
      head: [['Tgl', 'Keterangan', 'Kategori', 'Metode', 'Jumlah']],
      body: txRows,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 65 },
        2: { cellWidth: 30 },
        3: { cellWidth: 22 },
        4: { cellWidth: 35, halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ======= HUTANG PIUTANG =======
  const hpAktif = hpData.filter(h => (h.jumlah - (h.terbayar || 0)) > 0);
  if (hpAktif.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('HUTANG & PIUTANG AKTIF', margin, y);
    y += 2;
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    const hpRows = hpAktif.map(h => {
      const sisa = h.jumlah - (h.terbayar || 0);
      const tgl = new Date(h.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return [h.tipe === 'piutang' ? 'Piutang' : 'Hutang', h.nama, h.keterangan || '-', tgl, formatRupiah(sisa)];
    });

    doc.autoTable({
      startY: y,
      head: [['Jenis', 'Nama', 'Keterangan', 'Tanggal', 'Sisa']],
      body: hpRows,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ======= FOOTER =======
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFillColor(248, 250, 252);
    doc.rect(0, footerY - 6, pageW, 16, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('◈ Kerta · Laporan otomatis', margin, footerY);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageW - margin, footerY, { align: 'right' });
  }

  // Download PDF
  doc.save(`laporan-kerta-${bulanIni}.pdf`);
  toggleMenu();
}
function toggleHistori(id) {
  const el = document.getElementById(id);
  const key = id.replace('histori-', '');
  const icon = document.getElementById('icon-' + key);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
}

function aturSaldoAwal() {
  // Buat modal
  const existing = document.getElementById('modal-saldo-awal');
  if (existing) existing.remove();

  const inputsHTML = bankList.map(b => `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <label style="font-size:13px;font-weight:500;color:#475569;width:80px">${b}</label>
      <input type="number" id="saldo-awal-${b}" placeholder="0" min="0"
        value="${saldoAwal[b] || ''}"
        style="flex:1;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:'Inter',sans-serif;margin-left:12px" />
    </div>
  `).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-saldo-awal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:400px;max-height:80vh;overflow-y:auto;margin:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0">Atur Saldo Awal</h3>
        <button onclick="document.getElementById('modal-saldo-awal').remove()"
          style="background:none;border:none;cursor:pointer;font-size:20px;color:#94a3b8">✕</button>
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:16px">Saldo awal tidak dihitung sebagai pemasukan. Kosongkan jika tidak ada.</p>
      ${inputsHTML}
      <button onclick="simpanSaldoAwal()"
        style="width:100%;padding:12px;background:#6366f1;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;margin-top:8px">
        💾 Simpan Saldo Awal
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  // Tutup modal kalau klik luar
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function simpanSaldoAwal() {
  const data = {};
  bankList.forEach(b => {
    const val = parseFloat(document.getElementById('saldo-awal-' + b)?.value);
    if (val && val > 0) data[b] = val;
  });
  set(saldoAwalRef, data);
  document.getElementById('modal-saldo-awal').remove();
  alert('✅ Saldo awal berhasil disimpan!');
}
function toggleHistoriTarget(id) {
  const el = document.getElementById(id);
  const key = id.replace('histori-target-', '');
  const icon = document.getElementById('icon-target-' + key);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▼' : '▲';
}

// ======= EXPOSE =======
window.gotoTab = gotoTab;
window.setType = setType;
window.tambahTransaksi = tambahTransaksi;
window.hapus = hapus;
window.editTransaksi = editTransaksi;
window.lakukanTransfer = lakukanTransfer;
window.simpanBudget = simpanBudget;
window.hapusBudget = hapusBudget;
window.editBudget = editBudget;
window.setHPTab = setHPTab;
window.tambahHP = tambahHP;
window.tandaiLunas = tandaiLunas;
window.editHP = editHP;
window.bukaCicilan = bukaCicilan;
window.tutupCicilan = tutupCicilan;
window.simpanCicilan = simpanCicilan;
window.tambahTarget = tambahTarget;
window.hapusTarget = hapusTarget;
window.editTarget = editTarget;
window.bukaDanaTarget = bukaDanaTarget;
window.tutupDanaTarget = tutupDanaTarget;
window.simpanDanaTarget = simpanDanaTarget;
window.renderInsight = renderInsight;
window.cekDanKirimNotifikasi = cekDanKirimNotifikasi;
window.aktifkanNotifikasi = aktifkanNotifikasi;
window.backupData = backupData;
window.restoreData = restoreData;
window.toggleMenu = toggleMenu;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.gantiMode = gantiMode;
window.setFilterType = setFilterType;
window.render = render;
window.updateTarget = updateTarget;
window.updateHP = updateHP;
window.updateBudget = updateBudget;
window.updateTransaksi = updateTransaksi;
window.tampilkanError = tampilkanError;
window.tambahKategori = tambahKategori;
window.hapusKategori = hapusKategori;
window.tambahBank = tambahBank;
window.hapusBank = hapusBank;
window.generatePDF = generatePDF;
window.toggleHistori = toggleHistori;
window.aturSaldoAwal = aturSaldoAwal;
window.simpanSaldoAwal = simpanSaldoAwal;
window.toggleHistoriTarget = toggleHistoriTarget;
