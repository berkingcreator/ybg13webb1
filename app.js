import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, onSnapshot, query, orderBy, deleteDoc, setDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC0Mv6ovlgvilx8x4W7dPR1UZYLpKduqeI",
    authDomain: "ybg13-a6ab3.firebaseapp.com",
    projectId: "ybg13-a6ab3",
    storageBucket: "ybg13-a6ab3.firebasestorage.app",
    messagingSenderId: "623025176609",
    appId: "1:623025176609:web:febf58e3150992dd142360",
    measurementId: "G-D5CFJP1MZ0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let globalProducts = [];
let globalNews = [];

window.showPage = function(pageId) {
    if(pageId === 'contact') {
        window.location.href = 'iletisim.html';
    } else {
        window.location.href = pageId + '.html';
    }
}

window.mobileMenuToggle = function() {
    const mobMenu = document.getElementById('mobile-menu');
    if(mobMenu) mobMenu.classList.toggle('hidden');
}

/* ================= MAĞAZA VE ÜRÜNLER ================= */
async function loadProducts() {
    const grid = document.getElementById('product-grid');
    if(!grid) return;
    try {
        const querySnapshot = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
        globalProducts = [];
        grid.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const p = { id: doc.id, ...doc.data() };
            globalProducts.push(p);
            grid.innerHTML += `
                <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition cursor-pointer group" onclick="viewProduct('${p.id}')">
                    <div class="h-48 overflow-hidden relative">
                        <img src="${p.img}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" onerror="this.src='https://placehold.co/800x600/3b82f6/white?text=Resim+Yok'">
                        <div class="absolute top-3 left-3 bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-xs font-bold text-blue-600 shadow-sm">${p.category}</div>
                    </div>
                    <div class="p-5">
                        <h3 class="font-bold text-slate-900 mb-2 truncate">${p.name}</h3>
                        <div class="flex justify-between items-center">
                            <span class="text-blue-600 font-extrabold">${Number(p.price).toLocaleString('tr-TR')} ₺</span>
                            <span class="text-slate-400 text-xs font-medium">İncele <i class="fas fa-chevron-right ml-1"></i></span>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Ürünler yüklenirken hata oluştu:", error);
        grid.innerHTML = `<p class="text-red-500">Ürünler yüklenemedi. Bağlantınızı kontrol edin.</p>`;
    }
}

async function loadProductDetail() {
    const container = document.getElementById('detail-content');
    if(!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if(productId) {
        try {
            const docSnap = await getDoc(doc(db, "products", productId));
            if(docSnap.exists()) {
                const p = docSnap.data();
                const safeName = p.name ? p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
                
                container.innerHTML = `
                    <div class="md:w-1/2 p-8 lg:p-12 bg-slate-50 flex items-center justify-center border-r border-slate-100">
                        <img src="${p.img}" class="w-full object-cover rounded-2xl shadow-lg transform hover:scale-105 transition duration-500" onerror="this.src='https://placehold.co/800x600/3b82f6/white?text=${encodeURIComponent(p.name)}'">
                    </div>
                    <div class="md:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
                        <div class="mb-4">
                            <span class="bg-blue-100 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">${p.category}</span>
                        </div>
                        <h1 class="text-3xl md:text-4xl font-extrabold mb-6 text-slate-900 leading-tight">${p.name}</h1>
                        <p class="text-slate-600 mb-8 leading-relaxed text-lg">${p.desc}</p>
                        <div class="flex items-center justify-between mb-8 border-y border-slate-100 py-6">
                            <span class="text-slate-500 font-bold uppercase tracking-wide">Lisans Bedeli</span>
                            <div class="text-4xl font-black text-blue-600">${Number(p.price).toLocaleString('tr-TR')} ₺</div>
                        </div>
                        <button onclick="requestQuote('${safeName}')" class="bg-slate-900 text-white py-5 px-8 rounded-xl font-bold hover:bg-blue-600 w-full transition shadow-xl hover:shadow-2xl transform hover:-translate-y-1 flex items-center justify-center text-lg">
                            <i class="fas fa-paper-plane mr-3"></i> Hemen Teklif Al
                        </button>
                    </div>
                `;
                document.title = p.name + " | YBG13™ Mağaza";
            } else {
                container.innerHTML = '<div class="w-full text-center py-20"><p class="text-red-500 font-bold text-xl">Ürün bulunamadı.</p></div>';
            }
        } catch(err) {
            container.innerHTML = '<div class="w-full text-center py-20"><p class="text-red-500 font-bold text-xl">Bir hata oluştu.</p></div>';
        }
    }
}

/* ================= HABERLER ================= */
async function loadNews() {
    const newsGrid = document.getElementById('news-container');
    if(!newsGrid) return;
    try {
        const querySnapshot = await getDocs(query(collection(db, "news"), orderBy("createdAt", "desc")));
        globalNews = [];
        newsGrid.innerHTML = ''; 
        querySnapshot.forEach((doc) => {
            const news = { id: doc.id, ...doc.data() };
            globalNews.push(news);
            newsGrid.innerHTML += `
                <div class="bg-white rounded-3xl overflow-hidden border border-slate-100 hover:shadow-lg transition duration-300">
                    <img src="${news.image}" class="w-full h-48 object-cover" onerror="this.src='https://placehold.co/800x400/slate/white?text=Haber'">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-xs font-bold text-blue-600 uppercase">${news.category}</span>
                            <span class="text-xs text-slate-400">${news.date}</span>
                        </div>
                        <h3 class="text-xl font-bold mb-3 text-slate-900">${news.title}</h3>
                        <p class="text-slate-600 text-sm mb-4 line-clamp-2">${news.summary}</p>
                        <button onclick="viewNewsDetail('${news.id}')" class="text-blue-600 font-bold text-sm hover:underline">Devamını Oku <i class="fas fa-arrow-right ml-1"></i></button>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Haberler yüklenirken hata:", error);
    }
}

