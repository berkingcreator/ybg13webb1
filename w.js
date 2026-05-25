import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOIuErSB-6ml-OGzQ2_cAqWHOMtE4niLo",
  authDomain: "ybg13-a6ab3.firebaseapp.com",
  projectId: "ybg13-a6ab3",
  storageBucket: "ybg13-a6ab3.firebasestorage.app",
  messagingSenderId: "623025176609",
  appId: "1:623025176609:web:c8cdcdc680aff2ab142360",
  measurementId: "G-EZX8GR3ZJR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const isIndexPage = document.getElementById('versions-list');
const isLoginForm = document.getElementById('login-form');
const isDetailPage = document.getElementById('detail-version');

if (isIndexPage) {
    async function loadVersions() {
        try {
            const querySnapshot = await getDocs(collection(db, "kernel_versions"));
            let htmlContent = "";
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                htmlContent += `
                    <div class="version-item">
                        <div>
                            <h3>Sürüm: ${data.version}</h3>
                            <p>Tarih: ${data.date}</p>
                        </div>
                        <a href="kernel_detay.html?id=${doc.id}" class="inspect-btn">Beni İncele</a>
                    </div>
                `;
            });
            isIndexPage.innerHTML = htmlContent || "Henüz sürüm yok.";
        } catch (error) {
            isIndexPage.innerHTML = "Bağlantı hatası.";
        }
    }
    loadVersions();
}

if (isLoginForm) {
    const loginSection = document.getElementById('login-section');
    const panelSection = document.getElementById('panel-section');
    const releaseForm = document.getElementById('release-form');
    const logoutBtn = document.getElementById('logout-btn');
    const loginError = document.getElementById('login-error');
    const statusMsg = document.getElementById('status-message');
    const adminVersionsContainer = document.getElementById('admin-versions-container');
    const submitBtn = document.getElementById('submit-btn');

    let editingId = null;

    async function loadAdminVersions() {
        try {
            const querySnapshot = await getDocs(collection(db, "kernel_versions"));
            let htmlContent = "";
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                htmlContent += `
                    <div class="admin-version-card">
                        <div>
                            <strong>${data.version}</strong> <span style="color: #64748b; font-size:0.9em;">(${data.date})</span>
                        </div>
                        <div class="action-btns">
                            <button class="edit-btn" data-id="${docSnap.id}">Düzenle</button>
                            <button class="delete-btn" data-id="${docSnap.id}">Sil</button>
                        </div>
                    </div>
                `;
            });
            adminVersionsContainer.innerHTML = htmlContent || "Kayıtlı sürüm yok.";

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    if(confirm("Bu sürümü silmek istediğine emin misin?")) {
                        await deleteDoc(doc(db, "kernel_versions", id));
                        loadAdminVersions();
                    }
                });
            });

            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    const docRef = doc(db, "kernel_versions", id);
                    const docSnapInfo = await getDoc(docRef);
                    if (docSnapInfo.exists()) {
                        const data = docSnapInfo.data();
                        document.getElementById('version').value = data.version;
                        document.getElementById('date').value = data.date;
                        document.getElementById('notes').value = data.notes;
                        document.getElementById('code').value = data.code;
                        editingId = id;
                        submitBtn.innerText = "Sürümü Güncelle";
                        window.scrollTo(0, 0);
                    }
                });
            });
        } catch (error) {
            adminVersionsContainer.innerHTML = "Sürümler yüklenirken hata oluştu.";
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginSection.style.display = 'none';
            panelSection.style.display = 'block';
            loadAdminVersions();
        } else {
            loginSection.style.display = 'block';
            panelSection.style.display = 'none';
        }
    });

    isLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const pass = document.getElementById('admin-pass').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            isLoginForm.reset();
            loginError.innerText = "";
        } catch (error) {
            loginError.innerText = "Giriş başarısız: Bilgileri kontrol edin.";
        }
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth);
    });

    releaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const versionStr = document.getElementById('version').value;
        const dateStr = document.getElementById('date').value;
        const notesStr = document.getElementById('notes').value;
        const codeStr = document.getElementById('code').value;

        statusMsg.innerText = "İşlem yapılıyor...";
        statusMsg.style.color = "var(--primary)";

        try {
            if (editingId) {
                const docRef = doc(db, "kernel_versions", editingId);
                await updateDoc(docRef, {
                    version: versionStr,
                    date: dateStr,
                    notes: notesStr,
                    code: codeStr
                });
                statusMsg.innerText = "Sürüm başarıyla güncellendi!";
                submitBtn.innerText = "Sistemi Güncelle / Yayınla";
                editingId = null;
            } else {
                await addDoc(collection(db, "kernel_versions"), {
                    version: versionStr,
                    date: dateStr,
                    notes: notesStr,
                    code: codeStr
                });
                statusMsg.innerText = "Yeni sürüm başarıyla yayınlandı!";
            }
            statusMsg.style.color = "var(--success)";
            releaseForm.reset();
            loadAdminVersions();
        } catch (error) {
            statusMsg.innerText = "Hata: " + error.message;
            statusMsg.style.color = "var(--danger)";
        }
    });
}

