// public/js/script.js
import { v4 as uuidV4 } from "uuid";

// ---------------------------------------------
// Global O'zgaruvchilar
// ---------------------------------------------
const socket = io();
const currentPath = window.location.pathname.split("/");
const ROOM_ID = currentPath[currentPath.length - 1];
const MY_ID = sessionStorage.getItem("userId") || uuidV4();
const MY_USERNAME = localStorage.getItem("username") || "Anonim";
sessionStorage.setItem("userId", MY_ID); // userId ni saqlash

let localStream;
const peers = {}; // WebRTC PeerConnection ob'ektlarini saqlash: { userId: RTCPeerConnection }

// STUN server konfiguratsiyasi (WebRTC ulanishlari uchun zarur)
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// DOM Elementlari
const videoGrid = document.getElementById("video-grid");
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const chatForm = document.getElementById("chat-form");
const copyLinkBtn = document.getElementById("copy-link-btn");
const toggleVideoBtn = document.getElementById("toggle-video");
const toggleAudioBtn = document.getElementById("toggle-audio");
const leaveRoomBtn = document.getElementById("leave-room-btn");
const localVideoEl = document.getElementById("local-video");
const localUsernameDisplay = document.getElementById("local-username-display");

// ---------------------------------------------
// Asosiy Funksiyalar
// ---------------------------------------------

/**
 * Foydalanuvchining media (video va audio) ulanishini o'rnatish.
 */
async function setupLocalMedia() {
  localUsernameDisplay.textContent = `${MY_USERNAME} (Siz)`;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideoEl.srcObject = localStream;

    // Socket.io orqali xonaga qo'shilish
    socket.emit("join-room", ROOM_ID, MY_ID, MY_USERNAME);
  } catch (err) {
    console.error("Media ulanishda xato:", err);
    alert(
      "Kamera va mikrofoningizni ulash imkoni bo'lmadi. Ruxsat berganingizga ishonch hosil qiling."
    );
    // Agar media ulanmasa ham xonaga qo'shilishni davom ettirish
    socket.emit("join-room", ROOM_ID, MY_ID, MY_USERNAME);
  }
}

/**
 * Yangi video elementini yaratish va uni video gridga qo'shish.
 * @param {string} userId - Foydalanuvchining ID si
 * @param {MediaStream} stream - Foydalanuvchining media stream'i
 * @param {string} userName - Foydalanuvchining ismi
 */
function addVideoStream(userId, stream, userName) {
  let container = document.getElementById(`video-container-${userId}`);
  if (!container) {
    container = document.createElement("div");
    container.classList.add("video-container");
    container.id = `video-container-${userId}`;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true; // Mobil brauzerlar uchun

    const usernameDisplay = document.createElement("div");
    usernameDisplay.classList.add("video-username");
    usernameDisplay.textContent = userName;

    container.append(video, usernameDisplay);
    videoGrid.append(container);
  } else {
    // Agar konteyner mavjud bo'lsa, faqat streamni yangilash
    const video = container.querySelector("video");
    if (video) video.srcObject = stream;
  }

  updateVideoGridSize();
}

/**
 * Foydalanuvchi uzilganda uning video elementini o'chirish.
 * @param {string} userId - O'chiriladigan foydalanuvchining ID si
 */
function removeVideoStream(userId) {
  const container = document.getElementById(`video-container-${userId}`);
  if (container) {
    container.remove();
    delete peers[userId];
  }
  updateVideoGridSize();
}

/**
 * WebRTC peer ulanishini yaratish.
 * @param {string} userId - Ulanilayotgan foydalanuvchining ID si
 * @param {boolean} initiator - Agar true bo'lsa, offer yuboriladi
 * @param {string} userName - Foydalanuvchining ismi
 */
