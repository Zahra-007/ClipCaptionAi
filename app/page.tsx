"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud,
  Clapperboard,
  Sparkles,
  AudioLines,
  FileText,
  CheckCircle2,
  Download,
  RotateCcw,
  Film,
} from "lucide-react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Step = "idle" | "extracting" | "transcribing" | "burning" | "done";

interface WordTimestamp {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface TranscriptEntry {
  time: string;
  text: string;
}

type StepState = "inactive" | "active" | "completed";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function buildTranscriptEntries(words: WordTimestamp[]): TranscriptEntry[] {
  if (!words || words.length === 0) return [];
  const entries: TranscriptEntry[] = [];
  let chunkStart = words[0].start;
  let chunkWords: string[] = [];

  words.forEach((word, i) => {
    chunkWords.push(word.text);
    const isLast = i === words.length - 1;
    const isEndOfSentence = /[.!?]$/.test(word.text);
    const isChunkFull = chunkWords.length >= 7;

    if (isLast || isEndOfSentence || isChunkFull) {
      entries.push({
        time: formatTime(chunkStart),
        text: chunkWords.join(" "),
      });
      chunkWords = [];
      if (!isLast) chunkStart = words[i + 1].start;
    }
  });
  return entries;
}

export default function Home() {
  const [step, setStep] = useState<Step>("idle");
  const [dragActive, setDragActive] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>("");
  const [outputVideoUrl, setOutputVideoUrl] = useState<string>("");
  const [assContent, setAssContent] = useState<string>("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string>("");
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Pre-load FFmpeg
  useEffect(() => {
    const loadFfmpeg = async () => {
      if (ffmpegRef.current) return;
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
        
        ffmpeg.on("log", ({ message }) => {
          console.log("FFmpeg Log:", message);
        });

        ffmpeg.on("progress", ({ progress }) => {
          setLoadingProgress(Math.round(progress * 100));
        });

        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });

        // Load a font for captions (Roboto)
        const fontUrl = "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf";
        const fontData = await fetchFile(fontUrl);
        await ffmpeg.writeFile("Roboto-Regular.ttf", fontData);

        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch (e) {
        console.warn("FFmpeg pre-load failed:", e);
      }
    };
    loadFfmpeg();
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/avi"];
    const maxSize = 100 * 1024 * 1024;

    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|webm)$/i)) {
      setError("Please upload a valid video file (MP4, MOV, AVI, WEBM).");
      return;
    }
    if (file.size > maxSize) {
      setError("File size must be under 100MB.");
      return;
    }
    setError("");
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleGenerate = async () => {
    if (!videoFile) return;
    setError("");
    setStep("extracting");

    try {
      // Step 1: Extract audio using FFmpeg
      let ffmpeg = ffmpegRef.current;
      if (!ffmpeg) {
        const newFfmpeg = new FFmpeg();
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
        await newFfmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        // Load font if not already there
        const fontUrl = "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf";
        const fontData = await fetchFile(fontUrl);
        await newFfmpeg.writeFile("Roboto-Regular.ttf", fontData);
        
        ffmpegRef.current = newFfmpeg;
        ffmpeg = newFfmpeg;
      }

      // Write input video
      const inputData = await fetchFile(videoFile);
      await ffmpeg.writeFile("input.mp4", inputData);

      // Extract audio as WAV
      await ffmpeg.exec(["-i", "input.mp4", "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "audio.wav"]);
      const audioData = await ffmpeg.readFile("audio.wav");
      const audioBlob = new Blob([audioData], { type: "audio/wav" });
      const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });

      // Step 2: Transcribe
      setStep("transcribing");
      const formData = new FormData();
      formData.append("file", audioFile);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Transcription failed");
      }

      const data = await response.json();
      setAssContent(data.ass || "");
      const entries = buildTranscriptEntries(data.words || []);
      setTranscriptEntries(entries);

      // Step 3: Burn captions
      setStep("burning");
      setLoadingProgress(0);

      // Write ASS file for ffmpeg
      const assBytes = new TextEncoder().encode(data.ass || "");
      await ffmpeg.writeFile("captions.ass", assBytes);

      // Burn captions into video
      // Using .ass allows for advanced styling and animations defined in the file
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-vf", "subtitles=captions.ass:fontsdir=/",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "copy",
        "output.mp4",
      ]);

      const outputData = await ffmpeg.readFile("output.mp4");
      const outputBlob = new Blob([outputData], { type: "video/mp4" });
      const outputUrl = URL.createObjectURL(outputBlob);
      setOutputVideoUrl(outputUrl);

      // Cleanup ffmpeg files
      await ffmpeg.deleteFile("input.mp4").catch(() => {});
      await ffmpeg.deleteFile("audio.wav").catch(() => {});
      await ffmpeg.deleteFile("captions.ass").catch(() => {});
      await ffmpeg.deleteFile("output.mp4").catch(() => {});

      setStep("done");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong. Please try again.");
      setStep("idle");
    }
  };

  const handleReset = () => {
    setStep("idle");
    setVideoFile(null);
    setVideoPreviewUrl("");
    setOutputVideoUrl("");
    setAssContent("");
    setTranscriptEntries([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadAss = () => {
    const blob = new Blob([assContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.ass";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStepState = (s: Step): StepState => {
    const order: Step[] = ["extracting", "transcribing", "burning", "done"];
    const currentIdx = order.indexOf(step);
    const targetIdx = order.indexOf(s);
    if (step === "idle") return "inactive";
    if (step === "done") return "completed";
    if (targetIdx < currentIdx) return "completed";
    if (targetIdx === currentIdx) return "active";
    return "inactive";
  };

  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    {
      id: "extracting",
      label: "Extracting audio track...",
      icon: <AudioLines size={18} />,
    },
    {
      id: "transcribing",
      label: "Transcribing with AI Whisper...",
      icon: <Sparkles size={18} />,
    },
    {
      id: "burning",
      label: "Burning captions into video...",
      icon: <FileText size={18} />,
    },
  ];

  const isProcessing = step === "extracting" || step === "transcribing" || step === "burning";

  return (
    <div className="page-bg">
      <div className="page-content">
        <div className="container" style={{ paddingTop: "3rem", paddingBottom: "4rem" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div className="hero-icon">
                <Clapperboard size={34} />
              </div>
            </div>
            <h1
              className="hero-title"
              style={{
                fontSize: "2.75rem",
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                color: "#0f1117",
                marginBottom: "0.75rem",
              }}
            >
              Add Captions to Your{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #4f7cff 0%, #7c3aed 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Videos in Seconds
              </span>
            </h1>
            <p
              style={{
                fontSize: "1.05rem",
                color: "#6b7280",
                maxWidth: "480px",
                margin: "0 auto",
                lineHeight: 1.6,
              }}
            >
              Upload your video and our advanced AI will instantly transcribe the speech and burn beautiful subtitles into it.
            </p>
          </div>

          {/* Main Card */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            {/* Processing State */}
            {isProcessing && (
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <div className="processing-icon">
                    <Sparkles size={30} />
                  </div>
                </div>
                <h2
                  style={{
                    fontSize: "1.65rem",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Generating Captions
                </h2>
                <p style={{ color: "#6b7280", fontSize: "0.95rem", marginBottom: "2rem" }}>
                  This usually takes a minute or two depending on your video length.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {steps.map(({ id, label, icon }) => {
                    const state = getStepState(id);
                    return (
                      <div key={id} className={`step-item ${state}`}>
                        <div className={`step-icon ${state}`}>{icon}</div>
                        <span className={`step-text ${state}`}>{label}</span>
                        {state === "active" && (
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                            {id === "burning" && loadingProgress > 0 && (
                              <span style={{ fontSize: "0.75rem", color: "#4f7cff", fontWeight: 600 }}>{loadingProgress}%</span>
                            )}
                            <div className="spinner" />
                          </div>
                        )}
                        {state === "completed" && (
                          <CheckCircle2
                            size={18}
                            style={{ marginLeft: "auto", color: "#10b981" }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Done State */}
            {step === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Success banner */}
                <div className="success-banner">
                  <div className="success-banner-top">
                    <CheckCircle2 size={24} className="success-icon" />
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "1rem", color: "#065f46" }}>
                        Captions generated successfully!
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "#047857" }}>
                        Your video is ready to download.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="btn-outline"
                    style={{ width: "auto", fontSize: "0.875rem", padding: "0.6rem 1.25rem" }}
                  >
                    <RotateCcw size={15} />
                    Process Another Video
                  </button>
                </div>

                {/* Video Preview */}
                {outputVideoUrl && (
                  <div className="video-player">
                    <video controls src={outputVideoUrl} />
                  </div>
                )}

                {/* Download buttons */}
                <a href={outputVideoUrl} download="captioned-video.mp4" className="btn-download">
                  <Download size={17} />
                  Download Video
                </a>
                <button onClick={handleDownloadAss} className="btn-outline">
                  <Download size={17} />
                  Download .ASS Subtitles
                </button>

                {/* Transcript */}
                {transcriptEntries.length > 0 && (
                  <div className="transcript-section">
                    <div className="transcript-header">
                      <AudioLines size={20} style={{ color: "#4f7cff" }} />
                      Transcript
                    </div>
                    <div>
                      {transcriptEntries.map((entry, i) => (
                        <div key={i} className="transcript-row">
                          <span className="transcript-time">{entry.time}</span>
                          <span className="transcript-text">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Idle / Upload State */}
            {step === "idle" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div
                  id="drop-zone"
                  className={`drop-zone ${dragActive ? "dragging" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.webm"
                    style={{ display: "none" }}
                    onChange={handleInputChange}
                    id="video-upload-input"
                  />
                  <div className="drop-zone-icon">
                    <UploadCloud size={48} strokeWidth={1.5} />
                  </div>
                  {videoFile ? (
                    <div>
                      <p
                        style={{
                          fontWeight: 700,
                          fontSize: "1rem",
                          marginBottom: "0.25rem",
                          color: "#4f7cff",
                        }}
                      >
                        {videoFile.name}
                      </p>
                      <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB · Click to change
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.35rem" }}>
                        Click or drag video to upload
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
                        MP4, MOV, AVI, WEBM up to 100MB
                      </p>
                      <p
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.375rem",
                          fontSize: "0.8rem",
                          color: "#9ca3af",
                        }}
                      >
                        <Film size={14} /> Max 60 seconds recommended
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1.5px solid #fca5a5",
                      borderRadius: "12px",
                      padding: "0.875rem 1rem",
                      fontSize: "0.875rem",
                      color: "#dc2626",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  id="generate-captions-btn"
                  className="btn-gradient"
                  onClick={handleGenerate}
                  disabled={!videoFile}
                >
                  <Sparkles size={18} />
                  Generate Captions
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>
            Powered by{" "}
            <span style={{ fontWeight: 600, color: "#6b7280" }}>Groq Whisper</span> ×{" "}
            <span style={{ fontWeight: 600, color: "#6b7280" }}>FFmpeg.wasm</span>
          </p>
        </div>
      </div>
    </div>
  );
}
