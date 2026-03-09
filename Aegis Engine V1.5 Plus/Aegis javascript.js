/**
 * YBG13™ Aegis Plus v1.5 - Node.js
 * "The Guard" Edition
 */
const fs = require('fs');
const path = require('path');

const AegisPlus = (options = {}) => {
    const blacklistIPs = new Set(options.blacklist || []);
    const maxRequests = options.limit || 50; // Plus sürümü daha sıkı limit sunar 
    const windowMs = 60000;
    const allowedExts = options.allowedExtensions || ['.jpg', '.png', '.pdf', '.docx'];
    const logPath = options.logPath || 'aegis_plus.log';
    const hits = new Map();

    // Loglama Fonksiyonu
    const logAction = (ip, reason) => {
        const timestamp = new Date().toISOString();
        const message = `[${timestamp}] ALERT: ${ip} - ${reason}\n`;
        fs.appendFileSync(logPath, message);
    };

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;

        // 1. KARA LİSTE DENETİMİ
        if (blacklistIPs.has(ip)) {
            logAction(ip, "Blacklisted access attempt");
            return res.status(403).json({ error: "Aegis Plus: Erişim Reddedildi!" });
        }

        // 2. GELİŞMİŞ DOSYA DENETİMİ (Plus Özelliği)
        if (req.files || (req.headers['content-type']?.includes('multipart/form-data'))) {
            // Not: req.files kullanımı için 'express-fileupload' gibi bir middleware gereklidir
            if (req.files) {
                const files = Object.values(req.files);
                for (const file of files) {
                    const ext = path.extname(file.name).toLowerCase();
                    if (!allowedExts.includes(ext)) {
                        logAction(ip, `Unauthorized file extension: ${ext}`);
                        return res.status(400).json({ error: `Aegis Plus: ${ext} uzantısı yasak!` });
                    }
                }
            }
        }

        // 3. HIZ SINIRLAMA 
        const now = Date.now();
        const userHits = hits.get(ip) || [];
        const recentHits = userHits.filter(hit => now - hit < windowMs);
        
        if (recentHits.length >= maxRequests) {
            logAction(ip, "Rate limit exceeded");
            return res.status(429).json({ error: "Aegis Plus: Çok fazla istek!" });
        }
        
        recentHits.push(now);
        hits.set(ip, recentHits);

        // 4. GÜVENLİK BAŞLIKLARI
        res.setHeader('X-Aegis-Edition', 'Plus-v1.5');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');

        next();
    };
};

module.exports = AegisPlus;