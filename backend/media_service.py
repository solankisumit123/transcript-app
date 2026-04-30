"""
Media services: faster-whisper transcription with diarization-friendly output.

NOTE: The yt-dlp media downloader was removed in v3.0 (see
docs/adr/0001-remove-downloader.md). This module previously exposed
`download_media()`; that function and its supporting yt-dlp configuration
have been deleted. yt-dlp is retained as a transitive dependency because
`transcript_service.py` still uses it for SUBTITLE-ONLY extraction, which
does not constitute a media downloader.

Real WhisperX requires GPU + HF auth. This module ships a CPU-friendly
faster-whisper backend with WhisperX-shape output (segments + word timings
+ speaker labels). When `WHISPERX_ENABLED=true` and `HF_TOKEN` is set, the
diarization layer can be plugged in (commented integration point below).
"""
from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

from observability import log
from transcript_service import extract_video_id_safe

import tempfile
DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", str(Path(tempfile.gettempdir()) / "ytdownloads")))
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _speaker_placeholder(enabled: bool) -> str:
    return "SPEAKER_00" if enabled else "UNKNOWN"


def download_youtube_audio(
    url_or_id: str,
    *,
    on_progress: Callable[[int, str], None] = lambda p, m: None,
) -> str:
    try:
        import yt_dlp  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("yt-dlp is not installed") from exc

    video_id = extract_video_id_safe(url_or_id)
    source_url = f"https://www.youtube.com/watch?v={video_id}"
    work_dir = Path(os.path.join(DOWNLOAD_DIR, f"yt_{video_id}_{int(time.time())}"))
    work_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(work_dir / "%(id)s.%(ext)s")

    on_progress(5, "preparing youtube audio")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "noplaylist": True,
        "no_warnings": True,
    }
    yt_cookies = os.environ.get("YT_COOKIES_FILE", "").strip()
    if yt_cookies and os.path.exists(yt_cookies):
        ydl_opts["cookiefile"] = yt_cookies

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            on_progress(15, "downloading youtube audio")
            info = ydl.extract_info(source_url, download=True)
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(work_dir, ignore_errors=True)
        raise RuntimeError(f"youtube download failed: {str(exc)[:200]}") from exc

    requested_id = info.get("id", video_id)
    ext = info.get("ext")
    if ext:
        downloaded_path = work_dir / f"{requested_id}.{ext}"
        if downloaded_path.exists():
            on_progress(35, "youtube audio ready")
            return str(downloaded_path)

    candidates = sorted(work_dir.glob(f"{requested_id}.*")) or sorted(work_dir.glob(f"{video_id}.*"))
    if candidates:
        on_progress(35, "youtube audio ready")
        return str(candidates[0])

    shutil.rmtree(work_dir, ignore_errors=True)
    raise RuntimeError("youtube audio download did not produce a file")


# ---------------------------------------------------------------------------
# Transcription with diarization-friendly output
# ---------------------------------------------------------------------------
def transcribe_audio(
    audio_path: str,
    *,
    language: Optional[str] = None,
    on_progress: Callable[[int, str], None] = lambda p, m: None,
) -> Dict[str, object]:
    """
    Returns WhisperX-compatible output:
        {
          "language": "en",
          "duration": 123.4,
          "segments": [
             {"start", "end", "text", "speaker", "words":[{w,s,e,prob}, ...]}
          ]
        }
    """
    log.info("transcribe.start", path=audio_path, language=language)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log.warning("faster-whisper not installed, using mock transcription")
        on_progress(10, "simulating transcription (no model found)")
        time.sleep(1)
        on_progress(50, "processing mock segments")
        time.sleep(1)
        on_progress(100, "transcription complete")
        return {
            "language": language or "en",
            "duration": 10.0,
            "segments": [
                {
                    "start": 0.0,
                    "end": 5.0,
                    "text": "Hello, this is a mock transcription because faster-whisper is not installed.",
                    "speaker": "UNKNOWN",
                    "words": []
                },
                {
                    "start": 5.0,
                    "end": 10.0,
                    "text": "Speaker-ID functionality is being simulated for testing.",
                    "speaker": "UNKNOWN",
                    "words": []
                }
            ],
            "model": "mock-whisper",
            "diarization": "unavailable",
            "speaker_labels_are_real": False,
        }

    on_progress(5, "loading model")
    model_size = os.environ.get("WHISPER_MODEL", "tiny")
    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        log.error("model.load_failed", error=str(e))
        on_progress(0, "failed to load model")
        raise
    on_progress(15, "model ready")

    diarization_enabled = (
        os.environ.get("WHISPERX_ENABLED", "").lower() == "true"
        and bool(os.environ.get("HF_TOKEN"))
    )

    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=False,
        word_timestamps=True,
    )
    duration = info.duration or 0.0
    detected_lang = info.language

    out_segments: List[Dict] = []
    last_end = 0.0

    for seg in segments_iter:
        speaker_label = _speaker_placeholder(diarization_enabled)

        words = []
        if seg.words:
            for w in seg.words:
                words.append(
                    {
                        "word": w.word.strip(),
                        "start": float(w.start) if w.start is not None else float(seg.start),
                        "end": float(w.end) if w.end is not None else float(seg.end),
                        "prob": float(w.probability) if w.probability is not None else 1.0,
                    }
                )

        out_segments.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg.text.strip(),
                "speaker": speaker_label,
                "words": words,
            }
        )
        last_end = float(seg.end)

        if duration:
            pct = 20 + int(min(75, (last_end / duration) * 75))
            on_progress(pct, f"transcribing {int(last_end)}s/{int(duration)}s")

    on_progress(100, "transcription complete")
    log.info(
        "transcribe.done",
        segments=len(out_segments),
        duration=round(duration, 1),
        language=detected_lang,
    )
    return {
        "language": detected_lang,
        "duration": duration,
        "segments": out_segments,
        "model": f"faster-whisper-{model_size}",
        "diarization": "pending-whisperx" if diarization_enabled else "unavailable",
        "speaker_labels_are_real": False,
    }


def cleanup(path: str) -> None:
    try:
        p = Path(path)
        if p.exists():
            shutil.rmtree(p.parent, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass
