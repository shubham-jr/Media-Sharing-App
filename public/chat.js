const socket = io("/");

const mainElement = document.getElementById("main");
const joinButton = document.getElementById("join");
const roomInput = document.getElementById("roomInput");
const userVideo = document.getElementById("user-video");
const peerVideo = document.getElementById("peer-video");
const videoOptionsElement = document.getElementById("video-options");
const videoContainerElement = document.getElementById("video-container");
const fullModeButton = document.getElementById("fullMode");
const muteButton = document.getElementById("mute");
const hideButton = document.getElementById("hide");
const presentWithSysAudioButton = document.getElementById("presentSysAudio");
const presentWithUserAudioButton = document.getElementById("presentUserAudio");
const inputFileElement = document.getElementById("inputFileElement");
const exitButton = document.getElementById("exit");
const downloadedElement = document.getElementById("downloaded");
const uploadedElement = document.getElementById("uploaded");

let roomName;
let creator;
let userStream;
let rtcPeerConnection;
let videoStreamTrack;
let audioStreamTrack;
let fullScreenMode = false;
let hide = false;
let mute = false;
let present = false;
let file;
let fileChunks = [];
let filename;
let sendChannel;
let receiveChannel;
let fileSize;
let CHUNK_SIZE = 50 * 1024;

const iceServers = {
  iceServers: [
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

// event listeners

joinButton.addEventListener("click", () => {
  if (roomInput.value !== "") {
    roomName = roomInput.value;
    socket.emit("join", roomName);
  }
});

fullModeButton.addEventListener("click", () => {
  fullScreenMode = !fullScreenMode;
  if (fullScreenMode) {
    fullModeButton.textContent = "Normal Mode";
    videoContainerElement.style = `
  display:block;
  `;
    userVideo.style = "display:none";
    peerVideo.style = `
  height:100%;
  width:100%;
  `;
  } else {
    fullModeButton.textContent = "Full Screen Mode";
    videoContainerElement.style = `
    display:flex;
    `;
    userVideo.style = "display:block";
    peerVideo.style = `
    height: 300px;
    width: auto;
    `;
  }
});

hideButton.addEventListener("click", () => {
  hide = !hide;
  if (hide) {
    hideButton.textContent = "Show";
    userStream.getTracks()[1].enabled = false;
  } else {
    hideButton.textContent = "Hide";
    userStream.getTracks()[1].enabled = true;
  }
});

muteButton.addEventListener("click", () => {
  mute = !mute;
  if (mute) {
    muteButton.textContent = "Unmute";
    userStream.getTracks()[0].enabled = false;
  } else {
    muteButton.textContent = "Mute";
    userStream.getTracks()[0].enabled = true;
  }
});

// problem in exit with creator

exitButton.addEventListener("click", () => {
  socket.emit("leave", roomName);
  mainElement.style = "display:block";
  videoOptionsElement.style = "display:none";
  fullModeButton.style = "display:none";
  presentWithSysAudioButton.style = "display:none";
  presentWithUserAudioButton.style = "display:none";

  if (userVideo.srcObject) {
    userVideo.srcObject.getTracks()[0].stop();
    userVideo.srcObject.getTracks()[1].stop();
  }

  if (peerVideo.srcObject) {
    peerVideo.srcObject.getTracks()[0].stop();
    peerVideo.srcObject.getTracks()[1].stop();
  }

  if (rtcPeerConnection) {
    rtcPeerConnection.onicecandidate = null;
    rtcPeerConnection.addTrack = null;
    rtcPeerConnection.close();
    rtcPeerConnection = null;
  }
});

presentWithUserAudioButton.addEventListener("click", () => {
  present = !present;
  if (present) {
    presentWithUserAudioButton.textContent = "Stop Presenting";
    presentWithSysAudioButton.style = "display:none";
    navigator.mediaDevices
      .getDisplayMedia({
        audio: true,
        video: {
          cursor: "always",
        },
      })
      .then((stream) => {
        console.log(videoStreamTrack);
        videoStreamTrack.replaceTrack(stream.getVideoTracks()[0], stream);
        userVideo.srcObject = stream;
        userVideo.onloadeddata = () => {
          userVideo.play();
        };
      })
      .catch((err) => {
        console.log(err);
      });
  } else {
    presentWithUserAudioButton.textContent = "Present(with user audio)";
    presentWithSysAudioButton.style = "display:block";
    videoStreamTrack.replaceTrack(userStream.getVideoTracks()[0], userStream);
    userVideo.srcObject = userStream;
    userVideo.onloadeddata = () => {
      userVideo.play();
    };
  }
});

presentWithSysAudioButton.addEventListener("click", () => {
  present = !present;
  if (present) {
    presentWithSysAudioButton.textContent = "Stop Presenting";
    presentWithUserAudioButton.style = "display:none";
    navigator.mediaDevices
      .getDisplayMedia({
        audio: true,
        video: {
          cursor: "always",
        },
      })
      .then((stream) => {
        videoStreamTrack.replaceTrack(stream.getVideoTracks()[0], stream);
        audioStreamTrack.replaceTrack(stream.getAudioTracks()[0], stream);
        userVideo.srcObject = stream;
        userVideo.onloadeddata = () => {
          userVideo.play();
        };
      })
      .catch((err) => {
        console.log(err);
      });
  } else {
    presentWithSysAudioButton.textContent = "Present(with sys audio)";
    presentWithUserAudioButton.style = "display:block";
    videoStreamTrack.replaceTrack(userStream.getVideoTracks()[0], userStream);
    audioStreamTrack.replaceTrack(userStream.getAudioTracks()[0], userStream);
    userVideo.srcObject = userStream;
    userVideo.onloadeddata = () => {
      userVideo.play();
    };
  }
});

inputFileElement.addEventListener("change", () => {
  file = inputFileElement.files[0];
  const filename = file.name;
  console.log("sending file....", file.name);
  uploadedElement.style = "display:block";
  inputFileElement.style = "display:none";
  if (creator) {
    file.arrayBuffer().then((buffer) => {
      let temp = buffer.byteLength;
      sendChannel.send(`meta@${filename}@${temp}`);
      console.log("initial", temp);
      const chunkSize = 50 * 1024;
      const send = () => {
        while (buffer.byteLength) {
          if (
            sendChannel.bufferedAmount > sendChannel.bufferedAmountLowThreshold
          ) {
            sendChannel.onbufferedamountlow = () => {
              sendChannel.onbufferedamountlow = null;
              send();
            };
            return;
          }
          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize, buffer.byteLength);
          uploadedElement.textContent = `uploaded ${parseFloat(
            ((temp - buffer.byteLength) / temp) * 100
          ).toFixed(2)} %`;

          sendChannel.send(chunk);
        }
        sendChannel.send("Done");
        uploadedElement.style = "display:none";
        inputFileElement.style = "display:block";
      };
      send();
    });
  } else {
    file.arrayBuffer().then((buffer) => {
      const chunkSize = 50 * 1024;
      let temp = buffer.byteLength;
      receiveChannel.send(`meta@${filename}@${temp}`);
      const send = () => {
        while (buffer.byteLength) {
          if (
            receiveChannel.bufferedAmount >
            receiveChannel.bufferedAmountLowThreshold
          ) {
            receiveChannel.onbufferedamountlow = () => {
              receiveChannel.onbufferedamountlow = null;
              send();
            };
            return;
          }
          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize, buffer.byteLength);
          uploadedElement.textContent = `uploaded ${parseFloat(
            ((temp - buffer.byteLength) / temp) * 100
          ).toFixed(2)} %`;
          receiveChannel.send(chunk);
        }
        receiveChannel.send("Done");
        uploadedElement.style = "display:none";
        inputFileElement.style = "display:block";
      };
      send();
    });
  }
});

