import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");
const FONTS_DIR   = path.resolve(process.cwd(), "fonts");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ── Multer ────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => {
    const ext = path.extname(_file.originalname) || ".mp4";
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype.startsWith("video/")
      ? cb(null, true)
      : cb(new Error("Only video files are allowed"));
  },
});

function safeUnlink(p: string) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// ── ffprobe helpers ───────────────────────────────────────────────────────────

async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function getVideoDimensions(filePath: string): Promise<{ w: number; h: number }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0", filePath,
  ]);
  const [ws, hs] = stdout.trim().split("x");
  return { w: parseInt(ws ?? "1920", 10), h: parseInt(hs ?? "1080", 10) };
}

// ── Audio extraction ──────────────────────────────────────────────────────────

async function extractAudio(videoPath: string, audioPath: string) {
  await execFileAsync("ffmpeg", [
    "-i", videoPath, "-vn",
    "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
    "-y", audioPath,
  ]);
}

// ── Whisper ───────────────────────────────────────────────────────────────────

async function runWhisper(audioPath: string, outputDir: string, jobId: string): Promise<{
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  srt_path: string;
}> {
  const scriptPath = path.resolve(process.cwd(), "whisper_transcribe.py");
  const { stdout, stderr } = await execFileAsync(
    "python3", [scriptPath, audioPath, outputDir, jobId],
    { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
  );
  if (stderr) console.log(`[Whisper]: ${stderr.slice(0, 300)}`);
  return JSON.parse(stdout.trim());
}

// ── Subtitle chunking ─────────────────────────────────────────────────────────

type Seg = { start: number; end: number; text: string };

/**
 * Split long Whisper segments into short social-media-style chunks.
 * Portrait: 4 words per chunk.  Landscape: 6 words per chunk.
 * Ensures each chunk occupies at most 2 lines on screen.
 */
function chunkSegments(segments: Seg[], isPortrait: boolean): Seg[] {
  const max = isPortrait ? 4 : 6;
  const out: Seg[] = [];
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (words.length <= max) { out.push(seg); continue; }
    const chunks: string[][] = [];
    for (let i = 0; i < words.length; i += max) chunks.push(words.slice(i, i + max));
    const dur = (seg.end - seg.start) / chunks.length;
    chunks.forEach((chunk, i) => out.push({
      start: seg.start + i * dur,
      end:   seg.start + (i + 1) * dur,
      text:  chunk.join(" "),
    }));
  }
  return out;
}

// ── SRT (for download) ────────────────────────────────────────────────────────

