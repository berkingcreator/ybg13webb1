// "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)
const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const randomBytesAsync = promisify(crypto.randomBytes);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);
const generateKeyPairAsync = promisify(crypto.generateKeyPair);

class TenantKeyManager {
  #keys = new Map();
  #rotationLimits = new Map();
  #encryptionCounts = new Map();

  async getOrCreateKeys(tenantId) {
    if (!this.#keys.has(tenantId)) {
      const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      const aesKey = await randomBytesAsync(32);
      this.#keys.set(tenantId, { publicKey, privateKey, aesKey });
      this.#rotationLimits.set(tenantId, 10000);
      this.#encryptionCounts.set(tenantId, 0);
    }
    return this.#keys.get(tenantId);
  }

  async rotateAesKey(tenantId) {
    const tenantKeys = this.#keys.get(tenantId);
    if (!tenantKeys) return;
    tenantKeys.aesKey = await randomBytesAsync(32);
    this.#encryptionCounts.set(tenantId, 0);
  }

  incrementAndCheckRotation(tenantId) {
    const limit = this.#rotationLimits.get(tenantId) || 10000;
    const count = (this.#encryptionCounts.get(tenantId) || 0) + 1;
    this.#encryptionCounts.set(tenantId, count);
    return count > limit;
  }
}

class NovaGateQuantum {
  #version = "5.2.0";
  #config;
  #sessionKey = null;
  #usedNonces = new Map();
  #cleanupTimer;
  #encryptionCount = 0;
  #tenantKeyManager = new TenantKeyManager();
  #masterSalt = null;

  constructor(config = {}) {
    this.#config = {
      appId: config.appId || "YBG13_NOVAGATE_PRIME",
      debug: config.debug !== undefined ? config.debug : true,
      strictMode: true,
      keyRotationLimit: config.keyRotationLimit || 10000,
      maxNonceCache: config.maxNonceCache || 50000
    };
    
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
    
    this.log("NovaGate Quantum Gateway initialized", "info");
  }

  log(msg, type = "info") {
    if (!this.#config.debug) return;
    const colors = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", success: "\x1b[32m" };
    const reset = "\x1b[0m";
    const time = new Date().toLocaleTimeString();
    console.log(`${colors[type] || reset}[NovaGate v${this.#version}] [${time}] ${msg}${reset}`);
  }

  async bootSequence(masterPassword = null, saltHex = null) {
    try {
      if (masterPassword) {
        const salt = saltHex ? Buffer.from(saltHex, 'hex') : await randomBytesAsync(16);
        this.#masterSalt = salt.toString('hex');
        this.#sessionKey = await scryptAsync(masterPassword, salt, 32, {
          N: 131072,
          r: 8,
          p: 1,
          maxmem: 128 * 1024 * 1024
        });
        this.log("Master key derived via Scrypt", "success");
        return { status: true, salt: this.#masterSalt };
      } else {
        this.#sessionKey = await randomBytesAsync(32);
        this.log("Dynamic AES-256-GCM session key generated", "success");
        return { status: true, salt: null };
      }
    } catch (error) {
      this.log("Boot sequence failed: " + error.message, "error");
      throw new Error("System initialization failed");
    }
  }

  async #rotateKey() {
    this.log("Key rotation triggered", "warn");
    this.#sessionKey = await randomBytesAsync(32);
    this.#encryptionCount = 0;
    this.log("New session key generated (PFS)", "success");
  }

