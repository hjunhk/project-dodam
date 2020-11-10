let localStream;
let remoteStream;
let pc;
let isInitiator = false;
let isStarted = false;
let isChannelReady = false;

const videoWidth = window.innerWidth;
const videoHeight = window.innerHeight;

let socket = io.connect();

let pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
}

let room = getParameterByName('room');
let mode = parseInt(getParameterByName('mode'));

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    let regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    let results = regex.exec(location.search);
    
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

if (room !== '') {
    if (mode === 1) {
        toggleLoadingUI(true);
    }

    socket.emit('create or join', room);
    console.log('Attempted to create or join room', room);
}

socket.on('created', (room, id) => {
    console.log('Create room ' + room + ' socket ID: ' + id);
    isInitiator = true;
});

socket.on('full', room => {
    console.log('Room ' + room + ' is full');
});

socket.on('join', room => {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', room => {
    console.log('joined: ' + room);
    isChannelReady = true;
});

socket.on('log', array => {
    console.log.apply(console, array);
});

socket.on('message', (message) => {
    console.log('Client received message:', message);

    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }

        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        const candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        
        pc.addIceCandidate(candidate);
    }
});

function toggleLoadingUI(showLoadingUI, loadingDivId = 'loading', mainDivId = 'main') {
    if (showLoadingUI) {
        document.getElementById(loadingDivId).style.display = 'block';
        document.getElementById(mainDivId).style.display = 'none';
    } else {
        document.getElementById(loadingDivId).style.display = 'none';
        document.getElementById(mainDivId).style.display = 'block';
    }
}

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
}).then(gotStream).catch((error) => console.error(error));

function gotStream(stream) {
    console.log("Adding local stream");

    if (mode === 0) {
        localStream = document.getElementById('video').srcObject;
    } else {
        localStream = stream;
    }
    
    sendMessage("got user media");

    if (isInitiator) {
        maybeStart();
    }
}

function sendMessage(message) {
    console.log('Client sending message:', message);
    socket.emit('message', message);
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(pcConfig);
        pc.onicecandidate = handleIceCandidate;
        
        if (mode === 1) {
            pc.ontrack = handleRemoteStreamAdded;
        }
        
        console.log("Created RTCPeerConnection");
    } catch (e) {
        console.error("Cannot create RTCPeerConnection object");

        return;
    }
}

function handleIceCandidate(event) {
    console.log("iceCandidateEvent", event);

    if (event.candidate) {
        sendMessage({
            type: "candidate",
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
        });
    } else {
        console.log("end of candidates");
    }
}

function handleCreateOfferError(event) {
    console.log("createOffer() error: ", event);
}

function handleRemoteStreamAdded(event) {
    toggleLoadingUI(false);

    console.log("remote stream added");

    const remoteVideo = document.getElementById('remoteVideo');

    remoteVideo.width = videoWidth;
    remoteVideo.height = videoHeight;

    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;

    remoteVideo.play();

    drawCanvasInRealtime(remoteVideo);
}

function drawCanvasInRealtime(video) {
    const canvas = document.getElementById('output');
    const ctx = canvas.getContext('2d');

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    async function remoteVideoFrame() {
        ctx.clearRect(0, 0, videoWidth, videoHeight);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-videoWidth, 0);
        ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
        ctx.restore();

        requestAnimationFrame(remoteVideoFrame);
    }

    remoteVideoFrame();
}

function maybeStart() {
    console.log(">> maybeStart():", isStarted, localStream, isChannelReady);

    if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
        console.log(">>>>> creating peer connection");
        createPeerConnection();
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
        
        isStarted = true;
        console.log("isInitiator:", isInitiator);

        if (isInitiator) {
            doCall();
        }
    } else {
        console.error('maybeStart not Started!');
    }
}

function doCall() {
    console.log("Sending offer to peer");
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log("Sending answer to peer");
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    console.error('Failed to create session Description', error);
}
