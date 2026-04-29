import { useEffect, useRef, useState, useCallback } from "react";
import {
    Play, Pause, Stop, DownloadSimple, UploadSimple,
    SpeakerHigh, Equalizer, Waveform, ArrowClockwise, YoutubeLogo,
} from "@phosphor-icons/react";
import axios from "axios";
import { API } from "./HeroNav";

// ── helpers ──────────────────────────────────────────────────────────────────
function encodeWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.getChannelData(0);
    const totalSamples = buffer.length * numCh;
    const byteLength = 44 + totalSamples * 2;
    const ab = new ArrayBuffer(byteLength);
    const view = new DataView(ab);
    const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, "RIFF"); view.setUint32(4, byteLength - 8, true);
    writeStr(8, "WAVE"); writeStr(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numCh * 2, true);
    view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
    writeStr(36, "data"); view.setUint32(40, totalSamples * 2, true);
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numCh; ch++) {
            const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([ab], { type: "audio/wav" });
}

function Knob({ label, value, min, max, step = 1, unit = "", onChange, color = "text-primary" }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <span className={`text-[10px] font-mono uppercase tracking-[0.2em] ${color}`}>{label}</span>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-24 accent-current"
                style={{ accentColor: "currentColor" }}
            />
            <span className="text-[11px] font-mono text-muted-foreground">{value > 0 && unit !== "dB" ? "+" : ""}{value}{unit}</span>
        </div>
    );
}

