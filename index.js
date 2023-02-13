const express = require("express");
const app = express();
const path = require("path");
const socket = require("socket.io");
const PORT = process.env.PORT || 3333;

app.use(express.static(path.join(__dirname, "public")));

const httpServer = app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});

const io = socket(httpServer, {
  cors: {
    options: "*",
  },
});

io.on("connect", (socket) => {
  socket.on("join", (roomName) => {
    const rooms = io.sockets.adapter.rooms;
    const room = rooms.get(roomName);

    if (room == undefined) {
      socket.emit("created");
      socket.join(roomName);
    } else if (room.size == 1) {
      socket.emit("joined");
      socket.join(roomName);
    } else {
      socket.emit("full");
    }
  });

  socket.on("ready", (roomName) => {
    socket.broadcast.to(roomName).emit("ready");
  });

  socket.on("candidate", (roomName, candidate) => {
    socket.broadcast.to(roomName).emit("candidate", candidate);
  });

  socket.on("offer", (roomName, offer) => {
    socket.broadcast.to(roomName).emit("offer", offer);
  });

  socket.on("answer", (roomName, answer) => {
    socket.broadcast.to(roomName).emit("answer", answer);
  });

  socket.on("leave", (roomName) => {
    socket.leave(roomName);
    socket.broadcast.to(roomName).emit("leave");
  });
});
