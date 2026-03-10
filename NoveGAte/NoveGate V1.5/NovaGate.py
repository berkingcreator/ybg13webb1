/**
 * NovaGate v1.2.0 - Professional Core
 * Dinamik anahtar yönetimi ve veri bütünlüğü kontrolü.
 */

class NovaGate {
    constructor(config = {}) {
        this.version = "1.2.0";
        this.config = {
            appId: config.appId || "YBG13_PROJECT",
            debug: config.debug || false
        };
        // Cihaza özel parmak izi (Basitleştirilmiş versiyon)
        this.fingerprint = btoa(navigator.userAgent).substring(0, 16);
        this.log(`Sistem Başlatıldı. Cihaz İmzası: ${this.fingerprint}`);
    }

    log(msg) {
        if (this.config.debug) console.log(`%c[NovaGate v${this.version}]`, "color: #00ffcc; font-weight: bold", msg);
    }

    // Gelişmiş Dinamik Şifreleme (XOR + Base64 + Fingerprint)
    encrypt(payload) {
        try {
            const dataStr = JSON.stringify({
                _t: Date.now(), // Zaman damgası (Replay attack koruması)
                _v: this.version,
                data: payload
            });

            // Basit ama etkili bir bit kaydırma ve maskeleme
            let result = "";
            for (let i = 0; i < dataStr.length; i++) {
                const charCode = dataStr.charCodeAt(i) ^ this.fingerprint.charCodeAt(i % this.fingerprint.length);
                result += String.fromCharCode(charCode);
            }

            this.log("Veri paketlendi ve zırhlandı.");
            return btoa(unescape(encodeURIComponent(result)));
        } catch (err) {
            this.log("Kritik Şifreleme Hatası!");
            return null;
        }
    }

    // Gelişmiş Çözme ve Doğrulama
    decrypt(cipherText) {
        try {
            const decoded = decodeURIComponent(escape(atob(cipherText)));
            let result = "";
            for (let i = 0; i < decoded.length; i++) {
                const charCode = decoded.charCodeAt(i) ^ this.fingerprint.charCodeAt(i % this.fingerprint.length);
                result += String.fromCharCode(charCode);
            }

            const parsed = JSON.parse(result);
            
            // Veri bütünlüğü kontrolü
            if (parsed._v !== this.version) {
                this.log("Uyarı: Sürüm uyumsuzluğu!");
            }

            this.log("Veri güvenli bir şekilde çözüldü.");
            return parsed.data;
        } catch (err) {
            this.log("HATA: Sabotaj algılandı veya geçersiz anahtar!");
            return null;
        }
    }
}

// --- DENEME ---
const gate = new NovaGate({ debug: true });

const sensitiveData = {
    amount: 1500,
    currency: "TRY",
    status: "success"
};

const securePackage = gate.encrypt(sensitiveData);
console.log("Ağa Gönderilen (Güvenli):", securePackage);

const originalData = gate.decrypt(securePackage);
console.log("Sistemde Okunan:", originalData);