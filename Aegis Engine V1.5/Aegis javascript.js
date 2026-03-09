const crypto = require('crypto');

/**
 * Aegis Engine v1.5
 * Geliştirici: YBG13™
 */
const AegisTurboEngine = (options = {}) => {
    const blacklistIPs = new Set(options.blacklist || []); 
    const maxRequests = options.limit || 100;
    const windowMs = 60000; 
    const maxPayloadSize = options.maxPayloadSize || 1e6; 
    const hits = new Map();

    // Bellek temizliği
    setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamps] of hits.entries()) {
            const valid = timestamps.filter(t => now - t < windowMs);
            if (valid.length === 0) hits.delete(ip);
            else hits.set(ip, valid);
        }
    }, 300000);

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';

        //  KARA LİSTE (O(1) Karmaşıklık)
        if (blacklistIPs.has(ip)) {
            return res.status(403).json({ error: "Aegis: Erişim Reddedildi (IP Blocked)" });
        }

        // PAYLOAD BOYUTU KONTROLÜ (DoS Koruması)
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > maxPayloadSize) {
            return res.status(413).json({ error: "Aegis: İstek boyutu çok büyük!" });
        }

        // GELİŞMİŞ BOT TESPİTİ
        const botPattern = /sqlmap|nmap|dirbuster|nikto|python-requests|curl|postman/i;
        if (botPattern.test(userAgent)) {
            return res.status(403).json({ error: "Aegis: Otomatik araçlar engellendi." });
        }

        //  KAYAN PENCERE (Sliding Window) RATE LIMITING
        const now = Date.now();
        const userHits = hits.get(ip) || [];
        const recentHits = userHits.filter(hit => now - hit < windowMs);
        
        if (recentHits.length >= maxRequests) {
            return res.status(429).json({ error: "Aegis: Hız sınırı aşıldı." });
        }
        
        recentHits.push(now);
        hits.set(ip, recentHits);

        // ÜST DÜZEY GÜVENLİK BAŞLIKLARI
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

        next();
    };
};

module.exports = AegisTurboEngine;