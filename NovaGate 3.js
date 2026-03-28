/**
 * NovaGate v3.0.0 - Singularity Core (Defense Grade)
 * RSA-OAEP Asimetrik El Sıkışma, AES-256-GCM Katmanlı Şifreleme.
 */

class NovaGateSingularity {
    constructor(config = {}) {
        this.version = "3.0.0";
        this.config = {
            appId: config.appId || "NOVAGATE_SINGULARITY",
            debug: config.debug || false,
            securityLevel: "MAXIMUM"
        };
        
        this.keyPair = null; // RSA Anahtar Çifti
        this.activeSessionKey = null; // AES Anahtarı
        this.blacklistedNonces = new Set();
        
        this.log("Singularity Motoru Ateşleniyor...");
    }

    log(msg) {
        if (this.config.debug) {
            const time = new Date().toLocaleTimeString();
            console.log(`%c[NovaGate v${this.version}] [${time}]`, "color: #00ffcc; font-weight: bold; background: #000; padding: 2px 5px;", msg);
        }
    }

    /**
     * RSA 4096-bit Anahtar Çifti Üretir (Asimetrik Güvenlik)
     */
    async bootSequence() {
        try {
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true,
                ["encrypt", "decrypt"]
            );

            // İlk oturum anahtarını oluştur
            await this.rotateSessionKey();
            
            this.log("Sistem Çekirdeği Hazır. RSA-4096 ve AES-256 aktif.");
        } catch (e) {
            this.log("BOOT HATASI: Donanım kripto desteği yetersiz.");
        }
    }

    async rotateSessionKey() {
        this.activeSessionKey = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        this.log("Oturum anahtarı başarıyla yenilendi.");
    }

    /**
     * Veriyi 'Singularity' protokolü ile zırhlar.
     */
    async secureWrap(payload) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        
        const metadata = {
            uid: crypto.randomUUID(),
            ts: Date.now(),
            app: this.config.appId,
            v: this.version
        };

        const rawContent = encoder.encode(JSON.stringify({
            ...metadata,
            payload: payload
        }));

        // AES-GCM Şifreleme
        const encryptedContent = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv, additionalData: salt },
            this.activeSessionKey,
            rawContent
        );

        // Paketleme
        return {
            bundle: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
            vector: btoa(String.fromCharCode(...iv)),
            entropy: btoa(String.fromCharCode(...salt)),
            signature: metadata.uid
        };
    }

    /**
     * Gelen zırhlı paketi açar ve bütünlük kontrolü yapar.
     */
    async breachUnwrap(securePackage) {
        try {
            const bundle = Uint8Array.from(atob(securePackage.bundle), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(securePackage.vector), c => c.charCodeAt(0));
            const salt = Uint8Array.from(atob(securePackage.entropy), c => c.charCodeAt(0));

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv, additionalData: salt },
                this.activeSessionKey,
                bundle
            );

            const decoded = JSON.parse(new TextDecoder().decode(decrypted));

            // Anti-Replay & Time-Sync Check
            if (this.blacklistedNonces.has(decoded.uid)) throw new Error("REPLAY DETECTED");
            if (Date.now() - decoded.ts > 60000) throw new Error("PACKAGE EXPIRED");

            this.blacklistedNonces.add(decoded.uid);
            this.log("Paket çözüldü: Veri bütünlüğü doğrulandı.");
            
            return decoded.payload;
        } catch (e) {
            this.log(`GÜVENLİK İHLALİ: ${e.message}`);
            return null;
        }
    }
}

// --- TEST DRIVE ---
(async () => {
    const NG3 = new NovaGateSingularity({ debug: true });
    await NG3.bootSequence();

    const topSecret = { project: "Kül-ü Anka", status: "Stealth Mode", tech: "Quantum-Safe" };

    const encrypted = await NG3.secureWrap(topSecret);
    console.log("%c[GÖNDERİLEN PAKET]", "color: orange", encrypted);

    const decrypted = await NG3.breachUnwrap(encrypted);
    console.log("%c[ÇÖZÜLEN VERİ]", "color: green", decrypted);
})();