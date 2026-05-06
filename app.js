import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, 
    onSnapshot, serverTimestamp, updateDoc, arrayUnion, arrayRemove, 
    where, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- KONFİGÜRASYON ---
const firebaseConfig = {
  apiKey: "AIzaSyAV-SCX8O43d-nPOg8OXNn7DykuvcuBlWw",
  authDomain: "ysosyal-59b95.firebaseapp.com",
  projectId: "ysosyal-59b95",
  storageBucket: "ysosyal-59b95.firebasestorage.app",
  messagingSenderId: "488506757633",
  appId: "1:488506757633:web:a859e6662ede1145946600"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- GLOBAL DEĞİŞKENLER ---
window.currentUser = null; 
let currentChatUnsubscribe = null;
let inboxUnsubscribe = null;
let isRegisterMode = false;
let activePostIdForComment = null; 
let activeTargetEmail = null; 

const defaultPP = "https://placehold.co/150x150/1da1f2/ffffff?text=U";
const defaultBanner = "https://placehold.co/800x200/c4d3df/ffffff?text=Kapak";

// --- UI ELEMENTLERİ ---
const views = { auth: document.getElementById('auth-view'), app: document.getElementById('app-view') };
const sections = document.querySelectorAll('.content-section');
const navLinks = document.querySelectorAll('.nav-links li');
const modals = document.querySelectorAll('.modal');
const closeBtns = document.querySelectorAll('.close-modal');

// --- GENEL UI FONKSİYONLARI ---
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) views[viewName].classList.add('active');
}

window.openSection = function(targetId) {
    const section = document.getElementById(targetId);
    if (!section) return;

    sections.forEach(s => s.classList.remove('active'));
    section.classList.add('active');

    navLinks.forEach(l => l.classList.remove('active'));
    const navLink = document.querySelector(`[data-target="${targetId}"]`);
    if (navLink) navLink.classList.add('active');
};

// --- MOBİL NAVBAR & SIDEBAR ---
const hamburger = document.getElementById('hamburger-btn');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebar-overlay');

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}

if(hamburger) hamburger.addEventListener('click', toggleSidebar);
if(overlay) overlay.addEventListener('click', toggleSidebar);

// --- EVENT LISTENERS (GENEL) ---
navLinks.forEach(link => { 
    link.addEventListener('click', () => {
        openSection(link.dataset.target);
        if(window.innerWidth <= 768) toggleSidebar();
    }); 
});

closeBtns.forEach(btn => { 
    btn.addEventListener('click', () => modals.forEach(m => m.style.display = 'none')); 
});

// --- AUTH MANTIK ---
document.getElementById('toggle-auth').addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('auth-title').textContent = isRegisterMode ? "Hesap Oluştur" : "Giriş Yap";
    document.getElementById('auth-btn').textContent = isRegisterMode ? "Kayıt Ol" : "Devam Et";
    document.getElementById('toggle-auth').textContent = isRegisterMode ? "Zaten hesabın var mı? Giriş Yap" : "Yeni Hesap Oluştur";
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.toLowerCase().trim();
    const password = document.getElementById('auth-password').value;
    const errorMsg = document.getElementById('auth-error');
    
    try {
        if (isRegisterMode) {
            const userDoc = await getDoc(doc(db, "users", email));
            if(userDoc.exists()) return errorMsg.textContent = "Bu e-posta adresi zaten kayıtlı!";
            
            await setDoc(doc(db, "users", email), {
                email: email, password: password, username: email.split('@')[0], 
                bio: "Merhaba, YSosyal'dayım!", pp: defaultPP, banner: defaultBanner, 
                searchUsername: email.split('@')[0].toLowerCase()
            });
            alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
            document.getElementById('toggle-auth').click();
        } else {
            const userDoc = await getDoc(doc(db, "users", email));
            if (userDoc.exists() && userDoc.data().password === password) {
                window.currentUser = userDoc.data(); 
                showView('app');
                loadMyProfile();
                loadFeed();
                window.loadInbox();
            } else {
                errorMsg.textContent = "Hatalı E-Posta veya Şifre girdiniz!";
            }
        }
    } catch (error) { errorMsg.textContent = "Hata: " + error.message; }
});

document.getElementById('logout-btn').addEventListener('click', () => window.location.reload());