async function loadNewsDetail() {
    const container = document.getElementById('news-detail-container');
    if(!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const newsId = urlParams.get('id');

    if(newsId) {
        try {
            const docSnap = await getDoc(doc(db, "news", newsId));
            if(docSnap.exists()) {
                const n = docSnap.data();
                
                container.innerHTML = `
                    <div class="w-full h-64 md:h-96 relative">
                        <img src="${n.image}" alt="${n.title}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/1200x600/slate/white?text=YBG13+Haberler'">
                        <div class="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-sm font-bold text-blue-600 shadow-sm uppercase tracking-widest">${n.category}</div>
                    </div>
                    <div class="p-8 md:p-16">
                        <div class="flex items-center text-slate-500 mb-6 font-medium">
                            <i class="far fa-calendar-alt mr-2"></i> ${n.date}
                            <span class="mx-4 text-slate-300">|</span>
                            <i class="fas fa-user-edit mr-2"></i> YBG13™ Ekibi
                        </div>
                        <h1 class="text-3xl md:text-5xl font-extrabold mb-8 text-slate-900 leading-tight">${n.title}</h1>
                        <div class="prose prose-lg prose-slate max-w-none text-slate-600 leading-relaxed">
                            ${n.content ? n.content.replace(/\n/g, '<br><br>') : n.summary}
                        </div>
                        
                        <div class="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center">
                            <span class="font-bold text-slate-900">Bu haberi paylaş:</span>
                            <div class="flex gap-3">
                                <button class="w-10 h-10 rounded-full bg-slate-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition shadow-sm"><i class="fab fa-twitter"></i></button>
                                <button class="w-10 h-10 rounded-full bg-slate-50 text-blue-800 flex items-center justify-center hover:bg-blue-800 hover:text-white transition shadow-sm"><i class="fab fa-linkedin-in"></i></button>
                                <button onclick="navigator.clipboard.writeText(window.location.href); alert('Bağlantı kopyalandı!');" class="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-slate-600 hover:text-white transition shadow-sm"><i class="fas fa-link"></i></button>
                            </div>
                        </div>
                    </div>
                `;
                document.title = n.title + " | YBG13™ Haberler";
            } else {
                container.innerHTML = '<div class="w-full text-center py-32"><p class="text-red-500 font-bold text-xl">Haber bulunamadı.</p></div>';
            }
        } catch(err) {
            container.innerHTML = '<div class="w-full text-center py-32"><p class="text-red-500 font-bold text-xl">Bir hata oluştu.</p></div>';
        }
    } else {
        container.innerHTML = '<div class="w-full text-center py-32"><p class="text-slate-500 font-bold text-xl">Geçersiz haber bağlantısı.</p></div>';
    }
}

/* ================= PROJELER & GÜVENLİK ================= */
async function loadProjects() {
    const container = document.getElementById('projects-container');
    if(!container) return;
    try {
        const querySnapshot = await getDocs(query(collection(db, "portfolio"), orderBy("createdAt", "desc")));
        container.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const p = doc.data();
            container.innerHTML += `
                <div class="bg-white p-8 rounded-3xl border border-slate-100 hover:shadow-xl transition duration-300 flex flex-col h-full">
                    <div class="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mb-6">
                        <i class="fas ${p.icon}"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-3">${p.name}</h3>
                    <p class="text-slate-600 mb-6 leading-relaxed flex-grow text-sm">${p.desc}</p>
                    <a href="${p.url}" target="_blank" class="inline-flex items-center text-blue-600 font-bold hover:underline text-sm mt-auto">
                        Projeyi İncele <i class="fas fa-external-link-alt ml-2 text-xs"></i>
                    </a>
                </div>
            `;
        });
    } catch (error) {
        console.error("Projeler yüklenirken hata:", error);
    }
}

