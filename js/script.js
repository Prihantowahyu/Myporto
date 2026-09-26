/**
 * ==================== WAHYU PRIHANTO - IT CYBER SECURITY PORTFOLIO ====================
 * Engine: Interactive SOC Terminal, Matrix Rain Canvas, Telemetry Counter, Cyber Animations
 * Author: Wahyu Prihanto | SEC-OPS Portfolio System v3.2.0
 */

document.addEventListener('DOMContentLoaded', () => {
    initLoader();
    initScrollProgress();
    initNavbar();
    initThemeToggle();
    initMobileMenu();
    initTypingAnimation();
    initAOS();
    initCyberCanvas();
    initMatrixToggle();
    initInteractiveTerminal();
    initCounters();
    initContactForm();
    initFooterYear();
    initChatWidget();
    initSmoothScroll();
    initActiveNavLinks();
    initSkillBars();
});

/* ==================== CYBER LOADER ==================== */
function initLoader() {
    const loader = document.getElementById('loader');
    const loaderFill = document.getElementById('loaderFill');
    const loaderStatus = document.getElementById('loaderStatus');
    if (!loader) return;

    const messages = [
        'CALIBRATING SECURITY PROTOCOLS...',
        'VERIFYING CERTIFICATE CHAIN...',
        'INITIALIZING FIREWALL ENGINE...',
        'ESTABLISHING ENCRYPTED CHANNEL...',
        'LOADING THREAT INTELLIGENCE...',
        'SYSTEM SECURE — WELCOME.'
    ];

    let progress = 0;
    let msgIndex = 0;

    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 22) + 8;
        if (progress > 100) progress = 100;

        if (loaderFill) loaderFill.style.width = progress + '%';

        if (msgIndex < messages.length - 1) {
            msgIndex++;
            if (loaderStatus) loaderStatus.textContent = messages[msgIndex];
        }

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                loader.classList.add('hidden');
            }, 600);
        }
    }, 280);

    window.addEventListener('load', () => {
        progress = 100;
        if (loaderFill) loaderFill.style.width = '100%';
        if (loaderStatus) loaderStatus.textContent = 'SYSTEM SECURE — WELCOME.';
        setTimeout(() => loader.classList.add('hidden'), 700);
    });

    // Hard fallback
    setTimeout(() => loader.classList.add('hidden'), 4500);
}

/* ==================== SCROLL PROGRESS ==================== */
function initScrollProgress() {
    const sp = document.getElementById('scrollProgress');
    if (!sp) return;
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const total = document.documentElement.scrollHeight - window.innerHeight;
        sp.style.width = total > 0 ? `${(scrolled / total) * 100}%` : '0%';
    });
}

/* ==================== NAVBAR ==================== */
function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
    });
}

