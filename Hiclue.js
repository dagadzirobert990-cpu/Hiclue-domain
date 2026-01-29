// ---------------- LOGIN / SIGNUP ----------------
function signup() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("authMsg");

  if (!username || !password) { msg.innerText = "Fill all fields"; return; }

  let users = JSON.parse(localStorage.getItem("users")) || [];
  if (users.find(u => u.username === username)) { msg.innerText = "User exists"; return; }

  users.push({ username, password, pic: "images/default.jpg", bio: "Hello there!" });
  localStorage.setItem("users", JSON.stringify(users));
  msg.innerText = "Signup successful! You can login.";
}

function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("authMsg");

  let users = JSON.parse(localStorage.getItem("users")) || [];
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) { msg.innerText = "Invalid credentials"; return; }

  localStorage.setItem("currentUser", username);
  window.location.href = "index.html";
}

// ---------------- USER / CHAT ----------------
const loggedUser = localStorage.getItem("currentUser");
if (loggedUser && document.getElementById("loggedUser")) {
  document.getElementById("loggedUser").innerText = "Logged in as: " + loggedUser;
}

// Sample users with profile pics
const users = [
  { name: "Alex", pic: "images/alex.jpg", bio: "Love Tech" },
  { name: "Sarah", pic: "images/sarah.jpg", bio: "Sports Fan" },
  { name: "John", pic: "images/john.jpg", bio: "Gaming Fan" },
];

// Display users in sidebar
function showSuggestedUsers() {
  const list = document.getElementById("userList");
  list.innerHTML = "";
  users.forEach(user => {
    if (user.name !== loggedUser) {
      const li = document.createElement("li");
      li.innerHTML = `<img src="${user.pic}">${user.name}`;
      li.onclick = () => openChat(user.name);
      list.appendChild(li);
    }
  });
}

showSuggestedUsers();

let currentChatUser = "";
let unsubscribe = null;

// Real-time chat with Firebase
function openChat(name) {
  currentChatUser = name;
  document.getElementById("chatUser").innerText = name;
  document.getElementById("messages").innerHTML = "";

  if (unsubscribe) unsubscribe();

  const chatId = [loggedUser, name].sort().join("_");

  unsubscribe = db.collection("chats").doc(chatId)
    .collection("messages").orderBy("timestamp")
    .onSnapshot(snapshot => {
      document.getElementById("messages").innerHTML = "";
      snapshot.forEach(doc => {
        const data = doc.data();
        const msg = document.createElement("div");
        msg.classList.add("message", data.sender===loggedUser ? "me" : "other");
        msg.innerText = data.text;
        document.getElementById("messages").appendChild(msg);
      });
    });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentChatUser) return;

  const chatId = [loggedUser, currentChatUser].sort().join("_");
  db.collection("chats").doc(chatId).collection("messages").add({
    sender: loggedUser,
    text: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = "";
}

// ---------------- WEBRTC CALLS ----------------
let localStream;
let peerConnection;
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function startMedia(video=true) {
  localStream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
  document.getElementById("localVideo").srcObject = localStream;
}

async function videoCall() {
  if (!currentChatUser) return alert("Select a user first");
  await startMedia(true);
  startCall();
}

async function audioCall() {
  if (!currentChatUser) return alert("Select a user first");
  await startMedia(false);
  startCall();
}

async function startCall() {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = event => document.getElementById("remoteVideo").srcObject = event.streams[0];

  const callId = [loggedUser, currentChatUser].sort().join("_");
  const callDoc = db.collection("calls").doc(callId);
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  peerConnection.onicecandidate = event => {
    if (event.candidate) offerCandidates.add(event.candidate.toJSON());
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await callDoc.set({ offer: { type: offer.type, sdp: offer.sdp } });

  callDoc.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data?.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
    });
  });
}

// ---------------- CALL CONTROLS ----------------
function toggleMute() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCamera() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }
function endCall() {
  peerConnection.close();
  localStream.getTracks().forEach(track => track.stop());
  document.getElementById("localVideo").srcObject = null;
  document.getElementById("remoteVideo").srcObject = null;
  alert("Call ended");
}

// ---------------- LOGOUT ----------------
function logout() {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}