async function loadSecurity() {
    const freeContainer = document.getElementById('free-versions-container');
    const paidContainer = document.getElementById('paid-versions-container');
    if(!freeContainer || !paidContainer) return;
    
    try {
        const querySnapshot = await getDocs(query(collection(db, "security_versions"), orderBy("createdAt", "asc")));
        freeContainer.innerHTML = '';
        paidContainer.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const s = doc.data();

            const safeName = s.name ? s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            const safeJsUrl = s.jsUrl ? s.jsUrl.replace(/'/g, "\\'") : '';
            const safePyUrl = s.pyUrl ? s.pyUrl.replace(/'/g, "\\'") : '';

            if (s.type === 'free') {
                freeContainer.innerHTML += `
                    <div class="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col justify-between border-4 border-blue-500 hover:scale-[1.02] transition-transform overflow-hidden">
                        <div class="mb-6">
                            <h3 class="text-2xl font-black mb-2 tracking-tight">${s.name}</h3>
                            <p class="text-blue-100 text-sm opacity-90">${s.details}</p>
                        </div>
                        <div class="flex flex-wrap gap-3">
                            ${s.jsUrl ? `<button onclick="downloadRaw('${safeJsUrl}', '${safeName}.js')" class="flex-1 bg-white text-blue-600 px-4 py-3 rounded-2xl font-bold hover:bg-slate-100 transition shadow-md flex items-center justify-center gap-2 text-sm"><i class="fab fa-js text-lg"></i> JS İndir</button>` : ''}
                            ${s.pyUrl ? `<button onclick="downloadRaw('${safePyUrl}', '${safeName}.py')" class="flex-1 bg-slate-900 text-white px-4 py-3 rounded-2xl font-bold hover:bg-black transition shadow-md flex items-center justify-center gap-2 border border-blue-400 text-sm"><i class="fab fa-python text-lg"></i> Python</button>` : ''}
                        </div>
                    </div>
                `;
            } else {
                paidContainer.innerHTML += `
                    <div class="flex flex-col bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden">
                        <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <i class="fas fa-crown"></i>
                        </div>
                        <h3 class="text-xl font-bold mb-1">${s.name}</h3>
                        <p class="text-indigo-600 font-black text-lg mb-4">${s.priceOrDesc} ₺</p>
                        <p class="text-slate-500 text-sm mb-8 flex-grow">${s.details}</p>
                        <button onclick="goToContact('${safeName}')" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-indigo-600 transition">Satın Al</button>
                    </div>
                `;
            }
        });
    } catch (error) {
        console.error("Güvenlik sürümleri yüklenirken hata:", error);
    }
}

/* ================= YÜKLEYİCİ (HER ŞEYİ ÇALIŞTIRAN YER) ================= */
window.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    loadProductDetail();
    loadNews();
    loadNewsDetail(); // Haber detaylarını çekmesi için eklendi
    loadProjects();
    loadSecurity();
});

window.viewProduct = function(id) {
    window.location.href = 'magaza_detay.html?id=' + id;
}

window.viewNewsDetail = function(id) {
    window.location.href = 'haber_detay.html?id=' + id;
}

window.requestQuote = function(name) {
    localStorage.setItem('ybg_contact_subject', "Teklif Talebi: " + name);
    localStorage.setItem('ybg_contact_message', name + " ürünü hakkında detaylı teklif almak istiyorum.");
    window.location.href = 'iletisim.html';
}

window.goToContact = function(productName) {
    localStorage.setItem('ybg_contact_subject', "Satın Alma: " + productName);
    localStorage.setItem('ybg_contact_message', `Merhaba, ${productName} sürümü hakkında bilgi almak ve satın almak istiyorum.`);
    window.location.href = 'iletisim.html';
}