/* ==================== ACTIVE NAV LINKS ==================== */
function initActiveNavLinks() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let currentSection = '';
        sections.forEach(section => {
            if (window.scrollY >= section.offsetTop - 130) {
                currentSection = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSection}`) {
                link.classList.add('active');
            }
        });
    });
}

/* ==================== DARK / LIGHT THEME TOGGLE ==================== */
function initThemeToggle() {
    const btn = document.getElementById('themeToggle');
    const icon = btn?.querySelector('i');

    const savedTheme = localStorage.getItem('cyberTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(icon, savedTheme);

    btn?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('cyberTheme', next);
        updateThemeIcon(icon, next);
    });
}

function updateThemeIcon(icon, theme) {
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/* ==================== MOBILE MENU ==================== */
function initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    toggle?.addEventListener('click', () => {
        toggle.classList.toggle('active');
        links?.classList.toggle('active');
        document.body.style.overflow = links?.classList.contains('active') ? 'hidden' : '';
    });

    links?.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            toggle?.classList.remove('active');
            links?.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

/* ==================== TYPING ANIMATION ==================== */
function initTypingAnimation() {
    const el = document.getElementById('typing');
    if (!el) return;

    const texts = [
        'Guru TKJ & IT Educator',
        'Infrastruktur Jaringan & MikroTik',
        'Pemeliharaan & Troubleshooting Komputer',
        'Linux Server Admin (Ubuntu/Debian)',
        'Full-Stack Web Developer (PHP/PWA)'
    ];

    let ti = 0, ci = 0, deleting = false, speed = 80;

    function type() {
        const current = texts[ti];
        if (deleting) {
            el.textContent = current.substring(0, ci - 1);
            ci--;
            speed = 35;
        } else {
            el.textContent = current.substring(0, ci + 1);
            ci++;
            speed = 80;
        }

        if (!deleting && ci === current.length) {
            speed = 2200;
            deleting = true;
        } else if (deleting && ci === 0) {
            deleting = false;
            ti = (ti + 1) % texts.length;
            speed = 500;
        }

        setTimeout(type, speed);
    }
    setTimeout(type, 1200);
}

/* ==================== AOS ==================== */
function initAOS() {
    if (typeof AOS !== 'undefined') {
        AOS.init({ duration: 750, easing: 'ease-out-cubic', once: true, offset: 60 });
    }
}

/* ==================== CYBER CANVAS — MATRIX + PARTICLE NODES ==================== */
let matrixActive = true;
let canvasAnimFrame = null;

function initCyberCanvas() {
    const canvas = document.getElementById('cyberCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        columns = Math.floor(W / fontSize);
        drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    });

    const fontSize = 14;
    let columns = Math.floor(W / fontSize);
    let drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));

    // Matrix characters: combine latin, numbers and a few unicode symbols
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>/\\|{}[]~`ΩΨΛΣΔΘΞΠΦabcdefghijklmnopqrstuvwxyz';

    // Particle nodes for network effect
    const nodes = Array.from({ length: 55 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2.5 + 1
    }));

    function drawMatrix() {
        // Semi-transparent fade for trail effect
        ctx.fillStyle = 'rgba(5, 8, 17, 0.05)';
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            const y = drops[i] * fontSize;

            // Head character: bright neon green
            if (drops[i] > 0 && drops[i] * fontSize < H) {
                ctx.fillStyle = '#00ff9d';
                ctx.shadowColor = '#00ff9d';
                ctx.shadowBlur = 8;
                ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
                ctx.fillText(char, i * fontSize, y);
            }

            // Body characters: dimmer green
            if (drops[i] > 1) {
                ctx.fillStyle = 'rgba(0, 200, 100, 0.22)';
                ctx.shadowBlur = 0;
                ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
                const prevChar = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(prevChar, i * fontSize, (drops[i] - 1) * fontSize);
            }

            // Reset or advance
            if (y > H && Math.random() > 0.975) {
                drops[i] = 0;
            } else {
                drops[i]++;
            }
        }

        // Draw particle nodes
        ctx.shadowBlur = 0;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < 0 || n.x > W) n.vx *= -1;
            if (n.y < 0 || n.y > H) n.vy *= -1;

            // Draw node
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
            ctx.fill();

            // Draw connections
            for (let j = i + 1; j < nodes.length; j++) {
                const m = nodes[j];
                const dist = Math.hypot(n.x - m.x, n.y - m.y);
                if (dist < 130) {
                    ctx.beginPath();
                    ctx.moveTo(n.x, n.y);
                    ctx.lineTo(m.x, m.y);
                    ctx.strokeStyle = `rgba(0, 240, 255, ${(1 - dist / 130) * 0.12})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        canvasAnimFrame = requestAnimationFrame(drawMatrix);
    }

    drawMatrix();
}

function initMatrixToggle() {
    const btn = document.getElementById('matrixToggle');
    const canvas = document.getElementById('cyberCanvas');
    if (!btn || !canvas) return;

    btn.addEventListener('click', () => {
        matrixActive = !matrixActive;
        if (!matrixActive) {
            if (canvasAnimFrame) {
                cancelAnimationFrame(canvasAnimFrame);
                canvasAnimFrame = null;
            }
            canvas.style.opacity = '0';
            btn.style.color = 'var(--text-muted)';
        } else {
            canvas.style.opacity = '0.65';
            btn.style.color = 'var(--neon-cyan)';
            initCyberCanvas();
        }
    });
}

/* ==================== INTERACTIVE CYBER TERMINAL ==================== */
const TERMINAL_COMMANDS = {
    help: () => `
<span style="color:var(--neon-cyan)">╔══════════ AVAILABLE COMMANDS ══════════╗</span>
<span style="color:var(--neon-green)"> whoami   </span><span style="color:#94a3b8"> → Tampilkan profil SEC-OPS operator</span>
<span style="color:var(--neon-green)"> nmap     </span><span style="color:#94a3b8"> → Scan port & layanan terbuka (simulasi)</span>
<span style="color:var(--neon-green)"> status   </span><span style="color:#94a3b8"> → Laporan sistem keamanan aktif</span>
<span style="color:var(--neon-green)"> skills   </span><span style="color:#94a3b8"> → Daftar keahlian & arsenal keamanan</span>
<span style="color:var(--neon-green)"> projects </span><span style="color:#94a3b8"> → Proyek dan deployment sistem aman</span>
<span style="color:var(--neon-green)"> contact  </span><span style="color:#94a3b8"> → Informasi kontak & transmisi pesan</span>
<span style="color:var(--neon-green)"> clear    </span><span style="color:#94a3b8"> → Bersihkan layar terminal</span>
<span style="color:var(--neon-green)"> flag     </span><span style="color:#94a3b8"> → [EASTER EGG CTF] 🏴 Selamat! Kamu menemukan flag!</span>
<span style="color:var(--neon-cyan)">╚════════════════════════════════════════╝</span>`,

    whoami: () => `
<span style="color:var(--neon-green)">██╗    ██╗ █████╗ ██╗  ██╗██╗   ██╗██╗   ██╗</span>
<span style="color:var(--neon-green)">██║    ██║██╔══██╗██║  ██║╚██╗ ██╔╝██║   ██║</span>
<span style="color:var(--neon-green)">██║ █╗ ██║███████║███████║ ╚████╔╝ ██║   ██║</span>
<span style="color:var(--neon-green)">██║███╗██║██╔══██║██╔══██║  ╚██╔╝  ██║   ██║</span>
<span style="color:var(--neon-green)">╚███╔███╔╝██║  ██║██║  ██║   ██║   ╚██████╔╝</span>

<span style="color:var(--neon-cyan)">IDENTITY REPORT:</span>
  Nama        : <span style="color:#f0f6fc">Wahyu Prihanto</span>
  Role        : <span style="color:#f0f6fc">Guru TKJ · Network Infrastructure Specialist</span>
               <span style="color:#f0f6fc">Linux System Administrator & Web Developer</span>
  Instansi    : <span style="color:#f0f6fc">SMK Diponegoro Tumpang, Malang, ID</span>
  Pengalaman  : <span style="color:var(--neon-amber)">13+ Tahun (Pendidikan Vokasi & IT Jaringan)</span>
  Status      : <span style="color:var(--neon-green)">Siap Kerja / Open for Roles (Network/Linux/Web/Guru)</span>
  Keahlian Inti: <span style="color:#f0f6fc">MikroTik RouterOS | VLAN | Linux Server | Troubleshooting | PHP/PWA</span>`,

    nmap: () => {
        const ips = ['192.168.1.1', '10.0.0.254', '172.16.50.1'];
        const ip = ips[Math.floor(Math.random() * ips.length)];
        return `
<span style="color:var(--neon-cyan)">Starting Nmap 7.94 — Network & Service Scan</span>
Host: <span style="color:#f0f6fc">${ip} (lab-tkj-gw.local)</span>  Status: <span style="color:var(--neon-green)">Up</span>
Latency: ${Math.floor(Math.random() * 4) + 1}ms | Target: Gateway Lab TKJ

<span style="color:var(--neon-cyan)">PORT      STATE     SERVICE       VERSION</span>
<span style="color:var(--neon-green)">22/tcp    open      ssh           OpenSSH 8.9p1 (Ubuntu Linux)</span>
<span style="color:var(--neon-green)">80/tcp    open      http          Nginx 1.24 (Web Portal)</span>
<span style="color:var(--neon-green)">443/tcp   open      https         TLS 1.3 / Let's Encrypt</span>
<span style="color:var(--neon-alert)">8291/tcp  open      winbox        MikroTik RouterOS v7</span>
<span style="color:var(--text-muted)">53/udp    open      domain        DNS Server (Local Caching)</span>

Firewall Filter: <span style="color:var(--neon-green)">ACTIVE (MikroTik Rule Protection) ✓</span>
VLAN Segmentation: <span style="color:var(--neon-green)">VLAN 10 (Admin), VLAN 20 (Lab TKJ), VLAN 30 (WiFi) ✓</span>
SSH Protection: <span style="color:var(--neon-green)">Fail2ban & Key Authentication ACTIVE ✓</span>`;
    },

    status: () => `
<span style="color:var(--neon-cyan)">╔══════ LAB & INFRASTRUCTURE STATUS ══════╗</span>
  Timestamp   : <span style="color:#f0f6fc">${new Date().toISOString()}</span>
  Kondisi Lab : <span style="color:var(--neon-green)">OPTIMAL & TERHUBUNG</span>
  Uptime      : <span style="color:var(--neon-green)">99.9% (Infrastruktur Sekolah & Server)</span>

<span style="color:var(--neon-cyan)"> INFRASTRUKTUR & LAYANAN AKTIF:</span>
  [✓] Gateway MikroTik RouterOS  → <span style="color:var(--neon-green)">ROUTING & QUEUE ACTIVE</span>
  [✓] Segmentasi VLAN Antar-Lab  → <span style="color:var(--neon-green)">ISOLATED & SECURE</span>
  [✓] Server SIMPATI (SIM Siswa) → <span style="color:var(--neon-green)">ONLINE (PWA & WebAuthn)</span>
  [✓] Portal PPDB Online         → <span style="color:var(--neon-green)">RUNNING (Multi-step Form)</span>
  [✓] Server Linux (Ubuntu)      → <span style="color:var(--neon-green)">SSH, NGINX, MYSQL UP</span>
  [✓] Bandwidth Management (QoS) → <span style="color:var(--neon-green)">BALANCED PER CLIENT</span>
  [✓] Backup Database Otomatis   → <span style="color:var(--neon-green)">SCHEDULED NIGHTLY</span>
<span style="color:var(--neon-cyan)">╚═════════════════════════════════════════╝</span>`,

    skills: () => `
<span style="color:var(--neon-cyan)">KOMPETENSI & KEAHLIAN RELEVAN:</span>

<span style="color:var(--neon-amber)">▸ 1. Instalasi Jaringan</span>
  Krimping Kabel UTP (T568A/B) [████████████ 95%]
  Switching & Router Config    [████████████ 92%]
  Access Point & WiFi Setup    [████████████ 90%]
  Subnetting IPv4 & DHCP       [████████████ 94%]

<span style="color:var(--neon-amber)">▸ 2. Pemeliharaan Komputer (Hardware/Software)</span>
  Perakitan & Diagnostik PC    [████████████ 95%]
  Instalasi OS Windows & Linux [████████████ 95%]
  Troubleshooting Motherboard  [██████████░ 88%]
  Data Recovery & Backup       [██████████░ 89%]

<span style="color:var(--neon-amber)">▸ 3. Infrastruktur Jaringan</span>
  MikroTik RouterOS & Winbox   [████████████ 93%]
  VLAN (Virtual LAN) & Trunk   [████████████ 90%]
  Routing Statis & Dinamis     [██████████░ 88%]
  Bandwidth Management & Queue [████████████ 92%]

<span style="color:var(--neon-amber)">▸ 4. Monitoring & Sistem Linux</span>
  Ubuntu / Debian Server       [████████████ 90%]
  Terminal Bash & Shell Script [██████████░ 87%]
  Wireshark Traffic Analysis   [██████████░ 85%]
  Nmap Port & Service Scan     [██████████░ 86%]

<span style="color:var(--neon-amber)">▸ 5. Pengembangan Web & Sistem</span>
  PHP, MySQL, Apache/Nginx     [████████████ 90%]
  WebAuthn Biometrik & PWA     [██████████░ 88%]
  Google Apps Script (GAS)     [████████████ 92%]

Perangkat Kerja: MikroTik · Ubuntu · Debian · Wireshark · Packet Tracer · VS Code · MySQL`,

    projects: () => `
<span style="color:var(--neon-cyan)">ACTIVE DEPLOYMENTS — SECURITY LAB:</span>

<span style="color:var(--neon-green)">[SYS-01]</span> Aplikasi Kesiswaan — RBAC Multi-level
         RBAC Auth | Anti-Injection | Audit Log | Encrypted Cloud
         Status: <span style="color:var(--neon-green)">PRODUCTION ✓</span>

<span style="color:var(--neon-green)">[NET-02]</span> Sistem Rekam Pembina — Anti-Tamper Attendance
         Immutable Log | Real-time Timestamp | Automated Alert
         Status: <span style="color:var(--neon-green)">HARDENED ✓</span>

<span style="color:var(--neon-green)">[WEB-03]</span> Portal Web Pembelajaran — Secure Dashboard
         Token Auth | PII Protection | Class Analytics
         Status: <span style="color:var(--neon-green)">MONITORED ✓</span>

<span style="color:var(--neon-green)">[CRY-04]</span> Engine Sertifikat Anti-Pemalsuan
         Dynamic QR Hash | SHA-256 Integrity | Batch Generator
         Status: <span style="color:var(--neon-green)">TAMPER-PROOF ✓</span>

<span style="color:var(--neon-cyan)">[SIM-05]</span> SIMPATI — Sistem Informasi Manajemen Peserta Didik
         WebAuthn Biometrik | Cloudflare Turnstile | 6-Level RBAC | PWA
         URL: <span style="color:var(--neon-green)">https://simpatismkdiponegorotumpang.id</span>
         Status: <span style="color:var(--neon-cyan)">🌐 LIVE IN PRODUCTION ✓</span>

<span style="color:var(--neon-amber)">[WEB-06]</span> PPDB Online — Pendaftaran Peserta Didik Baru
         Multi-step Form | Autocomplete | Slip Registrasi | PWA Mobile
         URL: <span style="color:var(--neon-green)">https://ppdb.simpatismkdiponegorotumpang.id</span>
         Status: <span style="color:var(--neon-cyan)">🌐 LIVE IN PRODUCTION ✓</span>

→ Ketik <span style="color:var(--neon-cyan)">contact</span> untuk konsultasi / kolaborasi`,

    contact: () => `
<span style="color:var(--neon-cyan)">TRANSMISSION CHANNELS — ENCRYPTED:</span>

<span style="color:var(--neon-green)">📧 Email:</span>
   prihantowahyu23@gmail.com

<span style="color:var(--neon-green)">📱 WhatsApp (End-to-End Encrypted):</span>
   +62 877-7560-0462
   Chat: https://wa.me/6287775600462

<span style="color:var(--neon-green)">📍 Pangkalan Ops:</span>
   SMK Diponegoro Tumpang, Malang, Jawa Timur

<span style="color:var(--neon-amber)">PGP FINGERPRINT:</span>
   9B8A 4F12 770E 88B1 C990 D21A 5092 34BF E87A 1902

→ Scroll ke bawah untuk form kontak terenkripsi.`,

    flag: () => `
<span style="color:var(--neon-alert)">╔══════════════════════════════════════════╗</span>
<span style="color:var(--neon-alert)">║  🏴 CTF EASTER EGG — FLAG FOUND! 🏴     ║</span>
<span style="color:var(--neon-alert)">╚══════════════════════════════════════════╝</span>

<span style="color:var(--neon-green)">FLAG{WP_SEC0PS_M4STeR_D3FEnDeR_2026}</span>

<span style="color:#94a3b8">Selamat! Kamu telah menemukan easter egg tersembunyi.
Ini menandakan kamu adalah seseorang yang curious, teliti,
dan berpikir seperti seorang pentester — kualitas yang
sangat dibutuhkan di dunia Cyber Security! 🎯🛡️</span>`,

    clear: () => '__CLEAR__'
};

function initInteractiveTerminal() {
    const output = document.getElementById('terminalOutput');
    const input = document.getElementById('terminalInput');
    const sendBtn = document.getElementById('termSendBtn');
    const quickBtns = document.querySelectorAll('.chip-cmd');

    if (!output || !input) return;

    let commandHistory = [];
    let histIndex = -1;

    function appendLine(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    }

    function executeCommand(cmd) {
        const trimmed = cmd.trim().toLowerCase();
        if (!trimmed) return;

        // Add to history
        commandHistory.unshift(trimmed);
        histIndex = -1;

        // Echo the typed command
        appendLine(`<div class="term-cmd-echo">secops@wahyu:~$ ${escapeHtml(cmd.trim())}</div>`);

        if (!TERMINAL_COMMANDS[trimmed]) {
            appendLine(`<div class="term-error">bash: ${escapeHtml(trimmed)}: command not found. Ketik '<span style="color:var(--neon-cyan)">help</span>' untuk bantuan.</div>`);
            return;
        }

        const result = TERMINAL_COMMANDS[trimmed]();

        if (result === '__CLEAR__') {
            output.innerHTML = '<div class="term-line term-banner">Terminal cleared. Ketik \'<span style="color:var(--neon-cyan)">help</span>\' untuk daftar perintah.</div>';
            return;
        }

        appendLine(`<div class="term-result">${result}</div>`);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // Send button click
    sendBtn?.addEventListener('click', () => {
        if (input.value.trim()) {
            executeCommand(input.value);
            input.value = '';
        }
    });

    // Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (input.value.trim()) {
                executeCommand(input.value);
                input.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (histIndex < commandHistory.length - 1) {
                histIndex++;
                input.value = commandHistory[histIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (histIndex > 0) {
                histIndex--;
                input.value = commandHistory[histIndex];
            } else {
                histIndex = -1;
                input.value = '';
            }
        }
    });

    // Quick action chips
    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-cmd');
            input.value = cmd;
            executeCommand(cmd);
            input.value = '';
        });
    });

    // Focus terminal on btn click
    document.getElementById('btnFocusTerminal')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('terminalSection')?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => input.focus(), 700);
    });
}

/* ==================== ANIMATED COUNTER (TELEMETRY METRICS) ==================== */
function initCounters() {
    const counters = document.querySelectorAll('.counter');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-target'));
                animateCounter(el, target);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
}

function animateCounter(el, target) {
    const duration = 1800;
    const start = performance.now();
    const startVal = 0;

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(startVal + eased * (target - startVal));
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = target;
    }

    requestAnimationFrame(update);
}

/* ==================== SKILL BARS ANIMATION ==================== */
function initSkillBars() {
    const bars = document.querySelectorAll('.skill-fill');
    if (!bars.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const level = bar.style.getPropertyValue('--level');
                // Reset first to force animation
                bar.style.setProperty('--level', '0%');
                setTimeout(() => bar.style.setProperty('--level', level), 100);
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.3 });

    bars.forEach(b => observer.observe(b));
}

/* ==================== CONTACT FORM ==================== */
function initContactForm() {
    const form = document.getElementById('contactForm');
    const alert = document.getElementById('formStatusAlert');
    const btn = document.getElementById('btnSubmitForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Simulate processing
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span>ENCRYPTING & TRANSMITTING...</span>';
            btn.disabled = true;

            setTimeout(() => {
                btn.innerHTML = orig;
                btn.disabled = false;

                if (alert) {
                    alert.className = 'form-status-alert success';
                    alert.innerHTML = '<i class="fas fa-shield-check"></i> Transmisi berhasil! Pesan Anda telah dikirim secara aman. Saya akan segera merespons.';
                    alert.style.display = 'block';
                }

                form.reset();

                setTimeout(() => {
                    if (alert) alert.style.display = 'none';
                }, 6000);
            }, 1800);
        }
    });
}

/* ==================== FOOTER YEAR ==================== */
function initFooterYear() {
    const el = document.getElementById('currentYear');
    if (el) el.textContent = new Date().getFullYear();
}

/* ==================== CHAT WIDGET ==================== */
function initChatWidget() {
    const widget = document.getElementById('chatWidget');
    const toggle = document.getElementById('chatToggle');
    const minimize = document.getElementById('chatMinimize');
    if (!widget || !toggle || !minimize) return;

    toggle.addEventListener('click', () => widget.classList.toggle('open'));
    minimize.addEventListener('click', () => widget.classList.remove('open'));

    // Auto-open chat after 12s delay for engagement
    setTimeout(() => {
        if (!widget.classList.contains('open')) {
            widget.classList.add('open');
            setTimeout(() => {
                // Don't auto-close; let user close it
            }, 8000);
        }
    }, 12000);
}

/* ==================== SMOOTH SCROLL ==================== */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}
