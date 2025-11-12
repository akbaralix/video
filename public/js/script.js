// public/js/script.js
import { v4 as uuidV4 } from "uuid";

// ---------------------------------------------
// Global Konfiguratsiya
// ---------------------------------------------
const socket = io();
const ROOM_ID = window.location.pathname.split("/").pop();
const MY_ID = sessionStorage.getItem("userId") || uuidV4();
const MY_USERNAME = localStorage.getItem("username") || "Anonim";
sessionStorage.setItem("userId", MY_ID);

let localStream;
const peers = {}; // { userId: RTCPeerConnection }

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

// DOM Elementlar
const videoGrid = document.getElementById("video-grid");
const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const localVideoEl = document.getElementById("local-video");
const localUsernameDisplay = document.getElementById("local-username-display");
const toggleVideoBtn = document.getElementById("toggle-video");
const toggleAudioBtn = document.getElementById("toggle-audio");

// ---------------------------------------------
// Asosiy Funksiyalar
// ---------------------------------------------

/** Tizim xabarini chatga qo'shish */
function addSystemMessage(text) {
  addChatMessage({
    senderId: "SYSTEM",
    text: text,
    timestamp: new Date().toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
}

/** Local media (kamera/mikrofon) ni olish */
async function setupLocalMedia() {
  localUsernameDisplay.textContent = `${MY_USERNAME} (Siz)`;
  document.getElementById("room-id-display").textContent =
    ROOM_ID.substring(0, 8) + "...";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideoEl.srcObject = localStream;
    localVideoEl.addEventListener("loadedmetadata", () => localVideoEl.play());

    // Muvaffaqiyatli ulansa, xonaga qo'shilish
    socket.emit("join-room", ROOM_ID, MY_ID, MY_USERNAME);
  } catch (err) {
    console.error("Media ulanishda xato:", err);
    addSystemMessage(
      "⚠️ Kamera/mikrofonga ulanishda xato. Ruxsat berilganini tekshiring."
    );
    // Media bo'lmasa ham chat uchun ulanish
    socket.emit("join-room", ROOM_ID, MY_ID, MY_USERNAME);

    // Kontrol tugmalarini o'chirish
    toggleVideoBtn.disabled = true;
    toggleAudioBtn.disabled = true;
    document.getElementById("local-video-status").textContent = "Kamera yo'q";
    document.getElementById("local-video-container").classList.add("no-stream");
  }
}

/** Yangi video elementini yaratish va gridga qo'shish */
function addVideoStream(userId, stream, userName) {
  let container = document.getElementById(`video-container-${userId}`);
  if (!container) {
    container = document.createElement("div");
    container.classList.add("video-container");
    container.id = `video-container-${userId}`;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;

    const usernameDisplay = document.createElement("div");
    usernameDisplay.classList.add("video-username");
    usernameDisplay.textContent = userName;

    container.append(video, usernameDisplay);
    videoGrid.append(container);
  } else {
    const video = container.querySelector("video");
    if (video) video.srcObject = stream;
  }

  updateVideoGridSize();
}

/** Video grid elementlarining soniga qarab CSS classlarini yangilash */
function updateVideoGridSize() {
  // Local video + remote video soni
  const videoCount = videoGrid.childElementCount;

  videoGrid.className = "video-grid";

  if (videoCount === 1) videoGrid.classList.add("grid-1");
  else if (videoCount === 2) videoGrid.classList.add("grid-2");
  else if (videoCount <= 4) videoGrid.classList.add("grid-4");
  else if (videoCount <= 9) videoGrid.classList.add("grid-9");
  else videoGrid.classList.add("grid-16");
}

/** WebRTC peer ulanishini yaratish */
function createPeerConnection(userId, userName) {
  const peer = new RTCPeerConnection(configuration);
  peers[userId] = peer;

  // Local stream'ni qo'shish
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });
  }

  // Remote stream qabul qilinganda
  peer.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      addVideoStream(userId, event.streams[0], userName);
    }
  };

  // ICE nomzodlarini almashish
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("send-ice-candidate", event.candidate, userId);
    }
  };

  // Offer yaratish kerak bo'lganda (PeerConnection avtomatik chaqiradi)
  peer.onnegotiationneeded = async () => {
    try {
      await peer.setLocalDescription(await peer.createOffer());
      socket.emit("send-offer", peer.localDescription, userId);
    } catch (err) {
      console.error(`Offer yuborishda xato: ${userId}`, err);
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log(`WebRTC holati (${userName}): ${peer.iceConnectionState}`);
    if (peer.iceConnectionState === "failed") {
      peer.restartIce(); // Ulanishni qayta urinish
    }
  };

  return peer;
}