  async encryptData(payload, tenantId = 'default', ttlMs = null) {
    if (!this.#sessionKey) throw new Error("System not booted");
    
    this.#encryptionCount++;
    if (this.#encryptionCount > this.#config.keyRotationLimit) {
      await this.#rotateKey();
    }

    const tenantKeys = await this.#tenantKeyManager.getOrCreateKeys(tenantId);
    if (this.#tenantKeyManager.incrementAndCheckRotation(tenantId)) {
      await this.#tenantKeyManager.rotateAesKey(tenantId);
      this.log(`Tenant ${tenantId} AES key rotated`, "warn");
    }

    const iv = await randomBytesAsync(12);
    const nonce = await randomBytesAsync(16);
    const timestamp = Date.now();
    
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const compressedPayload = await brotliCompressAsync(Buffer.from(payloadString, 'utf8'));
    
    const bundle = {
      data: compressedPayload.toString('base64'),
      timestamp,
      nonce: nonce.toString('hex'),
      tenantId
    };
    if (ttlMs && typeof ttlMs === 'number' && ttlMs > 0) {
      bundle.ttl_ms = ttlMs;
    }
    
    const secureBundle = JSON.stringify(bundle);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.#sessionKey, iv);
    let encryptedContent = cipher.update(secureBundle, 'utf8', 'base64');
    encryptedContent += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return {
      cipher: encryptedContent,
      vector: iv.toString('base64'),
      tag: authTag,
      v: this.#version
    };
  }

  async decryptData(securePackage) {
    if (!this.#sessionKey) throw new Error("System not booted");
    if (securePackage.v !== this.#version) {
      this.log("Version mismatch", "warn");
      return null;
    }

    try {
      const iv = Buffer.from(securePackage.vector, 'base64');
      const authTag = Buffer.from(securePackage.tag, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.#sessionKey, iv);
      decipher.setAuthTag(authTag);

      let decryptedContent = decipher.update(securePackage.cipher, 'base64', 'utf8');
      decipher.final();
      
      const decoded = JSON.parse(decryptedContent);
      const now = Date.now();

      if (decoded.ttl_ms && (now - decoded.timestamp > decoded.ttl_ms)) {
        this.log("Package TTL expired", "error");
        return null;
      }

      if (!decoded.ttl_ms && (now - decoded.timestamp > 300000)) {
        this.log("Default TTL expired", "error");
        return null;
      }

      if (this.#usedNonces.has(decoded.nonce)) {
        this.log("Replay attack detected", "error");
        return null;
      }
      
      if (this.#usedNonces.size >= this.#config.maxNonceCache) {
        const oldestKey = this.#usedNonces.keys().next().value;
        this.#usedNonces.delete(oldestKey);
      }
      this.#usedNonces.set(decoded.nonce, decoded.timestamp);

      const compressedBuffer = Buffer.from(decoded.data, 'base64');
      const decompressedBuffer = await brotliDecompressAsync(compressedBuffer);
      const decompressedString = decompressedBuffer.toString('utf8');

      try {
        return JSON.parse(decompressedString);
      } catch {
        return decompressedString;
      }
    } catch (error) {
      this.log(`Decryption failed: ${error.message}`, "error");
      return null;
    }
  }

  destroy() {
    if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
    this.#sessionKey = null;
    this.#usedNonces.clear();
    this.log("System securely terminated", "info");
  }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const gateway = new NovaGateQuantum({ debug: true });

(async () => {
  await gateway.bootSequence("SuperGizliSifre_2026");
  console.log("Gateway booted successfully");

  app.post('/api/v1/vault/encrypt', async (req, res) => {
    try {
      const { payload, ttl_ms } = req.body;
      const tenantId = req.headers['x-app-id'] || 'default';
      if (!payload) return res.status(400).json({ error: 'Payload required' });
      const encrypted = await gateway.encryptData(payload, tenantId, ttl_ms);
      res.json({ success: true, data: encrypted });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/vault/decrypt', async (req, res) => {
    try {
      const { securePackage } = req.body;
      if (!securePackage) return res.status(400).json({ error: 'securePackage required' });
      const result = await gateway.decryptData(securePackage);
      if (result === null) return res.status(400).json({ error: 'Decryption failed or TTL expired' });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/share/create', async (req, res) => {
    try {
      const { payload, ttl_ms } = req.body;
      const tenantId = req.headers['x-app-id'] || 'default';
      if (!payload || !ttl_ms) return res.status(400).json({ error: 'payload and ttl_ms required' });
      const encrypted = await gateway.encryptData(payload, tenantId, ttl_ms);
      res.json({ success: true, data: encrypted, ttl_ms });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`NovaGate API Gateway running on port ${PORT}`);
    console.log('Endpoints:');
    console.log('  POST /api/v1/vault/encrypt');
    console.log('  POST /api/v1/vault/decrypt');
    console.log('  POST /api/v1/share/create');
  });
})();

if (require.main === module) {
  (async () => {
    const testPayload = { mission: "Artemis", status: "Active", level: "Top Secret" };
    const tenant = "test-tenant";
    
    const encrypted = await gateway.encryptData(testPayload, tenant, 10000);
    console.log("\nEncrypted package:", encrypted);
    
    const decrypted = await gateway.decryptData(encrypted);
    console.log("\nDecrypted data:", decrypted);
  })();
}