// socket listeners

socket.on("created", () => {
  creator = true;
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: { height: 500, width: 700 },
    })
    .then((stream) => {
      showElements(false);
      userStream = stream;
      userVideo.srcObject = stream;
      userVideo.onloadedmetadata = () => {
        userVideo.play();
      };
    })
    .catch((err) => {
      alert("Can't get user media....");
    });
});

socket.on("joined", () => {
  creator = false;
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: { height: 500, width: 700 },
    })
    .then((stream) => {
      showElements(false);
      userStream = stream;
      userVideo.srcObject = stream;
      userVideo.onloadedmetadata = () => {
        userVideo.play();
      };
      socket.emit("ready", roomName);
      showElements(true);
    })
    .catch((err) => {
      alert("Can't get user media....");
    });
});

socket.on("full", () => {
  alert("Room is full");
});

socket.on("ready", () => {
  if (creator) {
    showElements(true);
    rtcPeerConnection = new RTCPeerConnection(iceServers);

    rtcPeerConnection.onicecandidate = OnIceCandidateFunction;
    rtcPeerConnection.ontrack = OnTrackFunction;
    rtcPeerConnection.ondatachannel = OnDataChannelHandler;

    sendChannel = rtcPeerConnection.createDataChannel("sendChannel");
    sendChannel.onopen = handleSendChannelStatusChange;
    sendChannel.onclose = handleSendChannelStatusChange;
    sendChannel.onmessage = handleRecievedMessage;
    sendChannel.onerror = handleError;

    audioStreamTrack = rtcPeerConnection.addTrack(
      userStream.getTracks()[0],
      userStream
    );
    videoStreamTrack = rtcPeerConnection.addTrack(
      userStream.getTracks()[1],
      userStream
    );
    rtcPeerConnection
      .createOffer()
      .then((offer) => {
        rtcPeerConnection.setLocalDescription(offer);
        socket.emit("offer", roomName, offer);
      })
      .catch((err) => {
        console.log(err);
      });
  }
});

