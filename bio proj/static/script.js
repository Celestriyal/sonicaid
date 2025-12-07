class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.source = null;
        this.gainNode = null;
        this.analyser = null;
        this.filterLow = null;
        this.filterHigh = null;
        this.noiseGateNode = null; // Custom script processor for noise gate
        this.isRunning = false;
        
        // Settings
        this.volume = 1.0;
        this.threshold = 0.01;
        
        // UI Elements
        this.canvas = document.getElementById('visualizer');
        this.canvasCtx = this.canvas.getContext('2d');
        this.statusText = document.getElementById('statusText');
        this.statusIndicator = document.querySelector('.status-indicator');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    async start() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Get Microphone Access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false, // We want to do this ourselves
                    autoGainControl: false,
                    latency: 0
                } 
            });

            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // 1. Bandpass Filter (300Hz - 3400Hz for human voice)
            // Low Cut (High Pass)
            this.filterHigh = this.audioContext.createBiquadFilter();
            this.filterHigh.type = 'highpass';
            this.filterHigh.frequency.value = 300;

            // High Cut (Low Pass)
            this.filterLow = this.audioContext.createBiquadFilter();
            this.filterLow.type = 'lowpass';
            this.filterLow.frequency.value = 3400;

            // 2. Gain (Amplification)
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;

            // 3. Simple Noise Gate using ScriptProcessor (Deprecated but widely supported for simple logic)
            // In a production app, use AudioWorklet.
            this.noiseGateNode = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.noiseGateNode.onaudioprocess = (audioProcessingEvent) => {
                const inputBuffer = audioProcessingEvent.inputBuffer;
                const outputBuffer = audioProcessingEvent.outputBuffer;
                const inputData = inputBuffer.getChannelData(0);
                const outputData = outputBuffer.getChannelData(0);

                // Simple Gate Logic
                for (let i = 0; i < inputBuffer.length; i++) {
                    const sample = inputData[i];
                    // If absolute value is below threshold, mute it (or fade it)
                    if (Math.abs(sample) < this.threshold) {
                         // Smooth fade could be better, but hard cut for simple gate
                        outputData[i] = 0; 
                    } else {
                        outputData[i] = sample;
                    }
                }
            };

            // 4. Analyser for Visuals
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;

            // Connect the graph
            // Source -> FilterHigh -> FilterLow -> NoiseGate -> Gain -> Analyser -> Destination
            this.source.connect(this.filterHigh);
            this.filterHigh.connect(this.filterLow);
            this.filterLow.connect(this.noiseGateNode);
            this.noiseGateNode.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.isRunning = true;
            this.statusText.textContent = "System Active • Listening";
            this.statusIndicator.classList.add('active');
            
            this.draw();

        } catch (err) {
            console.error('Error accessing microphone:', err);
            this.statusText.textContent = "Error: " + err.message;
            alert("Microphone access denied or error occurred.");
        }
    }

    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.isRunning = false;
        this.statusText.textContent = "System Standby";
        this.statusIndicator.classList.remove('active');
    }

    updateVolume(value) {
        this.volume = parseFloat(value);
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }

    updateThreshold(value) {
        this.threshold = parseFloat(value);
    }

    draw() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.draw());

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        this.canvasCtx.fillStyle = '#1e1e1e'; // Clear color
        this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.strokeStyle = '#00f2ea'; // Waveform color
        this.canvasCtx.beginPath();

        const sliceWidth = this.canvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * (this.canvas.height / 2);

            if (i === 0) {
                this.canvasCtx.moveTo(x, y);
            } else {
                this.canvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
        this.canvasCtx.stroke();
    }
}

// UI Interaction
document.addEventListener('DOMContentLoaded', () => {
    const processor = new AudioProcessor();
    const toggleBtn = document.getElementById('toggleBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const volumeValue = document.getElementById('volumeValue');
    const thresholdValue = document.getElementById('thresholdValue');

    toggleBtn.addEventListener('click', () => {
        if (processor.isRunning) {
            processor.stop();
            toggleBtn.classList.remove('active');
            toggleBtn.querySelector('span').textContent = "Start System";
        } else {
            processor.start();
            toggleBtn.classList.add('active');
            toggleBtn.querySelector('span').textContent = "Stop System";
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        volumeValue.textContent = val + 'x';
        processor.updateVolume(val);
    });

    thresholdSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        thresholdValue.textContent = val;
        processor.updateThreshold(val);
    });
});
