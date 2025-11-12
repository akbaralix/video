// public/js/script.js
import { v4 as uuidV4 } from 'uuid';

// ---------------------------------------------
// Global O'zgaruvchilar
// ---------------------------------------------
const socket = io();
const currentPath = window.location.pathname.split('/');
const ROOM_ID = currentPath[currentPath.length - 1];
// Foydalanuvchi ID ni Session yoki yangi UUID dan olish
const MY_ID = sessionStorage.getItem('userId') || uuidV4();
const MY_USERNAME = localStorage.getItem('username') || "Anonim";
sessionStorage.setItem('userId', MY_ID); 

let localStream;
const peers = {}; // WebRTC PeerConnection ob'ektlarini saqlash: { userId: RTCPeerConnection }

// STUN/TURN server konfiguratsiyasi (Ulanish imkoniyatini oshiradi)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Qo'shimcha STUN serverlar, ko'pincha bu yetarli
        { urls: 'stun:global.stun.twilio.com:3478' } 
    ]
};

// DOM Elementlari
const videoGrid = document.getElementById('video-grid');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const chatForm = document.getElementById('chat-form');
const copyLinkBtn = document.getElementById('copy-link-btn');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const localVideoEl = document.getElementById('local-video');
const localUsernameDisplay = document.getElementById('local-username-display');


// ---------------------------------------------
// Asosiy Funksiyalar
// ---------------------------------------------

/**
 * Tizim xabarini chatga qo'shish.
 */
function addSystemMessage(text) {
    addChatMessage({
        senderId: 'SYSTEM',
        text: text,
        timestamp: new Date().toLocaleTimeString()
    });
}

/**
 * Foydalanuvchining media (video va audio) ulanishini o'rnatish.
 */
async function setupLocalMedia() {
    localUsernameDisplay.textContent = `${MY_USERNAME} (Siz)`;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoEl.srcObject = localStream;
        
        // Agar stream muvaffaqiyatli ulansa, xonaga qo'shilish
        socket.emit('join-room', ROOM_ID, MY_ID, MY_USERNAME);
        
    } catch (err) {
        console.error('Media ulanishda xato:', err);
        addSystemMessage('⚠️ Kamera va mikrofoningizni ulash imkoni bo\'lmadi. Ruxsat berganingizga ishonch hosil qiling.');
        
        // Agar media ulanmasa ham xonaga qo'shilishni davom ettirish (faqat chat uchun)
        if (!localStream) {
             socket.emit('join-room', ROOM_ID, MY_ID, MY_USERNAME);
        }
    }
}

/**
 * WebRTC peer ulanishini yaratish.
 * @param {string} userId - Ulanilayotgan foydalanuvchining ID si
 * @param {string} userName - Foydalanuvchining ismi
 */
function createPeerConnection(userId, userName) {
    const peer = new RTCPeerConnection(configuration);
    peers[userId] = peer;

    // 1. Local stream'ni peer'ga qo'shish
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    }

    // 2. Peer boshqa peer'dan media stream'ni qabul qilganda
    peer.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            addVideoStream(userId, event.streams[0], userName);
        }
    };
    
    // 3. ICE nomzodlarini to'plash va signal server orqali yuborish
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('send-ice-candidate', event.candidate, userId);
        }
    };

    // 4. Ulanish holati o'zgarganda (debugging uchun muhim)
    peer.oniceconnectionstatechange = () => {
        console.log(`WebRTC ulanish holati (${userName} / ${userId}): ${peer.iceConnectionState}`);
        if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
            console.warn(`WebRTC ulanish uzildi: ${userName}`);
            // removeVideoStream(userId); // Ehtiyotkorlik bilan ishlatish
        }
    };
    
    // 5. SDP (Session Description Protocol) almashinuvi kerakligini bildirish
    peer.onnegotiationneeded = async () => {
        console.log(`Negotiation needed for ${userName}. Initiating Offer.`);
        try {
            // Offer yaratish (faqat bir tomon yaratishi kerak)
            await peer.setLocalDescription(await peer.createOffer());
            // Offer'ni server orqali yuborish
            socket.emit('send-offer', peer.localDescription, userId);
        } catch (err) {
            console.error('Offer yaratishda yoki yuborishda xato:', err);
        }
    };
    
    return peer;
}

/**
 * SDP Offer'ni qabul qilish va Answer bilan javob berish.
 * @param {RTCSessionDescriptionInit} offer - Qabul qilingan offer
 * @param {string} senderId - Offer yuboruvchi ID
 * @param {string} senderName - Offer yuboruvchi ismi
 */
async function handleReceiveOffer(offer, senderId, senderName) {
    let peer = peers[senderId];
    if (!peer) {
        // Agar peer mavjud bo'lmasa, uni yaratish
        peer = createPeerConnection(senderId, senderName);
    }
    
    try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Answer yaratish
        await peer.setLocalDescription(await peer.createAnswer());
        
        // Answer'ni server orqali yuborish
        socket.emit('send-answer', peer.localDescription, senderId);
        
    } catch (err) {
        console.error('Offer/Answer jarayonida xato:', err);
    }
}

/**
 * SDP Answer'ni qabul qilish.
 * @param {RTCSessionDescriptionInit} answer - Qabul qilingan answer
 * @param {string} senderId - Answer yuboruvchi ID
 */
async function handleReceiveAnswer(answer, senderId) {
    const peer = peers[senderId];
    if (peer) {
        try {
             await peer.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
             console.error('Remote Answer o\'rnatishda xato:', err);
        }
    }
}

// Qolgan funksiyalar (addVideoStream, removeVideoStream, addChatMessage, updateVideoGridSize) avvalgi kabi qoladi.
// ... (Avvalgi script.js dagi funksiyalarni bu yerga qo'shing) ...
// Shuningdek, Event Listenerlar ham avvalgi kabi qoladi.
// ... (Avvalgi script.js dagi Event Listenerlar va Socket.io listenerlarni bu yerga qo'shing) ...

// ********** Qayta yozilgan Socket.io Listenerlar **********

// Server bilan ulanish o'rnatilganda
socket.on('connect', () => {
    console.log('Socket.io serveriga ulanish o\'rnatildi.');
    document.getElementById('room-id-display').textContent = ROOM_ID;
    
    // Asosiy jarayonni boshlash
    setupLocalMedia();
});

// Yangi foydalanuvchi xonaga ulanganida (yangi kelgan peer'ga Offer yuborish uchun)
socket.on('user-connected', (userId, userName) => {
    console.log(`Yangi foydalanuvchi ulandi: ${userName} (${userId}). Ulanishni boshlayman.`);
    
    addSystemMessage(`**${userName}** xonaga qo'shildi.`);

    // Peer ulanishini yaratish. onnegotiationneeded orqali Offer yuboriladi.
    createPeerConnection(userId, userName);
    // Peer yaratilgandan so'ng onnegotiationneeded eventining ishlashini kutish
});

// Xonada mavjud bo'lgan foydalanuvchilar (ularga ham offer yuborish kerak)
socket.on('current-users', (users) => {
    console.log('Mavjud foydalanuvchilar:', users);
    users.forEach(user => {
        // Mavjud foydalanuvchilar bilan WebRTC ulanishini yaratish.
        // Bu ham onnegotiationneeded orqali Offer yuboradi.
        createPeerConnection(user.id, user.name);
    });
});

// Boshqa foydalanuvchi uzilganda
socket.on('user-disconnected', (userId, userName) => {
    console.log(`Foydalanuvchi uzildi: ${userName} (${userId})`);
    
    removeVideoStream(userId);
    addSystemMessage(`**${userName}** xonani tark etdi.`);
});

// ---------------------------------------------
// WebRTC Signalling Listenerlar
// ---------------------------------------------

// Boshqa peer'dan offer qabul qilish
socket.on('receive-offer', (offer, senderId, senderName) => {
    console.log(`Offer qabul qilindi: ${senderName} (${senderId}). Answer bilan javob beraman.`);
    handleReceiveOffer(offer, senderId, senderName);
});

// Boshqa peer'dan answer qabul qilish
socket.on('receive-answer', (answer, senderId) => {
    console.log(`Answer qabul qilindi: ${senderId}`);
    handleReceiveAnswer(answer, senderId);
});

// Boshqa peer'dan ICE nomzodi qabul qilish
socket.on('receive-ice-candidate', (candidate, senderId) => {
    const peer = peers[senderId];
    if (peer && candidate) {
        peer.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(err => console.error('ICE nomzodini qo\'shishda xato:', err));
    }
});


// Dasturni ishga tushirish (agar room.html bo'lsa)
if (window.location.pathname.length > 1 && window.location.pathname !== '/') {
    // Xonaga kirish
}

// ********** AVVALGI FUNKSIYALARNING TO'LIQ BLOKINI SHU YERGA QO'SHISH KERAK **********
// (Avvalgi javobingizdagi to'liq script.js tarkibini bu yerdagi o'zgarishlar bilan birlashtiring)
// ...
// Yuqoridagi to'g'irlangan blokni avvalgi `script.js` ning qolgan qismi (DOM manipulyatsiyasi va Chat mantig'i) bilan to'liq almashtirish lozim.
