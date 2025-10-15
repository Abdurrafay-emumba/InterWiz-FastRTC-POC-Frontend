let peerConnection;
let webrtc_id;
const startButton = document.getElementById("start-button");
const chatMessages = document.getElementById("chat-messages");
const boxContainer = document.getElementById("box-container");
const typingIndicator = document.getElementById("typing-indicator");
const audioOutput = document.getElementById("audio-output");
const statusLabel = document.getElementById("statusLabel");
const backend_address = "https://wrtc.interwiz.ai"; //"http://0.0.0.0:7860";
let audioLevel = 0;
let animationFrame_input, animationFrame_output;
let audioContext_input, audioContext_output;
let analyser_input, dataArray_input;
let analyser_output, dataArray_output;
let audioSource_input, audioSource_output;
let messages = [];
let eventSource;
let isMuted = false;
// Create wave visualizer boxes
const numBars = 32;
for (let i = 0; i < numBars; i++) {
  const box = document.createElement("div");
  box.className = "box";
  boxContainer.appendChild(box);
}

// SVG Icons
const micIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>`;
const micMutedIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>`;



function delay(ms)
{
    // Returns a promise that resolves after the specified number of milliseconds
    return new Promise(resolve => setTimeout(resolve, ms));
}


function updateButtonState()
{
  const existingMuteButton = startButton.querySelector(".mute-toggle");
  if (existingMuteButton)
  {
    existingMuteButton.removeEventListener("click", toggleMute);
  }
  startButton.innerHTML = "";
  if ( peerConnection && (peerConnection.connectionState === "connecting" || peerConnection.connectionState === "new"))
  {
    startButton.innerHTML = `
                <div class="icon-with-spinner">
                    <div class="spinner"></div>
                    <span>Connecting...</span>
                </div>
            `;
    startButton.disabled = true;
  }
  else if (peerConnection && peerConnection.connectionState === "connected")
  {
    const pulseContainer = document.createElement("div");
    pulseContainer.className = "pulse-container";
    pulseContainer.innerHTML = `
                <div class="pulse-circle"></div>
                <span>Stop Conversation</span>
            `;
    const muteToggle = document.createElement("div");
    muteToggle.className = "mute-toggle";
    muteToggle.title = isMuted ? "Unmute" : "Mute";
    muteToggle.innerHTML = isMuted ? micMutedIconSVG : micIconSVG;
    muteToggle.addEventListener("click", toggleMute);
    startButton.appendChild(pulseContainer);
    startButton.appendChild(muteToggle);
    startButton.disabled = false;
  }
  else
  {
    startButton.textContent = "Start Conversation";
    startButton.disabled = false;
  }
}

function toggleMute(event)
{
  event.stopPropagation();
  if (!peerConnection || peerConnection.connectionState !== "connected") return;
  isMuted = !isMuted;
  console.log("Mute toggled:", isMuted);
  peerConnection.getSenders().forEach((sender) =>
  {
    if (sender.track && sender.track.kind === "audio")
    {
      sender.track.enabled = !isMuted;
      console.log(`Audio track ${sender.track.id} enabled: ${!isMuted}`);
    }
  });
  updateButtonState();
}

function setupAudioVisualization(stream) {
  // Input audio context for pulse circle
  audioContext_input = new (window.AudioContext || window.webkitAudioContext)();
  analyser_input = audioContext_input.createAnalyser();
  audioSource_input = audioContext_input.createMediaStreamSource(stream);
  audioSource_input.connect(analyser_input);
  analyser_input.fftSize = 64;
  dataArray_input = new Uint8Array(analyser_input.frequencyBinCount);
  function updateAudioLevel() {
    // Update input audio visualization (pulse circle)
    analyser_input.getByteFrequencyData(dataArray_input);
    const average =
      Array.from(dataArray_input).reduce((a, b) => a + b, 0) /
      dataArray_input.length;
    audioLevel = average / 255;
    const pulseCircle = document.querySelector(".pulse-circle");
    if (pulseCircle) {
      pulseCircle.style.setProperty("--audio-level", 1 + audioLevel);
    }
    animationFrame_input = requestAnimationFrame(updateAudioLevel);
  }
  updateAudioLevel();
}