socket.on("offer", (offer) => {
  if (!creator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers);

    rtcPeerConnection.onicecandidate = OnIceCandidateFunction;
    rtcPeerConnection.ontrack = OnTrackFunction;
    rtcPeerConnection.ondatachannel = OnDataChannelHandler;

    audioStreamTrack = rtcPeerConnection.addTrack(
      userStream.getTracks()[0],
      userStream
    );
    videoStreamTrack = rtcPeerConnection.addTrack(
      userStream.getTracks()[1],
      userStream
    );
    rtcPeerConnection.setRemoteDescription(offer);
    rtcPeerConnection
      .createAnswer()
      .then((answer) => {
        rtcPeerConnection.setLocalDescription(answer);
        socket.emit("answer", roomName, answer);
      })
      .catch((err) => {
        console.log(err);
      });
  }
});

socket.on("candidate", (candidate) => {
  const iceCandidate = new RTCIceCandidate(candidate);
  rtcPeerConnection.addIceCandidate(iceCandidate);
});

socket.on("answer", (answer) => {
  rtcPeerConnection.setRemoteDescription(answer);
});

socket.on("leave", () => {
  fullModeButton.style = "display:none";
  presentWithSysAudioButton.style = "display:none";
  presentWithUserAudioButton.style = "display:none";

  if (peerVideo.srcObject) {
    peerVideo.srcObject.getTracks()[0].stop();
    peerVideo.srcObject.getTracks()[1].stop();
  }

  if (rtcPeerConnection) {
    rtcPeerConnection.onicecandidate = null;
    rtcPeerConnection.addTrack = null;
    rtcPeerConnection.close();
    rtcPeerConnection = null;
  }
});

// utils functions

function OnIceCandidateFunction(event) {
  if (event.candidate) {
    socket.emit("candidate", roomName, event.candidate);
  }
}

function OnTrackFunction(event) {
  peerVideo.srcObject = event.streams[0];
  peerVideo.onloadedmetadata = () => {
    peerVideo.play();
  };
}

function showElements(peerReady) {
  if (peerReady) {
    fullModeButton.style = "display:block";
    presentWithSysAudioButton.style = "display:block";
    presentWithUserAudioButton.style = "display:block";
  } else {
    mainElement.style = "display:none";
    videoOptionsElement.style = "display:flex";
  }
}

// data channel listeners

function handleSendChannelStatusChange(event) {
  if (sendChannel) {
    const state = sendChannel.readyState;

    if (state === "open") {
      console.log("open");
    } else {
      console.log("close");
      sendChannel = rtcPeerConnection.createDataChannel("sendChannel");
      sendChannel.onopen = handleSendChannelStatusChange;
      sendChannel.onclose = handleSendChannelStatusChange;
      sendChannel.onmessage = handleRecievedMessage;
      sendChannel.onerror = handleError;
    }
  }
}

function handleReceiveChannelStatusChange(event) {
  if (receiveChannel) {
    const state = receiveChannel.readyState;

    if (state === "open") {
      console.log("open");
    } else {
      console.log("close");
    }
  }
}

function handleRecievedMessage(event) {
  console.log(event.data.toString());
  downloadedElement.style = "display:block";
  inputFileElement.style = "display:none";
  if (event.data.toString() === "Done") {
    downloadedElement.style = "display:none";
    inputFileElement.style = "display:block";

    const file = new Blob(fileChunks);
    console.log("Received", file);

    this.close();

    const blobUrl = window.URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${filename}`;
    document.body.appendChild(link);
    link.click();
    fileChunks = [];
  } else if (event.data.toString().includes("meta")) {
    filename = event.data.toString().split("@")[1];
    fileSize = Number(event.data.toString().split("@")[2]);
  } else {
    fileChunks.push(event.data);
    console.log(fileSize, fileChunks.length, CHUNK_SIZE);
    downloadedElement.textContent = `downloaded ${parseFloat(
      ((fileChunks.length * CHUNK_SIZE) / fileSize) * 100
    ).toFixed(2)}`;
  }
}

function OnDataChannelHandler(event) {
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleRecievedMessage;
  receiveChannel.onopen = handleReceiveChannelStatusChange;
  receiveChannel.onclose = handleReceiveChannelStatusChange;
}

function handleError(err) {
  console.log(err);
}