// --- GÖRSEL İŞLEMLER ---
async function compressImage(file, isBanner = false) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.getElementById('compression-canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = isBanner ? 1000 : 800;
                let width = img.width, height = img.height;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.4)); 
            };
        };
    });
}

// --- PROFİL YÖNETİMİ ---
async function loadMyProfile() {
    const email = window.currentUser.email;
    const docSnap = await getDoc(doc(db, "users", email));
    
    
    if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('my-username').value = data.username;
        document.getElementById('my-bio').value = data.bio || '';
        document.getElementById('my-pp-img').src = data.pp || defaultPP;
        document.getElementById('my-banner-img').src = data.banner || defaultBanner;

        // --- Kendi Takipçi Sayılarımızı Çek ---
        const counts = await getFollowCounts(email);
        const statsDiv = document.getElementById('my-stats');
        if (statsDiv) {
            statsDiv.innerHTML = `
                <div onclick="showUserList('${email}', 'followers')" style="cursor:pointer">
                    <strong>${counts.followers}</strong> Takipçi
                </div>
                <div onclick="showUserList('${email}', 'following')" style="cursor:pointer">
                    <strong>${counts.following}</strong> Takip Edilen
                </div>
            `;
            
        }
    }
    
    }


document.getElementById('upload-pp').addEventListener('change', async (e) => {
    if(!e.target.files[0]) return;
    const base64 = await compressImage(e.target.files[0]);
    document.getElementById('my-pp-img').src = base64;
    await updateDoc(doc(db, "users", window.currentUser.email), { pp: base64 });
});

document.getElementById('upload-banner').addEventListener('change', async (e) => {
    if(!e.target.files[0]) return;
    const base64 = await compressImage(e.target.files[0], true);
    document.getElementById('my-banner-img').src = base64;
    await updateDoc(doc(db, "users", window.currentUser.email), { banner: base64 });
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const username = document.getElementById('my-username').value;
    const bio = document.getElementById('my-bio').value;
    await updateDoc(doc(db, "users", window.currentUser.email), { username, bio, searchUsername: username.toLowerCase() });
    alert("Profil Kaydedildi.");
});

// --- AKIŞ (FEED) VE POSTLAR ---
function buildPostHTML(post) {
    const isLiked = post.likes && post.likes.includes(window.currentUser.email);
    const deleteBtnHTML = post.ownerEmail === window.currentUser.email ? `<i class="fas fa-trash delete-btn" title="Sil" onclick="deletePost('${post.id}')"></i>` : '';
    
    return `
        <div class="post-card">
            ${deleteBtnHTML}
            <div class="post-header" onclick="openUserProfile('${post.ownerEmail}')">
                <img src="${post.userPP || defaultPP}">
                <div>
                    <div class="post-author">${post.username}</div>
                    <div class="post-date">${post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Şimdi'}</div>
                </div>
            </div>
            <div class="post-text" onclick="openPostDetail('${post.id}')">${post.text}</div>
            ${post.image ? `<img src="${post.image}" class="post-img-content" onclick="openPostDetail('${post.id}')">` : ''}
            <div class="post-interactions">
                <div class="interaction-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post.id}', ${isLiked})">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${post.likes ? post.likes.length : 0}
                </div>
                <div class="interaction-btn" onclick="openPostDetail('${post.id}')">
                    <i class="far fa-comment"></i> Yorum
                </div>
            </div>
        </div>
    `;
}

function loadFeed() {
    const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const feed = document.getElementById('feed-container');
        feed.innerHTML = '';
        snapshot.forEach(docSnap => {
            const post = { id: docSnap.id, ...docSnap.data() };
            feed.innerHTML += buildPostHTML(post);
        });
    });
}

document.getElementById('share-post-btn').addEventListener('click', async () => {
    const text = document.getElementById('post-text').value;
    const file = document.getElementById('post-image').files[0];
    if(!text && !file) return;

    let imgBase64 = null;
    if(file) imgBase64 = await compressImage(file);

    const u = window.currentUser;
    await addDoc(collection(db, "posts"), {
        ownerEmail: u.email,
        username: u.username,
        userPP: u.pp || defaultPP,
        text: text,
        image: imgBase64,
        likes: [],
        timestamp: serverTimestamp()
    });
    document.getElementById('post-text').value = '';
    document.getElementById('post-image').value = '';
});

window.deletePost = async (postId) => {
    if(confirm("Gönderiyi silmek istiyor musunuz?")) {
        await deleteDoc(doc(db, "posts", postId));
        document.getElementById('post-modal').style.display = 'none';
    }
};

window.toggleLike = async (postId, isLiked) => {
    const postRef = doc(db, "posts", postId);
    if(isLiked) await updateDoc(postRef, { likes: arrayRemove(window.currentUser.email) });
    else await updateDoc(postRef, { likes: arrayUnion(window.currentUser.email) });
};

// --- YORUMLAR ---
window.openPostDetail = async (postId) => {
    activePostIdForComment = postId;
    document.getElementById('post-modal').style.display = 'flex';
    
    const postSnap = await getDoc(doc(db, "posts", postId));
    const post = postSnap.data();
    const isLiked = post.likes && post.likes.includes(window.currentUser.email);

    document.getElementById('post-detail-body').innerHTML = `
        <div class="post-header">
            <img src="${post.userPP || defaultPP}">
            <div class="post-author">${post.username}</div>
        </div>
        <div class="post-text" style="font-size:1.2rem; margin:15px 0;">${post.text}</div>
        ${post.image ? `<img src="${post.image}" class="post-img-content">` : ''}
    `;

    const q = query(collection(db, `posts/${postId}/comments`), orderBy("timestamp", "asc"));
    onSnapshot(q, (snap) => {
        const container = document.getElementById('comments-container');
        container.innerHTML = '';
        snap.forEach(c => {
            const comment = { id: c.id, ...c.data() };
            const delHtml = comment.ownerEmail === window.currentUser.email ? `<i class="fas fa-times" onclick="deleteComment('${comment.id}')"></i>` : '';
            container.innerHTML += `
                <div class="comment-row">
                    <img src="${comment.userPP || defaultPP}">
                    <div class="comment-content">
                        <strong>${comment.username}</strong>: ${comment.text} ${delHtml}
                    </div>
                </div>`;
        });
    });
};

document.getElementById('send-comment-btn').addEventListener('click', async () => {
    const text = document.getElementById('comment-input').value;
    if(!text || !activePostIdForComment) return;
    const u = window.currentUser;

    await addDoc(collection(db, `posts/${activePostIdForComment}/comments`), {
        ownerEmail: u.email, username: u.username, userPP: u.pp || defaultPP,
        text: text, timestamp: serverTimestamp()
    });
    document.getElementById('comment-input').value = '';
});

window.deleteComment = async (commentId) => {
    if(confirm("Yorumu sil?")) await deleteDoc(doc(db, `posts/${activePostIdForComment}/comments`, commentId));
};

// --- TAKİP VE PROFİL DETAY ---
async function toggleFollow(targetEmail) {
    const myEmail = window.currentUser.email;
    const followId = `${myEmail}_${targetEmail}`;
    const followRef = doc(db, "follows", followId);
    const followSnap = await getDoc(followRef);

    if (followSnap.exists()) {
        await deleteDoc(followRef);
        return false; 
    } else {
        await setDoc(followRef, { follower: myEmail, following: targetEmail, timestamp: serverTimestamp() });
        return true; 
    }
}

async function getFollowCounts(email) {
    const fers = await getDocs(query(collection(db, "follows"), where("following", "==", email)));
    const fing = await getDocs(query(collection(db, "follows"), where("follower", "==", email)));
    return { followers: fers.size, following: fing.size };
}

window.openUserProfile = async (targetEmail) => {
    const snap = await getDoc(doc(db, "users", targetEmail));
    if(!snap.exists()) return;
    const data = snap.data();

    openSection('user-detail-section');
    
    document.getElementById('detail-banner').src = data.banner || defaultBanner;
    document.getElementById('detail-pp').src = data.pp || defaultPP;
    document.getElementById('detail-username').textContent = data.username;
    document.getElementById('detail-header-name').textContent = data.username;
    document.getElementById('detail-bio').textContent = data.bio || "Biyografi yok.";

    const counts = await getFollowCounts(targetEmail);
    document.getElementById('detail-followers-count').innerHTML = `<strong onclick="showUserList('${targetEmail}', 'followers')">${counts.followers}</strong> Takipçi`;
    document.getElementById('detail-following-count').innerHTML = `<strong onclick="showUserList('${targetEmail}', 'following')">${counts.following}</strong> Takip Edilen`;

    const followBtn = document.getElementById('detail-follow-btn');
    const isFollowing = (await getDoc(doc(db, "follows", `${window.currentUser.email}_${targetEmail}`))).exists();
    
    followBtn.textContent = isFollowing ? "Takibi Bırak" : "Takip Et";
    followBtn.className = isFollowing ? "btn-primary outline" : "btn-primary";
    followBtn.onclick = async () => {
        await toggleFollow(targetEmail);
        openUserProfile(targetEmail);
    };
    
    document.getElementById('detail-dm-btn').onclick = () => startDM(targetEmail, data.username);
};

// --- ARAMA / KEŞFET ---
document.getElementById('search-input').addEventListener('input', async (e) => {
    const val = e.target.value.toLowerCase().trim();
    const res = document.getElementById('search-results');
    res.innerHTML = '';
    if(val.length < 2) return;

    const q = query(collection(db, "users"), where("searchUsername", ">=", val), where("searchUsername", "<=", val + '\uf8ff'));
    const snaps = await getDocs(q);
    
    snaps.forEach(docSnap => {
        const u = docSnap.data();
        if(u.email === window.currentUser.email) return;
        
        const div = document.createElement('div');
        div.className = 'user-row-card';
        div.innerHTML = `
            <div class="user-info">
                <img src="${u.pp || defaultPP}">
                <div><strong>${u.username}</strong><p>${u.bio || ''}</p></div>
            </div>
            <div class="user-actions">
                <button onclick="openUserProfile('${u.email}')">Gör</button>
                <button onclick="startDM('${u.email}', '${u.username}')"><i class="fas fa-envelope"></i></button>
            </div>`;
        res.appendChild(div);
    });
});

// --- DM SİSTEMİ ---
function getSecretKey(e1, e2) { return [e1, e2].sort().join('_') + "_YBG"; }
function encryptMsg(text, key) { return CryptoJS.AES.encrypt(text, key).toString(); }
function decryptMsg(cipher, key) {
    try { return CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8); } 
    catch { return "[Şifreli Mesaj]"; }
}

window.loadInbox = function() {
    if(inboxUnsubscribe) inboxUnsubscribe();
    const q = query(collection(db, "chats"), where("participants", "array-contains", window.currentUser.email), orderBy("timestamp", "desc"));
    
    inboxUnsubscribe = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('dm-inbox-list');
        list.innerHTML = snapshot.empty ? '<div class="empty-state">Mesaj yok.</div>' : '';
        
        snapshot.forEach(async (docSnap) => {
            const data = docSnap.data();
            const other = data.participants.find(e => e !== window.currentUser.email);
            const uSnap = await getDoc(doc(db, "users", other));
            const u = uSnap.exists() ? uSnap.data() : { username: "Bilinmeyen", pp: defaultPP };
            const last = decryptMsg(data.lastMessage, getSecretKey(window.currentUser.email, other));

            const div = document.createElement('div');
            div.className = 'inbox-item';
            div.innerHTML = `<img src="${u.pp}"><div class="inbox-item-details"><strong>${u.username}</strong><p>${last}</p></div>`;
            div.onclick = () => startDM(other, u.username);
            list.appendChild(div);
        });
    });
};

window.startDM = async function(targetEmail, targetUsername) {
    openSection('dm-section');
    activeTargetEmail = targetEmail;
    document.getElementById('no-chat-msg').style.display = 'none';
    document.getElementById('chat-wrapper').style.display = 'flex';

    const uSnap = await getDoc(doc(db, "users", targetEmail));
    const uData = uSnap.data();
    document.getElementById('chat-user-info').innerHTML = `
        <div class="chat-profile-trigger" onclick="openUserProfile('${targetEmail}')">
            <img src="${uData.pp || defaultPP}"> <strong>${targetUsername}</strong>
        </div>`;

    const chatId = [window.currentUser.email, targetEmail].sort().join('_');
    const key = getSecretKey(window.currentUser.email, targetEmail);
    const chatBox = document.getElementById('chat-box');

    if(currentChatUnsubscribe) currentChatUnsubscribe();
    currentChatUnsubscribe = onSnapshot(query(collection(db, `chats/${chatId}/messages`), orderBy("timestamp", "asc")), (snap) => {
        chatBox.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            chatBox.innerHTML += `<div class="msg ${m.senderEmail === window.currentUser.email ? 'sent' : 'received'}">${decryptMsg(m.text, key)}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
};

document.getElementById('send-msg-btn').addEventListener('click', async () => {
    const input = document.getElementById('chat-input');
    if(!input.value.trim() || !activeTargetEmail) return;

    const chatId = [window.currentUser.email, activeTargetEmail].sort().join('_');
    const encrypted = encryptMsg(input.value.trim(), getSecretKey(window.currentUser.email, activeTargetEmail));

    await addDoc(collection(db, `chats/${chatId}/messages`), {
        senderEmail: window.currentUser.email, text: encrypted, timestamp: serverTimestamp()
    });
    await setDoc(doc(db, "chats", chatId), {
        participants: [window.currentUser.email, activeTargetEmail],
        lastMessage: encrypted, timestamp: serverTimestamp()
    }, { merge: true });
    input.value = '';
});

document.getElementById('close-chat-btn').addEventListener('click', () => {
    document.getElementById('chat-wrapper').style.display = 'none';
    document.getElementById('no-chat-msg').style.display = 'flex';
    if(currentChatUnsubscribe) currentChatUnsubscribe();
});

// --- LİSTE MODALI (TAKİPÇİLER) ---
window.showUserList = async (email, type) => {
    document.getElementById('list-modal-title').textContent = type === 'followers' ? "Takipçiler" : "Takip Edilenler";
    const container = document.getElementById('list-modal-body');
    container.innerHTML = 'Yükleniyor...';
    document.getElementById('list-modal').style.display = 'flex';

    const field = type === 'followers' ? "following" : "follower";
    const targetField = type === 'followers' ? "follower" : "following";
    const snap = await getDocs(query(collection(db, "follows"), where(field, "==", email)));
    
    container.innerHTML = snap.empty ? 'Kimse yok.' : '';
    for (const d of snap.docs) {
        const uSnap = await getDoc(doc(db, "users", d.data()[targetField]));
        if(uSnap.exists()) {
            const u = uSnap.data();
            const div = document.createElement('div');
            div.className = 'user-row';
            div.innerHTML = `<img src="${u.pp || defaultPP}"> <strong>${u.username}</strong>`;
            div.onclick = () => { document.getElementById('list-modal').style.display = 'none'; openUserProfile(u.email); };
            container.appendChild(div);
        }
    }
};

window.openUserProfile = async (targetEmail) => {
    try {
        if (!targetEmail) return;
        
        const snap = await getDoc(doc(db, "users", targetEmail));
        if (!snap.exists()) {
            alert("Kullanıcı bulunamadı!");
            return;
        }
        
        const data = snap.data();
        
        // Bölümü aç
        openSection('user-detail-section');

        // Elementler mevcut mu kontrol et ve değerleri ata
        const elements = {
            'detail-banner': data.banner || defaultBanner,
            'detail-pp': data.pp || defaultPP,
            'detail-username': data.username,
            'detail-header-name': data.username,
            'detail-bio': data.bio || "Biyografi yok."
        };

        // Resim ve metinleri güvenli bir şekilde güncelle
        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                if (el.tagName === 'IMG') el.src = value;
                else el.textContent = value;
            }
        }

        // Takipçi sayılarını çek ve GÜVENLİCE yazdır
        const counts = await getFollowCounts(targetEmail);
        
        const followersEl = document.getElementById('detail-followers-count');
        const followingEl = document.getElementById('detail-following-count');

        if (followersEl) {
            followersEl.innerHTML = `<strong onclick="showUserList('${targetEmail}', 'followers')" style="cursor:pointer">${counts.followers}</strong> Takipçi`;
        }
        
        if (followingEl) {
            followingEl.innerHTML = `<strong onclick="showUserList('${targetEmail}', 'following')" style="cursor:pointer">${counts.following}</strong> Takip Edilen`;
        }

        // Takip Butonu Güncelleme
        const followBtn = document.getElementById('detail-follow-btn');
        if (followBtn) {
            const isFollowing = (await getDoc(doc(db, "follows", `${window.currentUser.email}_${targetEmail}`))).exists();
            followBtn.textContent = isFollowing ? "Takibi Bırak" : "Takip Et";
            followBtn.className = isFollowing ? "btn-primary outline" : "btn-primary";
            followBtn.onclick = async () => {
                await toggleFollow(targetEmail);
                openUserProfile(targetEmail); // Yenile
            };
        }

    } catch (error) {
        console.error("Profil açılırken hata oluştu:", error);
    };
};