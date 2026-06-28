// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)

const crypto = require('crypto');

const AegisTurboEngine = (options = {}) => {
    const blacklistIPs = new Set(options.blacklist || []);
    const maxRequests = options.limit || 100;
    const windowMs = 60000;
    const maxPayloadSize = options.maxPayloadSize || 1e6;
    const hits = new Map();

    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamps] of hits.entries()) {
            const valid = timestamps.filter(t => now - t < windowMs);
            if (valid.length === 0) hits.delete(ip);
            else hits.set(ip, valid);
        }
    }, 300000);

    if (cleanupTimer.unref) {
        cleanupTimer.unref();
    }

    return (req, res, next) => {
        const forwardedFor = req.headers['x-forwarded-for'];
        let ip = req.ip || req.connection?.remoteAddress || 'unknown';
        
        if (forwardedFor) {
            ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]).trim();
        }

        const userAgent = req.headers['user-agent'] || 'Unknown';

        if (blacklistIPs.has(ip)) {
            return res.status(403).json({ error: "Aegis: Erişim Reddedildi (IP Blocked)" });
        }

        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        if (contentLength > maxPayloadSize) {
            return res.status(413).json({ error: "Aegis: İstek boyutu çok büyük!" });
        }

        const botPattern = /sqlmap|nmap|dirbuster|nikto|python-requests|curl|postman/i;
        if (botPattern.test(userAgent)) {
            return res.status(403).json({ error: "Aegis: Otomatik araçlar engellendi." });
        }

        const now = Date.now();
        const userHits = hits.get(ip) || [];
        const recentHits = userHits.filter(hit => now - hit < windowMs);
        
        if (recentHits.length >= maxRequests) {
            return res.status(429).json({ error: "Aegis: Hız sınırı aşıldı." });
        }
        
        recentHits.push(now);
        hits.set(ip, recentHits);

        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

        next();
    };
};

module.exports = AegisTurboEngine;
