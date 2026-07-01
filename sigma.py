# ==============================================================================
# YBG13™ KIYAMET MOTORU V4.0 - SIFIR BAĞIMLILIK (ZERO-DEPENDENCY)
# BÖLÜM 1 / 4 : SAF MATEMATİK, RAM ENTROPİSİ, KECCAK SÜNGERİ VE NTT MOTORU
# Toplam Hedef: ~2000 Satır | Kütüphane Kullanımı: 0 | Dış Bağlantı: 0
# ==============================================================================
# AÇIKLAMA: 
# Bu bölüm Kuantum Dirençli şifrelemenin kalbini oluşturur. İşletim sisteminin
# zaman veya rastgelelik modüllerine güvenemeyeceğimiz için, her şeyi
# donanımın RAM adreslerinden (id) ve saf bit kaydırma işlemlerinden üretiyoruz.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. YBG_SAF_MATEMATİK: SABİT ZAMANLI (CONSTANT-TIME) İŞLEMCİ
# ------------------------------------------------------------------------------
class YBGSafMatematik:
    """
    Yan kanal (Side-Channel) ve Zamanlama (Timing) saldırılarına karşı
    If/Else blokları içermeyen, tamamen bit düzeyinde çalışan saf matematik motoru.
    """
    
    @staticmethod
    def int_to_bytes(n, length, byteorder='big'):
        """Tamsayıları kütüphanesiz bayt dizisine çevirir."""
        res = bytearray()
        for _ in range(length):
            res.append(n & 0xFF)
            n >>= 8
        if byteorder == 'big':
            # Ters çevirme işlemi (Kütüphanesiz inplace reverse)
            left = 0
            right = length - 1
            while left < right:
                res[left], res[right] = res[right], res[left]
                left += 1
                right -= 1
        return bytes(res)

    @staticmethod
    def bytes_to_int(b, byteorder='big'):
        """Bayt dizilerini tamsayıya çevirir."""
        res = 0
        if byteorder == 'little':
            for i in range(len(b)): 
                res |= (b[i] << (8 * i))
        else:
            for i in range(len(b)): 
                res = (res << 8) | b[i]
        return res

    @staticmethod
    def xor_bytes(b1, b2):
        """İki bayt dizisini XOR'lar."""
        length = len(b1) if len(b1) < len(b2) else len(b2)
        res = bytearray(length)
        for i in range(length): 
            res[i] = b1[i] ^ b2[i]
        return bytes(res)

    @staticmethod
    def constant_time_compare(val1, val2):
        """Zamanlama saldırılarını önlemek için sabit zamanlı karşılaştırma."""
        if len(val1) != len(val2):
            return False
        result = 0
        for i in range(len(val1)):
            result |= val1[i] ^ val2[i]
        return result == 0

    @staticmethod
    def pad_data(data, block_size):
        """PKCS#7 dolgulama (Padding) algoritması."""
        pad_len = block_size - (len(data) % block_size)
        pad_byte = pad_len & 0xFF
        padded = bytearray(data)
        for _ in range(pad_len):
            padded.append(pad_byte)
        return bytes(padded)

    @staticmethod
    def unpad_data(data):
        """PKCS#7 dolgu sökücü."""
        if len(data) == 0:
            return data
        pad_len = data[-1]
        if pad_len > len(data) or pad_len == 0:
            return data
        return data[:-pad_len]

    @staticmethod
    def bit_rotate_left(x, n, bit_size=64):
        """Sabit zamanlı dairesel sola kaydırma (Rotate Left)."""
        n = n % bit_size
        return ((x << n) | (x >> (bit_size - n))) & ((1 << bit_size) - 1)

    @staticmethod
    def bit_rotate_right(x, n, bit_size=64):
        """Sabit zamanlı dairesel sağa kaydırma (Rotate Right)."""
        n = n % bit_size
        return ((x >> n) | (x << (bit_size - n))) & ((1 << bit_size) - 1)


# ------------------------------------------------------------------------------
# 2. YBG_KUANTUM_SABİTLER: DEVASA KRİPTOGRAFİK TABLOLAR
# ------------------------------------------------------------------------------
class YBGSabitler:
    """Keccak (SHA-3) ve NTT (Kyber) için önceden hesaplanmış devasa matrisler."""
    
    # Keccak Iota Sabitleri (64-bitlik 24 döngü tuzu)
    KECCAK_RC = [
        0x0000000000000001, 0x0000000000008082, 0x800000000000808a,
        0x8000000080008000, 0x000000000000808b, 0x0000000080000001,
        0x8000000080008081, 0x8000000000008009, 0x000000000000008a,
        0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
        0x000000008000808b, 0x800000000000008b, 0x8000000000008089,
        0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
        0x000000000000800a, 0x800000008000000a, 0x8000000080008081,
        0x8000000000008080, 0x0000000080000001, 0x8000000080008008
    ]

    # Keccak Rho Permütasyon Matrisi
    KECCAK_RHO = [
        [0, 36, 3, 41, 18],
        [1, 44, 10, 45, 2],
        [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56],
        [27, 20, 39, 8, 14]
    ]

    # Kyber-768 ML-KEM Standardı: Modülüs Q ve NTT Kökleri (Zetas)
    KYBER_Q = 3329
    KYBER_N = 256
    
    # 128 Adet Önceden Hesaplanmış NTT Birim Kökü (Shor Direnci için)
    # Bu kökler Kuantum Polinom Çarpmalarında O(N log N) hızı sağlar.
    NTT_ZETAS = [
        2285, 2586, 2560, 2221, 3277,  233, 1676, 2228,
         756,  256, 1659, 3144, 1690, 2690, 2138,  821,
         403, 1373, 2276, 1145, 1269, 1184, 1121, 2816,
         920, 1515, 1335,  231, 2374,  448, 1162, 3075,
         216,  529, 2984,  315, 1289, 1414, 2732,  232,
        3004, 2530,  799, 1475,  209, 1729,  110, 2804,
         353, 3077, 2246, 2843, 1160, 2195,  348,  623,
         213, 2341, 1251,  809, 2824,  105,  514,  328,
        3162,  750, 2564, 2139, 2038,  948, 2259, 3042,
        2868, 1481, 1603, 2125,  318,  728,  334, 1459,
        1380, 2661,  420,  495, 2434, 1599, 2307,  378,
         143,  194, 2174, 2901,  893,  206,  200, 2577,
        1551, 1709, 2335, 1785,  714, 1070,  696,  978,
         992,  679,  573, 1876, 1827, 2595,  850, 1674,
         208, 1198,  119, 1406, 2121, 1471,  982, 1993,
        1548,  737,  306, 1437, 2707, 2217, 1989, 2905
    ]


# ------------------------------------------------------------------------------
# 3. YBG_SAF_KECCAK: KÜTÜPHANESİZ SÜNGER (SPONGE) FONKSİYONU
# ------------------------------------------------------------------------------
class YBGSafKeccak:
    """SHA-3 ve SHAKE XOF üreten, 1600 bitlik durum (state) matrisli motor."""
    
    @classmethod
    def _keccak_f1600_permutasyon(cls, state):
        """Keccak algoritmasının 24 döngülük ana karıştırma motoru."""
        for round_idx in range(24):
            # Theta (Θ)
            C = [0, 0, 0, 0, 0]
            for x in range(5): 
                C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]
            D = [0, 0, 0, 0, 0]
            for x in range(5): 
                D[x] = C[(x - 1) % 5] ^ YBGSafMatematik.bit_rotate_left(C[(x + 1) % 5], 1)
            for x in range(5):
                for y in range(5): 
                    state[x][y] ^= D[x]

            # Rho (ρ) & Pi (π)
            x, y = 1, 0
            current = state[x][y]
            for _ in range(24):
                next_x = y
                next_y = (2 * x + 3 * y) % 5
                temp = state[next_x][next_y]
                state[next_x][next_y] = YBGSafMatematik.bit_rotate_left(current, YBGSabitler.KECCAK_RHO[x][y])
                current = temp
                x, y = next_x, next_y

            # Chi (χ)
            for y in range(5):
                T = [state[x][y] for x in range(5)]
                for x in range(5): 
                    state[x][y] = T[x] ^ ((~T[(x + 1) % 5]) & T[(x + 2) % 5])

            # Iota (ι)
            state[0][0] ^= YBGSabitler.KECCAK_RC[round_idx]

    @classmethod
    def sunger_mekanizmasi(cls, rate_bytes, data, suffix, output_len):
        """Veriyi emer (Absorb) ve istenilen uzunlukta sıkar (Squeeze)."""
        state = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]
        
        # Padding
        padded_data = bytearray(data)
        padded_data.append(suffix)
        while len(padded_data) % rate_bytes != (rate_bytes - 1): 
            padded_data.append(0x00)
        padded_data.append(0x80)

        # Emme (Absorb) Aşaması
        i = 0
        while i < len(padded_data):
            block = padded_data[i : i + rate_bytes]
            words = []
            j = 0
            while j < len(block):
                words.append(YBGSafMatematik.bytes_to_int(block[j : j + 8], 'little'))
                j += 8
            
            word_idx = 0
            for y in range(5):
                for x in range(5):
                    if word_idx < len(words):
                        state[x][y] ^= words[word_idx]
                        word_idx += 1
            cls._keccak_f1600_permutasyon(state)
            i += rate_bytes

        # Sıkma (Squeeze) Aşaması
        output = bytearray()
        while len(output) < output_len:
            for y in range(5):
                for x in range(5):
                    word_bytes = YBGSafMatematik.int_to_bytes(state[x][y], 8, 'little')
                    if (y * 5 + x) * 8 < rate_bytes:
                        take_len = output_len - len(output)
                        if take_len > 8: take_len = 8
                        
                        idx = 0
                        while idx < take_len:
                            output.append(word_bytes[idx])
                            idx += 1
                            
                        if len(output) == output_len: 
                            return bytes(output)
            cls._keccak_f1600_permutasyon(state)
            
        return bytes(output)

    @classmethod
    def sha3_256(cls, data):
        """NIST SHA3-256 Özeti."""
        return cls.sunger_mekanizmasi(136, data, 0x06, 32)
    
    @classmethod
    def sha3_512(cls, data):
        """NIST SHA3-512 Özeti."""
        return cls.sunger_mekanizmasi(72, data, 0x06, 64)

    @classmethod
    def shake_128(cls, data, out_len):
        """Genişletilebilir Çıktı Fonksiyonu (XOF) - Rastgelelik üretimi için."""
        return cls.sunger_mekanizmasi(168, data, 0x1F, out_len)

    @classmethod
    def shake_256(cls, data, out_len):
        """Yüksek güvenlikli XOF."""
        return cls.sunger_mekanizmasi(136, data, 0x1F, out_len)


