import { NextRequest, NextResponse } from "next/server";

/** Convert seconds → ASS timestamp h:mm:ss.cc */
function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

interface GroqWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

/** Build an ASS string with sleek styling and pop animations. */
function buildAss(words: GroqWord[]): string {
  if (!words || words.length === 0) return "";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto Regular,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1.5,0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const CHUNK = 3; // Smaller chunks for sleek look
  const events: string[] = [];

  for (let i = 0; i < words.length; i += CHUNK) {
    const slice = words.slice(i, i + CHUNK);
    const start = slice[0].start;
    const end = slice[slice.length - 1].end;
    const text = slice.map((w) => w.word).join(" ");
    
    // Add a subtle pop animation using ASS tags: {\fscx110\fscy110\t(0,150,\fscx100\fscy100)}
    const animatedText = `{\\fscx115\\fscy115\\t(0,120,\\fscx100\\fscy100)}${text}`;
    
    events.push(
      `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${animatedText}`
    );
  }

  return header + events.join("\n");
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

    const ass = buildAss(rawWords);
    const srt = ""; // Keeping for compatibility or later use

    return NextResponse.json({
      text: result.text ?? "",
      words,
      ass,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio." },
      { status: 500 }
    );
  }
}
