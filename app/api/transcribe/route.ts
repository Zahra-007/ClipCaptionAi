import { NextRequest, NextResponse } from "next/server";

/** Convert seconds → SRT timestamp  hh:mm:ss,ms */
function toSrtTime(seconds: number): string {
  const ms = Math.round((seconds % 1) * 1000);
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

interface GroqWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

/** Build an SRT string by grouping words into ~6-word caption blocks. */
function buildSrt(words: GroqWord[]): string {
  if (!words || words.length === 0) return "";

  const blocks: { start: number; end: number; text: string }[] = [];
  const CHUNK = 6;

  for (let i = 0; i < words.length; i += CHUNK) {
    const slice = words.slice(i, i + CHUNK);
    blocks.push({
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      text: slice.map((w) => w.word).join(" "),
    });
  }

  return blocks
    .map((b, idx) =>
      `${idx + 1}\n${toSrtTime(b.start)} --> ${toSrtTime(b.end)}\n${b.text}`
    )
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 }
      );
    }

    // Build multipart body for Groq
    const groqForm = new FormData();
    groqForm.append("file", file, file.name);
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("response_format", "verbose_json");
    groqForm.append("timestamp_granularities[]", "word");
    groqForm.append("timestamp_granularities[]", "segment");

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
      }
    );

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("Groq API error:", err);
      return NextResponse.json(
        { error: `Groq transcription failed: ${groqRes.status}` },
        { status: 502 }
      );
    }

    const result = await groqRes.json();

    // result.words → [{ word, start, end }] (times in seconds)
    const rawWords: GroqWord[] = result.words ?? [];

    // Map to frontend shape: { text, start, end, confidence } with ms timestamps
    const words = rawWords.map((w) => ({
      text: w.word,
      start: Math.round(w.start * 1000), // → milliseconds
      end: Math.round(w.end * 1000),
      confidence: 1,
    }));

    const srt = buildSrt(rawWords);

    return NextResponse.json({
      text: result.text ?? "",
      words,
      srt,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio." },
      { status: 500 }
    );
  }
}