/* ================= İLETİŞİM SPAM KORUMASI ================= */
let lastSubmitTime = 0;
const contactForm = document.getElementById('contact-form');
if(contactForm) {
    contactForm.addEventListener('submit', (e) => {
        const now = Date.now();
        const cooldownLimit = 60000;
        if (now - lastSubmitTime < cooldownLimit) {
            e.preventDefault();
            const remaining = Math.ceil((cooldownLimit - (now - lastSubmitTime)) / 1000);
            alert(`Lütfen spam yapmayınız! Yeni bir mesaj göndermek için ${remaining} saniye bekleyin.`);
        } else {
            lastSubmitTime = now;
        }
    });
}

/* ================= YAPAY ZEKA ASİSTANI (MİMAR SELİM BEY) ================= */
const API_KEY = "AIzaSyDnTNuuY_ysPd55hjD2F23rHlCBop3ej7E";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`;

const ybg13BilgiBankasi = `
KURUMSAL KİMLİK:
- İsim: Mimar Selim Bey (YBG13 AI Asistanı).
- Kurucular: Berk Bey (Yazılım Mimarı), Serhat Bey (Tasarım Direktörü).
- Motto: "Geleceği Kodluyoruz."
ÇALIŞMA SAATLERİ:
- Hafta içi: 17:30 - 22:00
- Hafta sonu: 16:00 - 00:00
FİYATLANDIRMA:
1. E-Ticaret Script: 48.000 ₺
2. RPG Oyun Seti: 32.000 ₺
3. Premium Destek: 120.000 ₺
4. Fitness App: 65.000 ₺
İLETİŞİM:
- Müşterileri 'İletişim' sekmesine veya form doldurmaya yönlendir.
`;

window.askAI = async function() {
    const input = document.getElementById('ai-input');
    const container = document.getElementById('chat-messages');
    const sendBtn = document.getElementById('send-btn');
    if(!input || !container) return;
    
    const userText = input.value.trim();
    if (!userText) return;

    container.innerHTML += `
        <div class="flex justify-end mb-4">
            <div class="bg-slate-900 text-white p-4 rounded-2xl rounded-tr-none max-w-[80%] text-sm shadow-md">
                ${userText}
            </div>
        </div>`;
    
    input.value = '';
    container.scrollTop = container.scrollHeight;

    const typingId = 'typing-' + Date.now();
    container.innerHTML += `
        <div id="${typingId}" class="flex gap-2 items-center mb-4 self-start ml-2 text-slate-400 italic text-xs">
            <i class="fas fa-circle-notch animate-spin"></i> Mimar verileri analiz ediyor...
        </div>`;
    
    sendBtn.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ 
                        text: `Senin adın Mimar Selim Bey. YBG13'ün akıllı asistanısın. 
                               Karakterin: Zeki, çözüm odaklı, hafif esprili ama her zaman profesyonel.
                               Dil: SADECE TÜRKÇE.
                               BİLGİ TABANIN: ${ybg13BilgiBankasi}
                               TALİMATLAR:
                               1. Sorulara bilgi tabanındaki verilere dayanarak cevap ver.
                               2. Bilmiyorsan 'Bu konuda Berk veya Serhat Bey en doğru bilgiyi verecektir' de.
                               3. Kısa ve öz cevaplar ver.
                               Kullanıcı: ${userText}` 
                    }]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const aiReply = data.candidates[0].content.parts[0].text;
        document.getElementById(typingId).remove();
        container.innerHTML += `
            <div class="flex gap-3 mb-4 text-left">
                <div class="bg-blue-100 text-blue-800 p-4 rounded-2xl rounded-tl-none max-w-[80%] text-sm shadow-sm border border-blue-200">
                    ${aiReply.replace(/\n/g, '<br>')}
                </div>
            </div>`;
            
    } catch (error) {
        const tId = document.getElementById(typingId);
        if(tId) tId.remove();
        container.innerHTML += `
            <div class="bg-red-50 text-red-600 p-3 rounded-xl text-[10px] border border-red-100 mb-4">
                Bağlantı kesildi: ${error.message}
            </div>`;
    }

    sendBtn.disabled = false;
    container.scrollTop = container.scrollHeight;
}

const aiInput = document.getElementById('ai-input');
if(aiInput) {
    aiInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.askAI();
    });
}

window.calculateTotal = function() {
    const typeEl = document.getElementById('project-type');
    if(!typeEl) return;
    const projectBase = parseInt(typeEl.value) || 0;
    const checkboxes = document.querySelectorAll('#calculator input[type="checkbox"]:checked');
    
    let extras = 0;
    checkboxes.forEach(item => { extras += parseInt(item.value); });
    const total = projectBase + extras;
    const priceDisplay = document.getElementById('total-price');

    if (priceDisplay) {
        priceDisplay.innerText = total === 0 ? "0 ₺" : total.toLocaleString('tr-TR') + " ₺";
    }
}

window.downloadRaw = async function(url, fileName) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Bağlantı hatası');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(link);
    } catch (error) {
        console.error("Dosya indirilemedi:", error);
        window.open(url, '_blank'); 
    }
}

window.toggleCeoContact = function() {
    const info = document.getElementById('ceo-contact-info');
    if(!info) return;
    if (info.classList.contains('hidden')) {
        info.classList.remove('hidden');
        setTimeout(() => { info.classList.add('scale-100', 'opacity-100'); }, 10);
    } else {
        info.classList.remove('scale-100', 'opacity-100');
        setTimeout(() => { info.classList.add('hidden'); }, 500);
    }
}

/* ================= AEGIS ENGINE VE KONTROLLER ================= */
console.log("%c YBG13™ Aegis Engine V1.5 ", "color: white; background: #2563eb; padding: 5px; border-radius: 5px; font-weight: bold;");
console.log("%c Güvenlik Katmanları Aktif Edildi. ", "color: #2563eb; font-weight: bold;");

window.addEventListener('load', () => {
    const loadTime = performance.now() / 1000;
    console.log(`%c Sistem Yükleme Süresi: ${loadTime.toFixed(2)} saniye.`, "color: gray; font-style: italic;");
});

const aegisMeta = {
    owner: "Yusuf Berk Genç",
    brand: "YBG13™",
    engine: "Aegis",
    version: "1.5.0",
    buildDate: "2026-03-10",
    environment: "Production"
};

window.checkEngineStatus = function() {
    return `Aegis Engine ${aegisMeta.version} çalışıyor.`;
}

let idleTimer;
const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        console.log("Sistem Bekleme Modunda (Idle)...");
    }, 30000);
};
document.addEventListener('mousemove', resetTimer);
document.addEventListener('keypress', resetTimer);

onSnapshot(doc(db, "settings", "general"), (docSnap) => {
    if (docSnap.exists()) {
        const set = docSnap.data();

        if (set.maintenance) {
            document.body.innerHTML = `
                <div style="height:100vh; width:100vw; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0b1437; color:white; font-family:sans-serif; text-align:center; position:fixed; top:0; left:0; z-index:999999;">
                    <i class="fas fa-shield-alt" style="font-size:80px; color:#4318FF; margin-bottom:20px;"></i>
                    <h1 style="font-size:3rem; margin:0;">YBG13™</h1>
                    <h2 style="font-size:2rem; color:#a3aed1; margin:10px 0 20px 0;">Şuanda Bakımdayız</h2>
                    <p style="color:#8f9bba; max-width:500px; line-height:1.6;">Sitemizin altyapısında güvenlik güncellemesi yapıyoruz. Sistemler kısa bir süre içinde tekrar devrede olacaktır.</p>
                </div>`;
            return; 
        }

        if (set.ddosProtection) {
            const limit = set.ddosLevel === 'high' ? 2000 : 800;
            const hits = parseInt(localStorage.getItem('ybg_hits') || '0');
            const lastHit = parseInt(localStorage.getItem('ybg_time') || '0');
            const now = Date.now();
            if(now - lastHit < limit) {
                localStorage.setItem('ybg_hits', hits + 1);
                if(hits > 4) {
                    document.body.innerHTML = `<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:red;color:white;font-weight:bold;font-size:24px;">AEGIS KORUMASI: Lütfen Spam Yapmayın!</div>`;
                    setTimeout(() => localStorage.setItem('ybg_hits', 0), 30000); 
                    return;
                }
            } else { localStorage.setItem('ybg_hits', 0); }
            localStorage.setItem('ybg_time', now);
        }

        document.oncontextmenu = set.noRightClick ? (e => e.preventDefault()) : null;

        document.onkeydown = function(e) {
            if(set.noShortcuts && (e.ctrlKey && (e.key === 's' || e.key === 'p' || e.key === 'u'))) e.preventDefault(); 
            if(set.noF12 && (e.keyCode == 123 || (e.ctrlKey && e.shiftKey && e.keyCode == 73))) return false;
        };

        document.body.style.userSelect = set.noCopy ? "none" : "auto";
        document.ondragstart = set.noImageDrag ? (e => e.preventDefault()) : null;

        if(set.noIframe && window.self !== window.top) { window.top.location = window.self.location; }

        if (set.customAnalytics && !sessionStorage.getItem('ybg_logged')) {
            fetch('https://api.ipify.org?format=json').then(r => r.json()).then(data => {
                addDoc(collection(db, "visitor_logs"), { ip: data.ip, ua: navigator.userAgent, time: serverTimestamp() });
                sessionStorage.setItem('ybg_logged', 'true');
            }).catch(e => console.log("Analytics Error"));
        }

        let cursorStyle = document.getElementById('ybg-cursor');
        if(set.customCursor) {
            if(!cursorStyle) { cursorStyle = document.createElement('style'); cursorStyle.id='ybg-cursor'; document.head.appendChild(cursorStyle); }
            cursorStyle.innerHTML = `* { cursor: url('https://cdn-icons-png.flaticon.com/32/709/709682.png'), auto !important; }`;
        } else if(cursorStyle) cursorStyle.remove();

        let selectStyle = document.getElementById('ybg-select');
        if(set.customSelection) {
            if(!selectStyle) { selectStyle = document.createElement('style'); selectStyle.id='ybg-select'; document.head.appendChild(selectStyle); }
            selectStyle.innerHTML = `::selection { background: #4318FF; color: #fff; }`;
        } else if(selectStyle) selectStyle.remove();

        document.documentElement.style.scrollBehavior = set.smoothScroll ? 'smooth' : 'auto';

        if(set.tabTitleChange) {
            let defaultTitle = document.title;
            window.onblur = () => { document.title = "Seni Özledik! | YBG13™"; };
            window.onfocus = () => { document.title = defaultTitle; };
        } else { window.onblur = null; window.onfocus = null; }

        let scrollStyle = document.getElementById('ybg-scroll');
        if(set.hideScrollbar) {
            if(!scrollStyle) { scrollStyle = document.createElement('style'); scrollStyle.id='ybg-scroll'; document.head.appendChild(scrollStyle); }
            scrollStyle.innerHTML = `::-webkit-scrollbar { display: none; }`;
        } else if(scrollStyle) scrollStyle.remove();

        document.body.style.filter = set.grayscaleMode ? "grayscale(100%)" : "none";

        let meta = document.querySelector('meta[name="viewport"]');
        if(set.disableZoom) {
            if(meta) meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        } else {
            if(meta) meta.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }
    
        const existingPopup = document.getElementById('ybg-popup');
        if(set.popupActive && set.popupText) {
            if(!sessionStorage.getItem('ybg_popup_seen')) {
                if(!existingPopup) {
                    const div = document.createElement('div'); div.id = 'ybg-popup';
                    div.style.cssText = "position:fixed; bottom:20px; left:20px; background:#4318FF; color:white; padding:20px 30px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:9999; font-family:sans-serif; font-weight:bold; animation: slideIn 0.5s;";
                    div.innerHTML = `<span style="margin-right:20px;">📢 ${set.popupText}</span> <button onclick="this.parentElement.remove(); sessionStorage.setItem('ybg_popup_seen','true');" style="background:transparent; border:none; color:white; font-size:20px; cursor:pointer;">&times;</button>`;
                    document.body.appendChild(div);
                }
            }
        } else if(existingPopup) existingPopup.remove();
    }
});

/* ================= COMPONENT YÜKLEYİCİ (NAVBAR & FOOTER) ================= */
document.addEventListener("DOMContentLoaded", () => {
    const navbarContainer = document.getElementById("navbar-container");
    if (navbarContainer) {
        fetch("navbar.html")
            .then(response => {
                if (!response.ok) throw new Error("Navbar bulunamadı");
                return response.text();
            })
            .then(data => {
                navbarContainer.innerHTML = data;
            })
            .catch(error => console.error("Navbar yükleme hatası:", error));
    }

    const footerContainer = document.getElementById("footer-container");
    if (footerContainer) {
        fetch("footer.html")
            .then(response => {
                if (!response.ok) throw new Error("Footer bulunamadı");
                return response.text();
            })
            .then(data => {
                footerContainer.innerHTML = data;

                const yearElement = document.getElementById('current-year');
                if(yearElement) {
                    yearElement.textContent = new Date().getFullYear();
                }
            })
            .catch(error => console.error("Footer yükleme hatası:", error));
    }
});