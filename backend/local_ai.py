"""
local_ai.py — Zero-API-key AI features
- Extractive summarization (TF-IDF)
- Translation via Google Translate public endpoint (no key needed)
- Algorithmic content generation
"""
import re
import httpx
from collections import Counter
from typing import List, Dict, Optional

STOP_WORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
    "this","that","these","those","is","are","was","were","be","been","being","have",
    "has","had","do","does","did","will","would","could","should","may","might","can",
    "it","its","i","you","he","she","we","they","me","him","her","us","them","my",
    "your","his","our","their","what","which","who","how","when","where","why","all",
    "also","just","more","so","if","then","than","about","up","out","as","into",
    "through","after","not","no","only","there","here","very","some","any","each",
}

POSITIVE = {"good","great","excellent","amazing","wonderful","best","love","happy",
            "positive","success","beautiful","perfect","helpful","awesome","exciting",
            "innovative","powerful","effective","outstanding","incredible","enjoy"}
NEGATIVE = {"bad","terrible","awful","horrible","worst","hate","sad","fail","problem",
            "difficult","poor","wrong","broken","disaster","frustrating","useless",
            "waste","boring","weak","failure","danger","risk","unfortunately","sadly"}

LANG_CODES = {
    "spanish":"es","french":"fr","german":"de","italian":"it","portuguese":"pt",
    "russian":"ru","japanese":"ja","korean":"ko","chinese (simplified)":"zh-cn",
    "arabic":"ar","hindi":"hi","bengali":"bn","turkish":"tr","dutch":"nl",
    "swedish":"sv","polish":"pl","indonesian":"id","vietnamese":"vi","thai":"th",
    "ukrainian":"uk","hebrew":"he","greek":"el","czech":"cs","finnish":"fi",
    "norwegian":"no","danish":"da","romanian":"ro","hungarian":"hu","malay":"ms","persian":"fa",
}


def _tokenize(text: str) -> List[str]:
    words = re.findall(r'\b[a-z]+\b', text.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 2]


def _split_sentences(text: str) -> List[str]:
    sents = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sents if len(s.strip()) > 20]


def _score_sentences(sentences: List[str]) -> List[float]:
    all_words = []
    sent_words = []
    for s in sentences:
        words = _tokenize(s)
        sent_words.append(words)
        all_words.extend(words)
    freq = Counter(all_words)
    total = max(len(all_words), 1)
    scores = []
    for words in sent_words:
        if not words:
            scores.append(0.0)
            continue
        scores.append(sum(freq[w] / total for w in words) / len(words))
    return scores


def _extract_keywords(text: str, n: int = 20) -> List[str]:
    freq = Counter(_tokenize(text))
    return [w for w, _ in freq.most_common(n * 2) if len(w) > 3][:n]


