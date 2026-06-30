// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
const Titan = (options = {}) => {
    const rateLimitWindow = options.windowMs || 60000;
    const maxRequests = options.limit || 150;
    const blockDuration = options.blockDuration || 300000;
    const maxPayloadSize = options.maxPayloadSize || 1048576;
    const trustProxy = options.trustProxy === true;
    
    const hits = new Map();
    const blacklist = new Map();

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamp] of blacklist.entries()) {
            if (now > timestamp) {
                blacklist.delete(ip);
            }
        }
        for (const [ip, data] of hits.entries()) {
            if (now - data.startTime >= rateLimitWindow) {
                hits.delete(ip);
            }
        }
    }, Math.max(rateLimitWindow, 60000));
    
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return (req, res, next) => {
        let ip;
        if (trustProxy && req.headers['x-forwarded-for']) {
            const forwarded = req.headers['x-forwarded-for'];
            const forwardedString = Array.isArray(forwarded) ? forwarded[0] : forwarded;
            ip = String(forwardedString).split(',')[0].trim();
        } else {
            ip = req.ip || req.socket?.remoteAddress || 'unknown';
        }

        const now = Date.now();

        if (blacklist.has(ip)) {
            if (now < blacklist.get(ip)) {
                return res.status(403).json({ error: "Erişim geçici olarak engellendi." });
            } else {
                blacklist.delete(ip);
            }
        }

        const contentLengthHeader = req.headers['content-length'];
        const transferEncoding = req.headers['transfer-encoding'];

        if (contentLengthHeader !== undefined) {
            const contentLength = parseInt(contentLengthHeader, 10);
            if (isNaN(contentLength) || contentLength > maxPayloadSize) {
                return res.status(413).json({ error: "İstek boyutu çok büyük veya geçersiz." });
            }
        } else if (transferEncoding === 'chunked') {
            return res.status(411).json({ error: "Belirsiz istek boyutu (Chunked) güvenlik nedeniyle reddedildi." });
        }

        let userData = hits.get(ip);
        if (!userData || now - userData.startTime >= rateLimitWindow) {
            userData = { count: 0, startTime: now };
        }

        userData.count++;
        hits.set(ip, userData);

        if (userData.count > maxRequests) {
            blacklist.set(ip, now + blockDuration);
            hits.delete(ip);
            return res.status(429).json({ error: "Şüpheli trafik algılandı, IP adresi engellendi." });
        }

        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');

        next();
    };
};

module.exports = Titan;
