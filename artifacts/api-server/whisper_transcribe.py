#!/usr/bin/env python3
"""
Whisper transcription script for CaptionGen.
Called by Node.js to transcribe audio and generate SRT subtitles.

Usage: python3 whisper_transcribe.py <audio_path> <output_dir> <job_id>
Output: JSON to stdout with transcript, segments, and srt_path
"""

import sys
import json
import os
import whisper


def format_time(seconds: float) -> str:
    """Convert seconds to SRT time format: HH:MM:SS,mmm"""
    ms = int((seconds % 1) * 1000)
    s = int(seconds)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def generate_srt(segments: list, output_path: str) -> None:
    """Generate an SRT file from Whisper segments."""
    lines = []
    for i, seg in enumerate(segments, start=1):
        start = format_time(seg["start"])
        end = format_time(seg["end"])
        text = seg["text"].strip()
        lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: whisper_transcribe.py <audio_path> <output_dir> <job_id>"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    output_dir = sys.argv[2]
    job_id = sys.argv[3]

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    # Load the "base" model — good balance of speed and accuracy for MVP
    # On CPU: ~30s for a 60s clip. Use "tiny" if speed is more critical.
    model = whisper.load_model("base")

    # Transcribe — fp16=False for CPU compatibility
    result = model.transcribe(audio_path, fp16=False, language=None)

    transcript = result.get("text", "").strip()
    segments_raw = result.get("segments", [])

    # Build clean segment list
    segments = [
        {
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
        }
        for seg in segments_raw
        if seg.get("text", "").strip()
    ]

    # Generate SRT file
    srt_filename = f"subtitles_{job_id}.srt"
    srt_path = os.path.join(output_dir, srt_filename)
    generate_srt(segments, srt_path)

    # Output JSON result to stdout
    print(json.dumps({
        "transcript": transcript,
        "segments": segments,
        "srt_path": srt_path,
    }))


if __name__ == "__main__":
    main()