def summarize(transcript: str, title: Optional[str] = None, style: str = "comprehensive") -> Dict:
    sentences = _split_sentences(transcript)
    if not sentences:
        return {"tldr": transcript[:300], "key_points": [], "chapters": [],
                "sentiment": "neutral", "word_count_original": len(transcript.split()), "word_count_summary": 0}

    scores = _score_sentences(sentences)
    ranked = sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)

    n_kp = {"concise": 4, "bullet": 10, "comprehensive": 7}.get(style, 6)
    n_tl = {"concise": 1, "bullet": 2, "comprehensive": 3}.get(style, 2)

    tldr_idx = sorted(ranked[:n_tl])
    tldr = " ".join(sentences[i] for i in tldr_idx)

    kp_idx = sorted(ranked[n_tl: n_tl + n_kp])
    key_points = []
    for i in kp_idx:
        s = sentences[i].strip()
        if s and not s.endswith(('.', '!', '?')):
            s += "."
        key_points.append(s)

    n_ch = min(5, max(1, len(sentences) // 8))
    ch_size = max(1, len(sentences) // n_ch)
    chapters = []
    for ci in range(n_ch):
        s = ci * ch_size
        e = s + ch_size if ci < n_ch - 1 else len(sentences)
        sec = sentences[s:e]
        if not sec:
            continue
        sec_scores = scores[s:e]
        best = sec_scores.index(max(sec_scores))
        ch_title = " ".join(sec[best].split()[:7]).rstrip(".,;:!?") + "..."
        chapters.append({"title": ch_title, "summary": " ".join(sec[:3])[:300]})

    words = _tokenize(transcript)
    pos = sum(1 for w in words if w in POSITIVE)
    neg = sum(1 for w in words if w in NEGATIVE)
    if pos > neg * 1.5:
        sentiment = "positive"
    elif neg > pos * 1.5:
        sentiment = "negative"
    elif pos > 0 and neg > 0:
        sentiment = "mixed"
    else:
        sentiment = "neutral"

    summary_text = tldr + " " + " ".join(key_points)
    return {
        "tldr": tldr or sentences[0][:300],
        "key_points": key_points,
        "chapters": chapters,
        "sentiment": sentiment,
        "word_count_original": len(transcript.split()),
        "word_count_summary": len(summary_text.split()),
    }


async def translate_text(text: str, target_language: str) -> str:
    lang_code = LANG_CODES.get(target_language.lower(), "es")
    chunks = []
    remaining = text
    while remaining:
        if len(remaining) <= 4000:
            chunks.append(remaining)
            break
        split_at = remaining.rfind(" ", 0, 4000)
        if split_at == -1:
            split_at = 4000
        chunks.append(remaining[:split_at])
        remaining = remaining[split_at:].lstrip()

    parts = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    import asyncio
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        for chunk in chunks:
            resp = await client.get(
                "https://translate.googleapis.com/translate_a/single",
                params={"client": "gtx", "sl": "auto", "tl": lang_code, "dt": "t", "q": chunk},
            )
            resp.raise_for_status()
            data = resp.json()
            parts.append("".join(item[0] for item in data[0] if item[0]))
            await asyncio.sleep(0.5)  # Prevent rate limiting on large texts

    return " ".join(parts)


def generate_content(transcript: str, title: Optional[str] = None) -> Dict:
    sentences = _split_sentences(transcript)
    keywords = _extract_keywords(transcript, n=20)
    video_title = title or "This Video"

    if not sentences:
        return {"youtube_description": "", "title_ideas": [], "tags": [],
                "blog_article": "", "instagram_captions": []}

    scores = _score_sentences(sentences)
    ranked = sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)
    top = [sentences[i] for i in sorted(ranked[:8])]
    key_topics = ", ".join(keywords[:6])

    yt_desc = (
        f"{' '.join(sentences[:3])}\n\n"
        f"In this video, we cover: {key_topics}.\n\n"
        f"Key highlights:\n" + "\n".join(f"• {s}" for s in top[:4]) +
        "\n\nDon't forget to like, subscribe, and hit the notification bell!"
    ).strip()

    base = video_title.rstrip(".!?")
    title_ideas = [
        f"The Complete Guide to {base}",
        f"Everything You Need to Know About {base}",
        f"Why {base} Matters More Than You Think",
        f"{base}: A Deep Dive",
        f"The Truth About {base}",
        f"How to Master {base}",
        f"{base} Explained Simply",
        f"Top Insights on {base} You Can't Miss",
    ]

    tags = list(dict.fromkeys(keywords))[:18]

    sections = []
    n_sec = min(4, max(2, len(sentences) // 6))
    sec_size = max(1, len(sentences) // n_sec)
    for si in range(n_sec):
        s, e = si * sec_size, (si + 1) * sec_size if si < n_sec - 1 else len(sentences)
        sec_sents = sentences[s:e]
        if not sec_sents:
            continue
        sec_scores = scores[s:e]
        best = sec_scores.index(max(sec_scores))
        heading = " ".join(sec_sents[best].split()[:5]).rstrip(".,;:!?").title()
        sections.append(f"## {heading}\n\n{' '.join(sec_sents[:5])}")

    blog = (
        f"# {video_title}\n\n## Introduction\n\n{' '.join(sentences[:3])}\n\n"
        + "\n\n".join(sections)
        + f"\n\n## Conclusion\n\n{' '.join(sentences[-3:]) if len(sentences) >= 3 else sentences[-1]}"
    )

    top5 = [sentences[i] for i in sorted(ranked[:5])]
    htags = " ".join(f"#{w}" for w in keywords[:8])
    insta = [
        f"💡 {top5[0] if top5 else ''}\n\n{htags}",
        f"🎯 Did you know?\n{top5[1] if len(top5) > 1 else ''}\n\n❤️ {htags}",
        f"🔥 Key insight:\n\"{top5[2] if len(top5) > 2 else ''}\"\n\n{htags}",
        f"✨ Worth remembering:\n{top5[3] if len(top5) > 3 else ''}\n\n📌 {htags}",
        f"📌 Quick takeaway:\n{top5[4] if len(top5) > 4 else ''}\n\n👇 {htags}",
    ]

    return {
        "youtube_description": yt_desc,
        "title_ideas": title_ideas,
        "tags": tags,
        "blog_article": blog,
        "instagram_captions": insta,
    }
