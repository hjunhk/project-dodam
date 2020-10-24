import * as posenet from '@tensorflow-models/posenet';
import swal from 'sweetalert';

const videoWidth = screen.availWidth;
const videoHeight = screen.availHeight;

const color = 'white';

var usrAlert = {};

usrAlert.alert = function() {
    swal({
        className: "sweet-alert",
        title: "위험 상황!",
        text: "아이의 자세를 확인해주세요!",
        icon: "warning",
        closeOnClickOutside: true,
    })
}

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    let regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    let results = regex.exec(location.search);
    
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isiOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function drawPoint(ctx, y, x, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawKeypoints(keypoints, minConfidence, ctx, scale = 1) {
    // keypoints[0] : nose
    // keypoints[1] : leftEye
    // keypoints[2] : rightEye
    // keypoints[3] : leftEar
    // keypoints[4] : rightEar
    for (let i = 0; i < 5; i++) {
        const keypoint = keypoints[i];

        if (keypoint.score < minConfidence) {
            continue;
        }

        const {y, x} = keypoint.position;
        drawPoint(ctx, y * scale, x * scale, 3, color);
    }
}

function isMobile() {
    return isAndroid() || isiOS();
}

function toggleLoadingUI(showLoadingUI, loadingDivId = 'loading', mainDivId = 'main') {
    if (showLoadingUI) {
        document.getElementById(loadingDivId).style.display = 'block';
        document.getElementById(mainDivId).style.display = 'none';
    } else {
        document.getElementById(loadingDivId).style.display = 'none';
        document.getElementById(mainDivId).style.display = 'block';
    }
}

async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('브라우저 API navigator.mediaDevices.getUserMedia 를 사용할 수 없습니다.');
    }

    const video = document.getElementById('video');
    video.width = videoWidth;
    video.height = videoHeight;

    const stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
            facingMode: 'user',
            width: videoWidth,
            height: videoHeight,
        },
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

async function loadVideo() {
    const video = await setupCamera();
    video.play();

    return video;
}

const defaultQuantBytes = 2;

const defaultMobileNetMultiplier = isMobile() ? 0.50 : 0.75;
const defaultMobileNetStride = 16;
const defaultMobileNetInputResolution = { width: videoWidth, height: videoHeight };

const guiState = {
    algorithm: 'single-pose',
    input: {
        architecture: 'MobileNetV1',
        outputStride: defaultMobileNetStride,
        inputResolution: defaultMobileNetInputResolution,
        multiplier: defaultMobileNetMultiplier,
        quantBytes: defaultQuantBytes,
        imageScaleFactor: 0.5,
    },
    singlePoseDetection: {
        minPoseConfidence: 0.25,
        minPartConfidence: 0.5,
    },
    output: {
        showVideo: true,
        showSkeleton: true,
        showPoints: true,
        showBoundingBox: false,
    },
    net: null,
};

function setupGui(cameras, net) {
    guiState.net = net;

    if (cameras.length > 0) {
        guiState.camera = cameras[0].deviceId;
    }

    guiState.architecture = guiState.input.architecture;
    guiState.inputResolution = guiState.input.inputResolution;
    guiState.outputStride = guiState.input.outputStride;
    guiState.multiplier = guiState.input.multiplier;
    guiState.quantBytes = guiState.input.quantBytes;
    guiState.imageScaleFactor = guiState.input.imageScaleFactor;
}

function postDataToPhp(room, data) {
    let xhr = new XMLHttpRequest();
    let url = 'http://dodam123.dothome.co.kr/CheckUTAvailability.php';
    let params = 'UserNum=' + room;

    xhr.onreadystatechange = function() {
        if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
            let response = JSON.parse(xhr.responseText);

            if (response["NumRows"] === 0) {
                url = 'http://dodam123.dothome.co.kr/PostUrgentNum1.php';
                params = 'UserNum=' + room + '&urgent_num=' + data;

                xhr.open("POST", url, true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                xhr.send(params);
            } else if (response["NumRows"] === 1) {
                url = 'http://dodam123.dothome.co.kr/PostUrgentNum2.php';
                params = 'UserNum=' + room + '&urgent_num=' + data;

                xhr.open("POST", url, true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                xhr.send(params);
            }
        }
    }

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send(params);
}

function detectPoseInRealTime(video, net) {
    const canvas = document.getElementById('output');
    const ctx = canvas.getContext('2d');
    const flipPoseHorizontal = isMobile() ? false : true;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    let hazardAlert;
    let hazardDetection = true;

    var room = getParameterByName('room');
    
    async function poseDetectionFrame() {
        let poses = [];
        let minPoseConfidence;
        let minPartConfidence;

        const pose = await guiState.net.estimateSinglePose(video, {
            imageScaleFactor: guiState.imageScaleFactor,
            flipHorizontal: flipPoseHorizontal,
            outputStride: guiState.outputStride
        });

        poses = poses.concat(pose);
        minPoseConfidence = +guiState.singlePoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.singlePoseDetection.minPartConfidence;

        ctx.clearRect(0, 0, videoWidth, videoHeight);

        if (guiState.output.showVideo) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-videoWidth, 0);
            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
            ctx.restore();
        }

        poses.forEach(({score, keypoints}) => {
            if (score >= minPoseConfidence) {
                if (guiState.output.showPoints) {
                    drawKeypoints(keypoints, minPartConfidence, ctx);
                }
            }
            
            // [0]코, keypoints[1]왼쪽 눈과 [2]오른쪽 눈 위치가 파악이 안될 때
            if (keypoints[0].score < minPoseConfidence || 
                (keypoints[1].score < minPoseConfidence && keypoints[2].score < minPoseConfidence)) {
                if (hazardDetection) {
                    // hazardAlert = setInterval(postDataToPhp, 5000, room, 1);        // 딜레이는 시연 단계 이후 조정 할 것
                    hazardAlert = setInterval(usrAlert.alert, 5000);                      // test

                    hazardDetection = false;
                }
            } else {
                if (!hazardDetection) {
                    clearInterval(hazardAlert);
                    postDataToPhp(room, 0);

                    hazardDetection = true;
                }
            }
        });

        requestAnimationFrame(poseDetectionFrame);
    }

    poseDetectionFrame();               
}

async function bindPage() {
    toggleLoadingUI(true);

    const net = await posenet.load({
        architecture: guiState.input.architecture,
        outputStride: guiState.input.outputStride,
        inputResolution: guiState.input.inputResolution,
        multiplier: guiState.input.multiplier,
        quantBytes: guiState.input.quantBytes
    });

    toggleLoadingUI(false);

    let video;

    try {
        video = await loadVideo();
    } catch (e) {
        let info = document.getElementById('info');
        info.textContent = '해당 브라우저가 비디오 캡처를 지원하지 않거나, ' + '장치에 카메라가 없습니다.';
        info.style.display = 'block';

        throw e;
    }

    setupGui([], net);
    detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
bindPage();