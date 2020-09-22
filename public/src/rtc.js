let localStream;
let remoteStream;
let pc;
let isInitiator = false;
let isStarted = false;
let isChannelReady = false;

const videoWidth = 600;
const videoHeight = 500;

var socket = io.connect();

let pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
}

let room = getParameterByName('room');
let mode = parseInt(getParameterByName('mode'));

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var results = regex.exec(location.search);
    
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

if(room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or join room', room);
}

socket.on('created', (room, id) => {
    console.log('Create room ' + room + ' socket ID: ' + id);
    isInitiator = true;
})

socket.on('full', room => {
    console.log('Room ' + room + ' is full');
})

socket.on('join', room => {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
    isStarted = false;
})

socket.on('joined', room => {
    console.log('joined: ' + room);
    isChannelReady = true;
    // isStarted = false;
})

socket.on('log', array => {
    console.log.apply(console, array);
})

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
})

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
}).then(gotStream).catch((error) => console.error(error));

function gotStream(stream) {
    // console.log(stream);                    // debug
    console.log("Adding local stream");
    localStream = stream;
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
        // console.log(pc);                                // debug
        console.log("Created RTCPeerConnection");
    } catch (e) {
        // sweetalert로 대체 할 것
        alert("cannot create RTCPeerConnection object");
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
    console.log("remote stream added");
    // console.log(event.streams[0]);                     // debug
    // console.log(typeof(remoteStream));                      // debug

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

    console.log(video);

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
        // pc.addStream(localStream);       // == pc.addTrack()
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            // console.log('addTrack!');
        });
        
        isStarted = true;
        console.log("isInitiator:", isInitiator);

        if (isInitiator) {
            doCall();
        }
    } else {
        // console.log(isStarted + ' ' + isChannelReady);          // debug
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