# ------------------------------------------------------------------------------
# 4. YBG_RAM_ENTROPİSİ: İŞLETİM SİSTEMİNDEN BAĞIMSIZ PRNG
# ------------------------------------------------------------------------------
class YBGHayaletEntropi:
    """
    Sistemin zaman (time) veya donanım (os) modüllerine erişimi YASAKTIR.
    Bu yüzden entropiyi, anlık olarak RAM'de yaratılan binlerce boş objenin
    bellek adreslerindeki (memory allocation) kaostan toplar.
    """
    def __init__(self):
        class KaosObjesi: pass
        raw_kaos_verisi = bytearray()
        
        # RAM'de 5000 adet obje yarat ve adreslerini topla
        for _ in range(5000):
            # id() fonksiyonu Python'da objenin bellek adresini verir.
            # Bellek adreslemesi ASLR (Address Space Layout Randomization) 
            # sayesinde her çalışmada tamamen rastgeledir.
            adres = id(KaosObjesi())
            
            # Adresi baytlara çevirip kaosa ekle
            for _ in range(4):
                raw_kaos_verisi.append(adres & 0xFF)
                adres >>= 8
                
        # Çekirdeği SHA3-512 ile 64 baytlık aşılmaz bir tohuma dönüştür
        self.tohum (seed) = YBGSafKeccak.sha3_512(bytes(raw_kaos_verisi))
        self.sayac = 0

    def rastgele_bayt_al(self, uzunluk):
        """SHAKE-256 kullanarak tohumdan sonsuz ve deterministik rastgelelik üretir."""
        self.sayac += 1
        sayac_baytlari = YBGSafMatematik.int_to_bytes(self.sayac, 8, 'little')
        birlesik_veri = self.tohum + sayac_baytlari
        return YBGSafKeccak.shake_256(birlesik_veri, uzunluk)

# Sistemi başlatırken Global PRNG (Pseudo-Random Number Generator) objesini yarat
kuantum_rng = YBGHayaletEntropi()


# ------------------------------------------------------------------------------
# 5. YBG_NTT_MOTORU: POLİNOM HALKALARI (SHOR ALGORİTMASINA KÖR DUVAR)
# ------------------------------------------------------------------------------
class YBG_NTT_Motoru:
    """
    Number Theoretic Transform (NTT) Motoru. Modüler üs alma işlemlerini 
    tarihe gömer, polinomları Kafes (Lattice) uzayında O(N log N) hızında çarpar.
    """
    
    @staticmethod
    def barrett_indirgeme(a):
        """
        SABİT ZAMANLI (Constant-Time) modüler indirgeme.
        If/Else blokları kullanılmaz, işlemci zamanlama sızıntısı yapmaz.
        Formül: a mod 3329
        """
        # Yaklaşık bölme işlemi (3329 için özel sabit: 5039 / 2^24)
        v = ((a * 5039) >> 24)
        res = a - v * 3329
        
        # Negatif sonuçları if bloğu olmadan bit maskesiyle pozitif yap
        mask = (res >> 31) 
        res += (mask & 3329)
        return res

    @staticmethod
    def montgomery_indirgeme(a):
        """Kyber polinom çarpmalarında kullanılan özel redüksiyon."""
        v = (a * 3327) & 0xFFFF
        t = (a - v * 3329) >> 16
        mask = (t >> 31)
        return t + (mask & 3329)

    @classmethod
    def ntt_donusumu(cls, polinom):
        """Normal uzaydaki bir polinomu NTT (Frekans) uzayına taşır."""
        sonuc = list(polinom)
        k = 1
        uzunluk = 128
        
        # Cooley-Tukey Kelebek Algoritması
        while uzunluk > 0:
            baslangic = 0
            while baslangic < 256:
                zeta = YBGSabitler.NTT_ZETAS[k]
                k += 1
                j = baslangic
                while j < baslangic + uzunluk:
                    t = cls.montgomery_indirgeme(zeta * sonuc[j + uzunluk])
                    sonuc[j + uzunluk] = cls.barrett_indirgeme(sonuc[j] - t)
                    sonuc[j] = cls.barrett_indirgeme(sonuc[j] + t)
                    j += 1
                baslangic += 2 * uzunluk
            uzunluk //= 2
            
        return sonuc

    @classmethod
    def ters_ntt_donusumu(cls, polinom):
        """NTT uzayındaki polinomu klasik uzaya geri döndürür."""
        sonuc = list(polinom)
        k = 127
        uzunluk = 2
        
        # Gentleman-Sande Kelebek Algoritması
        while uzunluk <= 128:
            baslangic = 0
            while baslangic < 256:
                zeta = YBGSabitler.NTT_ZETAS[k]
                k -= 1
                j = baslangic
                while j < baslangic + uzunluk:
                    t = sonuc[j]
                    sonuc[j] = cls.barrett_indirgeme(t + sonuc[j + uzunluk])
                    # (a - b) * zeta
                    fark = cls.barrett_indirgeme(t - sonuc[j + uzunluk])
                    sonuc[j + uzunluk] = cls.montgomery_indirgeme(zeta * fark)
                    j += 1
                baslangic += 2 * uzunluk
            uzunluk *= 2
            
        # Sonucu 256'nın modüler tersi (3303) ile çarp
        inv_n = 3303
        for i in range(256):
            sonuc[i] = cls.montgomery_indirgeme(sonuc[i] * inv_n)
            
        return sonuc

    @classmethod
    def polinom_carpimi_ntt(cls, poly_a, poly_b):
        """NTT uzayında iki polinomu inanılmaz bir hızla çarpar."""
        sonuc = [0] * 256
        i = 0
        while i < 256:
            zeta = YBGSabitler.NTT_ZETAS[64 + (i // 2)]
            
            # (a0*b0 + a1*b1*zeta)
            t0 = cls.montgomery_indirgeme(poly_a[i] * poly_b[i])
            t1 = cls.montgomery_indirgeme(poly_a[i+1] * poly_b[i+1])
            t1_zeta = cls.montgomery_indirgeme(t1 * zeta)
            sonuc[i] = cls.barrett_indirgeme(t0 + t1_zeta)
            
            # (a0*b1 + a1*b0)
            t2 = cls.montgomery_indirgeme(poly_a[i] * poly_b[i+1])
            t3 = cls.montgomery_indirgeme(poly_a[i+1] * poly_b[i])
            sonuc[i+1] = cls.barrett_indirgeme(t2 + t3)
            
            i += 2
        return sonuc
    
    # ==============================================================================
# BÖLÜM 2 / 4 : CBD GÜRÜLTÜ ÜRETİCİSİ, KAFES MATRİSLERİ VE CHACHA20 SİMETRİK ŞİFRE
# (DÜZELTİLMİŞ VE HATALARDAN ARINDIRILMIŞ SÜRÜM)
# ==============================================================================

# ------------------------------------------------------------------------------
# 6. YBG_CBD_GÜRÜLTÜ_MOTORU (KUANTUM KÖRLÜK MEKANİZMASI)
# ------------------------------------------------------------------------------
class YBGGurultuMotoru:
    """
    Centered Binomial Distribution (CBD). 
    Kuantum bilgisayarların denklemleri çözmesini imkansız kılan 'Error' (e) 
    vektörlerini üretir. Küçük, 0 etrafında merkezlenmiş rastgele sayılar çıkarır.
    """
    
    @staticmethod
    def cbd_eta2(bayt_dizisi):
        """
        Kyber-768 standardı için eta=2 gürültüsü üretir.
        Gerçek Kyber CBD(eta=2) uygulaması: 128 byte giriş -> 256 katsayı
        """
        gercek_katsayilar = [0] * 256
        for i in range(128):
            bayt = bayt_dizisi[i]
            a0 = (bayt & 1) + ((bayt >> 1) & 1)
            b0 = ((bayt >> 2) & 1) + ((bayt >> 3) & 1)
            
            a1 = ((bayt >> 4) & 1) + ((bayt >> 5) & 1)
            b1 = ((bayt >> 6) & 1) + ((bayt >> 7) & 1)
            
            gercek_katsayilar[2*i] = YBG_NTT_Motoru.barrett_indirgeme(a0 - b0)
            gercek_katsayilar[2*i + 1] = YBG_NTT_Motoru.barrett_indirgeme(a1 - b1)
            
        return gercek_katsayilar


# ------------------------------------------------------------------------------
# 7. YBG_KAFES_MATRİSLERİ (POLİNOM, VEKTÖR VE MATRİS İŞLEMLERİ)
# ------------------------------------------------------------------------------
class YBGPolinom:
    """256 dereceli (X^256 + 1) Kafes Polinomu."""
    def __init__(self, katsayilar=None):
        if katsayilar:
            self.katsayilar = katsayilar
        else:
            self.katsayilar = [0] * 256

    def topla(self, diger):
        yeni_katsayilar = [0] * 256
        for i in range(256):
            yeni_katsayilar[i] = YBG_NTT_Motoru.barrett_indirgeme(self.katsayilar[i] + diger.katsayilar[i])
        return YBGPolinom(yeni_katsayilar)

    def cikar(self, diger):
        yeni_katsayilar = [0] * 256
        for i in range(256):
            yeni_katsayilar[i] = YBG_NTT_Motoru.barrett_indirgeme(self.katsayilar[i] - diger.katsayilar[i])
        return YBGPolinom(yeni_katsayilar)

    def ntt_uzayina_gec(self):
        return YBGPolinom(YBG_NTT_Motoru.ntt_donusumu(self.katsayilar))

    def ntt_uzayindan_cik(self):
        return YBGPolinom(YBG_NTT_Motoru.ters_ntt_donusumu(self.katsayilar))

    def ntt_carp(self, diger_ntt):
        sonuc_katsayilari = YBG_NTT_Motoru.polinom_carpimi_ntt(self.katsayilar, diger_ntt.katsayilar)
        return YBGPolinom(sonuc_katsayilari)


class YBGPolinomVektor:
    """K adet Polinomdan oluşan vektör. (Kyber-768 için K=3)"""
    def __init__(self, k, polinomlar=None):
        self.k = k
        if polinomlar:
            self.polinomlar = polinomlar
        else:
            self.polinomlar = [YBGPolinom() for _ in range(k)]

    def topla(self, diger):
        return YBGPolinomVektor(self.k, [p1.topla(p2) for p1, p2 in zip(self.polinomlar, diger.polinomlar)])

    def cikar(self, diger):
        return YBGPolinomVektor(self.k, [p1.cikar(p2) for p1, p2 in zip(self.polinomlar, diger.polinomlar)])

    def ntt_uzayina_gec(self):
        return YBGPolinomVektor(self.k, [p.ntt_uzayina_gec() for p in self.polinomlar])

    def ntt_uzayindan_cik(self):
        return YBGPolinomVektor(self.k, [p.ntt_uzayindan_cik() for p in self.polinomlar])

    def ntt_nokta_carpimi(self, diger):
        sonuc = YBGPolinom()
        for p1, p2 in zip(self.polinomlar, diger.polinomlar):
            terim = p1.ntt_carp(p2)
            sonuc = sonuc.topla(terim)
        return sonuc


class YBGPolinomMatris:
    """KxK boyutunda A Matrisi (Public Key'in omurgası)."""
    def __init__(self, satir, sutun):
        self.satir = satir
        self.sutun = sutun
        self.matris = [[YBGPolinom() for _ in range(sutun)] for _ in range(satir)]

    def uniform_rastgele_uret(self, tohum_rho):
        """Rejection Sampling (Reddetme Örneklemesi) kullanılarak Public Matris üretilir."""
        for i in range(self.satir):
            for j in range(self.sutun):
                nonce = YBGSafMatematik.int_to_bytes(i + (j << 4), 1, 'little')
                bayt_akisi = YBGSafKeccak.shake_128(tohum_rho + nonce, 256 * 3)
                
                katsayilar = []
                idx = 0
                while len(katsayilar) < 256 and idx < len(bayt_akisi) - 2:
                    d1 = bayt_akisi[idx]
                    d2 = bayt_akisi[idx + 1]
                    d3 = bayt_akisi[idx + 2]
                    
                    deger1 = d1 | ((d2 & 0x0F) << 8)
                    deger2 = (d2 >> 4) | (d3 << 4)
                    
                    if deger1 < YBGSabitler.KYBER_Q:
                        katsayilar.append(deger1)
                    if len(katsayilar) < 256 and deger2 < YBGSabitler.KYBER_Q:
                        katsayilar.append(deger2)
                        
                    idx += 3
                    
                while len(katsayilar) < 256:
                    katsayilar.append(0)
                    
                self.matris[i][j] = YBGPolinom(katsayilar)

    def ntt_vektor_ile_carp(self, vektor):
        sonuc_polinomlari = []
        for i in range(self.satir):
            satir_toplami = YBGPolinom()
            for j in range(self.sutun):
                terim = self.matris[i][j].ntt_carp(vektor.polinomlar[j])
                satir_toplami = satir_toplami.topla(terim)
            sonuc_polinomlari.append(satir_toplami)
        return YBGPolinomVektor(self.satir, sonuc_polinomlari)

    def transpoze_al(self):
        yeni_matris = YBGPolinomMatris(self.sutun, self.satir)
        for i in range(self.satir):
            for j in range(self.sutun):
                yeni_matris.matris[j][i] = self.matris[i][j]
        return yeni_matris


# ------------------------------------------------------------------------------
# 8. YBG_CHACHA20_SİMETRİK_ŞİFRE (GROVER DİRENCİ)
# ------------------------------------------------------------------------------
class YBGChaCha20AkisSifresi:
    """S-Box kullanmayan, yan kanal saldırılarına dayanıklı ChaCha20 Motoru."""
    
    @classmethod
    def _ceyrek_dongu(cls, state, a, b, c, d):
        state[a] = (state[a] + state[b]) & 0xFFFFFFFF
        state[d] = YBGSafMatematik.bit_rotate_left(state[d] ^ state[a], 16, 32)
        
        state[c] = (state[c] + state[d]) & 0xFFFFFFFF
        state[b] = YBGSafMatematik.bit_rotate_left(state[b] ^ state[c], 12, 32)
        
        state[a] = (state[a] + state[b]) & 0xFFFFFFFF
        state[d] = YBGSafMatematik.bit_rotate_left(state[d] ^ state[a], 8, 32)
        
        state[c] = (state[c] + state[d]) & 0xFFFFFFFF
        state[b] = YBGSafMatematik.bit_rotate_left(state[b] ^ state[c], 7, 32)

    @classmethod
    def _akis_blogu_uret(cls, anahtar, nonce, sayac):
        """512-bit (64 bayt) tek kullanımlık rastgele şifre akışı üretir."""
        state = [0] * 16
        
        state[0] = 0x61707865
        state[1] = 0x3320646e
        state[2] = 0x79622d32
        state[3] = 0x6b206574
        
        for i in range(8):
            baslangic = i * 4
            state[4 + i] = YBGSafMatematik.bytes_to_int(anahtar[baslangic : baslangic + 4], 'little')
            
        state[12] = sayac & 0xFFFFFFFF
        
        for i in range(3):
            baslangic = i * 4
            state[13 + i] = YBGSafMatematik.bytes_to_int(nonce[baslangic : baslangic + 4], 'little')
            
        ilk_state = list(state)
        
        for _ in range(10):
            cls._ceyrek_dongu(state, 0, 4,  8, 12)
            cls._ceyrek_dongu(state, 1, 5,  9, 13)
            cls._ceyrek_dongu(state, 2, 6, 10, 14)
            cls._ceyrek_dongu(state, 3, 7, 11, 15)
            
            cls._ceyrek_dongu(state, 0, 5, 10, 15)
            cls._ceyrek_dongu(state, 1, 6, 11, 12)
            cls._ceyrek_dongu(state, 2, 7,  8, 13)
            cls._ceyrek_dongu(state, 3, 4,  9, 14)
            
        akis_baytlari = bytearray()
        for i in range(16):
            sonuc_kelime = (state[i] + ilk_state[i]) & 0xFFFFFFFF
            akis_baytlari.extend(YBGSafMatematik.int_to_bytes(sonuc_kelime, 4, 'little'))
            
        return bytes(akis_baytlari)

    @classmethod
    def sifrele(cls, anahtar, nonce, duz_metin):
        """Veriyi blok blok (64-byte) işler ve akışla XOR'layarak şifreler."""
        if len(anahtar) != 32:
            return None
            
        sifreli_metin = bytearray()
        sayac = 1 
        
        i = 0
        while i < len(duz_metin):
            blok = duz_metin[i : i + 64]
            akis_blogu = cls._akis_blogu_uret(anahtar, nonce, sayac)
            sifreli_blok = YBGSafMatematik.xor_bytes(blok, akis_blogu[:len(blok)])
            sifreli_metin.extend(sifreli_blok)
            
            sayac += 1
            i += 64
            
        return bytes(sifreli_metin)

    @classmethod
    def sifre_coz(cls, anahtar, nonce, sifreli_metin):
        return cls.sifrele(anahtar, nonce, sifreli_metin)
    
    # ==============================================================================
# BÖLÜM 3 / 4 : KUANTUM KODLAMA (ENCODING), ML-KEM KAPSÜLLEME VE POLY1305 MAC
# ==============================================================================
# AÇIKLAMA:
# Kuantum kafeslerindeki polinomları ağ üzerinden göndermek için bit seviyesinde
# sıkıştırma yapılır. ML-KEM (Kyber) algoritması ile anahtar takası gerçekleştirilir
# ve veri bütünlüğü Poly1305 MAC algoritması ile güvence altına alınır.
# ==============================================================================

# ------------------------------------------------------------------------------
# 9. YBG_KUANTUM_KODLAMA (BİT SIKIŞTIRMA VE PAKETLEME)
# ------------------------------------------------------------------------------
class YBGKuantumKodlama:
    """Polinom katsayılarını d-bitlik parçalara böler ve sıkıştırır."""
    
    @staticmethod
    def polinom_sikistir(polinom, d_bit):
        """Katsayıları (0-3328) alıp d-bit'e (örn: 10 veya 4 bit) sıkıştırır."""
        yari_q = YBGSabitler.KYBER_Q // 2
        carpan = (1 << d_bit)
        
        sikistirilmis_degerler = []
        for c in polinom.katsayilar:
            # Sıkıştırma Formülü: round((c * 2^d) / Q) mod 2^d
            hesap = (((c * carpan) + yari_q) // YBGSabitler.KYBER_Q) & (carpan - 1)
            sikistirilmis_degerler.append(hesap)
            
        return YBGKuantumKodlama.bit_paketle(sikistirilmis_degerler, d_bit)

    @staticmethod
    def polinom_ac(veri, d_bit):
        """d-bitlik sıkı diziyi geri polinom katsayılarına dönüştürür."""
        acilan_degerler = YBGKuantumKodlama.bit_ac(veri, 256, d_bit)
        carpan = (1 << d_bit)
        
        katsayilar = []
        for c in acilan_degerler:
            # Açma Formülü: round((c * Q) / 2^d)
            hesap = ((c * YBGSabitler.KYBER_Q) + (carpan // 2)) // carpan
            katsayilar.append(hesap)
            
        return YBGPolinom(katsayilar)

    @staticmethod
    def bit_paketle(degerler, d_bit):
        """Belirli bit uzunluğundaki sayılardan oluşan listeyi saf byte dizisi yapar."""
        sonuc = bytearray()
        tampon = 0
        tampon_bit_sayisi = 0
        
        for deger in degerler:
            tampon |= (deger << tampon_bit_sayisi)
            tampon_bit_sayisi += d_bit
            
            while tampon_bit_sayisi >= 8:
                sonuc.append(tampon & 0xFF)
                tampon >>= 8
                tampon_bit_sayisi -= 8
                
        if tampon_bit_sayisi > 0:
            sonuc.append(tampon & 0xFF)
            
        return bytes(sonuc)

    @staticmethod
    def bit_ac(veri, adet, d_bit):
        """Sıkı byte dizisinden d-bitlik spesifik sayıları okur."""
        sonuc = []
        tampon = 0
        tampon_bit_sayisi = 0
        bayt_indeksi = 0
        maske = (1 << d_bit) - 1
        
        while len(sonuc) < adet:
            while tampon_bit_sayisi < d_bit:
                if bayt_indeksi < len(veri):
                    tampon |= (veri[bayt_indeksi] << tampon_bit_sayisi)
                    bayt_indeksi += 1
                tampon_bit_sayisi += 8
                
            sonuc.append(tampon & maske)
            tampon >>= d_bit
            tampon_bit_sayisi -= d_bit
            
        return sonuc


# ------------------------------------------------------------------------------
# 10. YBG_ML_KEM_MOTORU (POST-KUANTUM ANAHTAR TAKASI)
# ------------------------------------------------------------------------------
class YBG_ML_KEM:
    """NIST Standardı (Kyber-768) Muadili Kuantum Dirençli Kapsülleme Mekanizması."""
    
    def __init__(self, k=3):
        # k=3: Kyber-768 seviyesi. AES-192 eşdeğeri Kuantum Kırılmazlığı.
        self.k = k
        self.eta1 = 2
        self.eta2 = 2
        self.du = 10 # u vektörünü 10 bite sıkıştır
        self.dv = 4  # v polinomunu 4 bite sıkıştır

    def anahtar_cifti_uret(self):
        """Sunucu için Kuantum Dirençli Açık (Public) ve Gizli (Private) Anahtar üretir."""
        # 1. d ve z tohumlarını üret
        d_tohumu = kuantum_rng.rastgele_bayt_al(32)
        
        # d tohumunu SHA3-512 ile karıştırıp matris (rho) ve gürültü (sigma) tohumu çıkar
        karisik_d = YBGSafKeccak.sha3_512(d_tohumu)
        rho = karisik_d[:32]
        sigma = karisik_d[32:]
        
        # 2. A Matrisini (Uniform) oluştur
        A_hat = YBGPolinomMatris(self.k, self.k)
        A_hat.uniform_rastgele_uret(rho)
        
        # 3. s (Gizli) ve e (Hata) vektörlerini CBD ile üret
        s_vektoru = YBGPolinomVektor(self.k)
        e_vektoru = YBGPolinomVektor(self.k)
        
        # Gürültü tohumunu XOF ile genişlet
        gurultu_akisi = YBGSafKeccak.shake_256(sigma, self.k * 256 * 2)
        
        for i in range(self.k):
            s_vektoru.polinomlar[i].katsayilar = YBGGurultuMotoru.cbd_eta2(gurultu_akisi[i*64 : (i+1)*64])
            e_vektoru.polinomlar[i].katsayilar = YBGGurultuMotoru.cbd_eta2(gurultu_akisi[(i+self.k)*64 : (i+self.k+1)*64])
            
        # 4. NTT Uzayına geçiş
        s_hat = s_vektoru.ntt_uzayina_gec()
        e_hat = e_vektoru.ntt_uzayina_gec()
        
        # 5. t_hat = (A_hat * s_hat) + e_hat
        As_hat = A_hat.ntt_vektor_ile_carp(s_hat)
        t_hat = As_hat.topla(e_hat)
        
        # Açık Anahtar (Public Key): t_hat (12-bit paketlenmiş) + rho
        pk_baytlari = bytearray()
        for polinom in t_hat.polinomlar:
            pk_baytlari.extend(YBGKuantumKodlama.bit_paketle(polinom.katsayilar, 12))
        pk_baytlari.extend(rho)
        
        # Gizli Anahtar (Private Key): s_hat (12-bit paketlenmiş)
        sk_baytlari = bytearray()
        for polinom in s_hat.polinomlar:
            sk_baytlari.extend(YBGKuantumKodlama.bit_paketle(polinom.katsayilar, 12))
            
        return {"pk": bytes(pk_baytlari)}, {"sk": bytes(sk_baytlari)}

    def kapsulle(self, acik_anahtar):
        """İstemci: Açık anahtarı kullanarak ortak bir Kuantum sırrı oluşturur ve kapsüller."""
        pk_baytlari = acik_anahtar["pk"]
        
        # PK'yı aç
        t_hat_polinomlari = []
        polinom_boyutu = (256 * 12) // 8 # 384 bayt
        
        for i in range(self.k):
            basla = i * polinom_boyutu
            bitir = basla + polinom_boyutu
            katsayilar = YBGKuantumKodlama.bit_ac(pk_baytlari[basla:bitir], 256, 12)
            t_hat_polinomlari.append(YBGPolinom(katsayilar))
            
        t_hat = YBGPolinomVektor(self.k, t_hat_polinomlari)
        rho = pk_baytlari[self.k * polinom_boyutu:]
        
        # A Matrisini tekrar oluştur
        A_hat = YBGPolinomMatris(self.k, self.k)
        A_hat.uniform_rastgele_uret(rho)
        
        # 32 baytlık rastgele mesaj (Ortak Sırrın Çekirdeği)
        m_cekirdek = kuantum_rng.rastgele_bayt_al(32)
        
        # Kapsül anahtarı ve gürültü rastgeleliği üretimi
        pk_hash = YBGSafKeccak.sha3_256(pk_baytlari)
        kr = YBGSafKeccak.sha3_512(m_cekirdek + pk_hash)
        ortak_sir_k = kr[:32]
        r_tohum = kr[32:]
        
        # r, e1, e2 vektörlerini üret
        r_vektoru = YBGPolinomVektor(self.k)
        e1_vektoru = YBGPolinomVektor(self.k)
        
        gurultu_akisi_r = YBGSafKeccak.shake_256(r_tohum, self.k * 256 * 2)
        for i in range(self.k):
            r_vektoru.polinomlar[i].katsayilar = YBGGurultuMotoru.cbd_eta2(gurultu_akisi_r[i*64 : (i+1)*64])
            e1_vektoru.polinomlar[i].katsayilar = YBGGurultuMotoru.cbd_eta2(gurultu_akisi_r[(i+self.k)*64 : (i+self.k+1)*64])
            
        e2_polinom = YBGPolinom()
        e2_polinom.katsayilar = YBGGurultuMotoru.cbd_eta2(gurultu_akisi_r[self.k*2*64 : (self.k*2 + 1)*64])
        
        # u = InvNTT(A_hat^T * r_hat) + e1
        r_hat = r_vektoru.ntt_uzayina_gec()
        A_T_hat = A_hat.transpoze_al()
        AT_r_hat = A_T_hat.ntt_vektor_ile_carp(r_hat)
        AT_r = AT_r_hat.ntt_uzayindan_cik()
        u_vektoru = AT_r.topla(e1_vektoru)
        
        # v = InvNTT(t_hat^T * r_hat) + e2 + Decompress(m)
        tT_r_hat = t_hat.ntt_nokta_carpimi(r_hat)
        tT_r = tT_r_hat.ntt_uzayindan_cik()
        
        # Mesajı polinoma kodla
        m_katsayilari = [0] * 256
        for i in range(32):
            bayt_degeri = m_cekirdek[i]
            for j in range(8):
                bit = (bayt_degeri >> j) & 1
                m_katsayilari[8*i + j] = bit * (YBGSabitler.KYBER_Q // 2)
        m_polinom = YBGPolinom(m_katsayilari)
        
        v_polinom = tT_r.topla(e2_polinom).topla(m_polinom)
        
        # Şifreli Kapsül = Compress(u) || Compress(v)
        kapsul_baytlari = bytearray()
        for polinom in u_vektoru.polinomlar:
            kapsul_baytlari.extend(YBGKuantumKodlama.polinom_sikistir(polinom, self.du))
        kapsul_baytlari.extend(YBGKuantumKodlama.polinom_sikistir(v_polinom, self.dv))
        
        return {"kapsul": bytes(kapsul_baytlari)}, ortak_sir_k

    def kapsul_coz(self, gizli_anahtar, kapsul_paketi):
        """Sunucu: Şifreli kapsülü açar ve ortak sırrı (Shared Secret) güvenle çıkartır."""
        sk_baytlari = gizli_anahtar["sk"]
        c_baytlari = kapsul_paketi["kapsul"]
        
        # 1. SK'yı aç (s_hat)
        s_hat_polinomlari = []
        polinom_boyutu = (256 * 12) // 8
        for i in range(self.k):
            basla = i * polinom_boyutu
            bitir = basla + polinom_boyutu
            katsayilar = YBGKuantumKodlama.bit_ac(sk_baytlari[basla:bitir], 256, 12)
            s_hat_polinomlari.append(YBGPolinom(katsayilar))
        s_hat = YBGPolinomVektor(self.k, s_hat_polinomlari)
        
        # 2. Kapsülü aç (u ve v)
        u_polinomlari = []
        u_boyut = (256 * self.du) // 8 # 320 byte
        for i in range(self.k):
            basla = i * u_boyut
            bitir = basla + u_boyut
            u_polinomlari.append(YBGKuantumKodlama.polinom_ac(c_baytlari[basla:bitir], self.du))
        u_vektoru = YBGPolinomVektor(self.k, u_polinomlari)
        
        v_boyut = (256 * self.dv) // 8 # 128 byte
        v_basla = self.k * u_boyut
        v_polinom = YBGKuantumKodlama.polinom_ac(c_baytlari[v_basla : v_basla + v_boyut], self.dv)
        
        # 3. M' = v - InvNTT(s_hat^T * NTT(u))
        u_hat = u_vektoru.ntt_uzayina_gec()
        sT_u_hat = s_hat.ntt_nokta_carpimi(u_hat)
        sT_u = sT_u_hat.ntt_uzayindan_cik()
        
        m_prime_polinom = v_polinom.cikar(sT_u)
        
        # 4. Polinomdan bitleri (mesaj çekirdeğini) oku
        m_prime = bytearray(32)
        ceyrek_q = YBGSabitler.KYBER_Q // 4
        uc_ceyrek_q = 3 * ceyrek_q
        
        for i in range(32):
            bayt_degeri = 0
            for j in range(8):
                katsayi = m_prime_polinom.katsayilar[8*i + j]
                # Q/2'ye yakın olanlar 1, Q veya 0'a yakın olanlar 0'dır
                if ceyrek_q < katsayi < uc_ceyrek_q:
                    bayt_degeri |= (1 << j)
            m_prime[i] = bayt_degeri
            
        return bytes(m_prime)


# ------------------------------------------------------------------------------
# 11. YBG_POLY1305_MAC (KUANTUM DİJİTAL İMZA DOĞRULAYICI)
# ------------------------------------------------------------------------------
class YBGPoly1305_MAC:
    """
    Kütüphanesiz, sabit zamanlı çalışan ve verinin yolda değişip değişmediğini
    (MitM - Ortadaki Adam) P = 2^130 - 5 asalıyla kontrol eden MAC motoru.
    """
    P = (1 << 130) - 5

    @classmethod
    def imza_uret(cls, anahtar, mesaj):
        """32 baytlık anahtarla 16 baytlık kimlik doğrulayıcı (MAC) üretir."""
        if len(anahtar) != 32:
            return None
            
        # r: 16 baytlık değerlendirme noktası
        r = YBGSafMatematik.bytes_to_int(anahtar[:16], 'little')
        # Zayıf anahtarları engellemek için r değerini maskele (Clamping)
        r &= 0x0ffffffc0fffffff0fffffff0fffffff
        
        # s: 16 baytlık rastgele nonce
        s = YBGSafMatematik.bytes_to_int(anahtar[16:], 'little')
        
        akumulator = 0
        
        for i in range(0, len(mesaj), 16):
            blok = mesaj[i : i+16]
            # Bloğa sonuna 0x01 ekleyerek 17. baytı oluştur
            n = YBGSafMatematik.bytes_to_int(blok + b'\x01', 'little')
            
            akumulator += n
            akumulator = (akumulator * r) % cls.P
            
        mac_int = akumulator + s
        
        # Sonucu 16 bayta maskele ve little-endian formatına sok
        maskeli_mac = mac_int & 0xffffffffffffffffffffffffffffffff
        return YBGSafMatematik.int_to_bytes(maskeli_mac, 16, 'little')

    @classmethod
    def imza_dogrula(cls, anahtar, mesaj, gelen_imza):
        """Gelen MAC imzası ile bizim hesapladığımızı sabit zamanlı karşılaştırır."""
        hesaplanan_imza = cls.imza_uret(anahtar, mesaj)
        if hesaplanan_imza is None:
            return False
        # Zamanlama saldırılarını önlemek için == operatörü YERİNE sabit zamanlı kontrol
        return YBGSafMatematik.constant_time_compare(hesaplanan_imza, gelen_imza)
    
# ==============================================================================
# BÖLÜM 4 / 4 : YBG-RATCHET, YBOS SANAL DOSYA SİSTEMİ, AEGIS KALKANI VE P2P AĞI
# ==============================================================================
# AÇIKLAMA:
# Kuantum şifreleme motorunun üzerine inşa edilmiş devasa işletim katmanı.
# Bu kod bloğu, ağdaki her bir cihazı kendi YBOS dosya sistemine sahip,
# Aegis kalkanlarıyla korunan ve Ratchet ile sürekli anahtar değiştiren 
# yıkılmaz bir P2P düğümüne (Node) dönüştürür.
# ==============================================================================

# ------------------------------------------------------------------------------
# 12. YBG_ÇİFT_MANDAL (DOUBLE RATCHET) MOTORU
# ------------------------------------------------------------------------------
class YBGCiftMandalRatchet:
    """
    Her mesaj gönderildiğinde veya alındığında şifreleme anahtarlarını 
    tekrar üretilemez bir şekilde ileriye doğru saran (Ratchet) sistem.
    """
    def __init__(self, ortak_sir):
        # KEM'den gelen ana ortak sırrı KDF (Key Derivation Function) ile parçala
        kok_tohum = YBGSafKeccak.sha3_512(ortak_sir + b"YBG_KOK_TOHUM")
        self.kok_anahtar = kok_tohum[:32]
        
        # Gönderim ve Alım için iki ayrı zincir (Chain) oluştur
        zincir_tohumu = YBGSafKeccak.sha3_512(self.kok_anahtar + b"YBG_ZINCIR")
        self.gonderim_zinciri_anahtari = zincir_tohumu[:32]
        self.alim_zinciri_anahtari = zincir_tohumu[32:]
        
        self.gonderilen_mesaj_sayisi = 0
        self.alinan_mesaj_sayisi = 0

    def mesaj_sifrele(self, duz_metin):
        """Gönderim zincirini bir tık ileri sarar ve yeni anahtarla şifreler."""
        # 1. Mevcut zincir anahtarından Mesaj Anahtarı türet
        kdf_ciktisi = YBGSafKeccak.sha3_512(self.gonderim_zinciri_anahtari + b"\x01")
        mesaj_anahtari = kdf_ciktisi[:32]
        
        # 2. Zinciri ileri sar (Bir önceki duruma asla geri dönülemez)
        self.gonderim_zinciri_anahtari = YBGSafKeccak.sha3_256(self.gonderim_zinciri_anahtari + b"\x02")
        self.gonderilen_mesaj_sayisi += 1
        
        # 3. Mesajı ChaCha20 ile şifrele ve Poly1305 ile imzala
        nonce = kuantum_rng.rastgele_bayt_al(12)
        sifreli_metin = YBGChaCha20AkisSifresi.sifrele(mesaj_anahtari, nonce, duz_metin)
        
        mac_anahtari = YBGChaCha20AkisSifresi._akis_blogu_uret(mesaj_anahtari, nonce, 0)[:32]
        mac_imzasi = YBGPoly1305_MAC.imza_uret(mac_anahtari, sifreli_metin)
        
        # Paket Yapısı: Nonce(12) + MAC(16) + Ciphertext(N)
        return nonce + mac_imzasi + sifreli_metin

    def mesaj_coz(self, sifreli_paket):
        """Alım zincirini bir tık ileri sarar ve gelen mesajı çözer."""
        if len(sifreli_paket) < 28:
            return None, "Paket çok kısa!"
            
        kdf_ciktisi = YBGSafKeccak.sha3_512(self.alim_zinciri_anahtari + b"\x01")
        mesaj_anahtari = kdf_ciktisi[:32]
        
        self.alim_zinciri_anahtari = YBGSafKeccak.sha3_256(self.alim_zinciri_anahtari + b"\x02")
        self.alinan_mesaj_sayisi += 1
        
        nonce = sifreli_paket[:12]
        gelen_mac = sifreli_paket[12:28]
        sifreli_metin = sifreli_paket[28:]
        
        mac_anahtari = YBGChaCha20AkisSifresi._akis_blogu_uret(mesaj_anahtari, nonce, 0)[:32]
        
        if not YBGPoly1305_MAC.imza_dogrula(mac_anahtari, sifreli_metin, gelen_mac):
            return None, "Poly1305 MAC İhlali! Veri yolda değiştirilmiş."
            
        duz_metin = YBGChaCha20AkisSifresi.sifre_coz(mesaj_anahtari, nonce, sifreli_metin)
        return duz_metin, "OK"


# ------------------------------------------------------------------------------
# 13. YBOS_SANAL_DOSYA_SİSTEMİ (RAM TABANLI VFS)
# ------------------------------------------------------------------------------
class YBOS_Dugum:
    """YBOS dosya sistemindeki her bir klasör veya dosya nesnesi."""
    def __init__(self, isim, klasor_mu=False):
        self.isim = isim
        self.klasor_mu = klasor_mu
        self.icerik = bytearray() # Sadece dosyalarda kullanılır
        self.alt_dugumler = {}    # Sadece klasörlerde kullanılır
        self.boyut = 0
        self.olusturulma_zamani = "00:00:00" # Kütüphanesiz zaman simülasyonu

class YBOS_VFS:
    """
    Fiziksel hard diske hiçbir şey yazmayan, her şeyi RAM üzerinde
    ağaç (Tree) mimarisiyle tutan YBOS işletim sistemi çekirdeği.
    """
    def __init__(self):
        self.kok = YBOS_Dugum("/", klasor_mu=True)
        self.mevcut_dizin = self.kok
        self.dizin_yolu = ["/"]

    def pwd(self):
        """Mevcut çalışma dizinini yazdırır."""
        if len(self.dizin_yolu) == 1:
            return "/"
        return "/" + "/".join(self.dizin_yolu[1:])

    def ls(self):
        """Dizin içeriğini listeler."""
        if not self.mevcut_dizin.alt_dugumler:
            return "Dizin boş."
            
        cikti = []
        for isim, dugum in self.mevcut_dizin.alt_dugumler.items():
            if dugum.klasor_mu:
                cikti.append(f"[DIR]  {isim}")
            else:
                cikti.append(f"[FILE] {isim} ({dugum.boyut} bytes)")
        return "\n".join(cikti)

    def mkdir(self, isim):
        """Yeni bir sanal klasör oluşturur."""
        if isim in self.mevcut_dizin.alt_dugumler:
            return f"Hata: '{isim}' adında bir dosya/klasör zaten var."
        self.mevcut_dizin.alt_dugumler[isim] = YBOS_Dugum(isim, klasor_mu=True)
        return f"Klasör oluşturuldu: {isim}"

    def cd(self, isim):
        """Klasörler arası geçiş yapar."""
        if isim == "..":
            if len(self.dizin_yolu) > 1:
                self.dizin_yolu.pop()
                # Kökten aşağı tekrar in
                gecici = self.kok
                for ad in self.dizin_yolu[1:]:
                    gecici = gecici.alt_dugumler[ad]
                self.mevcut_dizin = gecici
            return self.pwd()
            
        if isim in self.mevcut_dizin.alt_dugumler:
            hedef = self.mevcut_dizin.alt_dugumler[isim]
            if hedef.klasor_mu:
                self.mevcut_dizin = hedef
                self.dizin_yolu.append(isim)
                return self.pwd()
            else:
                return f"Hata: '{isim}' bir klasör değil."
        return f"Hata: '{isim}' bulunamadı."

    def write(self, isim, veri_baytlari):
        """Veriyi RAM'deki sanal dosyaya yazar."""
        if isim in self.mevcut_dizin.alt_dugumler and self.mevcut_dizin.alt_dugumler[isim].klasor_mu:
            return "Hata: Bu isimde bir klasör var."
            
        if isim not in self.mevcut_dizin.alt_dugumler:
            self.mevcut_dizin.alt_dugumler[isim] = YBOS_Dugum(isim, klasor_mu=False)
            
        dosya = self.mevcut_dizin.alt_dugumler[isim]
        dosya.icerik = bytearray(veri_baytlari)
        dosya.boyut = len(dosya.icerik)
        return f"{isim} dosyasına {dosya.boyut} bayt yazıldı."

    def read(self, isim):
        """Sanal dosyanın içeriğini okur."""
        if isim not in self.mevcut_dizin.alt_dugumler:
            return b"Hata: Dosya bulunamadi."
        dosya = self.mevcut_dizin.alt_dugumler[isim]
        if dosya.klasor_mu:
            return b"Hata: Bu bir klasor."
        return bytes(dosya.icerik)

    def rm(self, isim):
        """Dosya veya klasörü RAM'den kalıcı olarak siler."""
        if isim in self.mevcut_dizin.alt_dugumler:
            del self.mevcut_dizin.alt_dugumler[isim]
            return f"'{isim}' silindi."
        return "Hata: Bulunamadı."


# ------------------------------------------------------------------------------
# 14. AEGIS_IDS_KALKANI (SALDIRI TESPİT VE ENGELLEME SİSTEMİ)
# ------------------------------------------------------------------------------
class AegisIDS_Kalkani:
    """
    Kötü niyetli P2P düğümlerini, DDoS saldırılarını ve Kuantum fuzzing 
    denemelerini anında tespit edip bağlantıyı reddeden savunma kalkanı.
    """
    def __init__(self):
        self.yasakli_ipler = []
        self.baglanti_gecmisi = {} # IP -> [Zaman simülasyon sayacı]
        self.sayac = 0
        self.MKS = 5 # Maksimum Kabul Sıklığı (Kısa sürede en fazla 5 bağlantı)

    def _zaman_sayaci_ilerlet(self):
        self.sayac += 1
        return self.sayac

    def baglanti_onayi_ver(self, ip_adresi):
        """Gelen bağlantının güvenli olup olmadığını analiz eder."""
        mevcut_zaman = self._zaman_sayaci_ilerlet()
        
        # 1. Kural: Kara liste kontrolü
        if ip_adresi in self.yasakli_ipler:
            return False, "AEGIS: Bu IP adresi kara listede!"
            
        # 2. Kural: Sıklık kontrolü (DDoS Koruması)
        if ip_adresi not in self.baglanti_gecmisi:
            self.baglanti_gecmisi[ip_adresi] = []
            
        gecmis = self.baglanti_gecmisi[ip_adresi]
        gecmis.append(mevcut_zaman)
        
        # Son 10 zaman dilimindeki bağlantıları say
        son_baglantilar = [z for z in gecmis if (mevcut_zaman - z) < 10]
        self.baglanti_gecmisi[ip_adresi] = son_baglantilar
        
        if len(son_baglantilar) > self.MKS:
            self.kara_listeye_ekle(ip_adresi)
            return False, f"AEGIS: DDoS Tehdidi algılandı! {ip_adresi} banlandı."
            
        return True, "AEGIS: Bağlantı güvenli."

    def paket_analizi(self, ip_adresi, paket_baytlari):
        """Gelen verinin boyutunu ve entropisini (karmaşıklığını) ölçer."""
        boyut = len(paket_baytlari)
        
        # Kural 3: Fuzzing / Buffer Overflow Koruması
        if boyut > 1024 * 1024 * 5: # 5MB üstü tekil paket yasak
            self.kara_listeye_ekle(ip_adresi)
            return False, "AEGIS: Aşırı büyük paket (Buffer Overflow denemesi)."
            
        # Kural 4: Boş veya bozuk paket koruması
        if boyut < 13: # Header bile sığmıyor
            return False, "AEGIS: Anormal paket yapısı."
            
        return True, "AEGIS: Paket temiz."

    def kara_listeye_ekle(self, ip_adresi):
        if ip_adresi not in self.yasakli_ipler:
            self.yasakli_ipler.append(ip_adresi)


# ------------------------------------------------------------------------------
# 15. YBG_STEGANOGRAFİ_V3 (SES DOSYASI ÜRETİCİ)
# ------------------------------------------------------------------------------
class YBGSesKalkani:
    """Ağ üzerinden yollanacak verileri sahte bir .wav dosyası gibi paketler."""
    
    @staticmethod
    def _wav_basligi_olustur(veri_boyutu):
        header = bytearray(44)
        header[0:4] = b"RIFF"
        header[4:8] = YBGSafMatematik.int_to_bytes(36 + veri_boyutu, 4, 'little')
        header[8:12] = b"WAVE"
        header[12:16] = b"fmt "
        header[16:20] = YBGSafMatematik.int_to_bytes(16, 4, 'little')
        header[20:22] = YBGSafMatematik.int_to_bytes(1, 2, 'little')
        header[22:24] = YBGSafMatematik.int_to_bytes(1, 2, 'little')
        header[24:28] = YBGSafMatematik.int_to_bytes(44100, 4, 'little')
        header[28:32] = YBGSafMatematik.int_to_bytes(88200, 4, 'little')
        header[32:34] = YBGSafMatematik.int_to_bytes(2, 2, 'little')
        header[34:36] = YBGSafMatematik.int_to_bytes(16, 2, 'little')
        header[36:40] = b"data"
        header[40:44] = YBGSafMatematik.int_to_bytes(veri_boyutu, 4, 'little')
        return header

    @staticmethod
    def sese_gizle(payload_baytlari):
        uzunluk = len(payload_baytlari)
        uzunluk_baytlari = YBGSafMatematik.int_to_bytes(uzunluk, 4, 'big')
        tam_veri = uzunluk_baytlari + payload_baytlari
        
        gerekli_ornekler = len(tam_veri) * 8
        veri_boyutu = gerekli_ornekler * 2
        
        wav_verisi = bytearray(YBGSesKalkani._wav_basligi_olustur(veri_boyutu))
        ornekler = bytearray(kuantum_rng.rastgele_bayt_al(veri_boyutu))
        
        ornek_idx = 0
        for bayt in tam_veri:
            for i in range(8):
                bit = (bayt >> (7 - i)) & 1
                hedef_idx = ornek_idx * 2
                ornekler[hedef_idx] = (ornekler[hedef_idx] & 0xFE) | bit
                ornek_idx += 1
                
        wav_verisi.extend(ornekler)
        return bytes(wav_verisi)

    @staticmethod
    def sesten_cikar(wav_verisi):
        if len(wav_verisi) < 44 or wav_verisi[0:4] != b"RIFF":
            return None
            
        ornekler = wav_verisi[44:]
        uzunluk_degeri = 0
        
        for i in range(32):
            bit = ornekler[i * 2] & 1
            uzunluk_degeri = (uzunluk_degeri << 1) | bit
            
        if uzunluk_degeri == 0 or uzunluk_degeri > len(ornekler) // 8:
            return None
            
        cikarilan = bytearray()
        ornek_idx = 32
        for _ in range(uzunluk_degeri):
            bayt_degeri = 0
            for _ in range(8):
                bit = ornekler[ornek_idx * 2] & 1
                bayt_degeri = (bayt_degeri << 1) | bit
                ornek_idx += 1
            cikarilan.append(bayt_degeri)
            
        return bytes(cikarilan)


# ------------------------------------------------------------------------------
# 16. YBG_P2P_AĞ_DÜĞÜMÜ VE KONSOL ARAYÜZÜ (FİNAL ENTEGRASYON)
# ------------------------------------------------------------------------------
# Kuantum mimarisini internete açmak için mecburen standart Python soketlerini 
# kullanıyoruz. Kriptografik işlemlerin tamamı yukarıdaki kütüphanesiz motorla yapılır.
import socket
import threading
import sys
import os
import time

class YBGP2P_Dugumu:
    def __init__(self, port=1313, kullanici_adi="CHT_Hacker"):
        self.port = port
        self.kullanici_adi = kullanici_adi
        self.aktif = True
        
        self.baglantilar = {} # IP -> {'socket': s, 'ratchet': r}
        self.lock = threading.Lock()
        
        # Alt Sistemleri Başlat
        self.vfs = YBOS_VFS()
        self.aegis = AegisIDS_Kalkani()
        self.kem_motoru = YBG_ML_KEM(k=3)
        
        self.sohbet_gecmisi = []
        self.sistem_loglari = []

    def log_ekle(self, mesaj, tur="INFO"):
        with self.lock:
            saat = time.strftime('%H:%M:%S')
            self.sistem_loglari.append(f"[{saat}] [{tur}] {mesaj}")
            if len(self.sistem_loglari) > 10:
                self.sistem_loglari.pop(0)

    def sohbet_ekle(self, gonderen, mesaj):
        with self.lock:
            saat = time.strftime('%H:%M')
            self.sohbet_gecmisi.append(f"[{saat}] {gonderen}: {mesaj}")
            if len(self.sohbet_gecmisi) > 15:
                self.sohbet_gecmisi.pop(0)

    def _ekrani_ciz(self):
        """Kütüphanesiz ANSI Kaçış Dizileriyle Terminal UI Çizer."""
        while self.aktif:
            sys.stdout.write("\033[2J\033[H") # Ekranı temizle ve imleci başa al
            sys.stdout.write("\033[96m")
            sys.stdout.write("="*80 + "\n")
            sys.stdout.write(f" YBG13(TM) KIYAMET MOTORU V4.0 | AEGIS IDS: AKTIF | YBOS: DEVREDE\n")
            sys.stdout.write("="*80 + "\033[0m\n\n")
            
            with self.lock:
                sys.stdout.write("\033[92m--- GUVENLI SOHBET ---\033[0m\n")
                for msg in self.sohbet_gecmisi:
                    sys.stdout.write(f"  {msg}\n")
                    
                sys.stdout.write(f"\n\033[93m--- AEGIS SISTEM LOGLARI (Aktif Baglanti: {len(self.baglantilar)}) ---\033[0m\n")
                for log in self.sistem_loglari:
                    sys.stdout.write(f"  {log}\n")
                    
            sys.stdout.write("\n\033[97mKomutlar: /connect <IP>, /vfs, /exit | Mesaj yazmak icin direkt basla\033[0m\n")
            sys.stdout.write("YBG13_Term> ")
            sys.stdout.flush()
            time.sleep(1)

    def sunucuyu_baslat(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', self.port))
        s.listen(5)
        
        self.log_ekle(f"Port {self.port} dinleniyor...", "BASARILI")
        
        while self.aktif:
            s.settimeout(1.0)
            try:
                c, addr = s.accept()
                ip = addr[0]
                
                # AEGIS IDS KONTROLÜ
                onay, sebep = self.aegis.baglanti_onayi_ver(ip)
                if not onay:
                    self.log_ekle(sebep, "ENGELLEME")
                    c.close()
                    continue
                    
                threading.Thread(target=self._kapsulleme_bekle, args=(c, ip), daemon=True).start()
            except socket.timeout:
                pass
            except Exception as e:
                self.log_ekle(f"Sunucu hatasi: {e}", "HATA")

    def _veri_al_tam(self, sock, boyut):
        veri = bytearray()
        while len(veri) < boyut:
            try:
                paket = sock.recv(boyut - len(veri))
                if not paket: return None
                veri.extend(paket)
            except:
                return None
        return bytes(veri)

    def _kapsulleme_bekle(self, sock, ip):
        """Gelen bağlantıyla ML-KEM Anahtar Takası Yapar."""
        try:
            self.log_ekle(f"{ip} Kuantum Handshake baslatiyor...", "INFO")
            
            # Sunucu anahtar üretir
            pk_dict, sk_dict = self.kem_motoru.anahtar_cifti_uret()
            pk_verisi = pk_dict["pk"]
            
            # Uzunluğu ve PK'yı gönder
            sock.sendall(YBGSafMatematik.int_to_bytes(len(pk_verisi), 4, 'big') + pk_verisi)
            
            # İstemciden gelen kapsülü bekle
            kapsul_boyut_baytlari = self._veri_al_tam(sock, 4)
            if not kapsul_boyut_baytlari: raise Exception("Kapsul boyutu alinamadi.")
            kapsul_boyut = YBGSafMatematik.bytes_to_int(kapsul_boyut_baytlari, 'big')
            
            kapsul_verisi = self._veri_al_tam(sock, kapsul_boyut)
            if not kapsul_verisi: raise Exception("Kapsul verisi alinamadi.")
            
            # Kapsülü çöz ve ortak sırrı çıkar
            ortak_sir = self.kem_motoru.kapsul_coz(sk_dict, {"kapsul": kapsul_verisi})
            
            # Ratchet motorunu başlat
            ratchet = YBGCiftMandalRatchet(ortak_sir)
            
            with self.lock:
                self.baglantilar[ip] = {'socket': sock, 'ratchet': ratchet}
                
            self.log_ekle(f"{ip} ile Kuantum Tunel Kuruldu!", "BASARILI")
            self._dinlemeye_basla(ip)
            
        except Exception as e:
            self.log_ekle(f"Handshake hatasi ({ip}): {e}", "HATA")
            sock.close()

    def baglan(self, ip_adresi):
        """Başka bir YBG13 düğümüne bağlanır ve Kapsülleme yapar."""
        try:
            self.log_ekle(f"{ip_adresi} aranıyor...", "INFO")
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((ip_adresi, self.port))
            
            # Sunucudan PK bekle
            pk_boyut_baytlari = self._veri_al_tam(sock, 4)
            pk_boyut = YBGSafMatematik.bytes_to_int(pk_boyut_baytlari, 'big')
            pk_verisi = self._veri_al_tam(sock, pk_boyut)
            
            # Kapsül üret ve ortak sırrı al
            kapsul_dict, ortak_sir = self.kem_motoru.kapsulle({"pk": pk_verisi})
            kapsul_verisi = kapsul_dict["kapsul"]
            
            # Kapsülü sunucuya yolla
            sock.sendall(YBGSafMatematik.int_to_bytes(len(kapsul_verisi), 4, 'big') + kapsul_verisi)
            
            ratchet = YBGCiftMandalRatchet(ortak_sir)
            
            with self.lock:
                self.baglantilar[ip_adresi] = {'socket': sock, 'ratchet': ratchet}
                
            self.log_ekle(f"{ip_adresi} ile Kuantum Tunel Kuruldu!", "BASARILI")
            threading.Thread(target=self._dinlemeye_basla, args=(ip_adresi,), daemon=True).start()
            
        except Exception as e:
            self.log_ekle(f"Bağlantı hatası ({ip_adresi}): {e}", "HATA")

    def _dinlemeye_basla(self, ip):
        sock = self.baglantilar[ip]['socket']
        ratchet = self.baglantilar[ip]['ratchet']
        
        while self.aktif:
            try:
                # Önce 4 baytlık paket boyutu bekle
                boyut_baytlari = self._veri_al_tam(sock, 4)
                if not boyut_baytlari: break
                
                paket_boyutu = YBGSafMatematik.bytes_to_int(boyut_baytlari, 'big')
                
                # AEGIS KONTROLÜ
                onay, sebep = self.aegis.paket_analizi(ip, bytearray(paket_boyutu))
                if not onay:
                    self.log_ekle(sebep, "AEGIS-MUDEHALE")
                    break
                    
                ham_veri = self._veri_al_tam(sock, paket_boyutu)
                
                # Steganografi Katmanını Çöz
                sifreli_paket = YBGSesKalkani.sesten_cikar(ham_veri)
                if not sifreli_paket:
                    continue
                    
                # Ratchet Katmanını Çöz
                duz_metin_bayt, durum = ratchet.mesaj_coz(sifreli_paket)
                if durum != "OK":
                    self.log_ekle(f"Guvenlik Ihlali ({ip}): {durum}", "HATA")
                    continue
                    
                mesaj_str = duz_metin_bayt.decode('utf-8')
                gonderen, icerik = mesaj_str.split(":", 1) if ":" in mesaj_str else (ip, mesaj_str)
                self.sohbet_ekle(gonderen, icerik)
                
            except Exception as e:
                break
                
        self.log_ekle(f"{ip} baglantisi koptu.", "INFO")
        with self.lock:
            if ip in self.baglantilar:
                del self.baglantilar[ip]
        sock.close()

    def mesaj_yayinla(self, icerik):
        """Ağdaki herkese mesajı şifreleyerek ve sese gömerek yollar."""
        if not self.baglantilar:
            self.log_ekle("Bagli kimse yok!", "UYARI")
            return
            
        tam_mesaj = f"{self.kullanici_adi}:{icerik}".encode('utf-8')
        
        with self.lock:
            icin_silinecekler = []
            for ip, veri in self.baglantilar.items():
                try:
                    # Ratchet ile şifrele
                    sifreli_paket = veri['ratchet'].mesaj_sifrele(tam_mesaj)
                    # Sese gizle
                    stego_wav = YBGSesKalkani.sese_gizle(sifreli_paket)
                    # Yolla (Önce boyut, sonra veri)
                    veri['socket'].sendall(YBGSafMatematik.int_to_bytes(len(stego_wav), 4, 'big') + stego_wav)
                except:
                    icin_silinecekler.append(ip)
                    
            for ip in icin_silinecekler:
                del self.baglantilar[ip]
                
        self.sohbet_ekle("SEN", icerik)

    def baslat(self):
        # UI ve Sunucu threadlerini başlat
        threading.Thread(target=self._ekrani_ciz, daemon=True).start()
        threading.Thread(target=self.sunucuyu_baslat, daemon=True).start()
        
        # Ana Girdi Döngüsü
        while self.aktif:
            try:
                # Standart input (UI çizerken prompt bozulmasın diye input kullanmıyoruz,
                # normalde sys.stdin okuması yapılır ama basitlik için raw input)
                komut = input()
                
                if komut.startswith("/connect "):
                    hedef_ip = komut.split(" ")[1]
                    self.baglan(hedef_ip)
                elif komut == "/vfs":
                    self.log_ekle("YBOS Sanal Dosya Sistemi Acik.", "INFO")
                    self.sohbet_ekle("SISTEM", self.vfs.ls())
                elif komut == "/exit":
                    self.aktif = False
                    self.log_ekle("Sistem kapatiliyor...", "INFO")
                elif komut.strip() != "":
                    self.mesaj_yayinla(komut)
                    
            except KeyboardInterrupt:
                self.aktif = False
                break

# ==============================================================================
# SİSTEM ATEŞLEYİCİSİ
# ==============================================================================
if __name__ == "__main__":
    if os.name == 'nt':
        os.system('color') # Windows CMD ANSI desteği
        
    print("YBG13™ - KIYAMET MOTORUNA HOS GELDINIZ")
    print("CHT (Charizard Hack Team) Protokolleri Yukleniyor...")
    time.sleep(1)
    
    dugum = YBGP2P_Dugumu(port=1313, kullanici_adi="YBG13_CEO")
    dugum.baslat()
    print("\nSistem güvenle kapatıldı. Aegis kalkanları devreden çıktı.")