function createPeerConnection(userId, initiator, userName) {
  const peer = new RTCPeerConnection(configuration);
  peers[userId] = peer;

  // 1. Local stream'ni peer'ga qo'shish
  if (localStream) {
    localStream.getTracks().forEach((track) => {
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
      socket.emit("send-ice-candidate", event.candidate, userId);
    }
  };

  // 4. Ulanish holati o'zgarganda
  peer.oniceconnectionstatechange = () => {
    console.log(
      `WebRTC ulanish holati (${userId}): ${peer.iceConnectionState}`
    );
    if (
      peer.iceConnectionState === "disconnected" ||
      peer.iceConnectionState === "failed"
    ) {
      console.warn(`WebRTC ulanish uzildi: ${userId}`);
      // Qayta ulanish logikasini bu yerga qo'shish mumkin
    }
  };

  // 5. Agar biz initiator bo'lsak, offer yaratish
  if (initiator) {
    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .then(() => {
        socket.emit("send-offer", peer.localDescription, userId);
      })
      .catch((err) => console.error("Offer yaratishda xato:", err));
  }

  return peer;
}

/**
 * Yangi chat xabarini sahifaga qo'shish.
 * @param {object} messageData - Xabar ma'lumotlari
 * @param {boolean} isLocal - Agar true bo'lsa, xabar bizniki
 */
function addChatMessage(messageData, isLocal = false) {
  const messageEl = document.createElement("div");
  messageEl.classList.add("message");
  if (isLocal) {
    messageEl.classList.add("local");
  } else if (messageData.senderId === "SYSTEM") {
    messageEl.classList.add("system");
  } else {
    messageEl.classList.add("remote");
  }

  let content = messageData.text;
  if (messageData.senderId !== "SYSTEM") {
    const senderName = isLocal ? "Siz" : messageData.senderName;
    content = `<strong>${senderName}</strong> <span class="timestamp">${messageData.timestamp}</span><br>${messageData.text}`;
  }

  messageEl.innerHTML = content;
  messagesContainer.appendChild(messageEl);

  // Avtomatik pastga scroll qilish
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Video grid elementlarining soniga qarab CSS classlarini yangilash.
 */
function updateVideoGridSize() {
  const videoCount = videoGrid.childElementCount;
  videoGrid.className = "video-grid"; // Barcha classlarni o'chirish

  // Foydalanuvchi soniga moslashuvchan grid classini qo'shish
  if (videoCount === 1) videoGrid.classList.add("grid-1");
  else if (videoCount === 2) videoGrid.classList.add("grid-2");
  else if (videoCount <= 4) videoGrid.classList.add("grid-4");
  else if (videoCount <= 9) videoGrid.classList.add("grid-9");
  else videoGrid.classList.add("grid-16");
}

// ---------------------------------------------
// Event Listenerlar
// ---------------------------------------------

// Xabar yuborish
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (message) {
    // Chat xabarini serverga yuborish
    socket.emit("chat-message", message);
    messageInput.value = "";
  }
});

// Linkni nusxalash
copyLinkBtn.addEventListener("click", () => {
  const roomLink = window.location.href;
  navigator.clipboard
    .writeText(roomLink)
    .then(() => {
      copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Nusxalandi!';
      setTimeout(
        () =>
          (copyLinkBtn.innerHTML =
            '<i class="fas fa-link"></i> Linkni nusxalash'),
        3000
      );
    })
    .catch((err) => {
      alert("Linkni nusxalashda xato yuz berdi. Iltimos, qo'lda nusxalang.");
    });
});

// Video yoqish/o'chirish
toggleVideoBtn.addEventListener("click", () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    const isEnabled = (videoTrack.enabled = !videoTrack.enabled);
    localVideoEl.classList.toggle("disabled", !isEnabled);
    toggleVideoBtn.classList.toggle("active", isEnabled);
    toggleVideoBtn.innerHTML = isEnabled
      ? '<i class="fas fa-video"></i> Video'
      : '<i class="fas fa-video-slash"></i> Video O\'chirilgan';
  }
});

// Audio yoqish/o'chirish
toggleAudioBtn.addEventListener("click", () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    const isEnabled = (audioTrack.enabled = !audioTrack.enabled);
    toggleAudioBtn.classList.toggle("active", isEnabled);
    toggleAudioBtn.innerHTML = isEnabled
      ? '<i class="fas fa-microphone"></i> Audio'
      : '<i class="fas fa-microphone-slash"></i> Audio O\'chirilgan';
  }
});

