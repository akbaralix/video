const socket = io();
const roomId = new URLSearchParams(window.location.search).get("room");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let localStream;
let peerConnection;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// kamera olish
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
    localStream = stream;
    socket.emit("join-room", roomId);
  });

socket.on("user-joined", async () => {
  peerConnection = new RTCPeerConnection(servers);
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", offer, roomId);
});

socket.on("offer", async (offer) => {
  peerConnection = new RTCPeerConnection(servers);
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomId);
});

socket.on("answer", (answer) => {
  peerConnection.setRemoteDescription(answer);
});

socket.on("candidate", (candidate) => {
  peerConnection.addIceCandidate(candidate);
});

function setupIceCandidates() {
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", event.candidate, roomId);
    }
  };
}
