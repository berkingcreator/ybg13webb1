// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)

const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const randomBytesAsync = promisify(crypto.randomBytes);
const generateKeyPairAsync = promisify(crypto.generateKeyPair);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

class TenantKeyManager {
    #tenants = new Map();

    async getOrCreateTenant(tenantId) {
        if (!this.#tenants.has(tenantId)) {
            const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });
            const sessionKey = await randomBytesAsync(32); // AES-256
            this.#tenants.set(tenantId, {
                publicKey,
                privateKey,
                sessionKey,
                createdAt: Date.now()
            });
        }
        return this.#tenants.get(tenantId);
    }
}

class NovaGateSingularity {
    #version = "3.0.0";
    #config;
    #tenantKeyManager;
    #blacklistedNonces = new Map();
    #cleanupTimer;

    constructor(config = {}) {
        this.#config = {
            appId: config.appId || "NOVAGATE_SINGULARITY",
            debug: config.debug || false,
            securityLevel: "MAXIMUM",
            maxNonceAgeMs: config.maxNonceAgeMs || 60000
        };
        this.#tenantKeyManager = new TenantKeyManager();

        this.#cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [uid, ts] of this.#blacklistedNonces.entries()) {
                if (now - ts > this.#config.maxNonceAgeMs) {
                    this.#blacklistedNonces.delete(uid);
                }
            }
        }, 60000);

        if (this.#cleanupTimer.unref) {
            this.#cleanupTimer.unref();
        }

        this.log("Singularity Engine initializing...");
    }

    log(msg) {
        if (this.#config.debug) {
            const time = new Date().toLocaleTimeString();
            console.log(`[NovaGate v${this.#version}] [${time}] ${msg}`);
        }
    }

    async secureWrap(payload, tenantId = 'default', ttlMs = null) {
        const tenant = await this.#tenantKeyManager.getOrCreateTenant(tenantId);
        const aesKey = tenant.sessionKey;  // Tenant'a özel simetrik anahtar
        const iv = await randomBytesAsync(12);
        const nonce = await randomBytesAsync(16);

        const metadata = {
            uid: crypto.randomUUID(),
            ts: Date.now(),
            app: this.#config.appId,
            v: this.#version
        };
        if (ttlMs && Number.isFinite(ttlMs) && ttlMs > 0) {
            metadata.ttl_ms = ttlMs;
        }

        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const compressed = await brotliCompressAsync(Buffer.from(payloadStr, 'utf8'));
        const fullPayload = JSON.stringify({
            ...metadata,
            payload: compressed.toString('base64')
        });

        const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
        let encryptedContent = cipher.update(fullPayload, 'utf8', 'base64');
        encryptedContent += cipher.final('base64');
        const authTag = cipher.getAuthTag();

        // AES anahtarını tenant'ın RSA public key'i ile şifrele (hibrit zarf)
        const encryptedAesKey = crypto.publicEncrypt(
            {
                key: tenant.publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            aesKey
        );

        this.log(`Package secured for tenant ${tenantId}`);

        return {
            bundle: encryptedContent,
            vector: iv.toString('base64'),
            tag: authTag.toString('base64'),
            nonce: nonce.toString('hex'),
            encryptedKey: encryptedAesKey.toString('base64'),
            tenantId,
            v: this.#version
        };
    }

    async breachUnwrap(securePackage) {
        if (!securePackage || securePackage.v !== this.#version) {
            this.log("Version mismatch or invalid package");
            return null;
        }

        const { bundle, vector, tag, nonce: nonceHex, encryptedKey, tenantId } = securePackage;
        if (!bundle || !vector || !tag || !nonceHex || !encryptedKey || !tenantId) {
            this.log("Missing required fields in securePackage");
            return null;
        }

        try {
            const tenant = await this.#tenantKeyManager.getOrCreateTenant(tenantId);

            // RSA private key ile AES anahtarını çöz
            const aesKey = crypto.privateDecrypt(
                {
                    key: tenant.privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                Buffer.from(encryptedKey, 'base64')
            );

            const iv = Buffer.from(vector, 'base64');
            const authTag = Buffer.from(tag, 'base64');

            const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(bundle, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            const decoded = JSON.parse(decrypted);

            // Nonce (tekrar saldırısı) kontrolü
            const nonceValue = Buffer.from(nonceHex, 'hex').toString('hex');
            if (this.#blacklistedNonces.has(decoded.uid)) {
                throw new Error("REPLAY_ATTACK");
            }

            // Zaman aşımı kontrolü (varsayılan 60 saniye, veya ttl_ms)
            const ttl = decoded.ttl_ms || 60000;
            if (Date.now() - decoded.ts > ttl) {
                throw new Error("TTL_EXPIRED");
            }

            // Nonce'yi kara listeye ekle
            this.#blacklistedNonces.set(decoded.uid, decoded.ts);

            const compressedData = Buffer.from(decoded.payload, 'base64');
            const decompressed = await brotliDecompressAsync(compressedData);
            const plaintext = decompressed.toString('utf8');

            try {
                return JSON.parse(plaintext);
            } catch {
                return plaintext;
            }
        } catch (err) {
            this.log(`Security violation: ${err.message}`);
            return null;
        }
    }

    destroy() {
        if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
        this.#blacklistedNonces.clear();
        this.log("Singularity Engine terminated.");
    }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const singularity = new NovaGateSingularity({ debug: true });

app.post('/api/v1/singularity/wrap', async (req, res) => {
    try {
        const { payload, ttl_ms } = req.body;
        const tenantId = req.headers['x-app-id'] || 'default';
        if (!payload) {
            return res.status(400).json({ error: 'payload is required' });
        }
        const result = await singularity.secureWrap(payload, tenantId, ttl_ms || undefined);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/v1/singularity/unwrap', async (req, res) => {
    try {
        const { securePackage } = req.body;
        if (!securePackage) {
            return res.status(400).json({ error: 'securePackage is required' });
        }
        const decrypted = await singularity.breachUnwrap(securePackage);
        if (decrypted === null) {
            return res.status(400).json({ error: 'Decryption failed. Package may be expired, tampered, or replayed.' });
        }
        res.json({ success: true, data: decrypted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`NovaGate Singularity API listening on port ${PORT}`);
});

module.exports = { NovaGateSingularity, app };
