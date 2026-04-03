/**
 * YBG13™ NovaGate v4.0.0 - Quantum Vanguard
 * Advanced Cryptographic Middleware (Defense Grade)
 * Core Tech: AES-256-GCM / PBKDF2 Key Derivation / Anti-Replay Nonce
 */

export class NovaGateQuantum {
    constructor(config = {}) {
        this.version = "4.0.0";
        this.config = {
            appId: config.appId || "YBG13_NOVAGATE_V4",
            debug: config.debug !== undefined ? config.debug : true,
            strictMode: true
        };
        
        this.sessionKey = null;
        this.usedNonces = new Set(); // Tekrar oynatma saldırılarını önlemek için hafıza
        
        this.log("Quantum Vanguard Motoru Ateşleniyor...", "info");
    }

    /**
     * Gelişmiş Konsol Raporlaması
     */
    log(msg, type = "info") {
        if (!this.config.debug) return;
        const colors = { info: "#00ffcc", warn: "#f1c40f", error: "#e74c3c", success: "#2ecc71" };
        const time = new Date().toLocaleTimeString();
        console.log(`%c[NovaGate v${this.version}] [${time}]`, `color: ${colors[type]}; font-weight: bold; background: #0b0f19; padding: 3px 8px; border-radius: 4px; border-left: 3px solid ${colors[type]};`, msg);
    }

    /**
     * PBKDF2 ile Şifreden Türetilmiş veya Rastgele Kuantum-Dirençli Anahtar Üretimi
     */
    async bootSequence(masterPassword = null) {
        try {
            if (masterPassword) {
                // Özel bir şifre verilirse, PBKDF2 ile onu 256-bitlik kırılmaz bir anahtara dönüştür
                const enc = new TextEncoder();
                const keyMaterial = await window.crypto.subtle.importKey(
                    "raw", enc.encode(masterPassword), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
                );
                
                this.sessionKey = await window.crypto.subtle.deriveKey(
                    { name: "PBKDF2", salt: enc.encode(this.config.appId), iterations: 250000, hash: "SHA-256" },
                    keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
                );
                this.log("PBKDF2 Master Anahtarı Başarıyla Türetildi.", "success");
            } else {
                // Şifre verilmezse, anlık ve eşsiz bir Session (Oturum) anahtarı üret
                this.sessionKey = await window.crypto.subtle.generateKey(
                    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
                );
                this.log("Dinamik AES-256-GCM Oturum Anahtarı Üretildi.", "success");
            }
            return true;
        } catch (error) {
            this.log("BootSequence Çöktü: " + error.message, "error");
            return false;
        }
    }

    /**
     * Veriyi Askeri Standartta Şifreleme (Payload + Timestamp + Nonce)
     */
    async encryptData(payload) {
        if (!this.sessionKey) throw new Error("KRİTİK HATA: Anahtar bulunamadı. Önce bootSequence() çalıştırın.");
        
        // Dinamik Vektör (IV) ve Anti-Replay Kimliği oluştur
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const nonce = window.crypto.getRandomValues(new Uint8Array(16)); 
        const timestamp = Date.now();
        
        // Veriyi metadata ile sarıyoruz
        const secureBundle = JSON.stringify({ payload, timestamp, nonce: Array.from(nonce) });
        const encodedData = new TextEncoder().encode(secureBundle);

        // AES-256-GCM ile Şifreleme (Aynı zamanda verinin değiştirilip değiştirilmediğini de doğrular)
        const encryptedContent = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            this.sessionKey,
            encodedData
        );

        this.log("Veri Kuantum Zırhı ile Kaplandı.", "info");

        // Sunucuya veya LocalStorage'a gönderime hazır Base64 paketi
        return {
            cipher: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
            vector: btoa(String.fromCharCode(...iv)),
            v: this.version
        };
    }

    /**
     * Şifreli Paketi Açma, Doğrulama ve Tehdit Analizi
     */
    async decryptData(securePackage) {
        if (!this.sessionKey) throw new Error("KRİTİK HATA: Anahtar bulunamadı.");
        if (securePackage.v !== this.version) this.log("Sürüm uyuşmazlığı tespiti! Paket eski bir motordan geliyor olabilir.", "warn");

        try {
            const encryptedData = Uint8Array.from(atob(securePackage.cipher), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(securePackage.vector), c => c.charCodeAt(0));

            // Şifreyi Çöz
            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                this.sessionKey,
                encryptedData
            );

            const decoded = JSON.parse(new TextDecoder().decode(decryptedContent));

            // 1. GÜVENLİK KONTROLÜ: Zaman Aşımı (Paket 5 dakikadan eskiyse reddet)
            if (Date.now() - decoded.timestamp > 300000) {
                throw new Error("ZAMAN_AŞIMI: Paket süresi doldu. Muhtemel ağ geciktirme saldırısı.");
            }

            // 2. GÜVENLİK KONTROLÜ: Anti-Replay (Paket daha önce kullanıldı mı?)
            const nonceStr = decoded.nonce.join('-');
            if (this.usedNonces.has(nonceStr)) {
                throw new Error("REPLAY_SALDIRISI: Bu veri paketi kopyalanmış ve tekrar gönderilmiş!");
            }
            
            // Nonce'u kara listeye al
            this.usedNonces.add(nonceStr);
            
            // Hafızayı şişirmemek için 1000 paketten sonra eski nonceları temizle
            if(this.usedNonces.size > 1000) this.usedNonces.clear();

            this.log("Paket başarıyla çözüldü ve bütünlüğü doğrulandı.", "success");
            return decoded.payload;

        } catch (error) {
            this.log(`Güvenlik İhlali Tespit Edildi: ${error.message}`, "error");
            return null;
        }
    }
}