// Xonadan chiqish
leaveRoomBtn.addEventListener("click", () => {
  if (confirm("Xonadan chiqishni xohlaysizmi?")) {
    localStream.getTracks().forEach((track) => track.stop());
    socket.disconnect();
    window.location.href = "/"; // Bosh sahifaga qaytarish
  }
});

// ---------------------------------------------
// Socket.io Listenerlar
// ---------------------------------------------

// Server bilan ulanish o'rnatilganda
socket.on("connect", () => {
  console.log("Socket.io serveriga ulanish o'rnatildi.");
  document.getElementById("room-id-display").textContent = ROOM_ID;

  // Foydalanuvchi ismini local video ostida ko'rsatish
  localUsernameDisplay.textContent = `${MY_USERNAME} (Siz)`;

  // Asosiy jarayonni boshlash
  setupLocalMedia();
});

// Serverdan xabar qabul qilish
socket.on("receive-message", (messageData) => {
  const isLocal = messageData.senderId === MY_ID;
  addChatMessage(messageData, isLocal);
});

// Yangi foydalanuvchi xonaga ulanganida (Peer ulanishini boshlash uchun)
socket.on("user-connected", (userId, userName) => {
  console.log(`Yangi foydalanuvchi ulandi: ${userName} (${userId})`);

  // Tizim xabarini qo'shish
  addChatMessage({
    senderId: "SYSTEM",
    text: `**${userName}** xonaga qo'shildi.`,
    timestamp: new Date().toLocaleTimeString(),
  });

  // WebRTC ulanishini boshlash (initiator sifatida)
  createPeerConnection(userId, true, userName);
});

// Xonada mavjud bo'lgan foydalanuvchilar
socket.on("current-users", (users) => {
  console.log("Mavjud foydalanuvchilar:", users);
  users.forEach((user) => {
    // Mavjud foydalanuvchilar bilan WebRTC ulanishini yaratish (initiator emas)
    createPeerConnection(user.id, true, user.name);
  });
});

// Boshqa foydalanuvchi uzilganda
socket.on("user-disconnected", (userId, userName) => {
  console.log(`Foydalanuvchi uzildi: ${userName} (${userId})`);

  // Video va peer ulanishini olib tashlash
  removeVideoStream(userId);

  // Tizim xabarini qo'shish
  addChatMessage({
    senderId: "SYSTEM",
    text: `**${userName}** xonani tark etdi.`,
    timestamp: new Date().toLocaleTimeString(),
  });
});

// ---------------------------------------------
// WebRTC Signalling Listenerlar
// ---------------------------------------------

// Boshqa peer'dan offer qabul qilish
socket.on("receive-offer", (offer, senderId, senderName) => {
  console.log(`Offer qabul qilindi: ${senderName} (${senderId})`);

  // Agar allaqachon peer mavjud bo'lmasa, yaratish
  let peer = peers[senderId];
  if (!peer) {
    peer = createPeerConnection(senderId, false, senderName);
  }

  // Offer'ni o'rnatish va Answer yaratish
  peer
    .setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => peer.createAnswer())
    .then((answer) => peer.setLocalDescription(answer))
    .then(() => {
      // Answer'ni server orqali offer yuborgan peer'ga yuborish
      socket.emit("send-answer", peer.localDescription, senderId);
    })
    .catch((err) => console.error("Answer yaratishda xato:", err));
});

// Boshqa peer'dan answer qabul qilish
socket.on("receive-answer", (answer, senderId) => {
  console.log(`Answer qabul qilindi: ${senderId}`);
  const peer = peers[senderId];
  if (peer) {
    peer
      .setRemoteDescription(new RTCSessionDescription(answer))
      .catch((err) => console.error("Remote Answer o'rnatishda xato:", err));
  }
});

// Boshqa peer'dan ICE nomzodi qabul qilish
socket.on("receive-ice-candidate", (candidate, senderId) => {
  const peer = peers[senderId];
  if (peer && candidate) {
    peer
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch((err) => console.error("ICE nomzodini qo'shishda xato:", err));
  }
});

// Dasturni ishga tushirish (agar room.html bo'lsa)
if (window.location.pathname.length > 1 && window.location.pathname !== "/") {
  // Xonaga kirish
}