function toSrtTime(s: number): string {
  const ms = Math.round((s % 1) * 1000);
  const ss = Math.floor(s) % 60;
  const mm = Math.floor(s / 60) % 60;
  const hh = Math.floor(s / 3600);
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

function writeSrt(segs: Seg[], outPath: string) {
  fs.writeFileSync(outPath,
    segs.map((s,i) => `${i+1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text.trim()}`).join("\n\n") + "\n",
    "utf8"
  );
}

// ── ASS (for burning — supports fade-in animation) ────────────────────────────

function toAssTime(s: number): string {
  const cs = Math.round((s % 1) * 100);   // centiseconds
  const ss = Math.floor(s) % 60;
  const mm = Math.floor(s / 60) % 60;
  const hh = Math.floor(s / 3600);
  return `${hh}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
}

/**
 * Generate an ASS subtitle file with:
 * - Poppins Bold font (clean, modern, social-media style)
 * - Font size 24 (scaled relative to PlayRes)
 * - Thick black outline, pure white text
 * - Bottom-center placement, ~2 inches above footer
 * - Subtle 150ms fade-in on every line
 * - Max 2 lines per subtitle (enforced by chunking + MarginL/R constraints)
 */
function generateAss(segs: Seg[], videoW: number, videoH: number, isPortrait: boolean): string {
  // Use actual video dimensions as the reference PlayRes
  // so all margin/font values scale correctly.
  const playW = videoW;
  const playH = videoH;

  // Font size: 75 relative to 1280 portrait height; scale for landscape
  const fontSize = isPortrait
    ? Math.round(75 * (playH / 1280))
    : Math.round(55 * (playH / 720));

  const outline = 3;                   // thick black stroke
  const shadow  = 0;                   // no drop shadow — cleaner look

  // MarginV: ~150px at 1280px tall (≈ 2 inches above footer on phone)
  // Scales proportionally on other resolutions
  const marginV = isPortrait
    ? Math.round(150 * (playH / 1280))
    : Math.round(60  * (playH / 720));

  // Horizontal margins keep text off screen edges
  const marginH = isPortrait
    ? Math.round(60 * (playW / 720))
    : Math.round(40 * (playW / 1280));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 1",           // word-boundary wrapping
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${playW}`,
    `PlayResY: ${playH}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Colours in ASS are &HAABBGGRR (alpha, blue, green, red)
    // White text:  &H00FFFFFF
    // Black stroke: &H00000000
    // Transparent bg: &H00000000
    `Style: Default,Poppins,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,${outline},${shadow},2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  // Each dialogue line gets a 150ms fade-in, 0ms fade-out
  const events = segs.map((seg) => {
    const text = seg.text.trim().replace(/[\r\n]+/g, "\\N");
    return `Dialogue: 0,${toAssTime(seg.start)},${toAssTime(seg.end)},Default,,0,0,0,,{\\fad(150,0)}${text}`;
  }).join("\n");

  return header + "\n" + events + "\n";
}

// ── FFmpeg burn ───────────────────────────────────────────────────────────────

async function burnSubtitles(
  videoPath: string,
  assPath: string,
  outputPath: string,
  log: (m: string) => void
): Promise<{ success: boolean; stderr: string }> {

  // Copy the ASS to /tmp for a clean path
  const safeAss = `/tmp/${path.basename(assPath)}`;
  fs.copyFileSync(assPath, safeAss);

  // Use `ass` filter (not `subtitles`) — it reads the ASS directly including embedded styles
  const args = [
    "-i", videoPath,
    "-vf", `ass=${safeAss}:fontsdir=${FONTS_DIR}`,
    "-map", "0:v:0",
    "-map", "0:a:0?",     // optional — won't fail on audio-less video
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-y",
    outputPath,
  ];

  log(`[burn] ass=${safeAss}  fontsdir=${FONTS_DIR}`);
  log(`[burn] ffmpeg ${args.join(" ")}`);

  return new Promise((resolve) => {
    execFile("ffmpeg", args, { timeout: 300000 }, (error, _out, stderr) => {
      safeUnlink(safeAss);
      if (error) {
        log(`[burn] FAILED code=${error.code}\n${stderr}`);
        resolve({ success: false, stderr });
      } else {
        const ok = fs.existsSync(outputPath);
        log(ok ? `[burn] SUCCESS → ${outputPath}` : `[burn] exit 0 but no output file`);
        resolve({ success: ok, stderr: ok ? "" : "Output file not created" });
      }
    });
  });
}

// ── POST /api/captions/process ────────────────────────────────────────────────

router.post("/process", upload.single("video"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No video file uploaded" });
    return;
  }

  const jobId = uuidv4();
  const videoPath = req.file.path;
  const steps: string[] = [];
  const log = (m: string) => { req.log.info(m); steps.push(m); };

  log(`[step] Upload: ${req.file.originalname} → ${videoPath}`);

  try {
    // 1. Duration ────────────────────────────────────────────────────────
    let duration: number;
    try {
      duration = await getVideoDuration(videoPath);
      log(`[step] Duration: ${duration.toFixed(2)}s`);
    } catch {
      safeUnlink(videoPath);
      res.status(400).json({ success: false, error: "Could not read video. Please upload a valid video file.", debug_burn_step: steps });
      return;
    }
    if (duration > 60) {
      safeUnlink(videoPath);
      res.status(400).json({ success: false, error: `Video is ${Math.round(duration)}s. Maximum is 60 seconds.`, debug_burn_step: steps });
      return;
    }

    // 2. Dimensions / orientation ─────────────────────────────────────────
    let videoW = 1920, videoH = 1080, isPortrait = false;
    try {
      ({ w: videoW, h: videoH } = await getVideoDimensions(videoPath));
      isPortrait = videoH > videoW;
      log(`[step] Dimensions: ${videoW}×${videoH} → ${isPortrait ? "portrait" : "landscape"}`);
    } catch {
      log(`[step] Could not detect dimensions, defaulting landscape`);
    }

    // 3. Extract audio ─────────────────────────────────────────────────────
    const audioPath = path.join(UPLOADS_DIR, `${jobId}.wav`);
    try {
      await extractAudio(videoPath, audioPath);
      log(`[step] Audio extracted`);
    } catch (err) {
      safeUnlink(videoPath);
      log(`[step] Audio extraction failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ success: false, error: "Failed to extract audio from video.", debug_burn_step: steps });
      return;
    }

    // 4. Whisper ───────────────────────────────────────────────────────────
    let wr: Awaited<ReturnType<typeof runWhisper>>;
    try {
      wr = await runWhisper(audioPath, OUTPUTS_DIR, jobId);
      log(`[step] Whisper: ${wr.segments.length} segments, ${wr.transcript.length} chars`);
    } catch (err) {
      safeUnlink(videoPath); safeUnlink(audioPath);
      log(`[step] Whisper failed: ${err instanceof Error ? err.message : err}`);
      res.status(500).json({ success: false, error: "Transcription failed. Please try again.", debug_burn_step: steps });
      return;
    }
    safeUnlink(audioPath);

    if (!wr.transcript.trim()) {
      safeUnlink(videoPath);
      res.status(400).json({ success: false, error: "No speech detected in the video.", debug_burn_step: steps });
      return;
    }

    // 5. Chunk subtitles ───────────────────────────────────────────────────
    const chunked = chunkSegments(wr.segments, isPortrait);
    log(`[step] Chunked: ${wr.segments.length} → ${chunked.length} segments`);

    // 6. Write SRT (user download) ─────────────────────────────────────────
    const srtPath = wr.srt_path;
    writeSrt(chunked, srtPath);
    log(`[step] SRT written: ${srtPath} (${fs.statSync(srtPath).size}B)`);

    // 7. Write ASS (for burning with fade-in) ──────────────────────────────
    const assPath = path.join(OUTPUTS_DIR, `subtitles_${jobId}.ass`);
    const assContent = generateAss(chunked, videoW, videoH, isPortrait);
    fs.writeFileSync(assPath, assContent, "utf8");
    log(`[step] ASS written: ${assPath}`);

    // 8. Burn captions ─────────────────────────────────────────────────────
    const captionedFilename = `captioned_${jobId}.mp4`;
    const captionedPath = path.join(OUTPUTS_DIR, captionedFilename);
    const srtFilename = path.basename(srtPath);

    log(`[step] FFmpeg burn starting...`);
    const burn = await burnSubtitles(videoPath, assPath, captionedPath, log);
    safeUnlink(videoPath);
    safeUnlink(assPath);

    if (!burn.success) {
      log(`[step] Burn failed — returning partial results`);
      res.status(200).json({
        success: false,
        error: `Caption burn failed: ${burn.stderr.slice(0, 300) || "Unknown FFmpeg error"}`,
        transcript: wr.transcript,
        segments: chunked,
        captionedVideoUrl: null,
        captionedVideoFilename: null,
        srtUrl: `/api/captions/download/${srtFilename}`,
        srtFilename,
        debug_burn_step: steps,
      });
      return;
    }

    log(`[step] Done → ${captionedPath}`);
    res.json({
      success: true,
      transcript: wr.transcript,
      segments: chunked,
      captionedVideoUrl: `/api/captions/download/${captionedFilename}`,
      srtUrl: `/api/captions/download/${srtFilename}`,
      captionedVideoFilename: captionedFilename,
      srtFilename,
      debug_burn_step: steps,
    });

  } catch (err) {
    safeUnlink(videoPath);
    log(`[step] Unexpected: ${err instanceof Error ? err.message : err}`);
    req.log.error({ err }, "Unexpected error");
    res.status(500).json({ success: false, error: "An unexpected error occurred.", debug_burn_step: steps });
  }
});

// ── GET /api/captions/download/:filename ──────────────────────────────────────

router.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[\w\-.]+$/.test(filename)) {
    res.status(400).json({ success: false, error: "Invalid filename" }); return;
  }
  const filePath = path.join(OUTPUTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: "File not found" }); return;
  }
  res.download(filePath, filename);
});

// ── Multer error handler ──────────────────────────────────────────────────────

router.use((err: Error, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  if (err.message?.includes("File too large"))
    res.status(400).json({ success: false, error: "File is too large. Maximum size is 100MB." });
  else if (err.message?.includes("Only video files"))
    res.status(400).json({ success: false, error: err.message });
  else
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
});

export default router;
