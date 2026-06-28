// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)

const crypto = require('crypto');

const AegisTurboEngine = (options = {}) => {
    const blacklistIPs = new Set(options.blacklist || []);
    const maxRequests = options.limit || 100;
    const windowMs = 60000;
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamps] of hits.entries()) {
            const validTimestamps = timestamps.filter(t => now - t < windowMs);
            if (validTimestamps.length === 0) {
                hits.delete(ip);
            } else {
                hits.set(ip, validTimestamps);
            }
        }
    }, windowMs);

    return (req, res, next) => {
        const forwardedFor = req.headers['x-forwarded-for'];
        const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.ip || req.connection?.remoteAddress || 'unknown');
        const userAgent = req.headers['user-agent'] || '';

        if (blacklistIPs.has(ip)) {
            return res.status(403).json({ error: "Aegis: IP Adresiniz Yasaklı!" });
        }

        const suspiciousAgents = ['sqlmap', 'nmap', 'dirbuster', 'nikto', 'python-requests'];
        const lowerUserAgent = userAgent.toLowerCase();
        
        if (suspiciousAgents.some(agent => lowerUserAgent.includes(agent))) {
            return res.status(403).json({ error: "Aegis: Otomatik Araçlar Yasak!" });
        }

        if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/form-data')) {
            const isSuspicious = false; 
            if (isSuspicious) {
                return res.status(400).json({ error: "Aegis: Geçersiz dosya formatı!" });
            }
        }

        const now = Date.now();
        const userHits = hits.get(ip) || [];
        const recentHits = userHits.filter(hit => now - hit < windowMs);

        if (recentHits.length >= maxRequests) {
            return res.status(429).json({ error: "Aegis: Dakikalık istek sınırı aşıldı." });
        }

        recentHits.push(now);
        hits.set(ip, recentHits);

        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        next();
    };
};

module.exports = AegisTurboEngine;
