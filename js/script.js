/**
 * ==================== WAHYU PRIHANTO - PORTFOLIO ====================
 * Script utama untuk interaktivitas website portfolio
 * Fitur: Typing animation, AOS, dark mode, scroll effects, form handling
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi semua modul
    initLoader();
    initScrollProgress();
    initNavbar();
    initThemeToggle();
    initMobileMenu();
    initTypingAnimation();
    initAOS();
    initContactForm();
    initFooterYear();
    initSmoothScroll();
    initChatWidget();
});

/**
 * ==================== LOADING ANIMATION ====================
 * Menyembunyikan loader setelah halaman selesai dimuat
 */
function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;

    window.addEventListener('load', () => {
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);
    });

    // Fallback: sembunyikan setelah 3 detik jika load event tidak terpicu
    setTimeout(() => {
        loader.classList.add('hidden');
    }, 3000);
}

/**
 * ==================== SCROLL PROGRESS INDICATOR ====================
 * Menampilkan progress bar di atas halaman saat user scroll
 */
function initScrollProgress() {
    const scrollProgress = document.getElementById('scrollProgress');
    if (!scrollProgress) return;

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        scrollProgress.style.width = `${scrollPercent}%`;
    });
}

/**
 * ==================== NAVBAR ====================
 * Menambahkan efek blur dan sticky saat user scroll
 */
function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * ==================== DARK MODE TOGGLE ====================
 * Mengatur tema gelap/terang dengan penyimpanan di localStorage
 */
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle?.querySelector('i');

    // Cek preferensi tersimpan
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(icon, savedTheme);
    } else if (!prefersDark) {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon(icon, 'light');
    } else {
        updateThemeIcon(icon, 'dark');
    }

    themeToggle?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(icon, newTheme);
    });
}

// Helper: Update ikon tema
function updateThemeIcon(icon, theme) {
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/**
 * ==================== MOBILE MENU ====================
 * Toggle menu navigasi di perangkat mobile
 */
function initMobileMenu() {
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.querySelector('.nav-links');

    navToggle?.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks?.classList.toggle('active');
        document.body.style.overflow = navLinks?.classList.contains('active') ? 'hidden' : '';
    });

    // Tutup menu saat klik link
    navLinks?.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navToggle?.classList.remove('active');
            navLinks?.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

/**
 * ==================== TYPING ANIMATION ====================
 * Efek mengetik pada subjudul hero section
 */
function initTypingAnimation() {
    const typingElement = document.getElementById('typing');
    if (!typingElement) return;

    const texts = [
        'Guru TKJ | Developer Aplikasi Sekolah | Google Apps Script Enthusiast',
        'SMK Diponegoro Tumpang',
        'Teknologi Pendidikan'
    ];
    
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typingSpeed = 80;

    function type() {
        const currentText = texts[textIndex];
        
        if (isDeleting) {
            typingElement.textContent = currentText.substring(0, charIndex - 1);
            charIndex--;
            typingSpeed = 40;
        } else {
            typingElement.textContent = currentText.substring(0, charIndex + 1);
            charIndex++;
            typingSpeed = 80;
        }

        if (!isDeleting && charIndex === currentText.length) {
            typingSpeed = 2000; // Jeda sebelum hapus
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
            typingSpeed = 500; // Jeda sebelum mulai ketik
        }

        setTimeout(type, typingSpeed);
    }

    // Mulai animasi setelah halaman load
    setTimeout(type, 1000);
}

/**
 * ==================== AOS (ANIMATE ON SCROLL) ====================
 * Inisialisasi library AOS untuk animasi saat scroll
 */
function initAOS() {
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: 'ease-out-cubic',
            once: true,
            offset: 50
        });
    }
}

/**
 * ==================== CONTACT FORM ====================
 * Menangani submit form kontak (saat ini hanya prevent default, bisa dikembangkan dengan backend)
 */
function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Ambil data form
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());
        
        // Untuk production: kirim ke backend/API
        // fetch('/api/contact', { method: 'POST', body: JSON.stringify(data) })
        
        // Sementara: tampilkan alert sukses
        alert('Terima kasih! Pesan Anda telah berhasil dikirim. Saya akan segera menghubungi Anda.');
        contactForm.reset();
    });
}

/**
 * ==================== FOOTER YEAR ====================
 * Menampilkan tahun saat ini secara dinamis
 */
function initFooterYear() {
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}

/**
 * ==================== CHAT WIDGET ====================
 * Toggle minimize/restore chat panel
 */
function initChatWidget() {
    const chatWidget = document.getElementById('chatWidget');
    const chatToggle = document.getElementById('chatToggle');
    const chatMinimize = document.getElementById('chatMinimize');

    if (!chatWidget || !chatToggle || !chatMinimize) return;

    function toggleChat() {
        chatWidget.classList.toggle('open');
    }

    chatToggle.addEventListener('click', toggleChat);
    chatMinimize.addEventListener('click', toggleChat);
}

/**
 * ==================== SMOOTH SCROLL ====================
 * Memastikan smooth scroll bekerja untuk anchor links (fallback jika CSS tidak cukup)
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}