function setupOutputVisualization(stream)
{
  // Create separate audio context for output visualization
  audioContext_output = new (window.AudioContext ||
    window.webkitAudioContext)();
  analyser_output = audioContext_output.createAnalyser();
  audioSource_output = audioContext_output.createMediaStreamSource(stream);
  audioSource_output.connect(analyser_output);
  analyser_output.fftSize = 2048;
  dataArray_output = new Uint8Array(analyser_output.frequencyBinCount);
  function updateVisualization() {
    // Update output audio visualization (wave bars)
    analyser_output.getByteFrequencyData(dataArray_output);
    const boxes = document.querySelectorAll(".box");
    for (let i = 0; i < boxes.length; i++) {
      const index = Math.floor((i * dataArray_output.length) / boxes.length);
      const value = dataArray_output[index] / 255;
      boxes[i].style.transform = `scaleY(${Math.max(0.1, value * 1.5)})`;
    }
    animationFrame_output = requestAnimationFrame(updateVisualization);
  }
  updateVisualization();
}

// Reset wave visualization bars to minimum height
function resetVisualization()
{
  const boxes = document.querySelectorAll(".box");
  boxes.forEach((box) => (box.style.transform = "scaleY(0.1)"));
}

function showError(message) {
  const toast = document.getElementById("error-toast");
  toast.textContent = message;
  toast.className = "toast error";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 5000);
}

