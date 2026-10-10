/**
 * =========================================================================
 * KONFIGURASI SINKRONISASI CLOUD MULTI-USER (SUPABASE)
 * =========================================================================
 * Fitur ini memungkinkan Anda dan teman-teman mahasiswa lain untuk saling
 * mengunggah tugas secara online & realtime langsung di GitHub Pages (GRATIS)!
 * 
 * CARA MENGHUBUNGKAN:
 * 1. Buat akun & project gratis di https://supabase.com
 * 2. Salin Project URL & anon public key dari Project Settings -> API
 * 3. Isi nilai di bawah ini ATAU masukkan melalui tombol "Sinkronisasi Cloud" di web:
 */

window.SUPABASE_CONFIG = {
    // URL Project Supabase (contoh: 'https://xyzabcdefghijklmn.supabase.co')
    url: '',

    // Public Anon Key Supabase (contoh: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    anonKey: '',

    // Nama tabel database Supabase (default: 'tugas')
    tableName: 'tugas'
};
