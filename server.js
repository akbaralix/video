// server.js

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidV4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

// ES Module uchun __dirname yaratish
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Socket.io serverini o'rnatish
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

// Public fayllarni taqdim etish
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------
// Ruting (Routing)
// ---------------------------------------------

// Asosiy sahifa - Xona yaratish
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Yangi unique Room ID bilan xona yaratish va yo'naltirish
app.get("/create", (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

// Xonaga kirish
app.get("/:room", (req, res) => {
  // Room sahifasini taqdim etish
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

// ---------------------------------------------
// Socket.io Ulanish Mantig'i
// ---------------------------------------------

// Aktiv xonalar (room ID ga asoslangan)
const rooms = {};

io.on("connection", (socket) => {
  console.log(`Yangi foydalanuvchi ulandi: ${socket.id}`);

  // Foydalanuvchi xonaga kirganda
  socket.on("join-room", (roomId, userId, userName) => {
    // Agar xona mavjud bo'lmasa, uni yaratish
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // Foydalanuvchini xonaga qo'shish
    socket.join(roomId);

    // Foydalanuvchi ma'lumotlarini saqlash
    const user = { id: userId, name: userName, socketId: socket.id };
    rooms[roomId].push(user);

    console.log(
      `Foydalanuvchi ${userName} (${userId}) xonaga kirdi: ${roomId}`
    );

    // Xonadagi boshqa foydalanuvchilarga yangi foydalanuvchi haqida xabar berish (WebRTC ulanishini boshlash uchun)
    socket.to(roomId).emit("user-connected", userId, userName);

    // Xonadagi mavjud foydalanuvchilar ro'yxatini yuborish
    const currentUsers = rooms[roomId].filter((u) => u.id !== userId);
    socket.emit("current-users", currentUsers);

    // ---------------------------------------------
    // WebRTC Signalling
    // ---------------------------------------------

    // Peer uchun WebRTC offerini boshqa foydalanuvchiga yuborish
    socket.on("send-offer", (offer, targetUserId) => {
      const targetUser = rooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit(
          "receive-offer",
          offer,
          userId,
          userName
        );
      }
    });

    // Peer uchun WebRTC answerini boshqa foydalanuvchiga yuborish
    socket.on("send-answer", (answer, targetUserId) => {
      const targetUser = rooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit("receive-answer", answer, userId);
      }
    });

    // Peer uchun WebRTC ICE nomzodlarini almashish
    socket.on("send-ice-candidate", (candidate, targetUserId) => {
      const targetUser = rooms[roomId].find((u) => u.id === targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit(
          "receive-ice-candidate",
          candidate,
          userId
        );
      }
    });

    // ---------------------------------------------
    // Chat Mantig'i
    // ---------------------------------------------

    // Xabar qabul qilish va xonadagi barchaga yuborish
    socket.on("chat-message", (message) => {
      // Xonadagi barcha foydalanuvchilarga xabarni yuborish
      io.to(roomId).emit("receive-message", {
        senderId: userId,
        senderName: userName,
        text: message,
        timestamp: new Date().toLocaleTimeString(),
      });
    });

    // ---------------------------------------------
    // Uzilish
    // ---------------------------------------------

    // Foydalanuvchi uzilganda
    socket.on("disconnect", () => {
      console.log(`Foydalanuvchi uzildi: ${userName} (${userId})`);

      // Xonadan foydalanuvchini o'chirish
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter((u) => u.id !== userId);
      }

      // Boshqa foydalanuvchilarga uzilish haqida xabar berish
      socket.to(roomId).emit("user-disconnected", userId, userName);

      // Agar xonada hech kim qolmasa, xonani o'chirish (ixtiyoriy, xotira uchun)
      if (rooms[roomId] && rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server ishlamoqda: http://localhost:${PORT}`);
  console.log(`Xona yaratish linki: http://localhost:${PORT}/create`);
});