function handleMessage(event) {
  const eventJson = JSON.parse(event.data);
  console.log("Received message on data channel:", eventJson);
  if (eventJson.type === "error")
  {
    showError(eventJson.message);
  }
  else if (eventJson.type === "send_input")
  {
    const data =
    {
      webrtc_id: webrtc_id,
      chatbot: messages,
      state: messages,
    };

    console.log("Sending input to server:", data);
    fetch(backend_address+"/input_hook",
    {
      method: "POST",
      headers:
      {
        "Content-Type": "application/json",
        credentials: "include", // 👈 this is critical for cookies/session
      },
      body: JSON.stringify(data),
    });
  }
  else if (eventJson.type === "log")
  {
    if (eventJson.data === "pause_detected")
    {
      typingIndicator.style.display = "block";
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    else if (eventJson.data === "response_starting")
    {
      typingIndicator.style.display = "none";
    }
  }
  // This is the real-time transcription logic, it is half here and half in the addMessage function
  else if (eventJson.type === "Real-time-transcription-or-llm-response")
  {
        let data = eventJson.data;
        // Push to messages array
        messages.push({
          role: data.role,
          content: data.content.message
        });

        // Add to UI
        addMessage(data.role, data.content);
  }
  else if( eventJson.type === "Eva Status Logs")
  {
        statusLabel.textContent = eventJson.data;
  }

}

async function setupWebRTC()
{
  // config is a global variable, it is defined in the HTML file
  if (!config)
  {
    console.error("WebRTC config is not defined");
    return;
  }

  peerConnection = new RTCPeerConnection(config);
  const timeoutId = setTimeout(() =>
  {
    const toast = document.getElementById("error-toast");
    toast.textContent =
      "Connection is taking longer than usual. Are you on a VPN?";
    toast.className = "toast warning";
    toast.style.display = "block";
    setTimeout(() =>
    {
      toast.style.display = "none";
    }, 5000);
  }, 5000);

  try
  {
    // Getting the mic stream
    const stream = await navigator.mediaDevices.getUserMedia(
    {
      audio:  {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
    });
    setupAudioVisualization(stream);
    stream.getTracks().forEach((track) =>
    {
      // Adding the track to the peer connection, now we can send audio
      peerConnection.addTrack(track, stream);
    });
    // Add this listener to handle incoming audio track
    peerConnection.addEventListener("track", (event) =>
    {
      if (event.track.kind === "audio")
      {
        console.log("Received audio track from server");
        if (audioOutput)
        {
          audioOutput.srcObject = event.streams[0];
          audioOutput
            .play()
            .catch((e) => console.error("Audio play failed:", e));
        }
        // Set up visualization for output audio with separate context
        setupOutputVisualization(event.streams[0]);
      }
    });
    const dataChannel = peerConnection.createDataChannel("text");
    dataChannel.onmessage = handleMessage;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    peerConnection.onicecandidate = ({ candidate }) =>
    {
      if (candidate)
      {
        console.debug("Sending ICE candidate", candidate);
        fetch(backend_address + "/webrtc/offer",
        {
          method: "POST",
          credentials: "include", // 👈 this is critical for cookies/session
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
          {
            candidate: candidate.toJSON(),
            webrtc_id: webrtc_id,
            type: "ice-candidate",
          }),
        });
      }
    };
    peerConnection.addEventListener("connectionstatechange", () =>
    {
      console.log("connectionstatechange", peerConnection.connectionState);
      if (peerConnection.connectionState === "connected")
      {
        clearTimeout(timeoutId);
        const toast = document.getElementById("error-toast");
        toast.style.display = "none";
      } else if (
        ["closed", "failed", "disconnected"].includes(
          peerConnection.connectionState
        )
      )
      {
        stop();
      }
      updateButtonState();
    });
    webrtc_id = Math.random().toString(36).substring(7);
    const response = await fetch(backend_address + "/webrtc/offer",
    {
      method: "POST",
      credentials: "include", // 👈 this is critical for cookies/session
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
      {
        sdp: peerConnection.localDescription.sdp,
        type: peerConnection.localDescription.type,
        webrtc_id: webrtc_id,
      }),
    });
    const serverResponse = await response.json();
    if (serverResponse.status === "failed")
    {
      showError(
        serverResponse.meta.error === "concurrency_limit_reached"
          ? `Too many connections. Maximum limit is ${serverResponse.meta.limit}`
          : serverResponse.meta.error
      );
      stop();
      return;
    }
    await peerConnection.setRemoteDescription(serverResponse);


    // Getting the interview ID from the URL parameters

    const params = new URLSearchParams(window.location.search);

    // Extract the specific parameter

    const interviewId = params.get("interview_id");

    console.log("Interview ID:", interviewId);

    eventSource = new EventSource(backend_address + "/outputs?webrtc_id=" + webrtc_id + "&interview_id=" + interviewId, { withCredentials: true } );
    /*
    eventSource = new EventSourcePolyfill("/outputs?webrtc_id=" + webrtc_id, {
      withCredentials: true
    });
    */
    eventSource.addEventListener("message", (event) =>
    {
      const data = JSON.parse(event.data);
      console.log("Received output:", data);
      if (data?.content?.message)
      {
        messages.push(
        {
          role: data.role,
          content: data.content.message,
        });
      }
      addMessage(data.role, data.content);
    });
  }
  catch (err)
  {
    clearTimeout(timeoutId);
    console.error("Error setting up WebRTC:", err);
    showError("Failed to establish connection. Please try again.");
    stop();
  }
}

function addMessage(role, content)
{
  console.log("🔵 Incoming:", { role, content });
  console.log("🟡 Current messages:", messages.map(m => m.role + ": " + m.content));

  const chatChildren = Array.from(chatMessages.children);


  let lastMsgObj;
  let lastWasUser = false;
  if (messages.length >= 2)
  {
    lastMsgObj = messages[messages.length - 2];
    lastWasUser = lastMsgObj?.role === "user";
  }

  // If replacing last user message
  if (role === "user" && lastWasUser)
  {
    console.log("🛠 Replacing last user message");

    messages.pop(); // Remove the last message from messages array

    // 1. Replace in messages[]
    messages[messages.length - 1].content = content.message;

    // 2. Replace in DOM
    for (let i = chatChildren.length - 1; i >= 0; i--)
    {
      const el = chatChildren[i];
      if (el.classList.contains("message") && el.classList.contains("user"))
      {
        el.textContent = content.message;
        break;
      }
    }

    for (let i = chatChildren.length - 1; i >= 0; i--)
    {
      const el = chatChildren[i];
      if (el.classList.contains("detail") && el.classList.contains("user"))
      {
        el.textContent = content.details || "";
        break;
      }
    }

    return;
  }

  // ⬇ Append new block
  console.log("➕ Appending new message");

  if (content.message)
  {
    const msgEl = document.createElement("div");
    msgEl.classList.add("message", role);
    msgEl.textContent = content.message;
    chatMessages.appendChild(msgEl);
  }

  if (content.details)
  {
    const detailEl = document.createElement("div");
    detailEl.classList.add("detail", role);
    detailEl.textContent = content.details;
    chatMessages.appendChild(detailEl);
  }

   /*
  messages.push({
    role,
    content: content.message
  });
  */

  chatMessages.scrollTop = chatMessages.scrollHeight;
}


