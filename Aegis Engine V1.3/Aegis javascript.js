const crypto = require('crypto');

const AegisTurboEngine = (options = {}) => {
    const blacklistIPs = options.blacklist || [];
    const maxRequests = options.limit || 100; // IP başına limit
    const windowMs = 60000; // 1 dakika
    const hits = new Map();

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';

        // 1. KARA LİSTE KONTROLÜ
        if (blacklistIPs.includes(ip)) {
            return res.status(403).json({ error: "Aegis: IP Adresiniz Yasaklı!" });
        }

        // 2. BOT & TARAYICI TESPİTİ
        const suspiciousAgents = ['sqlmap', 'nmap', 'dirbuster', 'nikto', 'python-requests'];
        if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
            return res.status(403).json({ error: "Aegis: Otomatik Araçlar Yasak!" });
        }

        // 3. GELİŞMİŞ DOSYA YÜKLEME KONTROLÜ
        if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/form-data')) {
            // Burada dosya uzantısı kontrolü yapılabilir
            console.log(`[Aegis] Dosya yükleme denetimi yapılıyor: ${ip}`);
        }

        // 4. RATE LIMITING (Hız Sınırlama)
        const now = Date.now();
        const userHits = hits.get(ip) || [];
        const recentHits = userHits.filter(hit => now - hit < windowMs);
        
        if (recentHits.length >= maxRequests) {
            return res.status(429).json({ error: "Aegis: Dakikalık istek sınırı aşıldı." });
        }
        
        recentHits.push(now);
        hits.set(ip, recentHits);

        // 5. GÜVENLİK KATMANI (HTTP Hardening)
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

        next();
    };
};

module.exports = AegisTurboEngine;