if (isDetailPage) {
    async function loadDetail() {
        const urlParams = new URLSearchParams(window.location.search);
        const docId = urlParams.get('id');
        
        if (docId) {
            try {
                const docRef = doc(db, "kernel_versions", docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById('detail-version').innerText = `Sürüm: ${data.version}`;
                    document.getElementById('detail-date').innerText = `Yayın Tarihi: ${data.date}`;
                    document.getElementById('detail-notes').innerText = `Notlar: ${data.notes}`;
                    
                    // Kodu satırlara böl ve her satırı <span> ile sar
                    const codeElement = document.getElementById('detail-code');
                    const lines = data.code.split('\n');
                    let formattedCode = '';
                    
                    lines.forEach(line => {
                        // HTML güvenlik açığı (XSS) oluşmaması ve <> işaretlerinin düzgün görünmesi için escape işlemi
                        const escapedLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        formattedCode += `<span class="code-line">${escapedLine}</span>`;
                    });
                    
                    codeElement.innerHTML = formattedCode;

                    // Kopyalama işlemi için orijinal kodu global window objesine saklayalım
                    window.rawKernelCode = data.code;
                }
            } catch (error) {
                document.getElementById('detail-version').innerText = "Hata oluştu.";
            }
        }
    }
    loadDetail();

    // Kopyalama Butonu İşlevi
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (window.rawKernelCode) {
                navigator.clipboard.writeText(window.rawKernelCode).then(() => {
                    // Kopyalandıktan sonra butonu yeşil yapıp metni değiştir
                    copyBtn.innerText = "Kopyalandı!";
                    copyBtn.classList.add('copied');
                    
                    // 2 saniye sonra butonu eski haline getir
                    setTimeout(() => {
                        copyBtn.innerText = "Kopyala";
                        copyBtn.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('Kopyalama başarısız oldu: ', err);
                });
            }
        });
    }
}if (isDetailPage) {
    async function loadDetail() {
        const urlParams = new URLSearchParams(window.location.search);
        const docId = urlParams.get('id');
        
        if (docId) {
            try {
                const docRef = doc(db, "kernel_versions", docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById('detail-version').innerText = `Sürüm: ${data.version}`;
                    document.getElementById('detail-date').innerText = `Yayın Tarihi: ${data.date}`;
                    document.getElementById('detail-notes').innerText = `Notlar: ${data.notes}`;
                    
                    const codeElement = document.getElementById('detail-code');
                    const lines = data.code.split('\n');
                    let formattedCode = '';
                    
                    lines.forEach(line => {
                        const escapedLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        formattedCode += `<span class="code-line">${escapedLine}</span>`;
                    });
                    
                    codeElement.innerHTML = formattedCode;

                    window.rawKernelCode = data.code;
                }
            } catch (error) {
                document.getElementById('detail-version').innerText = "Hata oluştu.";
            }
        }
    }
    loadDetail();

    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (window.rawKernelCode) {
                navigator.clipboard.writeText(window.rawKernelCode).then(() => {
                    copyBtn.innerText = "Kopyalandı!";
                    copyBtn.classList.add('copied');
                    
                    setTimeout(() => {
                        copyBtn.innerText = "Kopyala";
                        copyBtn.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('Kopyalama başarısız oldu: ', err);
                });
            }
        });
    }
}