// ── main component ────────────────────────────────────────────────────────────
export function AudioEnhancement({ videoId }) {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState("idle"); // idle | loading | ready | playing | paused | exporting
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [error, setError] = useState("");

    // Enhancement settings
    const [bass, setBass] = useState(0);       // -12 to +12 dB
    const [mid, setMid] = useState(0);
    const [treble, setTreble] = useState(0);
    const [noiseGate, setNoiseGate] = useState(0);   // 0–40 dB threshold
    const [compression, setCompression] = useState(4); // ratio 1–20
    const [volume, setVolume] = useState(100);  // 0–150 %
    const [stereoWidth, setStereoWidth] = useState(100); // 0–200 %

    const canvasRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);
    const audioCtxRef = useRef(null);
    const sourceRef = useRef(null);
    const gainRef = useRef(null);
    const bufferRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const fileInputRef = useRef(null);

    // build the audio graph
    const buildGraph = useCallback(() => {
        if (!audioCtxRef.current || !bufferRef.current) return null;
        const ctx = audioCtxRef.current;

        const src = ctx.createBufferSource();
        src.buffer = bufferRef.current;

        // Bass shelf
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200; bassFilter.gain.value = bass;

        // Mid peaking
        const midFilter = ctx.createBiquadFilter();
        midFilter.type = "peaking"; midFilter.frequency.value = 1000; midFilter.Q.value = 1; midFilter.gain.value = mid;

        // Treble shelf
        const trebleFilter = ctx.createBiquadFilter();
        trebleFilter.type = "highshelf"; trebleFilter.frequency.value = 4000; trebleFilter.gain.value = treble;

        // High-pass for noise gate simulation
        const hpFilter = ctx.createBiquadFilter();
        hpFilter.type = "highpass"; hpFilter.frequency.value = noiseGate > 0 ? 20 + noiseGate * 12 : 0;

        // Compressor
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = compression;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // Gain (volume)
        const gainNode = ctx.createGain();
        gainNode.gain.value = volume / 100;

        // Analyser
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        src.connect(hpFilter).connect(bassFilter).connect(midFilter).connect(trebleFilter).connect(compressor).connect(gainNode).connect(analyser).connect(ctx.destination);
        gainRef.current = gainNode;
        return src;
    }, [bass, mid, treble, noiseGate, compression, volume]);

    // draw waveform
    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width; const H = canvas.height;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillRect(0, 0, W, H);
        // grid
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke(); }
        // waveform
        const gradient = ctx.createLinearGradient(0, 0, W, 0);
        gradient.addColorStop(0, "#6366f1"); gradient.addColorStop(0.5, "#8b5cf6"); gradient.addColorStop(1, "#ec4899");
        ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.beginPath();
        const sliceW = W / data.length;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0; const y = (v * H) / 2;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            x += sliceW;
        }
        ctx.stroke();
    }, []);

    const loop = useCallback(() => {
        drawWaveform();
        if (audioCtxRef.current && status === "playing") {
            setCurrentTime(audioCtxRef.current.currentTime - startTimeRef.current + pauseOffsetRef.current);
        }
        rafRef.current = requestAnimationFrame(loop);
    }, [drawWaveform, status]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [loop]);

    const stopSource = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch { }
            sourceRef.current = null;
        }
    };

    const handleFile = async (f) => {
        setError("");
        setFile(f);
        setStatus("loading");
        setCurrentTime(0); pauseOffsetRef.current = 0;
        stopSource();
        if (audioCtxRef.current) { await audioCtxRef.current.close(); }
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        try {
            const ab = await f.arrayBuffer();
            bufferRef.current = await audioCtxRef.current.decodeAudioData(ab);
            setDuration(bufferRef.current.duration);
            setStatus("ready");
        } catch (e) {
            setError("Could not decode audio. Try MP3, WAV, OGG, or MP4.");
            setStatus("idle");
        }
    };

    const loadYoutubeAudio = async () => {
        if (!videoId) return;
        setError("");
        setStatus("loading");
        try {
            // Fetch the stream directly
            const resp = await fetch(`${API}/media/stream-audio?v=${videoId}`);
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(errText || "Failed to download audio stream");
            }
            
            const ab = await resp.arrayBuffer();
            
            setFile({ name: `YouTube Audio (${videoId})` });
            setCurrentTime(0); pauseOffsetRef.current = 0;
            stopSource();
            if (audioCtxRef.current) { await audioCtxRef.current.close(); }
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            
            bufferRef.current = await audioCtxRef.current.decodeAudioData(ab);
            setDuration(bufferRef.current.duration);
            setStatus("ready");
        } catch (e) {
            setError("Failed to fetch YouTube audio directly. " + (e.response?.data?.detail || e.message));
            setStatus("idle");
        }
    };


    const play = () => {
        if (!bufferRef.current || !audioCtxRef.current) return;
        if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
        stopSource();
        const src = buildGraph();
        src.start(0, pauseOffsetRef.current);
        sourceRef.current = src;
        startTimeRef.current = audioCtxRef.current.currentTime;
        src.onended = () => {
            if (status === "playing") { pauseOffsetRef.current = 0; setCurrentTime(0); setStatus("ready"); }
        };
        setStatus("playing");
    };

    const pause = () => {
        if (!audioCtxRef.current) return;
        pauseOffsetRef.current += audioCtxRef.current.currentTime - startTimeRef.current;
        stopSource();
        setStatus("paused");
    };

    const stop = () => {
        stopSource();
        pauseOffsetRef.current = 0;
        setCurrentTime(0);
        setStatus("ready");
    };

    // Re-apply graph changes while playing
    useEffect(() => {
        if (status === "playing") { pause(); setTimeout(play, 50); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bass, mid, treble, noiseGate, compression, volume]);

    const exportWav = async () => {
        if (!bufferRef.current) return;
        setStatus("exporting");
        try {
            // Render offline
            const offCtx = new OfflineAudioContext(
                bufferRef.current.numberOfChannels,
                bufferRef.current.length,
                bufferRef.current.sampleRate
            );
            const src = offCtx.createBufferSource(); src.buffer = bufferRef.current;
            const bf = offCtx.createBiquadFilter(); bf.type = "lowshelf"; bf.frequency.value = 200; bf.gain.value = bass;
            const mf = offCtx.createBiquadFilter(); mf.type = "peaking"; mf.frequency.value = 1000; mf.Q.value = 1; mf.gain.value = mid;
            const tf = offCtx.createBiquadFilter(); tf.type = "highshelf"; tf.frequency.value = 4000; tf.gain.value = treble;
            const hp = offCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = noiseGate > 0 ? 20 + noiseGate * 12 : 0;
            const comp = offCtx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = compression;
            const gain = offCtx.createGain(); gain.gain.value = volume / 100;
            src.connect(hp).connect(bf).connect(mf).connect(tf).connect(comp).connect(gain).connect(offCtx.destination);
            src.start(0);
            const rendered = await offCtx.startRendering();
            const blob = encodeWav(rendered);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = (file?.name?.replace(/\.[^.]+$/, "") || "enhanced") + "_enhanced.wav";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (e) { setError("Export failed: " + e.message); }
        setStatus(bufferRef.current ? "ready" : "idle");
    };

    const reset = () => { setBass(0); setMid(0); setTreble(0); setNoiseGate(0); setCompression(4); setVolume(100); setStereoWidth(100); };

    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
    const isReady = ["ready", "playing", "paused"].includes(status);

    return (
        <div className="border border-border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <span className="pulse-dot" />
                    <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                        SYS.AUDIO / enhancement
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={reset} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        <ArrowClockwise size={12} weight="bold" /> Reset
                    </button>
                    <button
                        onClick={exportWav}
                        disabled={!isReady || status === "exporting"}
                        className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 bg-primary text-primary-foreground btn-brutal disabled:opacity-50"
                    >
                        <DownloadSimple size={12} weight="bold" />
                        {status === "exporting" ? "Exporting..." : "Export WAV"}
                    </button>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* YouTube Quick Load */}
                {videoId && !file && status !== "loading" && (
                    <div className="border border-border bg-background/40 p-4 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-mono text-foreground">Extract Original Audio</p>
                            <p className="text-xs font-mono text-muted-foreground mt-1">Directly load the audio track from the YouTube video for enhancement.</p>
                        </div>
                        <button
                            onClick={loadYoutubeAudio}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.1em] btn-brutal whitespace-nowrap"
                        >
                            <YoutubeLogo size={16} weight="fill" />
                            Load YouTube Audio
                        </button>
                    </div>
                )}

                {/* Upload zone */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    className="border-2 border-dashed border-border hover:border-primary transition-colors cursor-pointer rounded-none flex flex-col items-center justify-center gap-3 py-10 bg-background/40 hover:bg-primary/5 relative"
                >
                    <UploadSimple size={32} className="text-muted-foreground" weight="duotone" />
                    <div className="text-center">
                        <p className="text-sm font-mono text-foreground">{file ? file.name : "Drop audio/video file here"}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-1">MP3 · WAV · OGG · MP4 · M4A · FLAC</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="audio/*,video/*" className="hidden"
                        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); }} />
                </div>

                {error && <div className="text-xs font-mono text-destructive border-l-2 border-destructive pl-3">{error}</div>}

                {/* Waveform */}
                <div className="relative border border-border bg-black/40 overflow-hidden">
                    <canvas ref={canvasRef} width={1200} height={120} className="w-full h-[120px]" />
                    {/* progress overlay */}
                    {duration > 0 && (
                        <div className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all" style={{ width: `${progress}%` }} />
                    )}
                    {!isReady && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.3em]">
                                {status === "loading" ? "Decoding audio..." : "No file loaded"}
                            </span>
                        </div>
                    )}
                </div>

                {/* Transport controls */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {status === "playing" ? (
                            <button onClick={pause} disabled={!isReady} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.2em] btn-brutal disabled:opacity-50">
                                <Pause size={14} weight="fill" /> Pause
                            </button>
                        ) : (
                            <button onClick={play} disabled={!isReady} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.2em] btn-brutal disabled:opacity-50">
                                <Play size={14} weight="fill" /> Play
                            </button>
                        )}
                        <button onClick={stop} disabled={!isReady} className="flex items-center gap-2 px-3 py-2 border border-border text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40">
                            <Stop size={14} weight="fill" />
                        </button>
                    </div>
                    <div className="flex-1 text-xs font-mono text-muted-foreground flex items-center gap-3">
                        <span>{fmtTime(currentTime)}</span>
                        <div className="flex-1 h-1 bg-border relative">
                            <div className="absolute left-0 top-0 h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span>{fmtTime(duration)}</span>
                    </div>
                </div>

                {/* EQ Section */}
                <div className="border border-border bg-background/40 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Equalizer size={16} className="text-primary" weight="duotone" />
                        <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// EQUALIZER</span>
                    </div>
                    <div className="flex flex-wrap justify-around gap-6">
                        <Knob label="Bass" value={bass} min={-12} max={12} unit=" dB" onChange={setBass} />
                        <Knob label="Mid" value={mid} min={-12} max={12} unit=" dB" onChange={setMid} />
                        <Knob label="Treble" value={treble} min={-12} max={12} unit=" dB" onChange={setTreble} />
                    </div>
                </div>

                {/* Processing Section */}
                <div className="border border-border bg-background/40 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Waveform size={16} className="text-primary" weight="duotone" />
                        <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// PROCESSING</span>
                    </div>
                    <div className="flex flex-wrap justify-around gap-6">
                        <Knob label="Noise Gate" value={noiseGate} min={0} max={40} unit="" onChange={setNoiseGate} color="text-violet-400" />
                        <Knob label="Compression" value={compression} min={1} max={20} unit=":1" onChange={setCompression} color="text-violet-400" />
                        <Knob label="Volume" value={volume} min={0} max={150} unit="%" onChange={setVolume} color="text-violet-400" />
                    </div>
                </div>

                {/* Presets */}
                <div className="border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-3 mb-4">
                        <SpeakerHigh size={14} className="text-primary" weight="duotone" />
                        <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// PRESETS</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { label: "Flat", fn: () => { setBass(0); setMid(0); setTreble(0); setNoiseGate(0); setCompression(4); setVolume(100); } },
                            { label: "Voice Boost", fn: () => { setBass(-3); setMid(6); setTreble(4); setNoiseGate(15); setCompression(8); setVolume(110); } },
                            { label: "Podcast", fn: () => { setBass(2); setMid(4); setTreble(2); setNoiseGate(20); setCompression(6); setVolume(115); } },
                            { label: "Music", fn: () => { setBass(5); setMid(0); setTreble(3); setNoiseGate(5); setCompression(3); setVolume(100); } },
                            { label: "Cinematic", fn: () => { setBass(8); setMid(-2); setTreble(5); setNoiseGate(0); setCompression(2); setVolume(105); } },
                            { label: "De-noise", fn: () => { setBass(0); setMid(2); setTreble(1); setNoiseGate(35); setCompression(10); setVolume(120); } },
                        ].map(p => (
                            <button key={p.label} onClick={p.fn}
                                className="px-4 py-2 text-xs font-mono uppercase tracking-[0.15em] border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Info */}
                <div className="flex flex-wrap gap-4 text-[10px] font-mono text-muted-foreground">
                    <span>FILE [{file?.name || "none"}]</span>
                    {duration > 0 && <span>DURATION [{fmtTime(duration)}]</span>}
                    {bufferRef.current && <span>SAMPLE_RATE [{bufferRef.current?.sampleRate} Hz]</span>}
                    {bufferRef.current && <span>CHANNELS [{bufferRef.current?.numberOfChannels}]</span>}
                    <span>STATUS [{status.toUpperCase()}]</span>
                </div>
            </div>
        </div>
    );
}
