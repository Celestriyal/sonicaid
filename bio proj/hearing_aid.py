import tkinter as tk
from tkinter import ttk
import sounddevice as sd
import numpy as np
from scipy import signal
import queue
import sys

class HearingAidApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Python Hearing Aid & Denoise")
        self.root.geometry("400x350")
        
        # Audio Configuration
        self.sample_rate = 44100
        self.block_size = 1024
        self.channels = 1
        self.stream = None
        self.is_running = False
        
        # Audio Processing State
        self.sos = signal.butter(6, [300, 3400], btype='bandpass', fs=self.sample_rate, output='sos')
        self.filter_state = signal.sosfilt_zi(self.sos)
        
        # UI Variables
        self.volume_var = tk.DoubleVar(value=5.0)
        self.threshold_var = tk.DoubleVar(value=0.02)
        self.status_var = tk.StringVar(value="Status: Stopped")
        
        self.create_widgets()

    def create_widgets(self):
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Title
        ttk.Label(main_frame, text="Real-Time Noise Filter", font=("Helvetica", 16, "bold")).pack(pady=10)

        # Volume Control
        control_frame = ttk.LabelFrame(main_frame, text="Controls", padding="10")
        control_frame.pack(fill=tk.X, pady=10)

        ttk.Label(control_frame, text="Amplification (Gain):").pack(anchor=tk.W)
        vol_slider = ttk.Scale(control_frame, from_=1.0, to=20.0, variable=self.volume_var, orient=tk.HORIZONTAL)
        vol_slider.pack(fill=tk.X, pady=5)

        # Noise Gate Threshold
        ttk.Label(control_frame, text="Noise Gate Threshold:").pack(anchor=tk.W)
        thresh_slider = ttk.Scale(control_frame, from_=0.0, to=0.2, variable=self.threshold_var, orient=tk.HORIZONTAL)
        thresh_slider.pack(fill=tk.X, pady=5)
        
        # Buttons
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(pady=20)
        
        self.start_btn = ttk.Button(btn_frame, text="Start Listening", command=self.start_processing)
        self.start_btn.pack(side=tk.LEFT, padx=5)
        
        self.stop_btn = ttk.Button(btn_frame, text="Stop", command=self.stop_processing, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)

        # Status
        ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN).pack(fill=tk.X, pady=10)

    def audio_callback(self, indata, outdata, frames, time, status):
        if status:
            print(status, file=sys.stderr)
        
        # 1. Bandpass Filter (Human Voice Range: 300Hz - 3400Hz)
        # We must maintain filter_state between blocks to avoid clicking artifacts
        filtered, self.filter_state = signal.sosfilt(self.sos, indata[:, 0], zi=self.filter_state)
        
        # 2. Noise Gate
        # Calculate amplitude (RMS)
        rms = np.sqrt(np.mean(filtered**2))
        threshold = self.threshold_var.get()
        
        if rms < threshold:
            # Silence the block if below threshold
            processed = np.zeros_like(filtered)
        else:
            processed = filtered
            
        # 3. Amplification (Gain)
        gain = self.volume_var.get()
        processed = processed * gain
        
        # 4. Limiter (prevent clipping distortion)
        processed = np.clip(processed, -1.0, 1.0)
        
        # Output to speakers
        outdata[:] = processed.reshape(-1, 1)

    def start_processing(self):
        try:
            # Reset filter state on start
            self.filter_state = signal.sosfilt_zi(self.sos)
            
            self.stream = sd.Stream(
                channels=self.channels,
                samplerate=self.sample_rate,
                blocksize=self.block_size,
                callback=self.audio_callback
            )
            self.stream.start()
            self.is_running = True
            
            self.status_var.set("Status: Running...")
            self.start_btn.config(state=tk.DISABLED)
            self.stop_btn.config(state=tk.NORMAL)
            
        except Exception as e:
            self.status_var.set(f"Error: {str(e)}")

    def stop_processing(self):
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
            
        self.is_running = False
        self.status_var.set("Status: Stopped")
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)

    def on_close(self):
        self.stop_processing()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = HearingAidApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()