/*
function addMessage(role, content) {
  console.log("Adding message:", role, content);
  if (!!content.message) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);
    messageDiv.textContent = content.message;
    chatMessages.appendChild(messageDiv);
  }
  if (!!content.details) {
    const detailDiv = document.createElement("div");
    detailDiv.classList.add("detail", role);
    detailDiv.textContent = content.details;
    chatMessages.appendChild(detailDiv);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
*/

function stop() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (animationFrame_input) {
    cancelAnimationFrame(animationFrame_input);
    animationFrame_input = null;
  }
  if (animationFrame_output) {
    cancelAnimationFrame(animationFrame_output);
    animationFrame_output = null;
  }
  if (audioContext_input) {
    audioContext_input
      .close()
      .catch((e) => console.error("Error closing input AudioContext:", e));
    audioContext_input = null;
    analyser_input = null;
    dataArray_input = null;
    audioSource_input = null;
  }
  if (audioContext_output) {
    audioContext_output
      .close()
      .catch((e) => console.error("Error closing output AudioContext:", e));
    audioContext_output = null;
    analyser_output = null;
    dataArray_output = null;
    audioSource_output = null;
  }
  if (audioOutput) {
    audioOutput.pause();
    audioOutput.srcObject = null;
  }
  // Reset visualization
  resetVisualization();
  if (peerConnection) {
    if (peerConnection.getTransceivers) {
      peerConnection.getTransceivers().forEach((transceiver) => {
        if (transceiver.stop) {
          transceiver.stop();
        }
      });
    }
    peerConnection.onicecandidate = null;
    peerConnection.ondatachannel = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }
  isMuted = false;
  updateButtonState();
  audioLevel = 0;
}

startButton.addEventListener("click", (event) =>
{
  if (event.target.closest(".mute-toggle"))
  {
    return;
  }

  if (peerConnection && peerConnection.connectionState === "connected")
  {
    console.log("Stop button clicked");
    stop();
    stopScreenShareStream();
    const response = fetch(backend_address + '/finish_interview', 
    {
  	method: "GET",
  	credentials: "include", // 👈 this is critical for cookies/session
	})
  }
  else if (!peerConnection || ["new", "closed", "failed", "disconnected"].includes(peerConnection.connectionState))
  {
    startScreenShareStream();
    RunSetupWebRTC();
  }
});

