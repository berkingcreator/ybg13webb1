// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)

const crypto = require('crypto');

class NovaGateSingularity {
    constructor(config = {}) {
        this.version = "3.0.0";
        this.config = {
            appId: config.appId || "NOVAGATE_SINGULARITY",
            debug: config.debug || false,
            securityLevel: "MAXIMUM"
        };
        
        this.keyPair = null;
        this.activeSessionKey = null;
        this.blacklistedNonces = new Map();
        
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [uid, ts] of this.blacklistedNonces.entries()) {
                if (now - ts > 60000) {
                    this.blacklistedNonces.delete(uid);
                }
            }
        }, 60000);
        
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }

        this.log("Singularity Motoru Atesleniyor...");
    }

    log(msg) {
        if (this.config.debug) {
            const time = new Date().toLocaleTimeString();
            console.log(`[NovaGate v${this.version}] [${time}]`, msg);
        }
    }

    async bootSequence() {
        return new Promise((resolve, reject) => {
            crypto.generateKeyPair('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            }, (err, publicKey, privateKey) => {
                if (err) return reject(err);
                this.keyPair = { publicKey, privateKey };
                this.rotateSessionKey();
                this.log("Sistem Cekirdegi Hazir. RSA-4096 ve AES-256 aktif.");
                resolve();
            });
        });
    }

    rotateSessionKey() {
        this.activeSessionKey = crypto.randomBytes(32);
        this.log("Oturum anahtari basariyla yenilendi.");
    }

    secureWrap(payload) {
        if (!this.activeSessionKey) throw new Error("Oturum anahtari eksik.");
        
        const iv = crypto.randomBytes(12);
        const salt = crypto.randomBytes(16);
        
        const metadata = {
            uid: crypto.randomUUID(),
            ts: Date.now(),
            app: this.config.appId,
            v: this.version
        };

        const rawContent = JSON.stringify({
            ...metadata,
            payload: payload
        });

        const cipher = crypto.createCipheriv('aes-256-gcm', this.activeSessionKey, iv);
        cipher.setAAD(salt);
        
        let encryptedContent = cipher.update(rawContent, 'utf8', 'base64');
        encryptedContent += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');

        return {
            bundle: encryptedContent,
            vector: iv.toString('base64'),
            entropy: salt.toString('base64'),
            tag: authTag,
            signature: metadata.uid
        };
    }

    breachUnwrap(securePackage) {
        try {
            const bundle = securePackage.bundle;
            const iv = Buffer.from(securePackage.vector, 'base64');
            const salt = Buffer.from(securePackage.entropy, 'base64');
            const authTag = Buffer.from(securePackage.tag, 'base64');

            const decipher = crypto.createDecipheriv('aes-256-gcm', this.activeSessionKey, iv);
            decipher.setAAD(salt);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(bundle, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            const decoded = JSON.parse(decrypted);

            if (this.blacklistedNonces.has(decoded.uid)) throw new Error("REPLAY DETECTED");
            if (Date.now() - decoded.ts > 60000) throw new Error("PACKAGE EXPIRED");

            this.blacklistedNonces.set(decoded.uid, decoded.ts);
            this.log("Paket cozuldu: Veri butunlugu dogrulandi.");
            
            return decoded.payload;
        } catch (e) {
            this.log(`GUVENLIK IHLALI: ${e.message}`);
            return null;
        }
    }
}

(async () => {
    const NG3 = new NovaGateSingularity({ debug: true });
    await NG3.bootSequence();

    const topSecret = { project: "Kul-u Anka", status: "Stealth Mode", tech: "Quantum-Safe" };

    const encrypted = NG3.secureWrap(topSecret);
    console.log("[GONDERILEN PAKET]", encrypted);

    const decrypted = NG3.breachUnwrap(encrypted);
    console.log("[COZULEN VERI]", decrypted);
})();
