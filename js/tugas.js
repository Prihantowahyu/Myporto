/**
 * ============================================================================
 * RUANG TUGAS KULIAH & REPOSITORI AKADEMIK
 * Modul Manajemen Tugas Kuliah Dinamis dengan IndexedDB, Filter Realtime,
 * Multi-Lampiran (Foto & Berkas), Table/Grid View Switcher, Pagination,
 * CRUD Kategori Mata Kuliah, & Sinkronisasi Cloud Supabase
 * ============================================================================
 */

(function () {
    'use strict';

    // ---- KONFIGURASI DATABASE INDEXEDDB ----
    const DB_NAME = 'MyPortoTugasDB';
    const DB_VERSION = 2; // Naikkan ke v2 untuk dukungan multi-lampiran
    const STORE_ASSIGNMENTS = 'assignments';
    const STORE_FILES = 'assignment_files';

    // ---- PERSISTENCE KEYS (ANTI-RESET / HAPUS PERMANEN DINAMIS) ----
    const SEED_DONE_KEY = 'ruangtugas_seed_initialized_v2';
    const DELETED_IDS_KEY = 'ruangtugas_deleted_ids';
    const KATEGORI_KEY = 'ruangtugas_kategori';

    let dbInstance = null;
    let assignmentsData = [];
    let blobUrlCache = {}; // Cache ObjectURL untuk preview gambar tersimpan di DB
    let currentFilter = {
        search: '',
        course: 'all',
        status: 'all',
        sortBy: 'deadline-asc'
    };
    let currentView = localStorage.getItem('ruangtugas_view') || 'grid';
    let currentPagination = {
        page: 1,
        perPage: localStorage.getItem('ruangtugas_per_page') || '12'
    };
    let editingId = null;

    // Multi-attachment staging state: array of { id, name, size, type, isImage, file, blob, previewUrl, url, isExisting }
    let stagedAttachments = [];

    // Lightbox Gallery State
    let lightboxGallery = {
        images: [],
        currentIndex: 0,
        title: ''
    };

    // Supabase Cloud State (Multi-User Realtime Sync untuk GitHub Pages)
    let supabaseClient = null;
    let isCloudActive = false;

    // ==========================================
    // 1. MANAJEMEN DELETED IDS & ANTI-RESET
    // ==========================================
    function getDeletedIds() {
        try {
            return JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function recordDeletedId(id) {
        const list = getDeletedIds();
        if (!list.includes(id)) {
            list.push(id);
            localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(list));
        }
    }

    // ==========================================
    // 2. INISIALISASI INDEXEDDB
    // ==========================================
    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_ASSIGNMENTS)) {
                    const assignStore = db.createObjectStore(STORE_ASSIGNMENTS, { keyPath: 'id' });
                    assignStore.createIndex('mataKuliah', 'mataKuliah', { unique: false });
                    assignStore.createIndex('status', 'status', { unique: false });
                    assignStore.createIndex('deadline', 'deadline', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    db.createObjectStore(STORE_FILES, { keyPath: 'id' });
                }
            };

            request.onsuccess = function (event) {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = function (event) {
                console.error('IndexedDB Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Helper Operasi DB
    async function dbGetAll() {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_ASSIGNMENTS, 'readonly');
            const store = tx.objectStore(STORE_ASSIGNMENTS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbPut(assignment, filesList) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_ASSIGNMENTS, STORE_FILES], 'readwrite');
            const assignStore = tx.objectStore(STORE_ASSIGNMENTS);
            const fileStore = tx.objectStore(STORE_FILES);

            assignStore.put(assignment);

            if (filesList && Array.isArray(filesList) && filesList.length > 0) {
                const filesData = filesList.map(f => ({
                    id: f.id,
                    name: f.name || f.fileName || '',
                    size: f.size || f.fileSize || 0,
                    type: f.type || f.fileType || '',
                    isImage: !!f.isImage,
                    blob: f.blob || f.file || null,
                    url: f.url || ''
                }));

                fileStore.put({
                    id: assignment.id,
                    files: filesData,
                    // Backward compatibility single file
                    blob: filesData[0].blob || null,
                    fileName: filesData[0].name || '',
                    fileType: filesData[0].type || ''
                });
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbDelete(id) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_ASSIGNMENTS, STORE_FILES], 'readwrite');
            tx.objectStore(STORE_ASSIGNMENTS).delete(id);
            tx.objectStore(STORE_FILES).delete(id);
            tx.oncomplete = () => {
                if (blobUrlCache[id]) {
                    URL.revokeObjectURL(blobUrlCache[id]);
                    delete blobUrlCache[id];
                }
                // Bersihkan cache spesifik lampiran
                Object.keys(blobUrlCache).forEach(k => {
                    if (k.startsWith(id + '_')) {
                        URL.revokeObjectURL(blobUrlCache[k]);
                        delete blobUrlCache[k];
                    }
                });
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbGetAttachment(assignmentId, attachmentId) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.get(assignmentId);
            req.onsuccess = () => {
                const res = req.result;
                if (!res) return resolve(null);
                if (res.files && Array.isArray(res.files)) {
                    if (attachmentId) {
                        const found = res.files.find(f => f.id === attachmentId);
                        if (found) return resolve(found);
                    }
                    return resolve(res.files[0] || null);
                }
                // fallback legacy record:
                resolve(res);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGetAllFiles(assignmentId) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.get(assignmentId);
            req.onsuccess = () => {
                const res = req.result;
                if (!res) return resolve([]);
                if (res.files && Array.isArray(res.files)) return resolve(res.files);
                if (res.blob) return resolve([{ id: 'legacy-' + assignmentId, name: res.fileName, blob: res.blob, type: res.fileType, isImage: isImageFile(res.fileName, res.fileType) }]);
                resolve([]);
            };
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // 3. NORMALISASI LAMPIRAN (MULTI-FILE)
    // ==========================================
    function normalizeAttachments(item) {
        if (!item.attachments || !Array.isArray(item.attachments)) {
            item.attachments = [];
        }

        // Backward compatibility dengan legacy file
        if (item.attachments.length === 0 && item.fileName && item.fileName.trim()) {
            item.attachments.push({
                id: 'att-legacy-' + (item.id || Date.now()),
                name: item.fileName,
                size: item.fileSize || 0,
                type: item.fileType || '',
                isImage: isImageFile(item.fileName, item.fileType),
                url: item.imageUrl || '',
                isLegacy: true
            });
        }

        // Backward compatibility dengan legacy image URL jika belum terdaftar
        if (item.imageUrl && item.imageUrl.trim() && !item.attachments.some(a => a.url === item.imageUrl)) {
            item.attachments.push({
                id: 'att-img-' + (item.id || Date.now()),
                name: 'Foto Dokumentasi Tugas',
                size: 0,
                type: 'image/jpeg',
                isImage: true,
                url: item.imageUrl
            });
        }

        return item.attachments;
    }

    function isImageFile(fileName, fileType) {
        if (fileType && fileType.startsWith('image/')) return true;
        if (fileName && /\.(jpe?g|png|webp|gif|svg)$/i.test(fileName)) return true;
        return false;
    }

    // ==========================================
    // 4. SINKRONISASI CLOUD (SUPABASE)
    // ==========================================
    function getCloudCredentials() {
        const localUrl = localStorage.getItem('supabase_url');
        const localKey = localStorage.getItem('supabase_anon_key');
        const configUrl = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || '';
        const configKey = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '';

        const url = (localUrl && localUrl.trim()) || configUrl.trim();
        const anonKey = (localKey && localKey.trim()) || configKey.trim();

        return { url, anonKey };
    }

    async function initCloudClient() {
        const { url, anonKey } = getCloudCredentials();
        if (!url || !anonKey || !window.supabase || !window.supabase.createClient) {
            isCloudActive = false;
            supabaseClient = null;
            updateCloudUIIndicators(false);
            return false;
        }

        try {
            supabaseClient = window.supabase.createClient(url, anonKey);
            isCloudActive = true;
            updateCloudUIIndicators(true);
            subscribeToRealtimeCloud();
            return true;
        } catch (e) {
            console.error('Gagal inisialisasi client Supabase:', e);
            isCloudActive = false;
            supabaseClient = null;
            updateCloudUIIndicators(false);
            return false;
        }
    }

    function mapAssignmentToDb(item) {
        return {
            id: item.id,
            mata_kuliah: item.mataKuliah || '',
            kode_mk: item.kodeMK || '',
            semester: item.semester || '',
            dosen: item.dosen || '',
            pengunggah: item.pengunggah || 'Wahyu Prihanto',
            nim: item.nim || '',
            judul: item.judul || '',
            deskripsi: item.deskripsi || '',
            deadline: item.deadline || '',
            tanggal_kumpul: item.tanggalKumpul || '',
            status: item.status || 'belum',
            file_name: item.fileName || (item.attachments && item.attachments[0] ? item.attachments[0].name : ''),
            file_size: item.fileSize || (item.attachments && item.attachments[0] ? item.attachments[0].size : 0),
            file_type: item.fileType || (item.attachments && item.attachments[0] ? item.attachments[0].type : ''),
            image_url: item.imageUrl || '',
            github_url: item.githubUrl || '',
            demo_url: item.demoUrl || ''
        };
    }

    function mapDbToAssignment(row) {
        const item = {
            id: row.id,
            mataKuliah: row.mata_kuliah || '',
            kodeMK: row.kode_mk || '',
            semester: row.semester || '',
            dosen: row.dosen || '',
            pengunggah: row.pengunggah || 'Wahyu Prihanto',
            nim: row.nim || '',
            judul: row.judul || '',
            deskripsi: row.deskripsi || '',
            deadline: row.deadline || '',
            tanggalKumpul: row.tanggal_kumpul || '',
            status: row.status || 'belum',
            fileName: row.file_name || '',
            fileSize: row.file_size || 0,
            fileType: row.file_type || '',
            imageUrl: row.image_url || '',
            githubUrl: row.github_url || '',
            demoUrl: row.demo_url || '',
            createdAt: row.created_at || new Date().toISOString(),
            attachments: []
        };
        normalizeAttachments(item);
        return item;
    }

    async function fetchCloudAssignments() {
        if (!supabaseClient) return null;
        try {
            const { data, error } = await supabaseClient
                .from('tugas')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase fetch error:', error);
                return null;
            }
            return data.map(mapDbToAssignment);
        } catch (e) {
            console.error('Gagal fetchCloudAssignments:', e);
            return null;
        }
    }

    async function saveCloudAssignment(item) {
        if (!supabaseClient) return;
        try {
            const payload = mapAssignmentToDb(item);
            const { error } = await supabaseClient
                .from('tugas')
                .upsert(payload, { onConflict: 'id' });
            if (error) {
                console.error('Supabase upsert error:', error);
            }
        } catch (e) {
            console.error('Error saveCloudAssignment:', e);
        }
    }

    async function deleteCloudAssignment(id) {
        if (!supabaseClient) return;
        try {
            const { error } = await supabaseClient
                .from('tugas')
                .delete()
                .eq('id', id);
            if (error) {
                console.error('Supabase delete error:', error);
            }
        } catch (e) {
            console.error('Error deleteCloudAssignment:', e);
        }
    }

    function subscribeToRealtimeCloud() {
        if (!supabaseClient) return;
        try {
            supabaseClient
                .channel('tugas-channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tugas' }, async () => {
                    const cloudData = await fetchCloudAssignments();
                    if (cloudData) {
                        const deletedIds = getDeletedIds();
                        assignmentsData = cloudData.filter(d => !deletedIds.includes(d.id));
                        for (const item of assignmentsData) {
                            await dbPut(item, null);
                        }
                        populateCourseFilter();
                        renderCourseFilterPills();
                        renderStats();
                        renderView();
                        showToast('Ada pembaruan tugas dari cloud realtime!', 'info');
                    }
                })
                .subscribe();
        } catch (e) {
            console.error('Supabase Realtime subscription error:', e);
        }
    }

    function updateCloudUIIndicators(active) {
        const badge = document.getElementById('cloudStatusBadge');
        const text = document.getElementById('cloudStatusText');
        const dot = document.getElementById('cloudStatusDot');

        if (!badge || !text) return;

        if (active) {
            badge.className = 'cloud-status-badge connected';
            text.textContent = 'Cloud Sync Aktif';
            if (dot) dot.className = 'fas fa-circle-dot text-emerald';
        } else {
            badge.className = 'cloud-status-badge';
            text.textContent = 'Mode Lokal';
            if (dot) dot.className = 'fas fa-circle-dot';
        }
    }

    // ==========================================
    // 5. INISIALISASI DATA DINAMIS (ANTI-RESET)
    // ==========================================
    async function initData() {
        try {
            const cloudConnected = await initCloudClient();
            let loadedFromCloud = false;

            if (cloudConnected) {
                const cloudData = await fetchCloudAssignments();
                if (cloudData && cloudData.length > 0) {
                    const deletedIds = getDeletedIds();
                    assignmentsData = cloudData.filter(d => !deletedIds.includes(d.id));
                    loadedFromCloud = true;
                    for (const item of assignmentsData) {
                        await dbPut(item, null);
                    }
                }
            }

            if (!loadedFromCloud) {
                let localData = await dbGetAll();
                const isSeeded = localStorage.getItem(SEED_DONE_KEY) === 'true';
                const deletedIds = getDeletedIds();

                // Hanya seed dari data/tugas.json pada kunjungan pertama kali
                if (!isSeeded) {
                    if (localData.length === 0) {
                        try {
                            const response = await fetch('data/tugas.json?t=' + Date.now());
                            if (response.ok) {
                                const seed = await response.json();
                                if (Array.isArray(seed)) {
                                    for (const item of seed) {
                                        if (!deletedIds.includes(item.id)) {
                                            normalizeAttachments(item);
                                            await dbPut(item, null);
                                            localData.push(item);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('Menggunakan basis data lokal.');
                        }
                    }
                    localStorage.setItem(SEED_DONE_KEY, 'true');
                }

                // Normalisasi setiap item dan buang ID yang telah dihapus permanen oleh pengguna
                assignmentsData = localData
                    .filter(d => !deletedIds.includes(d.id))
                    .map(d => {
                        normalizeAttachments(d);
                        return d;
                    });

                // Hapus data sisa yang ada di blacklist dari IndexedDB
                for (const item of localData) {
                    if (deletedIds.includes(item.id)) {
                        await dbDelete(item.id);
                    }
                }
            }

            // Muat blob gambar ke cache untuk preview foto
            await loadBlobImagesToCache();

            populateCourseFilter();
            renderCourseFilterPills();
            renderStats();
            setViewMode(currentView);

            // Periksa jika ada target link pengumpulan dosen atau filter khusus mata kuliah
            checkUrlHighlight();
        } catch (error) {
            console.error('Gagal inisialisasi data:', error);
            showToast('Gagal memuat basis data tugas', 'error');
        }
    }

    async function loadBlobImagesToCache() {
        for (const item of assignmentsData) {
            try {
                const files = await dbGetAllFiles(item.id);
                files.forEach(f => {
                    if (f.blob && isImageFile(f.name, f.type)) {
                        const key = `${item.id}_${f.id}`;
                        if (!blobUrlCache[key]) {
                            blobUrlCache[key] = URL.createObjectURL(f.blob);
                        }
                        if (!blobUrlCache[item.id]) {
                            blobUrlCache[item.id] = blobUrlCache[key];
                        }
                    }
                });
            } catch (e) {
                // ignore
            }
        }
    }

    async function resetSampleData() {
        if (!confirm('Apakah Anda ingin memuat ulang contoh tugas default? Data contoh akan ditambahkan kembali ke aplikasi Anda.')) return;

        // Bersihkan ID default dari blacklist
        const currentDeleted = getDeletedIds().filter(id => !id.startsWith('tugas-10'));
        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(currentDeleted));

        try {
            const response = await fetch('data/tugas.json?t=' + Date.now());
            if (response.ok) {
                const seed = await response.json();
                if (Array.isArray(seed)) {
                    for (const item of seed) {
                        normalizeAttachments(item);
                        await dbPut(item, null);
                        const idx = assignmentsData.findIndex(a => a.id === item.id);
                        if (idx !== -1) assignmentsData[idx] = item;
                        else assignmentsData.push(item);
                    }
                    await loadBlobImagesToCache();
                    populateCourseFilter();
                    renderCourseFilterPills();
                    renderStats();
                    renderView();
                    showToast('Data contoh tugas berhasil dimuat ulang!', 'success');
                }
            }
        } catch (e) {
            showToast('Gagal memuat ulang contoh: ' + e.message, 'error');
        }
    }

    // ==========================================
    // 6. FILTER, SORT & PAGINATION LOGIC
    // ==========================================
    function getFilteredAssignments() {
        return assignmentsData.filter(item => {
            // Search query
            const q = currentFilter.search.toLowerCase().trim();
            const matchSearch = !q ||
                (item.judul && item.judul.toLowerCase().includes(q)) ||
                (item.mataKuliah && item.mataKuliah.toLowerCase().includes(q)) ||
                (item.kodeMK && item.kodeMK.toLowerCase().includes(q)) ||
                (item.deskripsi && item.deskripsi.toLowerCase().includes(q)) ||
                (item.dosen && item.dosen.toLowerCase().includes(q)) ||
                (item.pengunggah && item.pengunggah.toLowerCase().includes(q));

            // Filter Mata Kuliah
            const matchCourse = currentFilter.course === 'all' || item.mataKuliah === currentFilter.course;

            // Filter Status
            const matchStatus = currentFilter.status === 'all' || item.status === currentFilter.status;

            return matchSearch && matchCourse && matchStatus;
        }).sort((a, b) => {
            if (currentFilter.sortBy === 'deadline-asc') {
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            } else if (currentFilter.sortBy === 'deadline-desc') {
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(b.deadline) - new Date(a.deadline);
            } else if (currentFilter.sortBy === 'course-asc') {
                return (a.mataKuliah || '').localeCompare(b.mataKuliah || '');
            } else if (currentFilter.sortBy === 'created-desc') {
                return (b.id || '').localeCompare(a.id || '');
            }
            return 0;
        });
    }

    function getPaginatedItems(list) {
        if (currentPagination.perPage === 'all') return list;
        const perPage = parseInt(currentPagination.perPage, 10) || 12;
        const total = list.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        if (currentPagination.page > totalPages) {
            currentPagination.page = totalPages;
        }

        const start = (currentPagination.page - 1) * perPage;
        const end = start + perPage;
        return list.slice(start, end);
    }

    function setPage(p) {
        currentPagination.page = p;
        renderView();
        const toolbar = document.querySelector('.toolbar-card');
        if (toolbar) toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setPerPage(val) {
        currentPagination.perPage = val;
        currentPagination.page = 1;
        localStorage.setItem('ruangtugas_per_page', val);
        renderView();
    }

    function setViewMode(mode) {
        currentView = mode || 'grid';
        localStorage.setItem('ruangtugas_view', currentView);

        const gridEl = document.getElementById('assignmentsGrid');
        const tableWrapper = document.getElementById('assignmentsTableWrapper');
        const btnGrid = document.getElementById('btnViewGrid');
        const btnTable = document.getElementById('btnViewTable');

        if (btnGrid) btnGrid.classList.toggle('active', currentView === 'grid');
        if (btnTable) btnTable.classList.toggle('active', currentView === 'table');

        if (currentView === 'grid') {
            if (gridEl) gridEl.style.display = 'grid';
            if (tableWrapper) tableWrapper.style.display = 'none';
        } else {
            if (gridEl) gridEl.style.display = 'none';
            if (tableWrapper) tableWrapper.style.display = 'block';
        }
        renderView();
    }

    function renderView() {
        if (currentView === 'grid') {
            renderCards();
        } else {
            renderTable();
        }
        renderPagination();
    }

    function populateCourseFilter() {
        const select = document.getElementById('filterCourse');
        if (!select) return;

        const courses = [...new Set(assignmentsData.map(a => a.mataKuliah).filter(Boolean))].sort();
        const currentVal = select.value;

        select.innerHTML = '<option value="all">Semua Mata Kuliah</option>';
        courses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });

        if (courses.includes(currentVal)) {
            select.value = currentVal;
        } else {
            select.value = currentFilter.course || 'all';
        }
    }

    function renderCourseFilterPills() {
        const container = document.getElementById('coursePillsList');
        const shareBtn = document.getElementById('btnShareCourse');
        if (!container) return;

        const courses = [...new Set(assignmentsData.map(a => a.mataKuliah).filter(Boolean))].sort();
        const totalAll = assignmentsData.length;

        let pillsHtml = `
            <button type="button" class="course-pill-btn ${currentFilter.course === 'all' ? 'active' : ''}" data-course="all">
                <i class="fas fa-list-check"></i>
                <span>Semua Mata Kuliah</span>
                <span class="course-pill-badge">${totalAll}</span>
            </button>
        `;

        courses.forEach(c => {
            const count = assignmentsData.filter(a => a.mataKuliah === c).length;
            const isActive = currentFilter.course === c;
            pillsHtml += `
                <button type="button" class="course-pill-btn ${isActive ? 'active' : ''}" data-course="${escapeHtml(c)}">
                    <i class="fas fa-book-bookmark"></i>
                    <span>${escapeHtml(c)}</span>
                    <span class="course-pill-badge">${count}</span>
                </button>
            `;
        });

        container.innerHTML = pillsHtml;

        if (shareBtn) {
            if (currentFilter.course !== 'all') {
                shareBtn.style.display = 'inline-flex';
                shareBtn.innerHTML = `<i class="fas fa-link"></i> Salin Link ${escapeHtml(currentFilter.course)}`;
            } else {
                shareBtn.style.display = 'none';
            }
        }

        container.querySelectorAll('.course-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const courseVal = btn.getAttribute('data-course');
                setCourseFilter(courseVal);
            });
        });
    }

    function setCourseFilter(courseVal) {
        currentFilter.course = courseVal || 'all';
        currentPagination.page = 1;
        const select = document.getElementById('filterCourse');
        if (select) select.value = currentFilter.course;
        renderCourseFilterPills();
        renderView();
    }

    function copyCourseLink() {
        if (currentFilter.course === 'all') return;
        const baseHref = window.location.href.split('?')[0].split('#')[0];
        const url = `${baseHref}?mk=${encodeURIComponent(currentFilter.course)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                showToast(`Link khusus mata kuliah "${currentFilter.course}" berhasil disalin!`, 'success');
            }).catch(() => {
                fallbackCopyText(url);
            });
        }
    }

    // ==========================================
    // 7. STATISTIK KARTU
    // ==========================================
    function renderStats() {
        const total = assignmentsData.length;
        const selesai = assignmentsData.filter(a => a.status === 'selesai').length;
        const proses = assignmentsData.filter(a => a.status === 'proses').length;
        const belum = assignmentsData.filter(a => a.status === 'belum').length;
        const courses = new Set(assignmentsData.map(a => a.mataKuliah).filter(Boolean)).size;

        const elTotal = document.getElementById('statTotal');
        const elSelesai = document.getElementById('statSelesai');
        const elProses = document.getElementById('statProses');
        const elBelum = document.getElementById('statBelum');
        const elCourses = document.getElementById('statCourses');
        const elProgress = document.getElementById('statProgressFill');
        const elProgressTxt = document.getElementById('statProgressText');

        if (elTotal) elTotal.textContent = total;
        if (elSelesai) elSelesai.textContent = selesai;
        if (elProses) elProses.textContent = proses;
        if (elBelum) elBelum.textContent = belum;
        if (elCourses) elCourses.textContent = courses;

        const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;
        if (elProgress) elProgress.style.width = `${pct}%`;
        if (elProgressTxt) elProgressTxt.textContent = `${pct}% Selesai`;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatDeadline(deadlineStr) {
        if (!deadlineStr) return { text: 'Tidak ada batas waktu', statusClass: 'deadline-none', countdown: '' };

        const deadlineDate = new Date(deadlineStr);
        const now = new Date();
        const diffMs = deadlineDate - now;
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        const dateFormatted = deadlineDate.toLocaleDateString('id-ID', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        if (diffMs < 0) {
            return {
                text: dateFormatted,
                statusClass: 'deadline-passed',
                countdown: 'Telah lewat'
            };
        } else if (diffHours <= 24) {
            return {
                text: dateFormatted,
                statusClass: 'deadline-urgent',
                countdown: `Tersisa ${diffHours} jam!`
            };
        } else if (diffDays <= 3) {
            return {
                text: dateFormatted,
                statusClass: 'deadline-soon',
                countdown: `Tersisa ${diffDays} hari`
            };
        } else {
            return {
                text: dateFormatted,
                statusClass: 'deadline-safe',
                countdown: `Sisa ${diffDays} hari`
            };
        }
    }

    function getFileIcon(fileName) {
        if (!fileName) return 'fa-file';
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return 'fa-file-pdf text-red';
            case 'doc':
            case 'docx': return 'fa-file-word text-blue';
            case 'zip':
            case 'rar':
            case '7z': return 'fa-file-zipper text-amber';
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'webp': return 'fa-file-image text-green';
            case 'xls':
            case 'xlsx': return 'fa-file-excel text-green';
            case 'ppt':
            case 'pptx': return 'fa-file-powerpoint text-orange';
            default: return 'fa-file-code text-cyan';
        }
    }

    function getAssignmentImages(item) {
        const images = [];
        const atts = item.attachments || [];
        atts.forEach(att => {
            if (att.isImage) {
                const blobUrl = blobUrlCache[`${item.id}_${att.id}`] || (blobUrlCache[item.id] && att.isLegacy ? blobUrlCache[item.id] : null);
                const src = blobUrl || att.url || null;
                if (src && !images.includes(src)) images.push(src);
            }
        });
        if (item.imageUrl && item.imageUrl.trim() && !images.includes(item.imageUrl)) {
            images.push(item.imageUrl);
        }
        if (blobUrlCache[item.id] && !images.includes(blobUrlCache[item.id])) {
            images.push(blobUrlCache[item.id]);
        }
        return images;
    }

    function getAssignmentDocs(item) {
        const atts = item.attachments || [];
        return atts.filter(a => !a.isImage);
    }

    // ==========================================
    // 8. RENDERING CARDS (GRID VIEW)
    // ==========================================
    function renderCards() {
        const container = document.getElementById('assignmentsGrid');
        if (!container) return;

        const allFiltered = getFilteredAssignments();

        if (allFiltered.length === 0) {
            container.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-icon"><i class="fas fa-folder-open"></i></div>
                    <h3>Tidak ada tugas yang ditemukan</h3>
                    <p>Coba sesuaikan kata kunci pencarian atau klik tombol <strong>"Tambah Tugas Baru"</strong> untuk mencatat tugas pertama Anda.</p>
                    <button class="btn-primary-action" onclick="window.tugasApp.openModal()">
                        <i class="fas fa-plus"></i> Tambah Tugas Baru
                    </button>
                </div>
            `;
            return;
        }

        const pageItems = getPaginatedItems(allFiltered);

        container.innerHTML = pageItems.map(item => {
            const dl = formatDeadline(item.deadline);
            const statusLabels = {
                'belum': { text: 'Belum Dikerjakan', class: 'status-belum', icon: 'fa-hourglass-start' },
                'proses': { text: 'Sedang Dikerjakan', class: 'status-proses', icon: 'fa-spinner fa-spin' },
                'selesai': { text: 'Selesai / Terkumpul', class: 'status-selesai', icon: 'fa-circle-check' }
            };
            const st = statusLabels[item.status] || statusLabels['belum'];

            const images = getAssignmentImages(item);
            const docs = getAssignmentDocs(item);
            const hasPhoto = images.length > 0;
            const hasDocs = docs.length > 0;

            // Galeri Foto Markup
            let galleryHtml = '';
            if (hasPhoto) {
                const mainImg = images[0];
                const imagesJson = escapeHtml(JSON.stringify(images));
                const itemJudul = escapeHtml(item.judul);

                if (images.length === 1) {
                    galleryHtml = `
                        <div class="tugas-card-image-box" onclick="window.tugasApp.openImageLightbox(${imagesJson}, '${itemJudul}', 0)" title="Klik untuk memperbesar foto tugas">
                            <img src="${escapeHtml(mainImg)}" alt="${itemJudul}" class="tugas-card-img" loading="lazy" onerror="this.parentElement.style.display='none';">
                            <div class="photo-overlay-badge">
                                <i class="fas fa-camera"></i> Foto Tugas <span class="zoom-hint"><i class="fas fa-expand"></i></span>
                            </div>
                        </div>
                    `;
                } else {
                    galleryHtml = `
                        <div class="tugas-card-gallery">
                            <div class="gallery-main-view" onclick="window.tugasApp.openImageLightbox(${imagesJson}, '${itemJudul}', 0)" title="Klik untuk memperbesar galeri foto">
                                <img src="${escapeHtml(mainImg)}" alt="${itemJudul}" class="gallery-main-img" loading="lazy">
                                <div class="gallery-count-badge">
                                    <i class="fas fa-images"></i> ${images.length} Foto <span class="zoom-hint"><i class="fas fa-expand"></i></span>
                                </div>
                            </div>
                            <div class="gallery-strip-container">
                                ${images.map((img, idx) => `
                                    <img src="${escapeHtml(img)}" class="gallery-strip-thumb ${idx === 0 ? 'active' : ''}" 
                                         onclick="window.tugasApp.openImageLightbox(${imagesJson}, '${itemJudul}', ${idx})" 
                                         alt="Foto ${idx + 1}" title="Lihat Foto ${idx + 1}">
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            // Lampiran Berkas Markup
            let attachmentsHtml = '';
            if (hasDocs) {
                attachmentsHtml = `
                    <div class="attachments-chips-wrapper">
                        <div class="attachments-header-row">
                            <span><i class="fas fa-paperclip text-neon-cyan"></i> Lampiran Berkas (${docs.length})</span>
                            ${docs.length > 1 ? `
                                <button type="button" class="btn-download-all-attachments" onclick="window.tugasApp.downloadAllFiles('${item.id}')" title="Unduh semua berkas tugas ini">
                                    <i class="fas fa-file-zipper"></i> Unduh Semua
                                </button>
                            ` : ''}
                        </div>
                        <div class="attachments-chips-list">
                            ${docs.map(doc => {
                                const docIcon = getFileIcon(doc.name);
                                return `
                                    <div class="attachment-chip-item" title="${escapeHtml(doc.name)} (${formatBytes(doc.size)})">
                                        <i class="fas ${docIcon}"></i>
                                        <span class="attachment-chip-name">${escapeHtml(doc.name)}</span>
                                        ${doc.size ? `<span class="attachment-chip-size">${formatBytes(doc.size)}</span>` : ''}
                                        <button type="button" class="attachment-chip-dl" onclick="window.tugasApp.downloadFile('${item.id}', '${doc.id}', '${escapeHtml(doc.name)}')" title="Unduh berkas ini">
                                            <i class="fas fa-download"></i>
                                        </button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else if (!hasPhoto) {
                attachmentsHtml = `
                    <div class="no-file-pill">
                        <i class="fas fa-paperclip"></i> Tidak ada berkas lampiran
                    </div>
                `;
            }

            return `
                <div class="tugas-card ${hasPhoto ? 'card-has-photo' : ''}" data-id="${item.id}" data-status="${item.status}">
                    ${galleryHtml}

                    <div class="tugas-card-header">
                        <div class="course-meta">
                            <span class="course-code">${escapeHtml(item.kodeMK || 'MK')}</span>
                            <span class="course-name" title="${escapeHtml(item.mataKuliah)}">
                                <i class="fas fa-book-bookmark"></i> ${escapeHtml(item.mataKuliah || 'Mata Kuliah')}
                            </span>
                        </div>
                        <div class="tugas-status-badge ${st.class}">
                            <i class="fas ${st.icon}"></i> ${st.text}
                        </div>
                    </div>

                    <div class="tugas-card-body">
                        ${item.pengunggah ? `
                            <div class="tugas-author-tag" title="Mahasiswa yang mengunggah tugas ini">
                                <i class="fas fa-user-graduate"></i>
                                <span>Diunggah oleh: <strong>${escapeHtml(item.pengunggah)}</strong></span>
                                ${item.nim ? `<span class="author-nim">&bull; ${escapeHtml(item.nim)}</span>` : ''}
                            </div>
                        ` : ''}

                        <h3 class="tugas-title">${escapeHtml(item.judul)}</h3>
                        
                        ${item.dosen || item.semester ? `
                            <div class="tugas-submeta">
                                ${item.semester ? `<span><i class="fas fa-graduation-cap"></i> ${escapeHtml(item.semester)}</span>` : ''}
                                ${item.dosen ? `<span><i class="fas fa-chalkboard-user"></i> ${escapeHtml(item.dosen)}</span>` : ''}
                            </div>
                        ` : ''}

                        <p class="tugas-description">${escapeHtml(item.deskripsi || 'Tidak ada catatan atau deskripsi tambahan.')}</p>

                        <div class="tugas-deadline-banner ${dl.statusClass}">
                            <div class="deadline-label">
                                <i class="fas fa-clock"></i> <strong>Deadline:</strong> ${dl.text}
                            </div>
                            ${dl.countdown ? `<span class="deadline-pill">${dl.countdown}</span>` : ''}
                        </div>

                        ${item.tanggalKumpul ? `
                            <div class="tugas-submitted-note">
                                <i class="fas fa-paper-plane text-emerald"></i> Dikumpulkan pada: <strong>${new Date(item.tanggalKumpul).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                            </div>
                        ` : ''}

                        <!-- Lampiran & Tautan Luar -->
                        <div class="tugas-attachments">
                            ${attachmentsHtml}

                            ${(item.githubUrl || item.demoUrl) ? `
                                <div class="tugas-links-group" style="margin-top: 8px;">
                                    ${item.githubUrl ? `
                                        <a href="${escapeHtml(item.githubUrl)}" target="_blank" rel="noopener noreferrer" class="link-chip chip-github">
                                            <i class="fab fa-github"></i> Repositori Proyek
                                        </a>
                                    ` : ''}
                                    ${item.demoUrl ? `
                                        <a href="${escapeHtml(item.demoUrl)}" target="_blank" rel="noopener noreferrer" class="link-chip chip-demo">
                                            <i class="fas fa-arrow-up-right-from-square"></i> Demo / URL Luar
                                        </a>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Card Footer Actions -->
                    <div class="tugas-card-footer">
                        <div class="quick-status-selector">
                            <label for="quickStatus-${item.id}">Status:</label>
                            <select id="quickStatus-${item.id}" class="status-quick-select" onchange="window.tugasApp.quickUpdateStatus('${item.id}', this.value)" title="Ubah status cepat">
                                <option value="belum" ${item.status === 'belum' ? 'selected' : ''}>⏳ Belum</option>
                                <option value="proses" ${item.status === 'proses' ? 'selected' : ''}>🔄 Proses</option>
                                <option value="selesai" ${item.status === 'selesai' ? 'selected' : ''}>✅ Selesai</option>
                            </select>
                        </div>
                        <div class="card-action-btns">
                            <button type="button" class="btn-action-icon btn-action-dosen" onclick="window.tugasApp.copyDosenLink('${item.id}')" title="Kirim / Salin Link Tugas untuk Dosen">
                                <i class="fas fa-paper-plane text-emerald"></i>
                            </button>
                            <button type="button" class="btn-action-icon" onclick="window.tugasApp.openModal('${item.id}')" title="Edit Tugas">
                                <i class="fas fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="btn-action-icon btn-action-delete" onclick="window.tugasApp.confirmDelete('${item.id}')" title="Hapus Tugas">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==========================================
    // 9. RENDERING TABLE (LIST VIEW DINAMIS)
    // ==========================================
    function renderTable() {
        const tbody = document.getElementById('assignmentsTableBody');
        if (!tbody) return;

        const allFiltered = getFilteredAssignments();

        if (allFiltered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px 16px;">
                        <i class="fas fa-folder-open" style="font-size: 2rem; color: var(--text-muted); opacity: 0.5;"></i>
                        <p style="margin-top: 8px; color: var(--text-muted);">Tidak ada tugas yang sesuai dengan filter.</p>
                    </td>
                </tr>
            `;
            return;
        }

        const pageItems = getPaginatedItems(allFiltered);

        tbody.innerHTML = pageItems.map(item => {
            const dl = formatDeadline(item.deadline);
            const statusLabels = {
                'belum': { text: 'Belum', class: 'status-belum', icon: 'fa-hourglass-start' },
                'proses': { text: 'Proses', class: 'status-proses', icon: 'fa-spinner fa-spin' },
                'selesai': { text: 'Selesai', class: 'status-selesai', icon: 'fa-circle-check' }
            };
            const st = statusLabels[item.status] || statusLabels['belum'];

            const images = getAssignmentImages(item);
            const docs = getAssignmentDocs(item);

            let filesMarkup = [];
            if (images.length > 0) {
                const imagesJson = escapeHtml(JSON.stringify(images));
                filesMarkup.push(`
                    <button type="button" class="attachment-chip-item" style="cursor: pointer;" onclick="window.tugasApp.openImageLightbox(${imagesJson}, '${escapeHtml(item.judul)}', 0)" title="Lihat Foto Dokumentasi">
                        <i class="fas fa-camera text-green"></i>
                        <span>${images.length} Foto</span>
                    </button>
                `);
            }

            docs.forEach(doc => {
                filesMarkup.push(`
                    <div class="attachment-chip-item" style="display:inline-flex;">
                        <i class="fas ${getFileIcon(doc.name)}"></i>
                        <span class="attachment-chip-name" style="max-width:110px;">${escapeHtml(doc.name)}</span>
                        <button type="button" class="attachment-chip-dl" onclick="window.tugasApp.downloadFile('${item.id}', '${doc.id}', '${escapeHtml(doc.name)}')" title="Unduh">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                `);
            });

            if (filesMarkup.length === 0) {
                filesMarkup.push('<span style="color:var(--text-muted); font-size:0.78rem;">-</span>');
            }

            return `
                <tr data-id="${item.id}">
                    <td>
                        <span class="tugas-status-badge ${st.class}">
                            <i class="fas ${st.icon}"></i> ${st.text}
                        </span>
                    </td>
                    <td>
                        <div class="table-course-cell">
                            <span class="course-code" style="align-self: flex-start;">${escapeHtml(item.kodeMK || 'MK')}</span>
                            <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${escapeHtml(item.mataKuliah)}</span>
                            ${item.dosen ? `<span style="font-size: 0.76rem; color: var(--text-muted);"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(item.dosen)}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <div class="table-title-cell">
                            <span class="table-title-main">${escapeHtml(item.judul)}</span>
                            ${item.pengunggah ? `
                                <span class="table-author-note">
                                    <i class="fas fa-user-graduate"></i> ${escapeHtml(item.pengunggah)} ${item.nim ? `(${escapeHtml(item.nim)})` : ''}
                                </span>
                            ` : ''}
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 0.82rem; font-weight: 600;">
                            <div>${dl.text}</div>
                            ${dl.countdown ? `<span class="deadline-pill" style="margin-top: 4px; display: inline-block;">${dl.countdown}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <div class="table-files-cell">
                            ${filesMarkup.join('')}
                        </div>
                    </td>
                    <td>
                        <div class="table-actions-cell">
                            <select class="status-quick-select" onchange="window.tugasApp.quickUpdateStatus('${item.id}', this.value)" title="Ubah status" style="padding: 2px 4px; font-size: 0.75rem;">
                                <option value="belum" ${item.status === 'belum' ? 'selected' : ''}>⏳</option>
                                <option value="proses" ${item.status === 'proses' ? 'selected' : ''}>🔄</option>
                                <option value="selesai" ${item.status === 'selesai' ? 'selected' : ''}>✅</option>
                            </select>
                            <button type="button" class="btn-action-icon btn-action-dosen" onclick="window.tugasApp.copyDosenLink('${item.id}')" title="Kirim ke Dosen">
                                <i class="fas fa-paper-plane text-emerald"></i>
                            </button>
                            <button type="button" class="btn-action-icon" onclick="window.tugasApp.openModal('${item.id}')" title="Edit">
                                <i class="fas fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="btn-action-icon btn-action-delete" onclick="window.tugasApp.confirmDelete('${item.id}')" title="Hapus">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // 10. RENDERING PAGINATION CONTROLS
    // ==========================================
    function renderPagination() {
        const infoEl = document.getElementById('paginationInfo');
        const controlsEl = document.getElementById('paginationControls');
        const perPageSelect = document.getElementById('perPageSelect');

        if (perPageSelect && perPageSelect.value !== currentPagination.perPage) {
            perPageSelect.value = currentPagination.perPage;
        }

        const allFiltered = getFilteredAssignments();
        const total = allFiltered.length;

        if (total === 0) {
            if (infoEl) infoEl.textContent = 'Menampilkan 0 tugas';
            if (controlsEl) controlsEl.innerHTML = '';
            return;
        }

        if (currentPagination.perPage === 'all') {
            if (infoEl) infoEl.textContent = `Menampilkan semua ${total} tugas`;
            if (controlsEl) controlsEl.innerHTML = '';
            return;
        }

        const perPage = parseInt(currentPagination.perPage, 10) || 12;
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        const startIdx = (currentPagination.page - 1) * perPage + 1;
        const endIdx = Math.min(startIdx + perPage - 1, total);

        if (infoEl) {
            infoEl.textContent = `Menampilkan ${startIdx}-${endIdx} dari ${total} tugas`;
        }

        if (!controlsEl) return;

        let btnsHtml = `
            <button type="button" class="pagination-btn" ${currentPagination.page <= 1 ? 'disabled' : ''} onclick="window.tugasApp.setPage(${currentPagination.page - 1})" title="Halaman Sebelumnya">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            // Show only first, last, and around current page
            if (totalPages > 7) {
                if (i !== 1 && i !== totalPages && Math.abs(i - currentPagination.page) > 1) {
                    if (i === 2 || i === totalPages - 1) {
                        btnsHtml += `<span style="padding: 0 4px; color: var(--text-muted);">&bull;</span>`;
                    }
                    continue;
                }
            }
            btnsHtml += `
                <button type="button" class="pagination-btn ${i === currentPagination.page ? 'active' : ''}" onclick="window.tugasApp.setPage(${i})">
                    ${i}
                </button>
            `;
        }

        btnsHtml += `
            <button type="button" class="pagination-btn" ${currentPagination.page >= totalPages ? 'disabled' : ''} onclick="window.tugasApp.setPage(${currentPagination.page + 1})" title="Halaman Selanjutnya">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        controlsEl.innerHTML = btnsHtml;
    }

    // ==========================================
    // 11. MULTI-ATTACHMENT MODAL FORM LOGIC
    // ==========================================
    function openModal(id = null) {
        editingId = id;
        stagedAttachments = [];

        const modal = document.getElementById('tugasModal');
        const form = document.getElementById('tugasForm');
        const titleEl = document.getElementById('modalTitle');
        if (!modal || !form) return;

        form.reset();

        if (id) {
            const item = assignmentsData.find(a => a.id === id);
            if (item) {
                titleEl.textContent = 'Edit Tugas Kuliah';
                document.getElementById('inputPengunggah').value = item.pengunggah || 'Wahyu Prihanto';
                document.getElementById('inputNim').value = item.nim || '';
                document.getElementById('inputMataKuliah').value = item.mataKuliah || '';
                document.getElementById('inputKodeMK').value = item.kodeMK || '';
                document.getElementById('inputSemester').value = item.semester || '';
                document.getElementById('inputDosen').value = item.dosen || '';
                document.getElementById('inputJudul').value = item.judul || '';
                document.getElementById('inputDeskripsi').value = item.deskripsi || '';
                document.getElementById('inputDeadline').value = item.deadline ? item.deadline.slice(0, 16) : '';
                document.getElementById('inputTanggalKumpul').value = item.tanggalKumpul || '';
                document.getElementById('inputStatus').value = item.status || 'belum';
                document.getElementById('inputImageUrl').value = item.imageUrl || '';
                document.getElementById('inputGithub').value = item.githubUrl || '';
                document.getElementById('inputDemo').value = item.demoUrl || '';

                // Muat berkas yang sudah tersimpan sebelumnya
                const existingAtts = normalizeAttachments(item);
                existingAtts.forEach(att => {
                    const blobUrl = blobUrlCache[`${item.id}_${att.id}`] || (blobUrlCache[item.id] && att.isLegacy ? blobUrlCache[item.id] : null);
                    stagedAttachments.push({
                        id: att.id,
                        name: att.name,
                        size: att.size || 0,
                        type: att.type || '',
                        isImage: !!att.isImage,
                        file: null,
                        blob: null,
                        previewUrl: blobUrl || att.url || null,
                        url: att.url || '',
                        isExisting: true
                    });
                });
            }
        } else {
            titleEl.textContent = 'Tambah Tugas Kuliah Baru';
            document.getElementById('inputPengunggah').value = localStorage.getItem('last_pengunggah') || 'Wahyu Prihanto';
            document.getElementById('inputNim').value = localStorage.getItem('last_nim') || '';
            document.getElementById('inputStatus').value = 'belum';

            const future = new Date();
            future.setDate(future.getDate() + 7);
            future.setHours(23, 59, 0, 0);
            document.getElementById('inputDeadline').value = future.toISOString().slice(0, 16);
        }

        renderStagedAttachments();

        modal.classList.add('active');
        document.body.classList.add('modal-open');
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) modalBody.scrollTop = 0;
    }

    function closeModal() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        document.body.classList.remove('modal-open');
        editingId = null;
        stagedAttachments = [];
    }

    function processSelectedFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i];
            const isImg = isImageFile(f.name, f.type);
            const attId = 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
            let previewUrl = null;
            if (isImg) {
                previewUrl = URL.createObjectURL(f);
            }

            stagedAttachments.push({
                id: attId,
                name: f.name,
                size: f.size,
                type: f.type,
                isImage: isImg,
                file: f,
                blob: f,
                previewUrl: previewUrl,
                url: '',
                isExisting: false
            });
        }

        renderStagedAttachments();
    }

    function renderStagedAttachments() {
        const container = document.getElementById('stagedFilesContainer');
        const listEl = document.getElementById('stagedFilesList');
        const countEl = document.getElementById('stagedFilesCount');
        const dropZone = document.getElementById('fileDropZone');

        if (!container || !listEl) return;

        const total = stagedAttachments.length;
        if (countEl) countEl.textContent = total;

        if (total === 0) {
            container.classList.add('hidden');
            if (dropZone) dropZone.classList.remove('has-file');
            listEl.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        if (dropZone) dropZone.classList.add('has-file');

        listEl.innerHTML = stagedAttachments.map(att => {
            const icon = getFileIcon(att.name);
            return `
                <div class="staged-file-card ${att.isExisting ? 'is-existing' : ''}" data-id="${att.id}">
                    ${att.isImage && att.previewUrl ? `
                        <img src="${escapeHtml(att.previewUrl)}" class="staged-file-thumb" alt="Preview Foto">
                    ` : `
                        <div class="staged-file-icon-box">
                            <i class="fas ${icon}"></i>
                        </div>
                    `}
                    <div class="staged-file-details">
                        <span class="staged-file-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
                        <span class="staged-file-meta">${att.size ? formatBytes(att.size) : 'Berkas tersimpan'}</span>
                    </div>
                    <button type="button" class="btn-remove-single-staged" onclick="window.tugasApp.removeStagedAttachment('${att.id}')" title="Hapus berkas ini">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    function removeStagedAttachment(attId) {
        const item = stagedAttachments.find(a => a.id === attId);
        if (item && item.previewUrl && !item.isExisting) {
            URL.revokeObjectURL(item.previewUrl);
        }
        stagedAttachments = stagedAttachments.filter(a => a.id !== attId);
        renderStagedAttachments();
    }

    function clearAllStagedAttachments() {
        stagedAttachments.forEach(att => {
            if (att.previewUrl && !att.isExisting) {
                URL.revokeObjectURL(att.previewUrl);
            }
        });
        stagedAttachments = [];
        renderStagedAttachments();
    }

    async function handleFormSubmit(e) {
        e.preventDefault();

        const pengunggah = document.getElementById('inputPengunggah').value.trim() || 'Wahyu Prihanto';
        const nim = document.getElementById('inputNim').value.trim();
        const mataKuliah = document.getElementById('inputMataKuliah').value.trim();
        const judul = document.getElementById('inputJudul').value.trim();

        if (!mataKuliah || !judul) {
            showToast('Mata kuliah dan judul tugas wajib diisi!', 'warning');
            return;
        }

        localStorage.setItem('last_pengunggah', pengunggah);
        if (nim) localStorage.setItem('last_nim', nim);

        const kodeMK = document.getElementById('inputKodeMK').value.trim();
        const semester = document.getElementById('inputSemester').value.trim();
        const dosen = document.getElementById('inputDosen').value.trim();
        const deskripsi = document.getElementById('inputDeskripsi').value.trim();
        const deadline = document.getElementById('inputDeadline').value;
        const tanggalKumpul = document.getElementById('inputTanggalKumpul').value;
        const status = document.getElementById('inputStatus').value;
        const imageUrl = document.getElementById('inputImageUrl').value.trim();
        const githubUrl = document.getElementById('inputGithub').value.trim();
        const demoUrl = document.getElementById('inputDemo').value.trim();

        // Siapkan metadata lampiran
        const attachmentsMetadata = stagedAttachments.map(a => ({
            id: a.id,
            name: a.name,
            size: a.size || 0,
            type: a.type || '',
            isImage: !!a.isImage,
            url: a.url || ''
        }));

        const firstDoc = stagedAttachments.find(a => !a.isImage) || stagedAttachments[0];
        const firstImg = stagedAttachments.find(a => a.isImage);

        let assignment = {};

        if (editingId) {
            const existing = assignmentsData.find(a => a.id === editingId);
            assignment = {
                ...existing,
                pengunggah,
                nim,
                mataKuliah,
                kodeMK,
                semester,
                dosen,
                judul,
                deskripsi,
                deadline,
                tanggalKumpul,
                status,
                imageUrl: imageUrl || (firstImg && firstImg.url ? firstImg.url : ''),
                githubUrl,
                demoUrl,
                fileName: firstDoc ? firstDoc.name : '',
                fileSize: firstDoc ? firstDoc.size : 0,
                fileType: firstDoc ? firstDoc.type : '',
                attachments: attachmentsMetadata,
                updatedAt: new Date().toISOString()
            };
        } else {
            const newId = 'tugas-' + Date.now();
            assignment = {
                id: newId,
                pengunggah,
                nim,
                mataKuliah,
                kodeMK,
                semester,
                dosen,
                judul,
                deskripsi,
                deadline,
                tanggalKumpul,
                status,
                fileName: firstDoc ? firstDoc.name : '',
                fileSize: firstDoc ? firstDoc.size : 0,
                fileType: firstDoc ? firstDoc.type : '',
                imageUrl,
                githubUrl,
                demoUrl,
                attachments: attachmentsMetadata,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        try {
            await dbPut(assignment, stagedAttachments);

            // Update blob image cache
            stagedAttachments.forEach(att => {
                if (att.isImage && (att.blob || att.file)) {
                    const key = `${assignment.id}_${att.id}`;
                    if (blobUrlCache[key]) URL.revokeObjectURL(blobUrlCache[key]);
                    blobUrlCache[key] = URL.createObjectURL(att.blob || att.file);
                    if (!blobUrlCache[assignment.id]) {
                        blobUrlCache[assignment.id] = blobUrlCache[key];
                    }
                }
            });

            // Sinkronisasi ke Supabase Cloud jika aktif
            if (isCloudActive && supabaseClient) {
                await saveCloudAssignment(assignment);
            }

            // Perbarui memori lokal
            if (editingId) {
                const idx = assignmentsData.findIndex(a => a.id === editingId);
                if (idx !== -1) assignmentsData[idx] = assignment;
            } else {
                assignmentsData.unshift(assignment);
            }

            closeModal();
            populateCourseFilter();
            renderCourseFilterPills();
            renderStats();
            renderView();
            showToast(editingId ? 'Tugas berhasil diperbarui!' : 'Tugas baru berhasil disimpan!', 'success');
        } catch (error) {
            console.error('Gagal menyimpan tugas:', error);
            showToast('Gagal menyimpan tugas: ' + error.message, 'error');
        }
    }

    // ==========================================
    // 12. STATUS UPDATE, HAPUS PERMANEN & UNDUH
    // ==========================================
    async function quickUpdateStatus(id, newStatus) {
        const item = assignmentsData.find(a => a.id === id);
        if (!item) return;

        item.status = newStatus;
        if (newStatus === 'selesai' && !item.tanggalKumpul) {
            item.tanggalKumpul = new Date().toISOString().slice(0, 10);
        }
        item.updatedAt = new Date().toISOString();

        try {
            await dbPut(item, null);

            if (isCloudActive && supabaseClient) {
                await saveCloudAssignment(item);
            }

            renderStats();
            renderView();
            showToast(`Status tugas diubah menjadi "${newStatus}"`, 'info');
        } catch (error) {
            console.error('Gagal memperbarui status:', error);
            showToast('Gagal memperbarui status', 'error');
        }
    }

    async function confirmDelete(id) {
        const item = assignmentsData.find(a => a.id === id);
        if (!item) return;

        const isConfirm = confirm(`Hapus permanen tugas "${item.judul}"? Tugas ini tidak akan muncul kembali.`);
        if (!isConfirm) return;

        try {
            // Catat ID ke daftar deleted IDs agar tidak pernah di-seed ulang
            recordDeletedId(id);

            await dbDelete(id);

            if (isCloudActive && supabaseClient) {
                await deleteCloudAssignment(id);
            }

            assignmentsData = assignmentsData.filter(a => a.id !== id);
            populateCourseFilter();
            renderCourseFilterPills();
            renderStats();
            renderView();
            showToast('Tugas berhasil dihapus secara permanen.', 'info');
        } catch (error) {
            console.error('Gagal menghapus tugas:', error);
            showToast('Gagal menghapus tugas', 'error');
        }
    }

    async function downloadFile(assignmentId, attachmentId, fallbackName) {
        try {
            const item = assignmentsData.find(a => a.id === assignmentId);
            const fileEntry = await dbGetAttachment(assignmentId, attachmentId);

            if (fileEntry && fileEntry.blob) {
                const blobUrl = URL.createObjectURL(fileEntry.blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileEntry.name || fileEntry.fileName || fallbackName || 'berkas-tugas';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                showToast(`Mengunduh ${fileEntry.name || fileEntry.fileName}...`, 'success');
            } else if (fileEntry && fileEntry.url) {
                const a = document.createElement('a');
                a.href = fileEntry.url;
                a.download = fileEntry.name || fallbackName || 'berkas-tugas';
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('Membuka tautan berkas...', 'info');
            } else if (item && item.imageUrl) {
                const a = document.createElement('a');
                a.href = item.imageUrl;
                a.download = fallbackName || 'foto-tugas';
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('Membuka tautan berkas foto...', 'info');
            } else {
                showToast('Berkas ini tersimpan sebagai metadata contoh atau belum di-upload di browser ini.', 'warning');
            }
        } catch (error) {
            console.error('Gagal mengunduh file:', error);
            showToast('Terjadi kesalahan saat mengambil berkas', 'error');
        }
    }

    async function downloadAllFiles(assignmentId) {
        const item = assignmentsData.find(a => a.id === assignmentId);
        if (!item) return;

        const docs = getAssignmentDocs(item);
        if (docs.length === 0) {
            showToast('Tidak ada berkas dokumen yang dapat diunduh.', 'warning');
            return;
        }

        showToast(`Memulai pengunduhan ${docs.length} berkas...`, 'info');
        let delay = 0;
        for (const doc of docs) {
            setTimeout(() => {
                downloadFile(assignmentId, doc.id, doc.name);
            }, delay);
            delay += 500;
        }
    }

    // ==========================================
    // 13. LIGHTBOX GALLERY DENGAN PREV & NEXT
    // ==========================================
    function openImageLightbox(srcOrList, title, startIndex = 0) {
        if (Array.isArray(srcOrList)) {
            lightboxGallery.images = srcOrList;
            lightboxGallery.currentIndex = startIndex || 0;
        } else {
            lightboxGallery.images = [srcOrList];
            lightboxGallery.currentIndex = 0;
        }
        lightboxGallery.title = title || 'Dokumentasi Tugas Kuliah';

        updateLightboxUI();

        const modal = document.getElementById('imageLightboxModal');
        if (modal) {
            modal.classList.add('active');
            document.body.classList.add('modal-open');
        }
    }

    function closeImageLightbox() {
        const modal = document.getElementById('imageLightboxModal');
        if (modal) modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    function updateLightboxUI() {
        const imgEl = document.getElementById('lightboxImage');
        const capEl = document.getElementById('lightboxCaption');
        const counterEl = document.getElementById('lightboxCounter');
        const prevBtn = document.getElementById('lightboxPrevBtn');
        const nextBtn = document.getElementById('lightboxNextBtn');

        if (!lightboxGallery.images.length) return;

        const currentSrc = lightboxGallery.images[lightboxGallery.currentIndex];
        if (imgEl) imgEl.src = currentSrc;
        if (capEl) capEl.textContent = `${lightboxGallery.title} (${lightboxGallery.currentIndex + 1} dari ${lightboxGallery.images.length})`;
        if (counterEl) counterEl.textContent = `${lightboxGallery.currentIndex + 1} / ${lightboxGallery.images.length}`;

        const isMultiple = lightboxGallery.images.length > 1;
        if (prevBtn) prevBtn.style.display = isMultiple ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = isMultiple ? 'flex' : 'none';
    }

    function prevLightboxImage() {
        if (lightboxGallery.images.length <= 1) return;
        lightboxGallery.currentIndex = (lightboxGallery.currentIndex - 1 + lightboxGallery.images.length) % lightboxGallery.images.length;
        updateLightboxUI();
    }

    function nextLightboxImage() {
        if (lightboxGallery.images.length <= 1) return;
        lightboxGallery.currentIndex = (lightboxGallery.currentIndex + 1) % lightboxGallery.images.length;
        updateLightboxUI();
    }

    // ==========================================
    // 14. EXPORT & IMPORT JSON
    // ==========================================
    function exportJSON() {
        if (assignmentsData.length === 0) {
            showToast('Belum ada data tugas untuk diekspor', 'warning');
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assignmentsData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `tugas-kuliah-${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showToast('Data tugas berhasil diekspor ke format JSON!', 'success');
    }

    function triggerImportJSON() {
        const input = document.getElementById('jsonFileInput');
        if (input) input.click();
    }

    async function handleImportJSON(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (!Array.isArray(imported)) {
                showToast('Format berkas JSON tidak valid!', 'error');
                return;
            }

            let addedCount = 0;
            for (const item of imported) {
                if (item.id && item.judul) {
                    normalizeAttachments(item);
                    await dbPut(item, null);
                    const idx = assignmentsData.findIndex(a => a.id === item.id);
                    if (idx !== -1) {
                        assignmentsData[idx] = item;
                    } else {
                        assignmentsData.push(item);
                    }
                    addedCount++;
                }
            }

            populateCourseFilter();
            renderCourseFilterPills();
            renderStats();
            renderView();

            showToast(`Berhasil mengimpor ${addedCount} data tugas!`, 'success');
        } catch (error) {
            console.error('Gagal impor JSON:', error);
            showToast('Gagal mengimpor berkas JSON: ' + error.message, 'error');
        } finally {
            e.target.value = '';
        }
    }

    // ==========================================
    // 15. FITUR KIRIM KE DOSEN
    // ==========================================
    function copyDosenLink(id) {
        const item = assignmentsData.find(a => a.id === id);
        const baseHref = window.location.href.split('#')[0].split('?')[0];
        const shareUrl = `${baseHref}#${id}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast(`Link tugas "${item ? item.judul : ''}" berhasil disalin! Silakan kirimkan link ini ke Dosen Anda.`, 'success');
            }).catch(() => {
                fallbackCopyText(shareUrl);
            });
        } else {
            fallbackCopyText(shareUrl);
        }
    }

    function fallbackCopyText(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast('Teks berhasil disalin ke clipboard!', 'success');
    }

    function checkUrlHighlight() {
        const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
        const params = new URLSearchParams(window.location.search);
        const targetId = hash || params.get('id');
        const mkParam = params.get('mk');

        if (mkParam) {
            setCourseFilter(decodeURIComponent(mkParam));
            showToast(`Menampilkan khusus mata kuliah: ${decodeURIComponent(mkParam)}`, 'info');
        }

        if (targetId) {
            currentFilter.course = 'all';
            currentFilter.status = 'all';
            currentFilter.search = '';

            const sel = document.getElementById('filterCourse');
            if (sel) sel.value = 'all';
            const searchInp = document.getElementById('searchQuery');
            if (searchInp) searchInp.value = '';

            document.querySelectorAll('.filter-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-status') === 'all');
            });

            renderCourseFilterPills();
            renderView();

            setTimeout(() => {
                const targetCard = document.querySelector(`[data-id="${targetId}"]`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetCard.classList.add('highlight-target');
                    showToast('Membuka rincian tugas untuk Dosen', 'info');
                }
            }, 350);
        }
    }

    // ==========================================
    // 16. MANAJEMEN KATEGORI MATA KULIAH (CRUD)
    // ==========================================
    function loadKategoriData() {
        try {
            const raw = localStorage.getItem(KATEGORI_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveKategoriData(list) {
        localStorage.setItem(KATEGORI_KEY, JSON.stringify(list));
    }

    function populateMataKuliahDatalist() {
        const dl = document.getElementById('listMataKuliah');
        if (!dl) return;

        let kategoriList = loadKategoriData();
        const fromAssignments = [...new Set(assignmentsData.map(a => a.mataKuliah).filter(Boolean))];
        fromAssignments.forEach(mk => {
            if (!kategoriList.find(k => k.nama === mk)) {
                kategoriList.push({ id: 'auto-' + mk.replace(/\s+/g, '-').toLowerCase(), nama: mk, kode: '' });
            }
        });

        dl.innerHTML = kategoriList.map(k => `<option value="${escapeHtml(k.nama)}">${k.kode ? escapeHtml(k.kode) + ' - ' : ''}${escapeHtml(k.nama)}</option>`).join('');
    }

    function renderKategoriList() {
        const container = document.getElementById('kategoriList');
        const countEl = document.getElementById('kategoriCount');
        if (!container) return;

        const list = loadKategoriData();
        if (countEl) countEl.textContent = `${list.length} kategori`;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="kategori-empty">
                    <i class="fas fa-folder-open"></i>
                    <p>Belum ada kategori mata kuliah. Tambahkan di atas!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(k => {
            const tugasCount = assignmentsData.filter(a => a.mataKuliah === k.nama).length;
            return `
                <div class="kategori-item" data-id="${escapeHtml(k.id)}">
                    <div class="kategori-item-info">
                        ${k.kode ? `<span class="kategori-kode-badge">${escapeHtml(k.kode)}</span>` : ''}
                        <span class="kategori-nama">${escapeHtml(k.nama)}</span>
                        <span class="kategori-tugas-count">${tugasCount} tugas</span>
                    </div>
                    <div class="kategori-item-actions">
                        <button type="button" class="btn-kategori-edit" onclick="window.tugasApp.editKategori('${escapeHtml(k.id)}')" title="Edit Kategori">
                            <i class="fas fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="btn-kategori-delete" onclick="window.tugasApp.deleteKategori('${escapeHtml(k.id)}')" title="Hapus Kategori">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openKategoriModal() {
        const list = loadKategoriData();
        const fromAssignments = [...new Set(assignmentsData.map(a => a.mataKuliah).filter(Boolean))];
        let changed = false;
        fromAssignments.forEach(mk => {
            if (!list.find(k => k.nama === mk)) {
                list.push({ id: 'auto-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), nama: mk, kode: '' });
                changed = true;
            }
        });
        if (changed) saveKategoriData(list);

        resetKategoriForm();
        renderKategoriList();

        const modal = document.getElementById('kategoriModal');
        if (modal) {
            modal.classList.add('active');
            document.body.classList.add('modal-open');
        }
    }

    function resetKategoriForm() {
        const nameInput = document.getElementById('inputKategoriNama');
        const kodeInput = document.getElementById('inputKategoriKode');
        const editId = document.getElementById('editKategoriId');
        const formTitle = document.getElementById('kategoriFormTitle');
        const saveBtn = document.getElementById('btnSaveKategori');
        const cancelBtn = document.getElementById('btnCancelEditKategori');

        if (nameInput) nameInput.value = '';
        if (kodeInput) kodeInput.value = '';
        if (editId) editId.value = '';
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Tambah Mata Kuliah Baru';
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    function saveKategoriFromForm() {
        const nameInput = document.getElementById('inputKategoriNama');
        const kodeInput = document.getElementById('inputKategoriKode');
        const editId = document.getElementById('editKategoriId');

        const nama = nameInput ? nameInput.value.trim() : '';
        const kode = kodeInput ? kodeInput.value.trim() : '';
        const id = editId ? editId.value.trim() : '';

        if (!nama) {
            showToast('Nama mata kuliah tidak boleh kosong!', 'warning');
            if (nameInput) nameInput.focus();
            return;
        }

        const list = loadKategoriData();

        if (id) {
            const idx = list.findIndex(k => k.id === id);
            if (idx !== -1) {
                list[idx].nama = nama;
                list[idx].kode = kode;
                saveKategoriData(list);
                showToast(`Kategori "${nama}" berhasil diperbarui!`, 'success');
            }
        } else {
            if (list.find(k => k.nama.toLowerCase() === nama.toLowerCase())) {
                showToast(`Mata kuliah "${nama}" sudah ada di daftar kategori!`, 'warning');
                return;
            }
            list.push({ id: 'mk-' + Date.now(), nama, kode });
            saveKategoriData(list);
            showToast(`Kategori "${nama}" berhasil ditambahkan!`, 'success');
        }

        resetKategoriForm();
        renderKategoriList();
        populateMataKuliahDatalist();
        populateCourseFilter();
        renderCourseFilterPills();
    }

    function editKategori(id) {
        const list = loadKategoriData();
        const item = list.find(k => k.id === id);
        if (!item) return;

        const nameInput = document.getElementById('inputKategoriNama');
        const kodeInput = document.getElementById('inputKategoriKode');
        const editId = document.getElementById('editKategoriId');
        const formTitle = document.getElementById('kategoriFormTitle');
        const saveBtn = document.getElementById('btnSaveKategori');
        const cancelBtn = document.getElementById('btnCancelEditKategori');

        if (nameInput) { nameInput.value = item.nama; nameInput.focus(); }
        if (kodeInput) kodeInput.value = item.kode || '';
        if (editId) editId.value = item.id;
        if (formTitle) formTitle.innerHTML = '<i class="fas fa-pen-to-square text-neon-cyan"></i> Edit Kategori Mata Kuliah';
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> Update';
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    }

    function deleteKategori(id) {
        const list = loadKategoriData();
        const item = list.find(k => k.id === id);
        if (!item) return;

        const tugasCount = assignmentsData.filter(a => a.mataKuliah === item.nama).length;
        const msg = tugasCount > 0
            ? `Hapus kategori "${item.nama}"? Kategori ini memiliki ${tugasCount} tugas terkait. Tugas tidak akan ikut terhapus.`
            : `Hapus kategori "${item.nama}"?`;

        if (!confirm(msg)) return;

        const newList = list.filter(k => k.id !== id);
        saveKategoriData(newList);
        showToast(`Kategori "${item.nama}" berhasil dihapus.`, 'info');
        renderKategoriList();
        populateMataKuliahDatalist();
        populateCourseFilter();
        renderCourseFilterPills();
    }

    // ==========================================
    // 17. MODAL SINKRONISASI CLOUD
    // ==========================================
    const SQL_SCHEMA = `-- TABEL TUGAS KULIAH MULTI-USER (MYPORTO)
create table if not exists tugas (
  id text primary key,
  mata_kuliah text,
  kode_mk text,
  semester text,
  dosen text,
  pengunggah text,
  nim text,
  judul text not null,
  deskripsi text,
  deadline text,
  tanggal_kumpul text,
  status text default 'belum',
  file_name text,
  file_size bigint,
  file_type text,
  image_url text,
  github_url text,
  demo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Kebijakan Row Level Security
alter table tugas enable row level security;
create policy "Akses Publik Baca" on tugas for select using (true);
create policy "Akses Publik Tambah" on tugas for insert with check (true);
create policy "Akses Publik Update" on tugas for update using (true);
create policy "Akses Publik Hapus" on tugas for delete using (true);

-- Aktifkan Realtime Replication
alter publication supabase_realtime add table tugas;
`;

    function openCloudSyncModal() {
        const modal = document.getElementById('cloudSyncModal');
        if (!modal) return;

        const urlInput = document.getElementById('inputSupabaseUrl');
        const keyInput = document.getElementById('inputSupabaseKey');

        const { url, anonKey } = getCloudCredentials();

        if (urlInput) urlInput.value = url;
        if (keyInput) keyInput.value = anonKey;

        updateCloudModalBanner();

        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    function updateCloudModalBanner() {
        const banner = document.getElementById('cloudModalStatusBanner');
        const title = document.getElementById('cloudBannerTitle');
        const desc = document.getElementById('cloudBannerDesc');
        const icon = document.getElementById('cloudBannerIcon');

        if (!banner || !title || !desc || !icon) return;

        if (isCloudActive) {
            banner.style.background = 'rgba(16, 185, 129, 0.12)';
            banner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            icon.className = 'fas fa-check-circle';
            icon.style.background = '#10b981';
            title.textContent = 'Status: Terhubung ke Cloud Supabase (Online Multi-User)';
            title.style.color = '#10b981';
            desc.textContent = 'Sinkronisasi aktif! Setiap tugas yang ditambahkan akan otomatis tersimpan di cloud realtime.';
        } else {
            banner.style.background = 'var(--accent-2-soft)';
            banner.style.borderColor = 'var(--accent-2-border)';
            icon.className = 'fas fa-satellite-dish';
            icon.style.background = 'var(--accent-2)';
            title.textContent = 'Status: Mode Lokal (IndexedDB Dinamis)';
            title.style.color = 'var(--text-primary)';
            desc.textContent = 'Data tersimpan secara permanen di browser lokal Anda. Hubungkan ke Supabase jika ingin berbagi tugas realtime bersama teman.';
        }
    }

    async function handleSaveCloudConfig() {
        const urlInput = document.getElementById('inputSupabaseUrl');
        const keyInput = document.getElementById('inputSupabaseKey');

        const url = urlInput ? urlInput.value.trim() : '';
        const anonKey = keyInput ? keyInput.value.trim() : '';

        if (!url || !anonKey) {
            showToast('Supabase URL dan Anon Key harus diisi!', 'warning');
            return;
        }

        try {
            showToast('Menguji koneksi ke Supabase...', 'info');

            if (!window.supabase || !window.supabase.createClient) {
                showToast('Library Supabase belum dimuat di browser!', 'error');
                return;
            }

            const client = window.supabase.createClient(url, anonKey);
            const { error } = await client.from('tugas').select('id').limit(1);

            if (error) {
                showToast('Gagal menghubungkan: ' + error.message, 'error');
                return;
            }

            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_anon_key', anonKey);

            supabaseClient = client;
            isCloudActive = true;
            updateCloudUIIndicators(true);
            updateCloudModalBanner();

            subscribeToRealtimeCloud();

            const cloudData = await fetchCloudAssignments();
            if (cloudData && cloudData.length > 0) {
                assignmentsData = cloudData;
                for (const item of cloudData) {
                    await dbPut(item, null);
                }
            } else {
                for (const item of assignmentsData) {
                    await saveCloudAssignment(item);
                }
            }

            populateCourseFilter();
            renderCourseFilterPills();
            renderStats();
            renderView();

            showToast('Berhasil terhubung ke Supabase Cloud! Multi-user aktif.', 'success');
            setTimeout(closeModal, 1200);
        } catch (err) {
            console.error(err);
            showToast('Kesalahan koneksi Supabase: ' + err.message, 'error');
        }
    }

    function handleDisconnectCloud() {
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_anon_key');
        if (window.SUPABASE_CONFIG) {
            window.SUPABASE_CONFIG.url = '';
            window.SUPABASE_CONFIG.anonKey = '';
        }
        supabaseClient = null;
        isCloudActive = false;
        updateCloudUIIndicators(false);
        updateCloudModalBanner();
        showToast('Koneksi Cloud diputus. Kembali ke Mode Lokal.', 'info');
    }

    function copySqlSchema() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(SQL_SCHEMA).then(() => {
                showToast('Script SQL Supabase berhasil disalin! Tempel di SQL Editor Supabase Anda.', 'success');
            }).catch(() => {
                fallbackCopyText(SQL_SCHEMA);
            });
        } else {
            fallbackCopyText(SQL_SCHEMA);
        }
    }

    // ==========================================
    // 18. EVENT LISTENERS SETUP
    // ==========================================
    function setupEventListeners() {
        // Search Input
        const searchInput = document.getElementById('searchQuery');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentFilter.search = e.target.value;
                currentPagination.page = 1;
                renderView();
            });
        }

        // Filter Course Dropdown
        const filterCourse = document.getElementById('filterCourse');
        if (filterCourse) {
            filterCourse.addEventListener('change', (e) => {
                setCourseFilter(e.target.value);
            });
        }

        // Sort By Dropdown
        const sortBy = document.getElementById('sortBy');
        if (sortBy) {
            sortBy.addEventListener('change', (e) => {
                currentFilter.sortBy = e.target.value;
                currentPagination.page = 1;
                renderView();
            });
        }

        // Per Page Select
        const perPageSelect = document.getElementById('perPageSelect');
        if (perPageSelect) {
            perPageSelect.addEventListener('change', (e) => {
                setPerPage(e.target.value);
            });
        }

        // Filter Status Tabs
        document.querySelectorAll('.filter-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter.status = btn.getAttribute('data-status');
                currentPagination.page = 1;
                renderView();
            });
        });

        // View Mode Toggle (Grid vs Table)
        const btnViewGrid = document.getElementById('btnViewGrid');
        const btnViewTable = document.getElementById('btnViewTable');
        if (btnViewGrid) btnViewGrid.addEventListener('click', () => setViewMode('grid'));
        if (btnViewTable) btnViewTable.addEventListener('click', () => setViewMode('table'));

        // Form Submit
        const form = document.getElementById('tugasForm');
        if (form) form.addEventListener('submit', handleFormSubmit);

        // Cloud Sync Modal Listeners
        const btnSaveCloud = document.getElementById('btnSaveCloudConfig');
        if (btnSaveCloud) btnSaveCloud.addEventListener('click', handleSaveCloudConfig);

        const btnDiscCloud = document.getElementById('btnDisconnectCloud');
        if (btnDiscCloud) btnDiscCloud.addEventListener('click', handleDisconnectCloud);

        const btnCopySql = document.getElementById('btnCopySqlSchema');
        if (btnCopySql) btnCopySql.addEventListener('click', copySqlSchema);

        // Multi-File Drag & Drop & Upload Input
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('inputFile');
        const clearAllBtn = document.getElementById('btnClearAllStagedFiles');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    processSelectedFiles(e.target.files);
                    fileInput.value = ''; // Reset input agar bisa pilih berkas yg sama jika perlu
                }
            });

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processSelectedFiles(e.dataTransfer.files);
                }
            });
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllStagedAttachments);
        }

        // Lightbox Navigation Listeners
        const lightboxPrevBtn = document.getElementById('lightboxPrevBtn');
        const lightboxNextBtn = document.getElementById('lightboxNextBtn');
        if (lightboxPrevBtn) lightboxPrevBtn.addEventListener('click', prevLightboxImage);
        if (lightboxNextBtn) lightboxNextBtn.addEventListener('click', nextLightboxImage);

        // Lightbox close triggers
        const lightboxModal = document.getElementById('imageLightboxModal');
        if (lightboxModal) {
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal || e.target.closest('[data-close-lightbox]')) {
                    closeImageLightbox();
                }
            });
        }

        // Import JSON File Listener
        const jsonInput = document.getElementById('jsonFileInput');
        if (jsonInput) {
            jsonInput.addEventListener('change', handleImportJSON);
        }

        // Modal Close triggers
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        document.querySelectorAll('.modal-overlay').forEach(modalEl => {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) closeModal();
            });
        });

        // Theme Toggle Sync
        const themeBtn = document.getElementById('tugasThemeToggle');
        if (themeBtn) {
            const savedTheme = localStorage.getItem('cyber-theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeIcon(savedTheme);

            themeBtn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', current);
                localStorage.setItem('cyber-theme', current);
                updateThemeIcon(current);
            });
        }

        function updateThemeIcon(th) {
            if (!themeBtn) return;
            themeBtn.innerHTML = th === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        }

        // Keyboard Shortcuts (Esc to close, Left/Right for lightbox)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeImageLightbox();
            } else if (lightboxModal && lightboxModal.classList.contains('active')) {
                if (e.key === 'ArrowLeft') prevLightboxImage();
                if (e.key === 'ArrowRight') nextLightboxImage();
            }
        });

        // Hash change
        window.addEventListener('hashchange', checkUrlHighlight);
    }

    function setupKategoriEventListeners() {
        const saveBtn = document.getElementById('btnSaveKategori');
        if (saveBtn) saveBtn.addEventListener('click', saveKategoriFromForm);

        const cancelBtn = document.getElementById('btnCancelEditKategori');
        if (cancelBtn) cancelBtn.addEventListener('click', resetKategoriForm);

        const nameInput = document.getElementById('inputKategoriNama');
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveKategoriFromForm(); }
            });
        }
    }

    // ==========================================
    // 19. TOAST NOTIFICATION & HELPER
    // ==========================================
    function showToast(message, type = 'info') {
        const toast = document.getElementById('tugasToast');
        if (!toast) return;

        const icons = {
            'success': 'fa-circle-check',
            'warning': 'fa-triangle-exclamation',
            'error': 'fa-circle-xmark',
            'info': 'fa-circle-info'
        };

        toast.className = `tugas-toast toast-${type} active`;
        toast.innerHTML = `<i class="fas ${icons[type] || 'fa-circle-info'}"></i> <span>${escapeHtml(message)}</span>`;

        if (window.toastTimeout) clearTimeout(window.toastTimeout);
        window.toastTimeout = setTimeout(() => {
            toast.classList.remove('active');
        }, 3600);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================
    // 20. EXPOSE GLOBAL APIS & DOM READY
    // ==========================================
    window.tugasApp = {
        openModal,
        closeModal,
        openImageLightbox,
        closeImageLightbox,
        prevLightboxImage,
        nextLightboxImage,
        downloadFile,
        downloadAllFiles,
        removeStagedAttachment,
        quickUpdateStatus,
        confirmDelete,
        resetSampleData,
        exportJSON,
        triggerImportJSON,
        copyDosenLink,
        checkUrlHighlight,
        openCloudSyncModal,
        setCourseFilter,
        copyCourseLink,
        openKategoriModal,
        editKategori,
        deleteKategori,
        setViewMode,
        setPage,
        setPerPage
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
        setupKategoriEventListeners();
        initData().then(() => {
            populateMataKuliahDatalist();
        });
    });

})();
