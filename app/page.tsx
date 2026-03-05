"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Sheet } from "@silk-hq/components";
import "@silk-hq/components/unlayered-styles";

const PAD_COLORS = [
  "#ff006e", "#ff4d6d", "#ff758f", "#ff8fa3",
  "#c77dff", "#9d4edd", "#7b2cbf", "#5a189a",
  "#00b4d8", "#0096c7", "#0077b6", "#023e8a",
  "#06d6a0", "#00c49a", "#00b894", "#00a88a",
];

const KEY_MAP: Record<string, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3,
  q: 4, w: 5, e: 6, r: 7,
  a: 8, s: 9, d: 10, f: 11,
  z: 12, x: 13, c: 14, v: 15,
};

const PAD_KEYS = ["1","2","3","4","Q","W","E","R","A","S","D","F","Z","X","C","V"];

const SAMPLE_TRACKS = [
  { name: "Funky Groove", path: "/samples/funky-groove.mp3" },
  { name: "Retro Soul", path: "/samples/retro-soul.mp3" },
  { name: "Chill Beat", path: "/samples/chill-beat.mp3" },
];

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  artist: { name: string };
  album: { cover_small: string; cover_medium: string };
}

type PadCount = 8 | 16 | 32;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function ChopPage() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [trackArtist, setTrackArtist] = useState("");
  const [duration, setDuration] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [padCount, setPadCount] = useState<PadCount>(16);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingRegion, setPlayingRegion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [playbackPos, setPlaybackPos] = useState<number | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DeezerTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingTrackId, setLoadingTrackId] = useState<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom per-pad slices — persists across pad count changes
  const [customSlices, setCustomSlices] = useState<Map<number, { start: number; end: number }>>(new Map());

  // Pad editor sheet state
  const [editingPad, setEditingPad] = useState<number | null>(null);
  const [editIn, setEditIn] = useState(0);
  const [editOut, setEditOut] = useState(0);
  const [previewingEdit, setPreviewingEdit] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const fullSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fullStartTimeRef = useRef<number>(0);
  const fullOffsetRef = useRef<number>(0);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const padWaveformRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number>(0);
  const heldKeysRef = useRef<Set<string>>(new Set());

  // Editor sheet refs
  const editCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const draggingRef = useRef<"in" | "out" | "pan" | null>(null);
  // Refs to hold latest edit values during drag (avoids stale closure)
  const editInRef = useRef(0);
  const editOutRef = useRef(0);
  // Zoom & pan: viewStart/viewEnd define the visible time window (in seconds)
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const viewStartRef = useRef(0);
  const viewEndRef = useRef(0);
  // Smooth dragging: offset from grab point to handle position
  const dragOffsetRef = useRef(0);
  const panStartXRef = useRef(0);
  const panStartViewRef = useRef(0);

  // Reset to home state helper
  const resetToHome = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    if (fullSourceRef.current) { try { fullSourceRef.current.stop(); } catch {} fullSourceRef.current = null; }
    if (previewSourceRef.current) { try { previewSourceRef.current.stop(); } catch {} previewSourceRef.current = null; }
    setIsPlaying(false);
    setPlayingRegion(null);
    setPlaybackPos(null);
    setAudioBuffer(null);
    setFileName("");
    setTrackArtist("");
    setDuration(0);
    setBpm(null);
    setActivePads(new Set());
    setSearchQuery("");
    setSearchResults([]);
    setCustomSlices(new Map());
    setEditingPad(null);
    setPreviewingEdit(false);
  }, []);

  // Browser back button support — push state when song loads, pop to go home
  useEffect(() => {
    const handlePopState = () => {
      resetToHome();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [resetToHome]);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.gain.value = volume;
      gainNodeRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/deezer?q=${encodeURIComponent(searchQuery.trim())}`);
        const json = await res.json();
        setSearchResults(json.data || []);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const getSlices = useCallback(() => {
    if (!audioBuffer) return [];
    const sliceDuration = audioBuffer.duration / padCount;
    return Array.from({ length: padCount }, (_, i) => ({
      index: i,
      start: i * sliceDuration,
      end: (i + 1) * sliceDuration,
      duration: sliceDuration,
    }));
  }, [audioBuffer, padCount]);

  const detectBPM = useCallback((buffer: AudioBuffer): number => {
    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const step = Math.floor(sampleRate / 200);
    const samples: number[] = [];
    for (let i = 0; i < rawData.length; i += step) {
      samples.push(Math.abs(rawData[i]));
    }
    const smoothed: number[] = [];
    const window = 5;
    for (let i = 0; i < samples.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - window); j <= Math.min(samples.length - 1, i + window); j++) {
        sum += samples[j]; count++;
      }
      smoothed.push(sum / count);
    }
    const threshold = smoothed.reduce((a, b) => a + b, 0) / smoothed.length * 1.4;
    const peaks: number[] = [];
    const minDist = 10;
    for (let i = 1; i < smoothed.length - 1; i++) {
      if (smoothed[i] > threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
        if (peaks.length === 0 || i - peaks[peaks.length - 1] > minDist) {
          peaks.push(i);
        }
      }
    }
    if (peaks.length < 2) return 120;
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }
    const counts = new Map<number, number>();
    for (const iv of intervals) {
      const rounded = Math.round(iv);
      counts.set(rounded, (counts.get(rounded) || 0) + 1);
    }
    let modeInterval = intervals[0];
    let maxCount = 0;
    counts.forEach((c, iv) => { if (c > maxCount) { maxCount = c; modeInterval = iv; } });
    const secondsPerBeat = (modeInterval * step) / sampleRate;
    const detectedBpm = Math.round(60 / secondsPerBeat);
    if (detectedBpm > 60 && detectedBpm < 200) return detectedBpm;
    return 120;
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setPlaybackPos(null);
      cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const tick = () => {
      if (!audioCtxRef.current || !fullSourceRef.current || !audioBuffer) return;
      const elapsed = audioCtxRef.current.currentTime - fullStartTimeRef.current + fullOffsetRef.current;
      if (elapsed >= audioBuffer.duration) {
        setPlaybackPos(null);
        return;
      }
      setPlaybackPos(elapsed / audioBuffer.duration);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, audioBuffer]);

  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / w);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.floor(x * data.length / w);
      let min = 1, max = -1;
      for (let j = 0; j < step && idx + j < data.length; j++) {
        const v = data[idx + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, (1 + min) * h / 2);
      ctx.lineTo(x, (1 + max) * h / 2);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#00b4d8";
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.floor(x * data.length / w);
      let min = 1, max = -1;
      for (let j = 0; j < step && idx + j < data.length; j++) {
        const v = data[idx + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, (1 + min) * h / 2);
      ctx.lineTo(x, (1 + max) * h / 2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const slices = padCount;
    ctx.strokeStyle = "#ff006e";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 1; i < slices; i++) {
      const x = (i / slices) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (playingRegion !== null) {
      const x1 = (playingRegion / slices) * w;
      const x2 = ((playingRegion + 1) / slices) * w;
      ctx.fillStyle = "rgba(255, 0, 110, 0.15)";
      ctx.fillRect(x1, 0, x2 - x1, h);
    }

    if (playbackPos !== null) {
      const cx = playbackPos * w;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    }
  }, [audioBuffer, padCount, playingRegion, playbackPos]);

  const drawPadWaveform = useCallback((canvas: HTMLCanvasElement, padIndex: number) => {
    if (!audioBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const data = audioBuffer.getChannelData(0);
    let startSample: number, endSample: number;
    const custom = customSlices.get(padIndex);
    if (custom) {
      startSample = Math.floor((custom.start / audioBuffer.duration) * data.length);
      endSample = Math.floor((custom.end / audioBuffer.duration) * data.length);
    } else {
      const sliceSamples = Math.floor(data.length / padCount);
      startSample = padIndex * sliceSamples;
      endSample = Math.min(startSample + sliceSamples, data.length);
    }
    const sliceLen = endSample - startSample;
    const step = Math.max(1, Math.ceil(sliceLen / w));

    ctx.strokeStyle = custom ? "rgba(255,180,100,0.4)" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = startSample + Math.floor(x * sliceLen / w);
      let min = 1, max = -1;
      for (let j = 0; j < step && idx + j < endSample; j++) {
        const v = data[idx + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x, (1 + min) * h / 2);
      ctx.lineTo(x, (1 + max) * h / 2);
    }
    ctx.stroke();
  }, [audioBuffer, padCount, customSlices]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    padWaveformRefs.current.forEach((canvas, idx) => {
      drawPadWaveform(canvas, idx);
    });
  }, [audioBuffer, padCount, drawPadWaveform]);

  const loadAudioBuffer = useCallback(async (arrayBuffer: ArrayBuffer, name: string, artist?: string) => {
    setLoading(true);
    const ctx = getAudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    setAudioBuffer(decoded);
    setFileName(name);
    setTrackArtist(artist || "");
    setDuration(decoded.duration);
    const detectedBpm = detectBPM(decoded);
    setBpm(detectedBpm);
    setLoading(false);
    // Push history state so browser back button returns to home
    window.history.pushState({ chop: "playing" }, "");
  }, [getAudioContext, detectBPM]);

  const handleFile = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    setPadCount(16);
    await loadAudioBuffer(arrayBuffer, file.name);
  }, [loadAudioBuffer]);

  const handleSampleLoad = useCallback(async (sample: typeof SAMPLE_TRACKS[number]) => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    setLoadingSample(sample.name);
    setLoading(true);
    try {
      const response = await fetch(sample.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      await loadAudioBuffer(arrayBuffer, sample.name);
    } catch (err) {
      console.error("Failed to load sample:", err);
      alert("Failed to load sample. Try again or upload your own file.");
      setLoading(false);
    }
    setLoadingSample(null);
  }, [getAudioContext, loadAudioBuffer]);

  const handleDeezerLoad = useCallback(async (track: DeezerTrack) => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    setLoadingTrackId(track.id);
    try {
      const response = await fetch(track.preview);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      setPadCount(8);
      await loadAudioBuffer(arrayBuffer, track.title, track.artist.name);
    } catch (err) {
      console.error("Failed to load track:", err);
      alert("Failed to load track preview. Try another.");
    }
    setLoadingTrackId(null);
  }, [getAudioContext, loadAudioBuffer]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const triggerPad = useCallback((index: number) => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();

    // Use custom slice if present, otherwise fall back to auto-chop
    let start: number, duration: number;
    const custom = customSlices.get(index);
    if (custom) {
      start = custom.start;
      duration = custom.end - custom.start;
    } else {
      const slices = getSlices();
      const slice = slices[index];
      if (!slice) return;
      start = slice.start;
      duration = slice.duration;
    }

    const existing = sourcesRef.current.get(index);
    if (existing) {
      try { existing.stop(); } catch {}
      sourcesRef.current.delete(index);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current!);
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = start + duration;
    source.start(0, start);
    sourcesRef.current.set(index, source);

    setActivePads(prev => new Set(prev).add(index));
    setPlayingRegion(index);
  }, [audioBuffer, getAudioContext, getSlices, customSlices]);

  const releasePad = useCallback((index: number) => {
    const source = sourcesRef.current.get(index);
    if (source) {
      try { source.stop(); } catch {}
      sourcesRef.current.delete(index);
    }
    setActivePads(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setPlayingRegion(prev => prev === index ? null : prev);
  }, []);

  const toggleFullPlay = useCallback(() => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();
    if (isPlaying && fullSourceRef.current) {
      const elapsed = ctx.currentTime - fullStartTimeRef.current + fullOffsetRef.current;
      fullOffsetRef.current = elapsed;
      try { fullSourceRef.current.stop(); } catch {}
      fullSourceRef.current = null;
      setIsPlaying(false);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current!);
    const offset = fullOffsetRef.current;
    source.start(0, offset);
    fullStartTimeRef.current = ctx.currentTime;
    fullSourceRef.current = source;
    setIsPlaying(true);
    source.onended = () => {
      if (fullSourceRef.current === source) {
        setIsPlaying(false);
        fullSourceRef.current = null;
        fullOffsetRef.current = 0;
      }
    };
  }, [audioBuffer, isPlaying, getAudioContext]);

  const stopAll = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try { source.stop(); } catch {}
    });
    sourcesRef.current.clear();
    setActivePads(new Set());
    setPlayingRegion(null);
    if (fullSourceRef.current) {
      try { fullSourceRef.current.stop(); } catch {}
      fullSourceRef.current = null;
    }
    fullOffsetRef.current = 0;
    setIsPlaying(false);
  }, []);

  const seekWaveform = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer) return;
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const seekTime = ratio * audioBuffer.duration;
    fullOffsetRef.current = seekTime;

    if (isPlaying && fullSourceRef.current) {
      try { fullSourceRef.current.stop(); } catch {}
      fullSourceRef.current = null;
      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current!);
      source.start(0, seekTime);
      fullStartTimeRef.current = ctx.currentTime;
      fullSourceRef.current = source;
      source.onended = () => {
        if (fullSourceRef.current === source) {
          setIsPlaying(false);
          fullSourceRef.current = null;
          fullOffsetRef.current = 0;
        }
      };
    }
  }, [audioBuffer, isPlaying, getAudioContext]);

  useEffect(() => {
    if (!audioBuffer) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (heldKeysRef.current.has(key)) return;

      if (key === " ") {
        e.preventDefault();
        toggleFullPlay();
        return;
      }
      if (key === "escape") {
        e.preventDefault();
        stopAll();
        return;
      }

      const padIndex = KEY_MAP[key];
      if (padIndex !== undefined && padIndex < padCount) {
        e.preventDefault();
        heldKeysRef.current.add(key);
        triggerPad(padIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      heldKeysRef.current.delete(key);

      const padIndex = KEY_MAP[key];
      if (padIndex !== undefined && padIndex < padCount) {
        e.preventDefault();
        releasePad(padIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [audioBuffer, padCount, triggerPad, releasePad, toggleFullPlay, stopAll]);

  // ─── Pad editor ──────────────────────────────────────────────────

  const stopEditPreview = useCallback(() => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch {}
      previewSourceRef.current = null;
    }
    setPreviewingEdit(false);
  }, []);

  const openEditSheet = useCallback((padIndex: number) => {
    stopEditPreview();
    const dur = audioBuffer?.duration ?? 0;
    let inTime: number, outTime: number;
    const custom = customSlices.get(padIndex);
    if (custom) {
      inTime = custom.start;
      outTime = custom.end;
    } else {
      const slices = getSlices();
      const slice = slices[padIndex];
      if (slice) {
        inTime = slice.start;
        outTime = slice.end;
      } else {
        inTime = 0;
        outTime = dur;
      }
    }
    editInRef.current = inTime;
    editOutRef.current = outTime;
    setEditIn(inTime);
    setEditOut(outTime);

    // Auto-zoom: show the slice filling ~60% of the view, with context on each side
    const sliceDur = outTime - inTime;
    const padding = sliceDur * 0.35; // 35% padding on each side
    const vStart = Math.max(0, inTime - padding);
    const vEnd = Math.min(dur, outTime + padding);
    viewStartRef.current = vStart;
    viewEndRef.current = vEnd;
    setViewStart(vStart);
    setViewEnd(vEnd);

    setEditingPad(padIndex);
  }, [customSlices, getSlices, audioBuffer, stopEditPreview]);

  const toggleEditPreview = useCallback(() => {
    if (previewingEdit) {
      stopEditPreview();
      return;
    }
    if (!audioBuffer) return;
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current!);
    source.loop = true;
    source.loopStart = editInRef.current;
    source.loopEnd = editOutRef.current;
    source.start(0, editInRef.current);
    previewSourceRef.current = source;
    previewStartCtxTimeRef.current = ctx.currentTime;
    setPreviewingEdit(true);
  }, [previewingEdit, audioBuffer, getAudioContext, stopEditPreview]);

  const saveEditSlice = useCallback(() => {
    if (editingPad === null) return;
    stopEditPreview();
    setCustomSlices(prev => {
      const next = new Map(prev);
      next.set(editingPad, { start: editInRef.current, end: editOutRef.current });
      return next;
    });
    setEditingPad(null);
  }, [editingPad, stopEditPreview]);

  // Convert pixel x to time using current view window
  const pxToTime = useCallback((px: number, canvasWidth: number) => {
    const vDur = viewEndRef.current - viewStartRef.current;
    return viewStartRef.current + (px / canvasWidth) * vDur;
  }, []);

  const timeToPx = useCallback((time: number, canvasWidth: number) => {
    const vDur = viewEndRef.current - viewStartRef.current;
    return ((time - viewStartRef.current) / vDur) * canvasWidth;
  }, []);

  const HANDLE_HIT_PX = 30; // generous touch target for handles

  const handleEditPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = editCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const inPx = timeToPx(editInRef.current, w);
    const outPx = timeToPx(editOutRef.current, w);
    const distIn = Math.abs(x - inPx);
    const distOut = Math.abs(x - outPx);

    if (distIn < HANDLE_HIT_PX && distIn <= distOut) {
      // Grab IN handle — store offset so handle doesn't jump
      draggingRef.current = "in";
      dragOffsetRef.current = inPx - x;
    } else if (distOut < HANDLE_HIT_PX) {
      // Grab OUT handle
      draggingRef.current = "out";
      dragOffsetRef.current = outPx - x;
    } else {
      // Pan the view
      draggingRef.current = "pan";
      panStartXRef.current = x;
      panStartViewRef.current = viewStartRef.current;
    }
  }, [audioBuffer, timeToPx]);

  const handleEditPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !audioBuffer) return;
    const canvas = editCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const x = e.clientX - rect.left;
    const dur = audioBuffer.duration;

    if (draggingRef.current === "pan") {
      const dx = x - panStartXRef.current;
      const vDur = viewEndRef.current - viewStartRef.current;
      const timeDelta = -(dx / w) * vDur;
      let newStart = panStartViewRef.current + timeDelta;
      // Clamp to track bounds
      newStart = Math.max(0, Math.min(dur - vDur, newStart));
      viewStartRef.current = newStart;
      viewEndRef.current = newStart + vDur;
      setViewStart(newStart);
      setViewEnd(newStart + vDur);
      return;
    }

    // Handle dragging — apply offset for smooth grab
    const handlePx = x + dragOffsetRef.current;
    const time = pxToTime(Math.max(0, Math.min(w, handlePx)), w);
    const clampedTime = Math.max(0, Math.min(dur, time));

    if (draggingRef.current === "in") {
      const newVal = Math.min(clampedTime, editOutRef.current - 0.05);
      editInRef.current = newVal;
      setEditIn(newVal);
    } else if (draggingRef.current === "out") {
      const newVal = Math.max(clampedTime, editInRef.current + 0.05);
      editOutRef.current = newVal;
      setEditOut(newVal);
    }
    // Update live preview loop points if playing
    if (previewSourceRef.current) {
      previewSourceRef.current.loopStart = editInRef.current;
      previewSourceRef.current.loopEnd = editOutRef.current;
    }
  }, [audioBuffer, pxToTime]);

  const handleEditPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Zoom helpers
  const zoomEdit = useCallback((factor: number) => {
    if (!audioBuffer) return;
    const dur = audioBuffer.duration;
    const vDur = viewEndRef.current - viewStartRef.current;
    const center = (viewStartRef.current + viewEndRef.current) / 2;
    const newVDur = Math.max(0.2, Math.min(dur, vDur * factor));
    let newStart = center - newVDur / 2;
    let newEnd = center + newVDur / 2;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > dur) { newStart -= (newEnd - dur); newEnd = dur; }
    newStart = Math.max(0, newStart);
    viewStartRef.current = newStart;
    viewEndRef.current = newEnd;
    setViewStart(newStart);
    setViewEnd(newEnd);
  }, [audioBuffer]);

  // Draw the editor waveform — uses view window for zoom/pan
  const drawEditWaveform = useCallback(() => {
    if (editingPad === null) return;
    const canvas = editCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx2d.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const dur = audioBuffer.duration;
    const data = audioBuffer.getChannelData(0);
    const vStart = viewStartRef.current;
    const vEnd = viewEndRef.current;
    const vDur = vEnd - vStart;

    // Map time → pixel in view window
    const t2px = (t: number) => ((t - vStart) / vDur) * w;

    const inPx = t2px(editInRef.current);
    const outPx = t2px(editOutRef.current);

    // Background
    ctx2d.fillStyle = "#0d0d0d";
    ctx2d.fillRect(0, 0, w, h);

    // Waveform for visible window — dimmed
    const startSample = Math.floor((vStart / dur) * data.length);
    const endSample = Math.ceil((vEnd / dur) * data.length);
    const visibleSamples = endSample - startSample;
    const step = Math.max(1, Math.ceil(visibleSamples / w));

    ctx2d.strokeStyle = "#1a1a1a";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (let x = 0; x < w; x++) {
      const sIdx = startSample + Math.floor((x / w) * visibleSamples);
      let min = 1, max = -1;
      for (let j = 0; j < step && sIdx + j < data.length; j++) {
        const v = data[sIdx + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx2d.moveTo(x, (1 + min) * h / 2);
      ctx2d.lineTo(x, (1 + max) * h / 2);
    }
    ctx2d.stroke();

    // Bright waveform inside selection
    const clipLeft = Math.max(0, inPx);
    const clipRight = Math.min(w, outPx);
    if (clipRight > clipLeft) {
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.rect(clipLeft, 0, clipRight - clipLeft, h);
      ctx2d.clip();

      ctx2d.fillStyle = "rgba(255, 0, 110, 0.08)";
      ctx2d.fillRect(clipLeft, 0, clipRight - clipLeft, h);

      ctx2d.strokeStyle = "#00b4d8";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      for (let x = Math.floor(clipLeft); x < Math.ceil(clipRight); x++) {
        const sIdx = startSample + Math.floor((x / w) * visibleSamples);
        let min = 1, max = -1;
        for (let j = 0; j < step && sIdx + j < data.length; j++) {
          const v = data[sIdx + j];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        ctx2d.moveTo(x, (1 + min) * h / 2);
        ctx2d.lineTo(x, (1 + max) * h / 2);
      }
      ctx2d.stroke();
      ctx2d.restore();
    }

    // Dim overlay outside selection
    ctx2d.fillStyle = "rgba(0, 0, 0, 0.45)";
    if (inPx > 0) ctx2d.fillRect(0, 0, inPx, h);
    if (outPx < w) ctx2d.fillRect(outPx, 0, w - outPx, h);

    // IN handle (only draw if in view)
    if (inPx >= -10 && inPx <= w + 10) {
      ctx2d.strokeStyle = "#00ff88";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(inPx, 0);
      ctx2d.lineTo(inPx, h);
      ctx2d.stroke();
      ctx2d.fillStyle = "#00ff88";
      ctx2d.beginPath();
      ctx2d.moveTo(inPx - 8, 0);
      ctx2d.lineTo(inPx + 8, 0);
      ctx2d.lineTo(inPx + 4, 22);
      ctx2d.lineTo(inPx - 4, 22);
      ctx2d.closePath();
      ctx2d.fill();
    }

    // OUT handle
    if (outPx >= -10 && outPx <= w + 10) {
      ctx2d.strokeStyle = "#ff4444";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(outPx, 0);
      ctx2d.lineTo(outPx, h);
      ctx2d.stroke();
      ctx2d.fillStyle = "#ff4444";
      ctx2d.beginPath();
      ctx2d.moveTo(outPx - 8, 0);
      ctx2d.lineTo(outPx + 8, 0);
      ctx2d.lineTo(outPx + 4, 22);
      ctx2d.lineTo(outPx - 4, 22);
      ctx2d.closePath();
      ctx2d.fill();
    }
  }, [editingPad, audioBuffer]);

  // Redraw on edit point or view changes
  useEffect(() => {
    drawEditWaveform();
  }, [editingPad, editIn, editOut, viewStart, viewEnd, drawEditWaveform]);

  // Use ResizeObserver + retries to draw waveform once canvas gets real size (sheet animation)
  useEffect(() => {
    if (editingPad === null) return;
    const canvas = editCanvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      drawEditWaveform();
    });
    observer.observe(canvas);

    // Also retry a few times during sheet open animation in case ResizeObserver misses it
    const retries = [50, 150, 300, 500];
    const timers = retries.map(ms => setTimeout(() => drawEditWaveform(), ms));

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [editingPad, drawEditWaveform]);

  // ─── Playhead ticker during preview ────────────────────────────
  const [editPlayheadPos, setEditPlayheadPos] = useState<number | null>(null);
  const editAnimRef = useRef<number>(0);
  const previewStartCtxTimeRef = useRef(0);

  useEffect(() => {
    if (!previewingEdit || !audioBuffer) {
      setEditPlayheadPos(null);
      cancelAnimationFrame(editAnimRef.current);
      return;
    }
    // Record the context time when preview started
    previewStartCtxTimeRef.current = audioCtxRef.current?.currentTime ?? 0;
    const inT = editInRef.current;
    const outT = editOutRef.current;
    const sliceDur = outT - inT;
    const tick = () => {
      if (!audioCtxRef.current || !previewSourceRef.current) return;
      const elapsed = (audioCtxRef.current.currentTime - previewStartCtxTimeRef.current);
      const posInSlice = elapsed % sliceDur;
      const timePos = inT + posInSlice;
      setEditPlayheadPos(timePos);
      editAnimRef.current = requestAnimationFrame(tick);
    };
    editAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(editAnimRef.current);
  }, [previewingEdit, audioBuffer]);

  // ─────────────────────────────────────────────────────────────────

  const gridCols = padCount === 8 ? 4 : padCount === 32 ? 8 : 4;
  const gridRows = padCount / gridCols;

  return (
    <div
      style={{
        background: "#0a0a0a",
        color: "#fff",
        minHeight: "100dvh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {audioBuffer && (
            <button
              onClick={() => { window.history.back(); }}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                fontSize: 22,
                cursor: "pointer",
                padding: "4px 8px 4px 0",
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Back to home"
            >
              ←
            </button>
          )}
          <div
            style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: 4, color: "#ff006e", cursor: audioBuffer ? "pointer" : "default" }}
            onClick={() => { if (audioBuffer) window.history.back(); }}
          >
            CHOP
          </div>
        </div>
        {bpm && (
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "#666" }}>
            {bpm} BPM
          </div>
        )}
      </div>

      {!audioBuffer ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 24px", overflowY: "auto" }}>
          {/* Title */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontFamily: "monospace", fontSize: 48, fontWeight: 800, letterSpacing: 8, color: "#ff006e" }}>CHOP</div>
            <div style={{ color: "#666", fontSize: 14, marginTop: 4 }}>Sample any song</div>
          </div>

          {/* Search bar */}
          <div style={{ width: "100%", maxWidth: 480, position: "relative", marginBottom: 8 }}>
            <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#555", pointerEvents: "none" }}>
              <SearchIcon />
            </div>
            <input
              type="text"
              placeholder="Search any song..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 16px 14px 42px",
                background: "#111",
                border: "2px solid #222",
                borderRadius: 12,
                color: "#fff",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#ff006e"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#222"; }}
            />
          </div>

          {/* Search results */}
          {searching && (
            <div style={{ color: "#555", fontSize: 13, padding: "12px 0" }}>Searching...</div>
          )}

          {searchResults.length > 0 && (
            <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
              {searchResults.map(track => {
                const isLoadingThis = loadingTrackId === track.id;
                return (
                  <div
                    key={track.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      background: isLoadingThis ? "#1a1018" : "#111",
                      border: `1px solid ${isLoadingThis ? "#ff006e44" : "#1a1a1a"}`,
                      borderRadius: 10,
                      transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      boxShadow: isLoadingThis ? "0 0 16px rgba(255,0,110,0.15)" : "none",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={track.album.cover_medium || track.album.cover_small}
                      alt=""
                      width={48}
                      height={48}
                      style={{ borderRadius: 6, flexShrink: 0, objectFit: "cover" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {track.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#777", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {track.artist.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", flexShrink: 0 }}>
                      {formatDuration(track.duration)}
                    </div>
                    <button
                      onClick={() => handleDeezerLoad(track)}
                      disabled={loadingTrackId !== null}
                      style={{
                        background: isLoadingThis ? "#ff006e" : "#1a1a1a",
                        border: "1px solid #ff006e",
                        color: "#ff006e",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        letterSpacing: 1,
                        cursor: loadingTrackId !== null ? "wait" : "pointer",
                        flexShrink: 0,
                        transition: "background 0.15s, color 0.15s",
                        ...(isLoadingThis ? { color: "#fff" } : {}),
                      }}
                    >
                      {isLoadingThis ? "..." : "CHOP"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!searching && searchQuery.trim() && searchResults.length === 0 && (
            <div style={{ color: "#444", fontSize: 13, padding: "12px 0" }}>No results</div>
          )}

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 480, margin: "8px 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: "#222" }} />
            <span style={{ color: "#444", fontSize: 12 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#222" }} />
          </div>

          {/* Demo samples */}
          <div style={{ width: "100%", maxWidth: 480, marginBottom: 20 }}>
            <div style={{ color: "#444", fontSize: 11, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Demo samples</div>
            <div style={{ display: "flex", gap: 8 }}>
              {SAMPLE_TRACKS.map(sample => (
                <button
                  key={sample.name}
                  onClick={() => handleSampleLoad(sample)}
                  disabled={!!loadingSample}
                  style={{
                    flex: 1,
                    background: "#111",
                    border: "1px solid #1e1e1e",
                    borderRadius: 8,
                    padding: "10px 8px",
                    cursor: loadingSample ? "wait" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    transition: "border-color 0.15s",
                    opacity: loadingSample && loadingSample !== sample.name ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!loadingSample) (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff006e"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e1e"; }}
                >
                  <span style={{ fontSize: 16, color: "#888" }}>
                    {loadingSample === sample.name ? "..." : "\u25B6"}
                  </span>
                  <span style={{ color: "#999", fontSize: 11, fontWeight: 500 }}>
                    {loadingSample === sample.name ? "Loading" : sample.name}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ color: "#2a2a2a", fontSize: 9, marginTop: 10 }}>
              Samples by Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener noreferrer" style={{ color: "#2a2a2a", textDecoration: "underline" }}>incompetech.com</a>) · CC BY 4.0
            </div>
          </div>

          {/* Upload */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ width: "100%", maxWidth: 480 }}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                padding: "12px",
                background: "transparent",
                border: "1px dashed #2a2a2a",
                borderRadius: 8,
                color: "#555",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {loading && !loadingSample && loadingTrackId === null ? "Decoding audio..." : "Upload your own file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Track info + controls */}
          <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#888" }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontFamily: "monospace", color: "#ddd", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{fileName}</span>
              {trackArtist && <span style={{ color: "#666", fontSize: 11 }}>{trackArtist}</span>}
            </div>
            <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</span>
            <button
              onClick={toggleFullPlay}
              style={{
                background: isPlaying ? "#ff006e" : "#222",
                border: "1px solid #333",
                color: "#fff",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {isPlaying ? "\u23F8 Pause" : "\u25B6 Play"}
            </button>
            <button
              onClick={stopAll}
              style={{
                background: "#222",
                border: "1px solid #333",
                color: "#fff",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              \u25A0 Stop
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                style={{ width: 60, accentColor: "#ff006e" }}
              />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {([8, 16, 32] as PadCount[]).map(n => (
                <button
                  key={n}
                  onClick={() => setPadCount(n)}
                  style={{
                    background: padCount === n ? "#ff006e" : "#1a1a1a",
                    border: "1px solid #333",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "monospace",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => { window.history.back(); }}
              style={{ background: "none", border: "1px solid #333", color: "#666", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
            >
              \u2715 New
            </button>
          </div>

          <div style={{ padding: "0 16px 8px" }}>
            <canvas
              ref={waveformCanvasRef}
              onClick={seekWaveform}
              style={{ width: "100%", height: 60, borderRadius: 8, display: "block", cursor: "crosshair" }}
            />
          </div>

          <div
            style={{
              flex: 1,
              padding: "0 8px 8px",
              display: "grid",
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: `repeat(${gridRows}, 1fr)`,
              gap: 6,
              maxHeight: "calc(100dvh - 200px)",
            }}
          >
            {Array.from({ length: padCount }, (_, i) => {
              const isActive = activePads.has(i);
              const hasCustom = customSlices.has(i);
              const color = PAD_COLORS[i % PAD_COLORS.length];
              const keyLabel = i < 16 ? PAD_KEYS[i] : null;
              return (
                <div
                  key={`${padCount}-${i}`}
                  onTouchStart={e => { e.preventDefault(); triggerPad(i); }}
                  onTouchEnd={e => { e.preventDefault(); releasePad(i); }}
                  onMouseDown={e => { e.preventDefault(); triggerPad(i); }}
                  onMouseUp={e => { e.preventDefault(); releasePad(i); }}
                  onMouseLeave={() => { if (activePads.has(i)) releasePad(i); }}
                  onContextMenu={e => e.preventDefault()}
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${color}, ${color}88)`
                      : `linear-gradient(145deg, #1a1a1a, #111)`,
                    borderRadius: 10,
                    border: `1px solid ${isActive ? color : hasCustom ? "#ff006e55" : "#222"}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "transform 0.05s, box-shadow 0.05s",
                    transform: isActive ? "scale(0.94)" : "scale(1)",
                    boxShadow: isActive ? `0 0 20px ${color}66, inset 0 0 20px ${color}22` : "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  <canvas
                    ref={el => { if (el) { padWaveformRefs.current.set(i, el); drawPadWaveform(el, i); } }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0.4,
                    }}
                  />
                  {/* Edit button — top-right corner */}
                  <button
                    onTouchStart={e => e.stopPropagation()}
                    onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); openEditSheet(i); }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseUp={e => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={e => { e.stopPropagation(); openEditSheet(i); }}
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      zIndex: 5,
                      background: hasCustom ? "rgba(255,0,110,0.3)" : "rgba(255,255,255,0.08)",
                      border: "none",
                      borderRadius: 5,
                      width: padCount > 16 ? 22 : 26,
                      height: padCount > 16 ? 22 : 26,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                      color: hasCustom ? "#ff006e" : "rgba(255,255,255,0.35)",
                      fontSize: padCount > 16 ? 10 : 12,
                    }}
                    aria-label={`Edit pad ${i + 1}`}
                  >
                    ✏️
                  </button>
                  {/* Custom slice dot indicator */}
                  {hasCustom && (
                    <div style={{
                      position: "absolute",
                      bottom: 4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#ff006e",
                      zIndex: 3,
                    }} />
                  )}
                  {keyLabel && (
                    <div
                      className="hidden md:flex"
                      style={{
                        position: "absolute",
                        inset: 0,
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "monospace",
                        fontSize: padCount > 16 ? 20 : 28,
                        fontWeight: 700,
                        color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                        zIndex: 2,
                        textShadow: isActive ? `0 0 12px ${color}` : "none",
                        pointerEvents: "none",
                      }}
                    >
                      {keyLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Silk Slice Editor Sheet ──────────────────────────────── */}
      <Sheet.Root
        license="non-commercial"
        presented={editingPad !== null}
        onPresentedChange={(presented: boolean) => { if (!presented) { stopEditPreview(); setEditingPad(null); } }}
      >
        <Sheet.View
          contentPlacement="bottom"
          style={{ zIndex: 100 }}
        >
          <Sheet.Backdrop
            style={{ background: "rgba(0,0,0,0.6)" }}
          />
          <Sheet.Content
            style={{
              background: "#111",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "70dvh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Handle bar */}
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "#333" }} />
            </div>

            {/* Header */}
            <div style={{ padding: "4px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: editingPad !== null ? PAD_COLORS[editingPad % PAD_COLORS.length] : "#333",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#fff",
                }}>
                  {editingPad !== null ? (editingPad < 16 ? PAD_KEYS[editingPad] : editingPad + 1) : ""}
                </div>
                <span style={{ fontFamily: "monospace", fontSize: 14, color: "#aaa" }}>SLICE EDITOR</span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555" }}>
                {editIn.toFixed(2)}s → {editOut.toFixed(2)}s ({(editOut - editIn).toFixed(2)}s)
              </div>
            </div>

            {/* Waveform editor */}
            <div style={{ padding: "0 16px 12px", position: "relative" }}>
              <canvas
                ref={editCanvasRef}
                onPointerDown={handleEditPointerDown}
                onPointerMove={handleEditPointerMove}
                onPointerUp={handleEditPointerUp}
                style={{
                  width: "100%",
                  height: 140,
                  borderRadius: 8,
                  display: "block",
                  cursor: "ew-resize",
                  touchAction: "none",
                }}
              />
              {/* Playhead ticker */}
              {editPlayheadPos !== null && audioBuffer && (viewEndRef.current - viewStartRef.current) > 0 && (() => {
                const pct = ((editPlayheadPos - viewStartRef.current) / (viewEndRef.current - viewStartRef.current)) * 100;
                if (pct < 0 || pct > 100) return null;
                return (
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: `calc(${pct}%)`,
                    width: 2,
                    height: 140,
                    background: "#fff",
                    pointerEvents: "none",
                    zIndex: 10,
                    boxShadow: "0 0 6px rgba(255,255,255,0.5)",
                    transition: "none",
                  }} />
                );
              })()}
              {/* Touch target labels */}
              <div style={{
                position: "absolute",
                bottom: 18,
                left: 16,
                right: 16,
                display: "flex",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", background: "rgba(0,0,0,0.6)", padding: "2px 4px", borderRadius: 3 }}>
                  IN {editIn.toFixed(2)}s
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ff4444", background: "rgba(0,0,0,0.6)", padding: "2px 4px", borderRadius: 3 }}>
                  OUT {editOut.toFixed(2)}s
                </span>
              </div>
            </div>

            {/* Zoom controls */}
            <div style={{ padding: "0 16px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <button
                onClick={() => zoomEdit(1.5)}
                style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
                  color: "#aaa", fontSize: 16, fontWeight: 700, width: 36, height: 32,
                  cursor: "pointer", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >−</button>
              <button
                onClick={() => {
                  if (!audioBuffer) return;
                  viewStartRef.current = 0;
                  viewEndRef.current = audioBuffer.duration;
                  setViewStart(0);
                  setViewEnd(audioBuffer.duration);
                }}
                style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
                  color: "#666", fontSize: 10, padding: "6px 10px",
                  cursor: "pointer", fontFamily: "monospace",
                }}
              >FULL</button>
              <button
                onClick={() => zoomEdit(0.6)}
                style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
                  color: "#aaa", fontSize: 16, fontWeight: 700, width: 36, height: 32,
                  cursor: "pointer", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</button>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#444", marginLeft: 6 }}>
                {viewStart.toFixed(1)}s – {viewEnd.toFixed(1)}s
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ padding: "0 16px 20px", display: "flex", gap: 10 }}>
              <button
                onClick={toggleEditPreview}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: previewingEdit ? "#ff006e" : "#1a1a1a",
                  border: `1px solid ${previewingEdit ? "#ff006e" : "#333"}`,
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {previewingEdit ? "⏸ STOP" : "▶ PREVIEW"}
              </button>
              <button
                onClick={() => {
                  if (editingPad !== null) {
                    // Reset this pad to auto-chop
                    stopEditPreview();
                    setCustomSlices(prev => {
                      const next = new Map(prev);
                      next.delete(editingPad);
                      return next;
                    });
                    setEditingPad(null);
                  }
                }}
                style={{
                  padding: "12px 16px",
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                  color: "#888",
                  fontSize: 13,
                  fontFamily: "monospace",
                  cursor: "pointer",
                }}
              >
                RESET
              </button>
              <button
                onClick={saveEditSlice}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: "#ff006e",
                  border: "1px solid #ff006e",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                ✓ SAVE
              </button>
            </div>
          </Sheet.Content>
        </Sheet.View>
      </Sheet.Root>
    </div>
  );
}
