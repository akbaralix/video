import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// public papkani statik qilish
app.use(express.static(path.join(__dirname, "public")));

// Socket.io real-time
io.on("connection", (socket) => {
  console.log("Foydalanuvchi ulandi:", socket.id);

  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });

    socket.on("message", (message) => {
      io.to(roomId).emit("createMessage", message);
    });
  });
});

// Fallback index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} da ishlayapti`);
});