async function RunSetupWebRTC()
{
    console.log("Start button clicked");
    let retryCount = 0;
    let connected = false
    while (retryCount < 4 && !connected)
    {
      try
      {
        console.log("Attempting to set up WebRTC connection..." + (retryCount + 1));
        messages = [];
        chatMessages.innerHTML = "";
        await setupWebRTC();
        updateButtonState();

        // Since the button seems to know when the connection is established
        while (startButton.disabled === true)
        {
            await delay(100);
        }

        if (peerConnection && peerConnection.connectionState === "connected")
        {
            connected = true;
            // Recover the history of the interview after the connection is established
            // recoverInterviewHistory(); // This task has now been given to the startup function of the FastRTC
        }
        else
        {
            retryCount++;
            const turnHost = "ec2-44-197-215-14.compute-1.amazonaws.com"//"ec2-16-171-208-195.eu-north-1.compute.amazonaws.com";

            // The TURN credentials are static for demo purposes
            // In production, you should hide them
            if (retryCount === 3)
            {
                  console.log("STUN failed, changing to TURN");
                  // config is a global variable, it is defined in the HTML file
                  // Changing the config to use TURN server
                  config =
                  {
                        iceServers: [
                        {
                            urls: [
                            `turn:${turnHost}:3478?transport=udp`,
                            `turn:${turnHost}:3478?transport=tcp`,
                            ],
                            username: "testuser",
                            credential: "testpass",
                        },
                        // keep one STUN as fallback
                        { urls: "stun:stun.l.google.com:19302" },
                    ],
                    // force TURN-only on this attempt
                    iceTransportPolicy: "relay",
                  };
            }
        }
      }
      catch
      {
        retryCount++;
        await delay(500); // Wait 500ms before retrying
      }
    }
}

////////////////////////////////////////////////////////////////
/////////////////Auto Muting Functionality//////////////////////
////////////////////////////////////////////////////////////////

let isAutoMuted = false; // Tracks if muting is automatic
let userMuteState = false; // Tracks user's manual mute preference
let outputAudioDebounceTimeout = null; // For debouncing auto-mute/unmute

function updateButtonState()
{
  const existingMuteButton = startButton.querySelector(".mute-toggle");
  if (existingMuteButton)
  {
    existingMuteButton.removeEventListener("click", toggleMute);
  }
  startButton.innerHTML = "";
  if (peerConnection && (peerConnection.connectionState === "connecting" || peerConnection.connectionState === "new"))
  {
    startButton.innerHTML = `
                <div class="icon-with-spinner">
                    <div class="spinner"></div>
                    <span>Connecting...</span>
                </div>
            `;
    startButton.disabled = true;
  }
  else if (peerConnection && peerConnection.connectionState === "connected")
  {
    const pulseContainer = document.createElement("div");
    pulseContainer.className = "pulse-container";
    pulseContainer.innerHTML = `
                <div class="pulse-circle"></div>
                <span>Stop Conversation</span>
            `;
    const muteToggle = document.createElement("div");
    muteToggle.className = "mute-toggle";

    // Show different tooltip based on auto-muting vs manual muting
    if (isMuted && isAutoMuted && !userMuteState)
    {
      muteToggle.title = "Auto-muted (output is playing)";
    }
    else
    {
      muteToggle.title = isMuted ? "Unmute" : "Mute";
    }

    muteToggle.innerHTML = isMuted ? micMutedIconSVG : micIconSVG;

    // For auto-muting, add a visual indicator
    if (isAutoMuted && !userMuteState)
    {
      muteToggle.classList.add("auto-muted");
    }

    muteToggle.addEventListener("click", toggleMute);
    startButton.appendChild(pulseContainer);
    startButton.appendChild(muteToggle);
    startButton.disabled = false;
  }
  else
  {
    startButton.textContent = "Start Conversation";
    startButton.disabled = false;
  }
}

function toggleMute(event, forceMute, isAuto = false)
{
  // Handle both event-based calls and direct function calls
  if (event && typeof event === "object" && event.stopPropagation)
  {
    event.stopPropagation();
    // This is a user-initiated manual mute (from clicking the button)
    isAuto = false;
  }

  if (!peerConnection || peerConnection.connectionState !== "connected") return;

  const previousMuteState = isMuted;

  if (isAuto)
  {
    // Auto-muting logic - only changes isAutoMuted state
    isAutoMuted = forceMute !== undefined ? forceMute : !isAutoMuted;
    console.log(`Auto-mute state changed to: ${isAutoMuted}`);

    // Only apply auto-muting if the user hasn't already manually muted
    if (!userMuteState)
    {
      isMuted = isAutoMuted;
      applyMuteState();
    }
  }
  else
  {
    // Manual muting by user - takes precedence and remembers user's choice
    userMuteState = forceMute !== undefined ? forceMute : !userMuteState;
    console.log(`User mute state changed to: ${userMuteState}`);

    // Manual muting always applies immediately
    isMuted = userMuteState;
    applyMuteState();
  }

  // Only update the UI if the effective mute state changed
  if (previousMuteState !== isMuted)
  {
    updateButtonState();
  }

  return isMuted;
}

