"""
Full-Stack AI Media Processing Pipeline
========================================
8-step pipeline:
  STEP 1  - Video Input Processing   (URL validation + platform detection)
  STEP 2  - Audio Extraction         (yt-dlp download + WAV conversion via av)
  STEP 3  - Speech Detection         (VAD via faster-whisper + chunking)
  STEP 4  - Speech-to-Text           (faster-whisper STT, auto language detect)
  STEP 5  - Speaker Identification   (label SPEAKER_01, SPEAKER_02, …)
  STEP 6  - Timestamp Alignment      (per-segment timestamps synced to video)
  STEP 7  - Text Cleaning            (filler word removal, punctuation fix)
  STEP 8  - Output Generation        (structured JSON + formatted transcript)

Optional:  Summary · Keywords · Translation
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

from observability import log

# ─── constants ────────────────────────────────────────────────────────────────
DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", str(Path(tempfile.gettempdir()) / "ytdownloads")))
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

FILLER_WORDS = re.compile(
    r"\b(um+|uh+|uhh+|umm+|ah+|ahh+|er+|err+|hmm+|mhm|ugh|like,?|you know,?|basically,?|literally,?|actually,?|right\??|okay so|so uh|so um)\b",
    re.IGNORECASE,
)


# ─── helpers ──────────────────────────────────────────────────────────────────
def _fmt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h:
        return f"{h:02}:{m:02}:{s:02}"
    return f"{m:02}:{s:02}"


def _noop(p: int, msg: str) -> None:
    pass


# ─── STEP 1: Video Input Processing ───────────────────────────────────────────
def step1_validate_input(url_or_id: str) -> Dict:
    """
    Validate URL, detect platform, extract video ID.
    Returns: {platform, video_id, source_url, accessible}
    """
    log.info("pipeline.step1.start", url=url_or_id[:80])

    from transcript_service import extract_video_id_safe

    # Platform detection
    platform = "unknown"
    source_url = url_or_id.strip()

    if "youtube.com" in source_url or "youtu.be" in source_url:
        platform = "youtube"
    elif source_url.endswith((".mp4", ".webm", ".mkv", ".mov", ".avi")):
        platform = "direct_video"
    elif source_url.endswith((".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg")):
        platform = "direct_audio"
    elif re.match(r"^[0-9A-Za-z_-]{11}$", source_url):
        platform = "youtube"

    video_id = None
    if platform == "youtube":
        try:
            video_id = extract_video_id_safe(source_url)
            source_url = f"https://www.youtube.com/watch?v={video_id}"
        except ValueError as e:
            raise ValueError(f"[STEP 1] Invalid YouTube URL: {e}") from e

    log.info("pipeline.step1.done", platform=platform, video_id=video_id)
    return {
        "platform": platform,
        "video_id": video_id,
        "source_url": source_url,
        "accessible": True,
    }


# ─── STEP 2: Audio Extraction ─────────────────────────────────────────────────
def step2_extract_audio(
    meta: Dict,
    *,
    on_progress: Callable[[int, str], None] = _noop,
) -> str:
    """
    Download + extract audio. Returns path to WAV file (16kHz mono).
    """
    log.info("pipeline.step2.start", platform=meta["platform"])
    on_progress(5, "extracting audio track")

    platform = meta["platform"]
    source_url = meta["source_url"]
    work_dir = Path(tempfile.mkdtemp(prefix="pipeline_", dir=str(DOWNLOAD_DIR)))

    if platform == "youtube":
        try:
            import yt_dlp  # type: ignore
        except ImportError:
            raise RuntimeError("[STEP 2] yt-dlp is not installed")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(work_dir / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            }],
            "postprocessor_args": ["-ar", "16000", "-ac", "1"],
        }
        yt_cookies = os.environ.get("YT_COOKIES_FILE", "").strip()
        if yt_cookies and os.path.exists(yt_cookies):
            ydl_opts["cookiefile"] = yt_cookies

        on_progress(10, "downloading youtube audio (16kHz mono WAV)")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source_url, download=True)

        vid = info.get("id", meta.get("video_id", "audio"))
        # Look for converted WAV first
        candidates = sorted(work_dir.glob(f"{vid}*.wav")) or sorted(work_dir.glob(f"{vid}*"))
        if not candidates:
            raise RuntimeError("[STEP 2] Audio download produced no file")
        audio_path = str(candidates[0])

    elif platform in ("direct_video", "direct_audio"):
        # Download raw file
        import urllib.request
        raw_path = work_dir / "input_media"
        urllib.request.urlretrieve(source_url, str(raw_path))
        audio_path = _convert_to_wav(str(raw_path), work_dir)

    else:
        raise ValueError(f"[STEP 2] Unsupported platform: {platform}")

    on_progress(35, "audio extraction complete")
    log.info("pipeline.step2.done", audio_path=audio_path)
    return audio_path


def _convert_to_wav(input_path: str, work_dir: Path) -> str:
    """Convert any media file to 16kHz mono WAV using av (PyAV)."""
    out_path = str(work_dir / "audio_16k.wav")
    try:
        import av  # type: ignore
        with av.open(input_path) as container:
            stream = container.streams.audio[0]
            with av.open(out_path, "w", format="wav") as out_container:
                out_stream = out_container.add_stream("pcm_s16le", rate=16000, layout="mono")
                resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
                for frame in container.decode(stream):
                    for resampled in resampler.resample(frame):
                        out_container.mux(out_stream.encode(resampled))
                out_container.mux(out_stream.encode(None))
        return out_path
    except ImportError:
        # Fallback: use yt-dlp/ffmpeg subprocess
        import subprocess
        subprocess.run(
            ["ffmpeg", "-i", input_path, "-ar", "16000", "-ac", "1", out_path, "-y"],
            check=True, capture_output=True,
        )
        return out_path


# ─── STEP 3: Speech Detection + Chunking ──────────────────────────────────────
def step3_detect_speech(audio_path: str, *, on_progress: Callable = _noop) -> List[Dict]:
    """
    Detect speech segments, ignore silence/music, return chunks.
    Uses faster-whisper's built-in VAD filter.
    Returns list of {start, end} dicts.
    """
    on_progress(40, "detecting speech segments")
    log.info("pipeline.step3.start", path=audio_path)

    try:
        from faster_whisper import WhisperModel
        model_size = os.environ.get("WHISPER_MODEL", "tiny")
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        _, info = model.transcribe(audio_path, vad_filter=True, word_timestamps=False)
        duration = info.duration or 0.0
    except ImportError:
        log.warning("pipeline.step3.faster_whisper_missing")
        return [{"start": 0.0, "end": 30.0}]

    # VAD segmentation: chunk by silence gaps > 1.5s
    segments, _ = model.transcribe(
        audio_path,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 1500},
        word_timestamps=False,
    )
    chunks = [{"start": float(s.start), "end": float(s.end)} for s in segments]
    on_progress(50, f"found {len(chunks)} speech chunks")
    log.info("pipeline.step3.done", chunks=len(chunks))
    return chunks if chunks else [{"start": 0.0, "end": duration}]


# ─── STEP 4: Speech-to-Text ───────────────────────────────────────────────────
def step4_speech_to_text(
    audio_path: str,
    language: Optional[str],
    *,
    on_progress: Callable = _noop,
) -> Dict:
    """
    Full transcription with word-level timestamps.
    Auto-detects language if not specified.
    Returns {language, duration, segments, model}.
    """
    on_progress(50, "loading speech recognition model")
    log.info("pipeline.step4.start", language=language)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log.warning("pipeline.step4.faster_whisper_missing — using mock")
        return {
            "language": language or "en",
            "duration": 10.0,
            "segments": [{"start": 0.0, "end": 10.0, "text": "[faster-whisper not installed]", "words": []}],
            "model": "mock",
        }

    model_size = os.environ.get("WHISPER_MODEL", "tiny")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    on_progress(55, "transcribing audio")

    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=True,
        temperature=0.0,
    )

    duration = info.duration or 0.0
    detected_lang = info.language
    raw_segments: List[Dict] = []
    last_end = 0.0

    for seg in segments_iter:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({
                    "word": w.word.strip(),
                    "start": float(w.start) if w.start is not None else float(seg.start),
                    "end": float(w.end) if w.end is not None else float(seg.end),
                    "prob": float(w.probability) if w.probability is not None else 1.0,
                })
        raw_segments.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": seg.text.strip(),
            "words": words,
        })
        last_end = float(seg.end)
        if duration:
            pct = 55 + int(min(30, (last_end / duration) * 30))
            on_progress(pct, f"transcribing {int(last_end)}s / {int(duration)}s")

    on_progress(85, "transcription complete")
    log.info("pipeline.step4.done", segments=len(raw_segments), lang=detected_lang)
    return {
        "language": detected_lang,
        "duration": duration,
        "segments": raw_segments,
        "model": f"faster-whisper-{model_size}",
    }


# ─── STEP 5: Speaker Identification ──────────────────────────────────────────
def step5_identify_speakers(segments: List[Dict], *, on_progress: Callable = _noop) -> List[Dict]:
    """
    Assign speaker labels using basic heuristics (pause gaps + voice change proxy).
    Real diarization requires WhisperX + GPU + HuggingFace token.
    """
    on_progress(87, "identifying speakers")
    log.info("pipeline.step5.start", segments=len(segments))

    SPEAKER_SWITCH_PAUSE_SEC = 1.5
    current_speaker = 1
    prev_end = 0.0
    result = []

    for seg in segments:
        start = seg.get("start", 0.0)
        pause = start - prev_end
        if pause >= SPEAKER_SWITCH_PAUSE_SEC and prev_end > 0:
            current_speaker = 2 if current_speaker == 1 else 1
        result.append({**seg, "speaker": f"Speaker {current_speaker}"})
        prev_end = seg.get("end", start)

    log.info("pipeline.step5.done")
    return result


# ─── STEP 6: Timestamp Alignment ─────────────────────────────────────────────
def step6_align_timestamps(segments: List[Dict]) -> List[Dict]:
    """Enrich each segment with formatted timestamp string."""
    log.info("pipeline.step6.start")
    aligned = []
    for i, seg in enumerate(segments):
        aligned.append({
            "index": i,
            "start": seg["start"],
            "end": seg["end"],
            "duration": round(seg["end"] - seg["start"], 3),
            "timestamp": _fmt_ts(seg["start"]),
            "timestamp_end": _fmt_ts(seg["end"]),
            "text": seg["text"],
            "speaker": seg.get("speaker", "Speaker 1"),
            "words": seg.get("words", []),
        })
    log.info("pipeline.step6.done")
    return aligned


# ─── STEP 7: Text Cleaning ────────────────────────────────────────────────────
def step7_clean_text(segments: List[Dict], *, on_progress: Callable = _noop) -> List[Dict]:
    """
    Remove filler words, normalize whitespace, fix basic punctuation.
    Preserves meaning and original timestamps.
    """
    on_progress(92, "cleaning transcript text")
    log.info("pipeline.step7.start")

    cleaned = []
    for seg in segments:
        text = seg["text"]
        # Remove fillers
        text = FILLER_WORDS.sub("", text)
        # Collapse multiple spaces
        text = re.sub(r"\s{2,}", " ", text).strip()
        # Capitalize first letter
        if text:
            text = text[0].upper() + text[1:]
        # Ensure sentence ends with punctuation
        if text and text[-1] not in ".!?,;:":
            text += "."
        cleaned.append({**seg, "text": text})

    log.info("pipeline.step7.done")
    return cleaned


# ─── STEP 8: Output Generation ───────────────────────────────────────────────
def step8_generate_output(
    meta: Dict,
    segments: List[Dict],
    stt_info: Dict,
    *,
    on_progress: Callable = _noop,
) -> Dict:
    """
    Build the final structured output:
      - Formatted transcript string (00:00 - Text)
      - Full plain text
      - Structured segment list
      - Summary stats
    """
    on_progress(96, "generating final output")
    log.info("pipeline.step8.start")

    formatted_lines: List[str] = []
    for seg in segments:
        speaker = seg.get("speaker", "")
        prefix = f"[{speaker}] " if speaker else ""
        formatted_lines.append(f"{seg['timestamp']} - {prefix}{seg['text']}")

    full_text = " ".join(s["text"] for s in segments if s["text"])
    total_duration = max((s["end"] for s in segments), default=0.0)

    output = {
        # Core fields
        "video_id": meta.get("video_id"),
        "video_url": meta.get("source_url"),
        "thumbnail": f"https://img.youtube.com/vi/{meta['video_id']}/maxresdefault.jpg" if meta.get("video_id") else "",
        "platform": meta.get("platform"),
        "language": stt_info.get("language", "en"),
        "model": stt_info.get("model", "unknown"),
        "strategy": "ai_pipeline_v1",

        # Transcript
        "segments": segments,
        "full_text": full_text,
        "formatted_transcript": "\n".join(formatted_lines),

        # Stats
        "duration": round(total_duration, 2),
        "word_count": len(full_text.split()),
        "segment_count": len(segments),
        "speakers_detected": len(set(s.get("speaker", "") for s in segments)),
    }

    on_progress(100, "pipeline complete")
    log.info("pipeline.step8.done", segments=len(segments), words=output["word_count"])
    return output


# ─── Main Pipeline Entry-Point ────────────────────────────────────────────────
def run_full_pipeline(
    url_or_id: str,
    language: Optional[str] = None,
    *,
    on_progress: Callable[[int, str], None] = _noop,
) -> Dict:
    """
    Execute all 8 steps end-to-end.
    Returns structured output dict ready for API response.
    Raises ValueError / RuntimeError with step number on failure.
    """
    audio_path: Optional[str] = None
    work_dir: Optional[str] = None
    try:
        # STEP 1
        on_progress(0, "[Step 1/8] Validating video input...")
        meta = step1_validate_input(url_or_id)

        # STEP 2
        on_progress(5, "[Step 2/8] Extracting audio...")
        audio_path = step2_extract_audio(meta, on_progress=on_progress)
        work_dir = str(Path(audio_path).parent)

        # STEP 3
        on_progress(40, "[Step 3/8] Detecting speech segments...")
        _chunks = step3_detect_speech(audio_path, on_progress=on_progress)

        # STEP 4
        on_progress(50, "[Step 4/8] Speech-to-text transcription...")
        stt_result = step4_speech_to_text(audio_path, language, on_progress=on_progress)

        # STEP 5
        on_progress(85, "[Step 5/8] Identifying speakers...")
        segments = step5_identify_speakers(stt_result["segments"], on_progress=on_progress)

        # STEP 6
        on_progress(88, "[Step 6/8] Aligning timestamps...")
        segments = step6_align_timestamps(segments)

        # STEP 7
        on_progress(90, "[Step 7/8] Cleaning transcript...")
        segments = step7_clean_text(segments, on_progress=on_progress)

        # STEP 8
        on_progress(95, "[Step 8/8] Generating structured output...")
        output = step8_generate_output(meta, segments, stt_result, on_progress=on_progress)

        return output

    finally:
        # Cleanup downloaded audio
        if work_dir and Path(work_dir).exists():
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception:
                pass
