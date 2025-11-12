// server.js

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidV4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Socket.io serverini o'rnatish. CORS Render kabi serverlar uchun kerak.
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Public papkasini taqdim etish (js/css/html)
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------
// Ruting
// ---------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unique Room ID bilan xona yaratish
app.get("/create", (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

// Xonaga kirish
app.get("/:room", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// ---------------------------------------------
// Socket.io Ulanish Mantig'i
// ---------------------------------------------

// Aktiv xonalar va foydalanuvchilar
const activeRooms = {}; // { roomId: [{ id: userId, name: userName, socketId: socket.id }] }

io.on("connection", (socket) => {
  // Foydalanuvchi xonaga kirganda
  socket.on("join-room", (roomId, userId, userName) => {
    socket.join(roomId);

    // Foydalanuvchi ma'lumotlarini saqlash
    const user = { id: userId, name: userName, socketId: socket.id };

    // Xonani yaratish/yangilash
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = [];
    }

    // Xonadagi mavjud foydalanuvchilarni yangi kelganga yuborish
    const currentUsers = activeRooms[roomId];
    socket.emit("current-users", currentUsers);

    // Yangi foydalanuvchini ro'yxatga qo'shish
    activeRooms[roomId].push(user);

    // Xonadagi boshqalarga yangi foydalanuvchi haqida xabar berish
    socket.to(roomId).emit("user-connected", userId, userName);

    // Chat xabarlari
    socket.on("chat-message", (message) => {
      io.to(roomId).emit("receive-message", {
        senderId: userId,
        senderName: userName,
        text: message,
        timestamp: new Date().toLocaleTimeString("uz-UZ", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // WebRTC Signalling
    socket.on("send-offer", (offer, targetUserId) => {
      const targetUser = activeRooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser)
        io.to(targetUser.socketId).emit(
          "receive-offer",
          offer,
          userId,
          userName
        );
    });

    socket.on("send-answer", (answer, targetUserId) => {
      const targetUser = activeRooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser)
        io.to(targetUser.socketId).emit("receive-answer", answer, userId);
    });

    socket.on("send-ice-candidate", (candidate, targetUserId) => {
      const targetUser = activeRooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser)
        io.to(targetUser.socketId).emit(
          "receive-ice-candidate",
          candidate,
          userId
        );
    });

    // Uzilish
    socket.on("disconnect", () => {
      if (activeRooms[roomId]) {
        activeRooms[roomId] = activeRooms[roomId].filter(
          (u) => u.id !== userId
        );
      }
      // Boshqalarga uzilish haqida xabar berish
      socket.to(roomId).emit("user-disconnected", userId, userName);

      // Xonani tozalash (agar bo'sh qolsa)
      if (activeRooms[roomId] && activeRooms[roomId].length === 0) {
        delete activeRooms[roomId];
      }
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server ishlamoqda: http://localhost:${PORT}`);
});