function applyMuteState()
{
  console.log(`Applying mute state: ${isMuted}`);
  peerConnection.getSenders().forEach((sender) =>
  {
    if (sender.track && sender.track.kind === "audio")
    {
      sender.track.enabled = !isMuted;
      console.log(`Audio track ${sender.track.id} enabled: ${!isMuted}`);
    }
  });
}

function setupOutputVisualization(stream)
{
  // Create separate audio context for output visualization
  audioContext_output = new (window.AudioContext || window.webkitAudioContext)();
  analyser_output = audioContext_output.createAnalyser();
  audioSource_output = audioContext_output.createMediaStreamSource(stream);
  audioSource_output.connect(analyser_output);
  analyser_output.fftSize = 2048;
  dataArray_output = new Uint8Array(analyser_output.frequencyBinCount);

  // Constants for auto-muting
  const AUDIO_THRESHOLD = 0.05; // Threshold for considering audio "active"
  const DEBOUNCE_TIME = 1500; // Milliseconds to wait before changing auto-mute state

  function updateVisualization()
    {
        // Update output audio visualization (wave bars)
        analyser_output.getByteFrequencyData(dataArray_output);

        // Calculate average audio level for the output audio
        const average =
          Array.from(dataArray_output).reduce((a, b) => a + b, 0) /
          dataArray_output.length;
        const normalizedLevel = average / 255;

        // Auto-muting logic based on audio output level
        if (normalizedLevel > AUDIO_THRESHOLD)
        {
          // Audio output detected - mute the microphone if not already muted
          if (!isAutoMuted)
          {
            console.log("Output audio detected, auto-muting microphone");
            // Clear any pending unmute timeout
            if (outputAudioDebounceTimeout)
            {
              clearTimeout(outputAudioDebounceTimeout);
              outputAudioDebounceTimeout = null;
            }
            // Apply auto-muting
            toggleMute(null, true, true);
          }
        }
        else if (isAutoMuted && !userMuteState)
        {
          // No audio output detected, but we're auto-muted - set up debounce to unmute
          if (!outputAudioDebounceTimeout)
          {
            outputAudioDebounceTimeout = setTimeout(() =>
            {
              console.log("Output audio ended, auto-unmuting microphone");
              toggleMute(null, false, true);
              outputAudioDebounceTimeout = null;
            }, DEBOUNCE_TIME);
          }
        }

        // Update visualization
        const boxes = document.querySelectorAll(".box");
        for (let i = 0; i < boxes.length; i++)
        {
          const index = Math.floor((i * dataArray_output.length) / boxes.length);
          const value = Math.max(0.1, (dataArray_output[index] / 255) * 1.5);
          boxes[i].style.transform = `scaleY(${value})`;
        }

        animationFrame_output = requestAnimationFrame(updateVisualization);
    }

  updateVisualization();
}

/////////////////////////Screen Sharing Functionality/////////////////////////

let mediaRecorder;
let recordedChunks = [];
let video_stream = null;

