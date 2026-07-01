// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const randomBytesAsync = promisify(crypto.randomBytes);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

class TenantKeyManager {
    #keys = new Map();

    async getOrCreateKey(tenantId) {
        if (!this.#keys.has(tenantId)) {
            const newKey = await randomBytesAsync(32);
            this.#keys.set(tenantId, {
                key: newKey,
                createdAt: Date.now()
            });
        }
        return this.#keys.get(tenantId).key;
    }
}

class NovaGateQuantum {
    #version = "4.0.0";
    #config;
    #tenantKeyManager;
    #usedNonces = new Map();
    #cleanupTimer;

    constructor(config = {}) {
        this.#config = {
            appId: config.appId || "YBG13_NOVAGATE_V4",
            debug: config.debug !== undefined ? config.debug : true,
            strictMode: true,
            maxNonceCache: config.maxNonceCache || 50000
        };
        this.#tenantKeyManager = new TenantKeyManager();
        
        this.#cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [nonce, ts] of this.#usedNonces.entries()) {
                if (now - ts > 300000) {
                    this.#usedNonces.delete(nonce);
                }
            }
        }, 60000);
        
        if (this.#cleanupTimer.unref) {
            this.#cleanupTimer.unref();
        }
        
        this.log("NovaGate Quantum Vault Engine initialized", "info");
    }

    log(msg, type = "info") {
        if (!this.#config.debug) return;
        const colors = { 
            info: "\x1b[36m", 
            warn: "\x1b[33m", 
            error: "\x1b[31m", 
            success: "\x1b[32m" 
        };
        const reset = "\x1b[0m";
        const time = new Date().toLocaleTimeString();
        console.log(`${colors[type] || reset}[NovaGate v${this.#version}] [${time}] ${msg}${reset}`);
    }

    async encryptData(payload, tenantId = 'default', ttlMs = null) {
        const tenantKey = await this.#tenantKeyManager.getOrCreateKey(tenantId);
        const iv = await randomBytesAsync(12);
        const nonce = await randomBytesAsync(16);
        const timestamp = Date.now();

        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const compressed = await brotliCompressAsync(Buffer.from(payloadStr, 'utf8'));
        
        const secureBundle = {
            data: compressed.toString('base64'),
            timestamp,
            nonce: nonce.toString('hex'),
            tenantId
        };
        if (ttlMs && typeof ttlMs === 'number' && ttlMs > 0) {
            secureBundle.ttl_ms = ttlMs;
        }

        const plaintext = JSON.stringify(secureBundle);
        const cipher = crypto.createCipheriv('aes-256-gcm', tenantKey, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');

        this.log(`Data encrypted for tenant ${tenantId}`, "info");
        return {
            cipher: encrypted,
            vector: iv.toString('base64'),
            tag: authTag,
            v: this.#version
        };
    }

    async decryptData(securePackage) {
        if (!securePackage || securePackage.v !== this.#version) {
            this.log("Version mismatch or invalid package", "warn");
            return null;
        }

        try {
            const encryptedText = securePackage.cipher;
            const iv = Buffer.from(securePackage.vector, 'base64');
            const authTag = Buffer.from(securePackage.tag, 'base64');

            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                await this.#tenantKeyManager.getOrCreateKey('__placeholder__'),
                iv
            );
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            const bundle = JSON.parse(decrypted);
            const tenantKey = await this.#tenantKeyManager.getOrCreateKey(bundle.tenantId);

            if (Buffer.compare(tenantKey, await this.#tenantKeyManager.getOrCreateKey(bundle.tenantId)) !== 0) {
                throw new Error("Tenant key mismatch");
            }

            const now = Date.now();
            const ttl = bundle.ttl_ms || 300000;
            if (now - bundle.timestamp > ttl) {
                throw new Error("TTL_EXPIRED");
            }

            if (this.#usedNonces.has(bundle.nonce)) {
                throw new Error("REPLAY_ATTACK");
            }

            if (this.#usedNonces.size >= this.#config.maxNonceCache) {
                const firstKey = this.#usedNonces.keys().next().value;
                this.#usedNonces.delete(firstKey);
            }
            this.#usedNonces.set(bundle.nonce, bundle.timestamp);

            const compressedData = Buffer.from(bundle.data, 'base64');
            const decompressed = await brotliDecompressAsync(compressedData);
            const plaintext = decompressed.toString('utf8');

            try {
                return JSON.parse(plaintext);
            } catch {
                return plaintext;
            }
        } catch (error) {
            this.log(`Decryption failed: ${error.message}`, "error");
            return null;
        }
    }

    destroy() {
        if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
        this.#usedNonces.clear();
        this.log("System terminated", "info");
    }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const gateway = new NovaGateQuantum({ debug: true });

app.post('/api/v1/vault/encrypt', async (req, res) => {
    try {
        const { payload, ttl_ms } = req.body;
        const tenantId = req.headers['x-app-id'] || 'default';
        if (!payload) {
            return res.status(400).json({ error: 'payload is required' });
        }
        const encrypted = await gateway.encryptData(payload, tenantId, ttl_ms || null);
        res.json({ success: true, data: encrypted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/v1/vault/decrypt', async (req, res) => {
    try {
        const { securePackage } = req.body;
        if (!securePackage) {
            return res.status(400).json({ error: 'securePackage is required' });
        }
        const decrypted = await gateway.decryptData(securePackage);
        if (decrypted === null) {
            return res.status(400).json({ error: 'Decryption failed, package invalid or expired' });
        }
        res.json({ success: true, data: decrypted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/v1/share/create', async (req, res) => {
    try {
        const { payload, ttl_ms } = req.body;
        const tenantId = req.headers['x-app-id'] || 'default';
        if (!payload || !ttl_ms) {
            return res.status(400).json({ error: 'payload and ttl_ms are required' });
        }
        const encrypted = await gateway.encryptData(payload, tenantId, ttl_ms);
        res.json({ success: true, data: encrypted, ttl_ms });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NovaGate API Gateway listening on port ${PORT}`);
});

module.exports = { NovaGateQuantum, app };
