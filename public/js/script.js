import { io } from "/socket.io/socket.io.js";

const socket = io();

// URL dan roomId va username olish
const params = new URLSearchParams(window.location.search);
const userName = params.get("name") || "Anonim";
const roomId = window.location.pathname.split("/")[2];

const videoGrid = document.getElementById("video-grid");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("sendBtn");
const chatMessages = document.getElementById("chat-messages");

const myVideo = document.createElement("video");
myVideo.muted = true;

let peers = {};
let localStream;

// WebRTC media olish
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localStream = stream;
    addVideoStream(myVideo, stream);

    socket.emit("join-room", { roomId, userName });

    socket.on("user-connected", ({ userId, userName }) => {
      connectToNewUser(userId, stream);
      appendMessage(`${userName} xonaga qo‘shildi`);
    });
  })
  .catch((err) => alert("Kamera yoki mikrofonni ochib bo‘lmadi!"));

socket.on("chat-message", (data) =>
  appendMessage(`${data.userName}: ${data.message}`)
);
socket.on("user-disconnected", (userId) => {
  if (peers[userId]) peers[userId].close();
});

// Send chat
sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const msg = chatInput.value.trim();
  if (msg) {
    socket.emit("chat-message", msg);
    appendMessage(`Siz: ${msg}`);
    chatInput.value = "";
  }
}

function appendMessage(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Peer connection
function connectToNewUser(userId, stream) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  peer.ontrack = (e) => {
    const video = document.createElement("video");
    addVideoStream(video, e.streams[0]);
  };

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { candidate: e.candidate, to: userId });
    }
  };

  peers[userId] = peer;

  // Data channel signaling
  socket.on("offer", async ({ from, sdp }) => {
    if (from === userId) {
      await peer.setRemoteDescription(sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("answer", { to: from, sdp: answer });
    }
  });

  socket.on("answer", async ({ from, sdp }) => {
    if (from === userId) await peer.setRemoteDescription(sdp);
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    if (from === userId) await peer.addIceCandidate(candidate);
  });

  // Create offer
  peer
    .createOffer()
    .then((offer) => peer.setLocalDescription(offer))
    .then(() => {
      socket.emit("offer", { to: userId, sdp: peer.localDescription });
    });
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => video.play());
  videoGrid.appendChild(video);
}