async function startScreenShareStream()
{
    // Getting the screen stream + system audio.
    // It will also add the video_stream to to the peerConnection, that way it will reach the backend.
    try
    {
        video_stream = await navigator.mediaDevices.getDisplayMedia(
        {
            video: true,
            audio: true,
        });

        // Confirm it's a MediaStream
        if (!(video_stream instanceof MediaStream))
        {
            console.error("Returned object is not a MediaStream", video_stream);
            return;
        }

        /*
        This FastRTC approach was abandoned because it is actually a webRTC functionality.
        FastRTC is optimized for audio only. It also does not allow you to access the webRTC video stream directly..
        We would have to put in a lot of effort to customize FastRTC to work with video.
        So, we took another approach.
        video_stream.getTracks().forEach((track) =>
        {
          // Adding the track to the peer connection, now we can send video+audio
          peerConnection.addTrack(track, video_stream);
        });
        */
        // videoElement.srcObject = video_stream;

        // We are using the current time as the name of the recordings
        // This will keep them in order
        // SO, we call this function, so that before the recording starts, we have the time when it started as the name
        const response = await fetch(backend_address + '/update_time',
        {
  	method: "GET",
  	credentials: "include", // 👈 this is critical for cookies/session
	})

        mediaRecorder = new MediaRecorder(video_stream, { mimeType: 'video/webm' });

        // Every time the recorder has data, this event fires.
        // It collects the video in chunks and stores them in recordedChunks.
        mediaRecorder.ondataavailable = (event) =>
        {
            if (event.data.size > 0)
            {
                // If the data is available, it means we have a chunk of video.
                recordedChunks.push(event.data);
                // Uploading the video after every chunk is available.
                uploadRecording();
            }
        };

        // Starts the recording.
        mediaRecorder.start(1000); // Emit chunks every 0.5 second
    }
    catch (err)
    {
        console.error("Error getting display media:", err);
    }
}

async function uploadRecording()
{
    /*
    This function will send the recorded video to the backend. If it is successful, it will clear the recordedChunks array.
    Otherwise, it will keep it and try again when it is called.
    */

    if (recordedChunks.length === 0)
    {
        console.warn("No recorded chunks to upload.");
    }
    else
    {
        // The chunks are combined into a single Blob (basically a video file in memory).
        // A FormData object is created to send the file via HTTP POST as if it were a file upload.
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('video', blob, 'recording.webm');

        // Sends the video to your backend endpoint (/upload_video) using a POST request.
        try
        {
            const response = await fetch(backend_address + '/upload_video',
            {
                method: 'POST',
                credentials: "include", // 👈 this is critical for cookies/session
                body: formData
            });

            // If the response was good, then it means the upload was successful. and now we should clear the recordedChunks array.
            if (response.ok)
            {
                console.log("Upload successful");
                recordedChunks = []; // Clear only on success
            }
            else
            {
                // If the response was not ok, it means the upload failed.
                // This can happen due to multiple issues (bad internet connection, server issues, etc.).
                // So, we will simply try again when this function is called next time.
                console.warn("Upload failed with status:", response.status);
            }
        }
        catch (error)
        {
            // If the response was not ok, it means the upload failed.
            // This can happen due to multiple issues (bad internet connection, server issues, etc.).
            // So, we will simply try again when this function is called next time.
            console.error("Upload failed due to network error:", error);
        }
    }
}

// Stop the screen sharing stream and reset everything
async function stopScreenShareStream()
{
    console.log("Stopping screen share stream...");

    // Stop the media recorder if it's running
    if (mediaRecorder && mediaRecorder.state !== "inactive")
    {
        mediaRecorder.stop();
    }

    // Upload any remaining video chunks
    await uploadRecording(); // Waits for upload to finish

    // Signal backend to start video stitching
    // const response = await fetch(backend_address + '/stop_screen_sharing')
    // Stop all tracks in the screen stream (release camera/mic resources)
    if (video_stream)
    {
        video_stream.getTracks().forEach(track => track.stop());
        video_stream = null;
    }

    console.log("Screen share stream stopped.");
}

/////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////Interview History Maintainance Functionality/////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
function recoverInterviewHistory()
{
    try
    {
        const eventSource = new EventSource("/recover-interview-history");

        eventSource.onmessage = (event) =>
        {
            try
            {
                const data = JSON.parse(event.data);
                console.log("Recovered message:", data);

                if (data?.content?.message)
                {
                    messages.push({
                        role: data.role,
                        content: data.content.message
                    });
                }

                addMessage(data.role, data.content);
            }
            catch (err)
            {
                console.error("Failed to parse event data:", event.data);
            }
        };

        eventSource.onerror = (error) =>
        {
            console.error("Error in EventSource:", error);
            eventSource.close();
        };
    }
    catch (error)
    {
        console.error("Network or EventSource error:", error);
    }
}




