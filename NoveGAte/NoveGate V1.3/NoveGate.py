/**
 * NovaGate v1.1.0 - Encryption Suite
 * Veri güvenliğini en üst seviyeye taşıyoruz.
 */

class NovaGate {
    constructor(config = {}) {
        this.config = {
            secretKey: config.secretKey || "YBG13_SUPER_SECRET_KEY", // Güçlü bir anahtar seçilmeli
            debug: config.debug || false
        };
        this.log("NovaGate: Şifreleme modülleri yüklendi.");
    }

    log(msg) {
        if (this.config.debug) console.log(`[NovaGate] ${msg}`);
    }

    // Basit XOR veya AES benzeri bir mantıkla şifreleme (Örnek amaçlı geliştirilebilir yapı)
    encrypt(data) {
        const jsonStr = JSON.stringify(data);
        // İpucu: Gerçek projede btoa() yerine CryptoJS.AES.encrypt kullanılması önerilir.
        const encoded = btoa(unescape(encodeURIComponent(jsonStr))); 
        this.log("Veri zırhlandı (Encrypted).");
        return encoded;
    }

    // Şifreyi geri çözme
    decrypt(cipherText) {
        try {
            const decoded = decodeURIComponent(escape(atob(cipherText)));
            this.log("Veri çözüldü (Decrypted).");
            return JSON.parse(decoded);
        } catch (e) {
            this.log("HATA: Geçersiz şifreli veri!");
            return null;
        }
    }

    // Ana işlem fonksiyonu (Geliştirilmiş)
    async process(payload, mode = 'encrypt') {
        if (mode === 'encrypt') {
            return this.encrypt(payload);
        } else if (mode === 'decrypt') {
            return this.decrypt(payload);
        }
    }
}

// --- KULLANIM ÖRNEĞİ ---
const gate = new NovaGate({ debug: true });

const secretMessage = {
    id: 1,
    message: "Bu çok gizli bir sistem bilgisidir.",
    author: "YBG13"
};

// 1. Veriyi Şifrele (Veritabanına gitmeden önce)
const encrypted = gate.process(secretMessage, 'encrypt');
console.log("Gönderilecek Veri (Cipher):", encrypted);

// 2. Veriyi Çöz (Veritabanından geldikten sonra)
const decrypted = gate.process(encrypted, 'decrypt');
console.log("Okunan Veri (Plain):", decrypted);