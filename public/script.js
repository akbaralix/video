const socket = io();

// URL paramlardan roomId va userId olish
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");
const userId = urlParams.get("user") || "Guest";

const videoGrid = document.getElementById("video-grid");
const myVideo = document.createElement("video");
myVideo.muted = true;

let myStream;

// Media olish (kamera + mikrofon)
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    myStream = stream;
    addVideoStream(myVideo, stream);

    socket.emit("join-room", roomId, userId);

    socket.on("user-connected", (userId) => {
      console.log("Foydalanuvchi ulandi:", userId);
    });
  })
  .catch((err) => console.error(err));

socket.on("user-disconnected", (userId) => {
  console.log("Foydalanuvchi chiqdi:", userId);
});

// Video qo‘shish funksiyasi
function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

// Chat funksiyasi
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("sendBtn");
const chatMessage = document.getElementById("chatMessage");

sendBtn.onclick = () => {
  if (chatMessage.value.trim() !== "") {
    socket.emit("message", `${userId}: ${chatMessage.value}`);
    chatMessage.value = "";
  }
};

socket.on("createMessage", (message) => {
  const msg = document.createElement("div");
  msg.innerText = message;
  messages.append(msg);
  messages.scrollTop = messages.scrollHeight;
});