/** Offer qabul qilish va Answer bilan javob berish */
async function handleReceiveOffer(offer, senderId, senderName) {
  let peer = peers[senderId];
  if (!peer) {
    peer = createPeerConnection(senderId, senderName);
  }

  try {
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    await peer.setLocalDescription(await peer.createAnswer());
    socket.emit("send-answer", peer.localDescription, senderId);
  } catch (err) {
    console.error("Offer/Answer jarayonida xato:", err);
  }
}

/** Yangi chat xabarini sahifaga qo'shish */
function addChatMessage(messageData, isLocal = false) {
  const messageEl = document.createElement("div");
  messageEl.classList.add("message");

  if (messageData.senderId === "SYSTEM") {
    messageEl.classList.add("system");
    messageEl.innerHTML = `<span>${messageData.text}</span>`;
  } else {
    messageEl.classList.add(isLocal ? "local" : "remote");
    const senderName = isLocal ? "Siz" : messageData.senderName;
    messageEl.innerHTML = `
            <strong>${senderName}</strong> <span class="timestamp">${messageData.timestamp}</span>
            <p>${messageData.text}</p>
        `;
  }

  messagesContainer.appendChild(messageEl);

  // Avtomatik pastga scroll qilish
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ---------------------------------------------
// Event Listenerlar
// ---------------------------------------------

// Chat yuborish
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (message) {
    socket.emit("chat-message", message);
    messageInput.value = "";
  }
});

// Video yoqish/o'chirish
toggleVideoBtn.addEventListener("click", () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    const isEnabled = (videoTrack.enabled = !videoTrack.enabled);
    localVideoEl.classList.toggle("disabled", !isEnabled);
    toggleVideoBtn.classList.toggle("active", isEnabled);
    toggleVideoBtn.innerHTML = isEnabled
      ? '<i class="fas fa-video"></i>'
      : '<i class="fas fa-video-slash"></i>';
    document.getElementById("local-video-status").textContent = isEnabled
      ? ""
      : "Video O'chirilgan";
  }
});

// Audio yoqish/o'chirish
toggleAudioBtn.addEventListener("click", () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    const isEnabled = (audioTrack.enabled = !audioTrack.enabled);
    toggleAudioBtn.classList.toggle("active", isEnabled);
    toggleAudioBtn.innerHTML = isEnabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
  }
});

// Mobil chat ko'rsatish/yashirish
document.getElementById("toggle-chat-mobile")?.addEventListener("click", () => {
  document.getElementById("chat-box").classList.toggle("open");
});

// Xonadan chiqish
document.getElementById("leave-room-btn").addEventListener("click", () => {
  if (confirm("Xonadan chiqishni xohlaysizmi?")) {
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    socket.disconnect();
    window.location.href = "/";
  }
});

// Linkni nusxalash (Kontrol panel tugmasi)
document.getElementById("copy-link-btn").addEventListener("click", () => {
  const roomLink = window.location.href;
  navigator.clipboard.writeText(roomLink).then(() => {
    alert("Xona linki nusxalandi!");
  });
});

// ---------------------------------------------
// Socket.io Listenerlar
// ---------------------------------------------

socket.on("connect", () => {
  setupLocalMedia();
});

socket.on("receive-message", (messageData) => {
  const isLocal = messageData.senderId === MY_ID;
  addChatMessage(messageData, isLocal);
});

socket.on("user-connected", (userId, userName) => {
  addSystemMessage(`**${userName}** xonaga qo'shildi.`);
  createPeerConnection(userId, userName); // Offer avtomatik yuboriladi
});

socket.on("current-users", (users) => {
  users.forEach((user) => {
    createPeerConnection(user.id, user.name); // Offer avtomatik yuboriladi
  });
});

socket.on("user-disconnected", (userId, userName) => {
  addSystemMessage(`**${userName}** xonani tark etdi.`);
  const container = document.getElementById(`video-container-${userId}`);
  if (container) container.remove();
  delete peers[userId];
  updateVideoGridSize();
});

// ---------------------------------------------
// WebRTC Signalling Listenerlar
// ---------------------------------------------

socket.on("receive-offer", (offer, senderId, senderName) => {
  handleReceiveOffer(offer, senderId, senderName);
});

socket.on("receive-answer", (answer, senderId) => {
  const peer = peers[senderId];
  if (peer) {
    peer
      .setRemoteDescription(new RTCSessionDescription(answer))
      .catch((err) => console.error("Remote Answer o'rnatishda xato:", err));
  }
});

socket.on("receive-ice-candidate", (candidate, senderId) => {
  const peer = peers[senderId];
  if (peer && candidate) {
    peer
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch((err) => console.error("ICE nomzodini qo'shishda xato:", err));
  }
});
