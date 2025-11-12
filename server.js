import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// public papkani statik qilish
app.use(express.static("public"));

// Fallback index.html (ixtiyoriy)
app.get("*", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

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

server.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} da ishlayapti`);
});
