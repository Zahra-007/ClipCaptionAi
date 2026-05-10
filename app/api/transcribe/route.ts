import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ASSEMBLYAI_API_KEY) {
      return NextResponse.json(
        { error: "AssemblyAI API key is missing." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to buffer for uploading
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload the audio file to AssemblyAI
    const uploadUrl = await client.files.upload(buffer);

    // Start transcription
    const transcript = await client.transcripts.transcribe({
      audio: uploadUrl,
      // You can add additional options here if needed
    });

    if (transcript.status === "error") {
      return NextResponse.json(
        { error: transcript.error },
        { status: 500 }
      );
    }

    // Get the SRT subtitle format
    const srt = await client.transcripts.subtitles(transcript.id, "srt");

    return NextResponse.json({
      transcriptId: transcript.id,
      text: transcript.text,
      words: transcript.words,
      srt: srt,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
