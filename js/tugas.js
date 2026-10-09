/**
 * ============================================================================
 * PORTAL TUGAS KULIAH & REPOSITORI AKADEMIK
 * Modul Manajemen Tugas Kuliah dengan IndexedDB, Filter, & Export/Import JSON
 * Dilengkapi Dukungan Berkas Dokumen & Foto/Gambar Dokumentasi Praktikum
 * Kompatibel 100% untuk GitHub Pages & XAMPP Localhost
 * ============================================================================
 */

(function () {
    'use strict';

    // ---- KONFIGURASI DATABASE INDEXEDDB ----
    const DB_NAME = 'MyPortoTugasDB';
    const DB_VERSION = 1;
    const STORE_ASSIGNMENTS = 'assignments';
    const STORE_FILES = 'assignment_files';

    let dbInstance = null;
    let assignmentsData = [];
    let blobUrlCache = {}; // Cache ObjectURL untuk preview gambar tersimpan di DB
    let currentFilter = {
        search: '',
        course: 'all',
        status: 'all',
        sortBy: 'deadline-asc'
    };
    let editingId = null;
    let stagedFile = null; // Menyimpan File object saat upload di modal

    // ==========================================
    // 1. INISIALISASI INDEXEDDB
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

    async function dbPut(assignment, fileBlob) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_ASSIGNMENTS, STORE_FILES], 'readwrite');
            const assignStore = tx.objectStore(STORE_ASSIGNMENTS);
            const fileStore = tx.objectStore(STORE_FILES);

            assignStore.put(assignment);

            if (fileBlob) {
                fileStore.put({
                    id: assignment.id,
                    blob: fileBlob,
                    fileName: assignment.fileName,
                    fileType: assignment.fileType
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
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbGetFile(id) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    // Seed Data & Sinkronisasi dari data/tugas.json
    async function initData() {
        try {
            let localData = await dbGetAll();
            try {
                const response = await fetch('data/tugas.json?t=' + Date.now());
                if (response.ok) {
                    const seed = await response.json();
                    if (Array.isArray(seed)) {
                        for (const item of seed) {
                            const existing = localData.find(d => d.id === item.id);
                            if (!existing) {
                                await dbPut(item, null);
                                localData.push(item);
                            } else {
                                Object.assign(existing, item);
                                await dbPut(existing, null);
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Tidak dapat mengambil data/tugas.json publik, menggunakan basis data lokal.');
            }
            assignmentsData = localData;

            // Muat blob gambar ke cache bila ada file foto tersimpan
            await loadBlobImagesToCache();

            populateCourseFilter();
            renderStats();
            renderCards();

            // Periksa jika ada target link pengumpulan dosen (URL Hash #tugas-xxx)
            checkUrlHighlight();
        } catch (error) {
            console.error('Gagal inisialisasi data:', error);
            showToast('Gagal memuat basis data tugas', 'error');
        }
    }

    async function loadBlobImagesToCache() {
        for (const item of assignmentsData) {
            if (isImageFile(item.fileName, item.fileType) && !blobUrlCache[item.id]) {
                try {
                    const fileEntry = await dbGetFile(item.id);
                    if (fileEntry && fileEntry.blob) {
                        blobUrlCache[item.id] = URL.createObjectURL(fileEntry.blob);
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    function isImageFile(fileName, fileType) {
        if (fileType && fileType.startsWith('image/')) return true;
        if (fileName && /\.(jpe?g|png|webp|gif|svg)$/i.test(fileName)) return true;
        return false;
    }

    // ==========================================
    // 2. FILTER & SORT LOGIC
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
                (item.dosen && item.dosen.toLowerCase().includes(q));

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
            select.value = 'all';
            currentFilter.course = 'all';
        }
    }

    // ==========================================
    // 3. STATISTIK KARTU
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

    // ==========================================
    // 4. RENDERING TUGAS CARDS
    // ==========================================
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
            case 'ppt':
            case 'pptx': return 'fa-file-powerpoint text-orange';
            default: return 'fa-file-code text-cyan';
        }
    }

    function renderCards() {
        const container = document.getElementById('assignmentsGrid');
        if (!container) return;

        const list = getFilteredAssignments();

        if (list.length === 0) {
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

        container.innerHTML = list.map(item => {
            const dl = formatDeadline(item.deadline);
            const statusLabels = {
                'belum': { text: 'Belum Dikerjakan', class: 'status-belum', icon: 'fa-hourglass-start' },
                'proses': { text: 'Sedang Dikerjakan', class: 'status-proses', icon: 'fa-spinner fa-spin' },
                'selesai': { text: 'Selesai / Terkumpul', class: 'status-selesai', icon: 'fa-circle-check' }
            };
            const st = statusLabels[item.status] || statusLabels['belum'];

            const hasFile = item.fileName && item.fileName.trim() !== '';
            const fileIcon = getFileIcon(item.fileName);

            // Cek apakah ada foto/gambar tugas
            const photoSrc = item.imageUrl || blobUrlCache[item.id] || null;
            const hasPhoto = !!photoSrc || isImageFile(item.fileName, item.fileType);

            return `
                <div class="tugas-card ${hasPhoto ? 'card-has-photo' : ''}" data-id="${item.id}" data-status="${item.status}">
                    ${photoSrc ? `
                        <div class="tugas-card-image-box" onclick="window.tugasApp.openImageLightbox('${escapeHtml(photoSrc)}', '${escapeHtml(item.judul)}')" title="Klik untuk memperbesar foto tugas">
                            <img src="${escapeHtml(photoSrc)}" alt="${escapeHtml(item.judul)}" class="tugas-card-img" loading="lazy" onerror="this.parentElement.style.display='none';">
                            <div class="photo-overlay-badge">
                                <i class="fas fa-camera"></i> Foto Tugas <span class="zoom-hint"><i class="fas fa-expand"></i></span>
                            </div>
                        </div>
                    ` : ''}

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
                            ${hasFile ? `
                                <div class="attachment-file-pill">
                                    <i class="fas ${fileIcon}"></i>
                                    <div class="attachment-info" title="${escapeHtml(item.fileName)}">
                                        <span class="file-name">${escapeHtml(item.fileName)}</span>
                                        ${item.fileSize ? `<span class="file-size">${formatBytes(item.fileSize)}</span>` : ''}
                                    </div>
                                    <div class="attachment-actions">
                                        ${isImageFile(item.fileName, item.fileType) && photoSrc ? `
                                            <button class="btn-action-mini" onclick="window.tugasApp.openImageLightbox('${escapeHtml(photoSrc)}', '${escapeHtml(item.judul)}')" title="Lihat Foto">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn-download-file" onclick="window.tugasApp.downloadFile('${item.id}', '${escapeHtml(item.fileName)}')" title="Unduh Berkas Tugas">
                                            <i class="fas fa-download"></i>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="no-file-pill">
                                    <i class="fas fa-paperclip"></i> Tidak ada berkas lampiran terpisah
                                </div>
                            `}

                            <div class="tugas-links-group">
                                ${photoSrc && !item.fileName ? `
                                    <button class="link-chip chip-photo" onclick="window.tugasApp.openImageLightbox('${escapeHtml(photoSrc)}', '${escapeHtml(item.judul)}')">
                                        <i class="fas fa-image"></i> Lihat Foto Tugas
                                    </button>
                                ` : ''}
                                ${item.githubUrl ? `
                                    <a href="${item.githubUrl}" target="_blank" rel="noopener noreferrer" class="link-chip chip-github" title="Buka Repositori GitHub">
                                        <i class="fab fa-github"></i> Repository
                                    </a>
                                ` : ''}
                                ${item.demoUrl ? `
                                    <a href="${item.demoUrl}" target="_blank" rel="noopener noreferrer" class="link-chip chip-demo" title="Buka Live Demo / Google Drive">
                                        <i class="fas fa-arrow-up-right-from-square"></i> Demo / Drive
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Footer Kartu: Quick Status & Edit/Delete/Kirim ke Dosen -->
                    <div class="tugas-card-footer">
                        <div class="quick-status-selector">
                            <label for="statusSelect-${item.id}">Status:</label>
                            <select id="statusSelect-${item.id}" onchange="window.tugasApp.quickUpdateStatus('${item.id}', this.value)" class="status-quick-select">
                                <option value="belum" ${item.status === 'belum' ? 'selected' : ''}>⏳ Belum</option>
                                <option value="proses" ${item.status === 'proses' ? 'selected' : ''}>🔄 Sedang Dikerjakan</option>
                                <option value="selesai" ${item.status === 'selesai' ? 'selected' : ''}>✅ Selesai</option>
                            </select>
                        </div>
                        <div class="card-action-btns">
                            <button class="btn-share-dosen" onclick="window.tugasApp.copyDosenLink('${item.id}')" title="Salin link langsung tugas ini untuk dikirimkan ke Dosen">
                                <i class="fas fa-paper-plane"></i> <span>Kirim ke Dosen</span>
                            </button>
                            <button class="btn-action-icon" onclick="window.tugasApp.openModal('${item.id}')" title="Edit Rincian Tugas">
                                <i class="fas fa-pen-to-square"></i>
                            </button>
                            <button class="btn-action-icon btn-action-delete" onclick="window.tugasApp.confirmDelete('${item.id}')" title="Hapus Tugas">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
    // 5. LIGHTBOX FOTO TUGAS
    // ==========================================
    function openImageLightbox(src, title) {
        const modal = document.getElementById('imageLightboxModal');
        const img = document.getElementById('lightboxImage');
        const titleEl = document.getElementById('lightboxCaption');
        if (!modal || !img) return;

        img.src = src;
        if (titleEl) titleEl.textContent = title || 'Dokumentasi Tugas Kuliah';
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    function closeImageLightbox() {
        const modal = document.getElementById('imageLightboxModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    }

    // ==========================================
    // 6. MODAL FORM: TAMBAH & EDIT TUGAS
    // ==========================================
    function openModal(id = null) {
        editingId = id;
        stagedFile = null;

        const modal = document.getElementById('tugasModal');
        const form = document.getElementById('tugasForm');
        const titleEl = document.getElementById('modalTitle');
        const filePreviewBox = document.getElementById('stagedFilePreview');
        const dropZone = document.getElementById('fileDropZone');
        const imgThumb = document.getElementById('stagedImgThumbnail');

        form.reset();
        filePreviewBox.classList.add('hidden');
        if (imgThumb) imgThumb.style.display = 'none';
        dropZone.classList.remove('has-file');

        if (id) {
            const item = assignmentsData.find(a => a.id === id);
            if (item) {
                titleEl.textContent = 'Edit Data Tugas Kuliah';
                document.getElementById('inputMataKuliah').value = item.mataKuliah || '';
                document.getElementById('inputKodeMK').value = item.kodeMK || '';
                document.getElementById('inputSemester').value = item.semester || '';
                document.getElementById('inputDosen').value = item.dosen || '';
                document.getElementById('inputJudul').value = item.judul || '';
                document.getElementById('inputDeskripsi').value = item.deskripsi || '';
                document.getElementById('inputDeadline').value = item.deadline || '';
                document.getElementById('inputTanggalKumpul').value = item.tanggalKumpul || '';
                document.getElementById('inputStatus').value = item.status || 'belum';
                document.getElementById('inputImageUrl').value = item.imageUrl || '';
                document.getElementById('inputGithub').value = item.githubUrl || '';
                document.getElementById('inputDemo').value = item.demoUrl || '';

                if (item.fileName) {
                    filePreviewBox.classList.remove('hidden');
                    document.getElementById('stagedFileName').textContent = item.fileName;
                    document.getElementById('stagedFileSize').textContent = formatBytes(item.fileSize);

                    if (isImageFile(item.fileName, item.fileType) && (item.imageUrl || blobUrlCache[item.id])) {
                        if (imgThumb) {
                            imgThumb.src = item.imageUrl || blobUrlCache[item.id];
                            imgThumb.style.display = 'block';
                        }
                    }
                }
            }
        } else {
            titleEl.textContent = 'Tambah Tugas Kuliah Baru';
            document.getElementById('inputStatus').value = 'belum';
            // Default deadline set to 7 days ahead
            const future = new Date();
            future.setDate(future.getDate() + 7);
            future.setHours(23, 59, 0, 0);
            const futureIso = future.toISOString().slice(0, 16);
            document.getElementById('inputDeadline').value = futureIso;
        }

        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    function closeModal() {
        const modal = document.getElementById('tugasModal');
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        editingId = null;
        stagedFile = null;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();

        const mataKuliah = document.getElementById('inputMataKuliah').value.trim();
        const judul = document.getElementById('inputJudul').value.trim();

        if (!mataKuliah || !judul) {
            showToast('Mata kuliah dan judul tugas wajib diisi!', 'warning');
            return;
        }

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

        let assignment = {};

        if (editingId) {
            const existing = assignmentsData.find(a => a.id === editingId);
            assignment = {
                ...existing,
                mataKuliah,
                kodeMK,
                semester,
                dosen,
                judul,
                deskripsi,
                deadline,
                tanggalKumpul,
                status,
                imageUrl,
                githubUrl,
                demoUrl,
                updatedAt: new Date().toISOString()
            };

            if (stagedFile) {
                assignment.fileName = stagedFile.name;
                assignment.fileSize = stagedFile.size;
                assignment.fileType = stagedFile.type;

                // Jika file berupa foto dan tidak ada imageUrl manual, gunakan blob URL
                if (isImageFile(stagedFile.name, stagedFile.type)) {
                    if (blobUrlCache[editingId]) URL.revokeObjectURL(blobUrlCache[editingId]);
                    blobUrlCache[editingId] = URL.createObjectURL(stagedFile);
                }
            }
        } else {
            const newId = 'tugas-' + Date.now();
            assignment = {
                id: newId,
                mataKuliah,
                kodeMK,
                semester,
                dosen,
                judul,
                deskripsi,
                deadline,
                tanggalKumpul,
                status,
                fileName: stagedFile ? stagedFile.name : '',
                fileSize: stagedFile ? stagedFile.size : 0,
                fileType: stagedFile ? stagedFile.type : '',
                imageUrl,
                githubUrl,
                demoUrl,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (stagedFile && isImageFile(stagedFile.name, stagedFile.type)) {
                blobUrlCache[newId] = URL.createObjectURL(stagedFile);
            }
        }

        try {
            await dbPut(assignment, stagedFile);
            
            // Perbarui memori lokal
            if (editingId) {
                const idx = assignmentsData.findIndex(a => a.id === editingId);
                if (idx !== -1) assignmentsData[idx] = assignment;
            } else {
                assignmentsData.unshift(assignment);
            }

            closeModal();
            populateCourseFilter();
            renderStats();
            renderCards();
            showToast(editingId ? 'Tugas berhasil diperbarui!' : 'Tugas baru berhasil disimpan!', 'success');
        } catch (error) {
            console.error('Gagal menyimpan tugas:', error);
            showToast('Gagal menyimpan ke penyimpanan lokal', 'error');
        }
    }

    // ==========================================
    // 7. QUICK STATUS UPDATE & HAPUS
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
            renderStats();
            renderCards();
            showToast(`Status tugas diubah menjadi "${newStatus}"`, 'info');
        } catch (error) {
            console.error('Gagal memperbarui status:', error);
            showToast('Gagal memperbarui status', 'error');
        }
    }

    async function confirmDelete(id) {
        const item = assignmentsData.find(a => a.id === id);
        if (!item) return;

        const isConfirm = confirm(`Apakah Anda yakin ingin menghapus tugas "${item.judul}"? Tindakan ini tidak dapat dibatalkan.`);
        if (!isConfirm) return;

        try {
            await dbDelete(id);
            assignmentsData = assignmentsData.filter(a => a.id !== id);
            populateCourseFilter();
            renderStats();
            renderCards();
            showToast('Tugas berhasil dihapus', 'info');
        } catch (error) {
            console.error('Gagal menghapus tugas:', error);
            showToast('Gagal menghapus tugas', 'error');
        }
    }

    // ==========================================
    // 8. UNDUH BERKAS (INDEXEDDB BLOB)
    // ==========================================
    async function downloadFile(id, fallbackName) {
        try {
            const item = assignmentsData.find(a => a.id === id);
            const fileEntry = await dbGetFile(id);

            if (fileEntry && fileEntry.blob) {
                const blobUrl = URL.createObjectURL(fileEntry.blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileEntry.fileName || fallbackName || 'tugas-kuliah';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                showToast(`Mengunduh ${fileEntry.fileName}...`, 'success');
            } else if (item && item.imageUrl) {
                // Jika berupa imageUrl lokal/web
                const a = document.createElement('a');
                a.href = item.imageUrl;
                a.download = item.fileName || 'foto-tugas';
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

    // ==========================================
    // 9. EXPORT & IMPORT JSON (GITHUB INTEGRATION)
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

        showToast('Data tugas berhasil diekspor ke format JSON! Anda dapat menyimpannya ke GitHub.', 'success');
    }

    function triggerImportJSON() {
        const input = document.getElementById('jsonFileInput');
        if (input) input.click();
    }

    async function handleImportJSON(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (event) {
            try {
                const parsed = JSON.parse(event.target.result);
                if (!Array.isArray(parsed)) {
                    throw new Error('Format JSON harus berupa daftar array tugas.');
                }

                for (const item of parsed) {
                    if (item.id && item.judul && item.mataKuliah) {
                        await dbPut(item, null);
                        const existingIdx = assignmentsData.findIndex(a => a.id === item.id);
                        if (existingIdx !== -1) {
                            assignmentsData[existingIdx] = item;
                        } else {
                            assignmentsData.push(item);
                        }
                    }
                }

                populateCourseFilter();
                renderStats();
                renderCards();
                showToast(`Berhasil mengimpor ${parsed.length} tugas kuliah!`, 'success');
            } catch (err) {
                console.error('Import error:', err);
                showToast('Format berkas JSON tidak valid: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ==========================================
    // 10. TOAST NOTIFICATION
    // ==========================================
    function showToast(msg, type = 'info') {
        const toast = document.getElementById('tugasToast');
        if (!toast) return;

        const iconMap = {
            'success': 'fa-circle-check',
            'warning': 'fa-triangle-exclamation',
            'error': 'fa-circle-xmark',
            'info': 'fa-circle-info'
        };

        toast.className = `tugas-toast toast-${type} show`;
        toast.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info'}"></i> <span>${escapeHtml(msg)}</span>`;

        clearTimeout(window._toastTimeout);
        window._toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // ==========================================
    // 11. SETUP EVENT LISTENERS
    // ==========================================
    function setupEventListeners() {
        // Search Input
        const searchInput = document.getElementById('searchQuery');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentFilter.search = e.target.value;
                renderCards();
            });
        }

        // Filter Course
        const filterCourse = document.getElementById('filterCourse');
        if (filterCourse) {
            filterCourse.addEventListener('change', (e) => {
                currentFilter.course = e.target.value;
                renderCards();
            });
        }

        // Filter Status Tabs
        const statusTabs = document.querySelectorAll('.filter-tab-btn');
        statusTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                statusTabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter.status = btn.getAttribute('data-status');
                renderCards();
            });
        });

        // Sort By
        const sortBy = document.getElementById('sortBy');
        if (sortBy) {
            sortBy.addEventListener('change', (e) => {
                currentFilter.sortBy = e.target.value;
                renderCards();
            });
        }

        // Form Submit
        const form = document.getElementById('tugasForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // File Drag & Drop
        const dropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('inputFile');
        const stagedPreview = document.getElementById('stagedFilePreview');
        const stagedFileName = document.getElementById('stagedFileName');
        const stagedFileSize = document.getElementById('stagedFileSize');
        const stagedImgThumb = document.getElementById('stagedImgThumbnail');
        const removeFileBtn = document.getElementById('btnRemoveStagedFile');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', (e) => {
                if (e.target !== removeFileBtn && !removeFileBtn.contains(e.target)) {
                    fileInput.click();
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    processSelectedFile(e.target.files[0]);
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
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processSelectedFile(e.dataTransfer.files[0]);
                }
            });

            function processSelectedFile(file) {
                stagedFile = file;
                dropZone.classList.add('has-file');
                stagedPreview.classList.remove('hidden');
                stagedFileName.textContent = file.name;
                stagedFileSize.textContent = formatBytes(file.size);

                // Jika file gambar, tampilkan preview thumbnail
                if (file.type && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        if (stagedImgThumb) {
                            stagedImgThumb.src = re.target.result;
                            stagedImgThumb.style.display = 'block';
                        }
                    };
                    reader.readAsDataURL(file);
                } else {
                    if (stagedImgThumb) stagedImgThumb.style.display = 'none';
                }
            }

            if (removeFileBtn) {
                removeFileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    stagedFile = null;
                    fileInput.value = '';
                    dropZone.classList.remove('has-file');
                    stagedPreview.classList.add('hidden');
                    if (stagedImgThumb) stagedImgThumb.style.display = 'none';
                });
            }
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

        const modal = document.getElementById('tugasModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        // Lightbox close triggers
        const lightboxModal = document.getElementById('imageLightboxModal');
        if (lightboxModal) {
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal || e.target.closest('[data-close-lightbox]')) {
                    closeImageLightbox();
                }
            });
        }

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

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeImageLightbox();
            }
        });

        // Listener URL Hash Change (jika link dibuka ulang atau hash berganti)
        window.addEventListener('hashchange', checkUrlHighlight);
    }

    // ==========================================
    // 12. FITUR PENGUMPULAN TUGAS KE DOSEN
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
        showToast('Link tugas berhasil disalin ke clipboard!', 'success');
    }

    function checkUrlHighlight() {
        const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
        const params = new URLSearchParams(window.location.search);
        const targetId = hash || params.get('id');

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

            renderCards();

            setTimeout(() => {
                const card = document.querySelector(`.tugas-card[data-id="${targetId}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight-target');
                    showToast('Membuka tugas spesifik untuk penilaian Dosen', 'info');
                }
            }, 350);
        }
    }

    // ==========================================
    // 13. EXPOSE GLOBAL APIS
    // ==========================================
    window.tugasApp = {
        openModal,
        closeModal,
        openImageLightbox,
        closeImageLightbox,
        downloadFile,
        quickUpdateStatus,
        confirmDelete,
        exportJSON,
        triggerImportJSON,
        copyDosenLink,
        checkUrlHighlight
    };

    // DOM Ready
    document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
        initData();
    });

})();
