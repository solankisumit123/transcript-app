import { useEffect, useRef, useState } from "react";
import {
    Copy,
    Check,
    PlayCircle,
    Brain,
    Translate,
    DownloadSimple,
    SpinnerGap,
    Lightning,
    CaretRight,
    PencilSimple,
    SpeakerHigh,
} from "@phosphor-icons/react";
import { fmt } from "./HeroNav";
import { SubtitleEditor } from "./SubtitleEditor";
import { AudioEnhancement } from "./AudioEnhancement";

function toSubtitleTimestamp(seconds, decimalMarker = ",") {
    const totalMs = Math.max(0, Math.floor((seconds || 0) * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${decimalMarker}${String(ms).padStart(3, "0")}`;
}

function buildSrt(segments) {
    return segments
        .map((seg, idx) => {
            const start = Number(seg.start || 0);
            const fallbackDuration = ((seg.end || 0) - start) || 0;
            const duration = Number(seg.duration ?? fallbackDuration);
            const end = Math.max(start, start + duration);
            return [
                idx + 1,
                `${toSubtitleTimestamp(start)} --> ${toSubtitleTimestamp(end)}`,
                seg.text || "",
            ].join("\n");
        })
        .join("\n\n");
}

function buildVtt(segments) {
    const body = segments
        .map((seg) => {
            const start = Number(seg.start || 0);
            const fallbackDuration = ((seg.end || 0) - start) || 0;
            const duration = Number(seg.duration ?? fallbackDuration);
            const end = Math.max(start, start + duration);
            return [
                `${toSubtitleTimestamp(start, ".")} --> ${toSubtitleTimestamp(end, ".")}`,
                seg.text || "",
            ].join("\n");
        })
        .join("\n\n");
    return `WEBVTT\n\n${body}`;
}

// Split-pane cinematic transcript viewer
export function TranscriptViewer({ data, onSummarize, onTranslate, onGenerateContent, summary, translation, contentPack, summarizing, translating, generatingContent, languages, errorSummary, errorTranslate, errorContent }) {
    const [activeIdx, setActiveIdx] = useState(0);
    const [autoScroll, setAutoScroll] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedSummary, setCopiedSummary] = useState(false);
    const [copiedTldr, setCopiedTldr] = useState(false);
    const [copiedKeyPoints, setCopiedKeyPoints] = useState(false);
    const [copiedChapters, setCopiedChapters] = useState(false);
    const [copiedTranslate, setCopiedTranslate] = useState(false);
    const [copiedContent, setCopiedContent] = useState(false);
    const [copiedYtDesc, setCopiedYtDesc] = useState(false);
    const [copiedTitleIdeas, setCopiedTitleIdeas] = useState(false);
    const [copiedTags, setCopiedTags] = useState(false);
    const [copiedBlog, setCopiedBlog] = useState(false);
    const [copiedInsta, setCopiedInsta] = useState(false);
    const [tab, setTab] = useState("transcript"); // transcript | summary | translate | content
    const [targetLang, setTargetLang] = useState("Spanish");
    const segRefs = useRef([]);
    const containerRef = useRef(null);
    const iframeRef = useRef(null);

    useEffect(() => {
        segRefs.current = segRefs.current.slice(0, data.segments.length);
    }, [data.segments.length]);

    useEffect(() => {
        if (autoScroll && segRefs.current[activeIdx] && containerRef.current) {
            const el = segRefs.current[activeIdx];
            const c = containerRef.current;
            const top = el.offsetTop - c.offsetTop - 120;
            c.scrollTo({ top, behavior: "smooth" });
        }
    }, [activeIdx, autoScroll]);

    const copyText = async (text, setFlag) => {
        try {
            await navigator.clipboard.writeText(text);
            setFlag(true);
            setTimeout(() => setFlag(false), 1800);
        } catch {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                setFlag(true);
                setTimeout(() => setFlag(false), 1800);
            } catch {
                // swallow
            }
        }
    };

    const copyAll = () => copyText(data.full_text, setCopied);

    const jumpTo = (seg, idx) => {
        setActiveIdx(idx);
        // Reload iframe to seek to start time
        if (iframeRef.current) {
            const start = Math.floor(seg.start);
            iframeRef.current.src = `https://www.youtube.com/embed/${data.video_id}?start=${start}&autoplay=1`;
        }
    };

    const downloadSubtitle = (format) => {
        const isVtt = format === "vtt";
        const content = isVtt ? buildVtt(data.segments) : buildSrt(data.segments);
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const safeBase = (data.title || data.video_id || "subtitle")
            .replace(/[^\w\- ]+/g, "")
            .trim()
            .replace(/\s+/g, "_") || "subtitle";
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${safeBase}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    return (
        <section
            data-testid="transcript-viewer"
            id="viewer"
            className="border-b border-border"
        >
            <div className="max-w-[1600px] mx-auto px-6 lg:px-12 py-8">
                {/* Meta header */}
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6 pb-6 border-b border-border">
                    <div>
                        <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mb-2">
                            // TRANSCRIPT.OUTPUT
                        </div>
                        <h2 data-testid="video-title" className="font-[Outfit] font-black text-2xl lg:text-3xl tracking-tight max-w-3xl">
                            {data.title || `Video ${data.video_id}`}
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                        <span data-testid="meta-strategy" className="px-3 py-1.5 border border-primary text-primary">
                            VIA [{(data.strategy || "unknown").toUpperCase()}]
                        </span>
                        <span className="px-3 py-1.5 border border-border text-muted-foreground">
                            WORDS [{fmt(data.word_count)}]
                        </span>
                        <span className="px-3 py-1.5 border border-border text-muted-foreground">
                            SEGMENTS [{data.segments.length}]
                        </span>
                        <span className="px-3 py-1.5 border border-border text-muted-foreground">
                            DURATION [{Math.floor(data.duration / 60)}:{String(Math.floor(data.duration % 60)).padStart(2, "0")}]
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 mb-6 border border-border w-fit">
                    {[
                        { k: "transcript", label: "01 / TRANSCRIPT", icon: PlayCircle },
                        { k: "summary", label: "02 / SUMMARY", icon: Brain },
                        { k: "translate", label: "03 / TRANSLATE", icon: Translate },
                        { k: "content", label: "04 / CONTENT", icon: Lightning },
                        { k: "editor", label: "05 / EDITOR", icon: PencilSimple },
                        { k: "audio", label: "06 / AUDIO", icon: SpeakerHigh },
                    ].map(({ k, label, icon: Icon }) => (
                        <button
                            key={k}
                            data-testid={`tab-${k}`}
                            onClick={() => setTab(k)}
                            className={`flex items-center gap-2 px-5 py-3 text-xs font-mono uppercase tracking-[0.2em] transition-colors ${
                                tab === k
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} weight="bold" /> {label}
                        </button>
                    ))}
                </div>

                {tab === "transcript" && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0 border border-border">
                        {/* Video pane */}
                        <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-border bg-card">
                            <div className="aspect-video bg-black">
                                <iframe
                                    ref={iframeRef}
                                    title="YouTube player"
                                    src={`https://www.youtube.com/embed/${data.video_id}`}
                                    className="w-full h-full"
                                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay"
                                    allowFullScreen
                                />
                            </div>
                            <div className="p-5 flex flex-col gap-3 text-xs font-mono">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground uppercase tracking-[0.2em]">Active Segment</span>
                                    <span className="text-primary">{data.segments[activeIdx]?.timestamp}</span>
                                </div>
                                <div className="text-foreground leading-relaxed">
                                    {data.segments[activeIdx]?.text}
                                </div>
                            </div>
                        </div>

                        {/* Transcript pane */}
                        <div className="md:col-span-7 bg-background relative">
                            <div className="sticky top-16 z-10 backdrop-blur-md bg-background/80 border-b border-border px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-xs font-mono">
                                    <label data-testid="autoscroll-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={autoScroll}
                                            onChange={(e) => setAutoScroll(e.target.checked)}
                                            className="accent-primary"
                                        />
                                        <span className="uppercase tracking-[0.2em] text-muted-foreground">Autoscroll</span>
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        data-testid="download-srt-btn"
                                        onClick={() => downloadSubtitle("srt")}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-1.5 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        <DownloadSimple size={12} weight="bold" />
                                        SRT
                                    </button>
                                    <button
                                        data-testid="download-vtt-btn"
                                        onClick={() => downloadSubtitle("vtt")}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-1.5 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        <DownloadSimple size={12} weight="bold" />
                                        VTT
                                    </button>
                                    <button
                                        data-testid="copy-all-btn"
                                        onClick={copyAll}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-1.5 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        {copied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                                        {copied ? "Copied" : "Copy All"}
                                    </button>
                                </div>
                            </div>
                            <div
                                ref={containerRef}
                                className="max-h-[60vh] overflow-y-auto py-4"
                            >
                                {data.segments.map((seg, idx) => (
                                    <div
                                        key={seg.index}
                                        ref={(el) => (segRefs.current[idx] = el)}
                                        data-testid={`transcript-line-${idx}`}
                                        onClick={() => jumpTo(seg, idx)}
                                        className={`transcript-line py-2 px-5 flex gap-5 text-sm leading-relaxed text-muted-foreground ${
                                            idx === activeIdx ? "transcript-line-active" : ""
                                        }`}
                                    >
                                        <span className="font-mono text-xs text-primary/70 shrink-0 w-16 pt-0.5">
                                            {seg.timestamp}
                                        </span>
                                        <span className="font-mono">{seg.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {tab === "summary" && (
                    <div className="border border-border bg-card">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <span className="pulse-dot" />
                                <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                                    SYS.ANALYSIS / claude-sonnet-4.5
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {summary && (
                                    <button
                                        onClick={() => copyText(
                                            [summary.tldr, "\n\nKey Points:", ...(summary.key_points || []).map((p, i) => `${i + 1}. ${p}`), summary.sentiment ? `\nSentiment: ${summary.sentiment}` : ""].join("\n"),
                                            setCopiedSummary
                                        )}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        {copiedSummary ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                                        {copiedSummary ? "Copied" : "Copy"}
                                    </button>
                                )}
                                <button
                                    data-testid="generate-summary-btn"
                                    onClick={onSummarize}
                                    disabled={summarizing}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.2em] btn-brutal disabled:opacity-60"
                                >
                                    {summarizing ? (
                                        <>
                                            <SpinnerGap size={14} className="animate-spin" /> ANALYZING
                                        </>
                                    ) : summary ? (
                                        "Re-analyze"
                                    ) : (
                                        "Generate"
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="p-6 lg:p-10">
                            {!summary && !summarizing && (
                                <div data-testid="summary-empty-state" className="text-center py-16 text-muted-foreground font-mono text-sm">
                                    <Brain size={32} className="mx-auto mb-4 text-primary" weight="duotone" />
                                    Click <span className="text-foreground">[GENERATE]</span> to produce TL;DR, key points, chapters & sentiment.
                                </div>
                            )}
                            {errorSummary && (
                                <div className="text-xs font-mono text-destructive border-l-2 border-destructive pl-3 mb-6">
                                    ERR &gt; {errorSummary}
                                </div>
                            )}
                            {summary && (
                                <div className="space-y-10">
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// TL;DR</span>
                                            <button onClick={() => copyText(summary.tldr, setCopiedTldr)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedTldr ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedTldr ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <p data-testid="summary-tldr" className="text-lg lg:text-xl font-[Outfit] leading-snug">
                                            {summary.tldr}
                                        </p>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// KEY_POINTS</span>
                                            <button onClick={() => copyText((summary.key_points || []).map((p, i) => `${i + 1}. ${p}`).join("\n"), setCopiedKeyPoints)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedKeyPoints ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedKeyPoints ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <ol data-testid="summary-key-points" className="space-y-3">
                                            {summary.key_points.map((p, i) => (
                                                <li key={i} className="flex gap-4 font-mono text-sm leading-relaxed">
                                                    <span className="text-muted-foreground shrink-0">[{String(i + 1).padStart(2, "0")}]</span>
                                                    <span>{p}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                    {summary.chapters?.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// CHAPTERS</span>
                                                <button onClick={() => copyText((summary.chapters || []).map((c, i) => `${i + 1}. ${c.title}\n   ${c.summary}`).join("\n\n"), setCopiedChapters)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                    {copiedChapters ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                    {copiedChapters ? "Copied" : "Copy"}
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
                                                {summary.chapters.map((c, i) => (
                                                    <div
                                                        key={i}
                                                        data-testid={`chapter-${i}`}
                                                        className="p-5 border-b last:border-b-0 md:[&:nth-child(odd)]:border-r border-border"
                                                    >
                                                        <div className="flex gap-3 mb-2">
                                                            <span className="text-xs font-mono text-muted-foreground">[{String(i + 1).padStart(2, "0")}]</span>
                                                            <h4 className="font-[Outfit] font-bold text-base">{c.title}</h4>
                                                        </div>
                                                        <p className="text-xs font-mono text-muted-foreground leading-relaxed pl-8">{c.summary}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-4 pt-6 border-t border-border text-xs font-mono">
                                        <span className="text-muted-foreground">SENTIMENT [<span className="text-primary uppercase">{summary.sentiment}</span>]</span>
                                        <span className="text-muted-foreground">COMPRESSION [{Math.round(((summary.word_count_original - summary.word_count_summary) / summary.word_count_original) * 100)}%]</span>
                                        <span className="text-muted-foreground">SOURCE_WORDS [{fmt(summary.word_count_original)}]</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === "translate" && (
                    <div className="border border-border bg-card">
                        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <span className="pulse-dot" />
                                <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                                    SYS.TRANSLATE / gpt-4o
                                </span>
                            </div>
                            <div className="flex items-center gap-3 ml-auto">
                                <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">TARGET</span>
                                <select
                                    data-testid="translate-language-select"
                                    value={targetLang}
                                    onChange={(e) => setTargetLang(e.target.value)}
                                    className="bg-background border border-border h-10 px-3 text-xs font-mono uppercase tracking-[0.15em] outline-none focus:border-primary"
                                >
                                    {languages.map((l) => (
                                        <option key={l.code} value={l.name}>
                                            {`[${l.code.toUpperCase()}] ${l.name}`}
                                        </option>
                                    ))}
                                </select>
                                {translation && (
                                    <button
                                        onClick={() => copyText(translation.translated_text, setCopiedTranslate)}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        {copiedTranslate ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                                        {copiedTranslate ? "Copied" : "Copy"}
                                    </button>
                                )}
                                <button
                                    data-testid="translate-btn"
                                    onClick={() => onTranslate(targetLang)}
                                    disabled={translating}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.2em] btn-brutal disabled:opacity-60"
                                >
                                    {translating ? (
                                        <>
                                            <SpinnerGap size={14} className="animate-spin" /> TRANSLATING
                                        </>
                                    ) : (
                                        <>
                                            Translate <CaretRight size={12} weight="bold" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2">
                            <div className="p-6 lg:p-8 border-b md:border-b-0 md:border-r border-border">
                                <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">
                                    // SOURCE [{data.language.toUpperCase()}]
                                </div>
                                <div data-testid="translate-source" className="font-mono text-sm text-muted-foreground leading-relaxed max-h-[55vh] overflow-y-auto whitespace-pre-wrap">
                                    {data.full_text}
                                </div>
                            </div>
                            <div className="p-6 lg:p-8 bg-background">
                                <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary mb-4">
                                    // TARGET [{targetLang.toUpperCase()}]
                                </div>
                                {errorTranslate && (
                                    <div className="text-xs font-mono text-destructive border-l-2 border-destructive pl-3 mb-4">
                                        ERR &gt; {errorTranslate}
                                    </div>
                                )}
                                {!translation && !translating && !errorTranslate && (
                                    <div data-testid="translate-empty-state" className="text-center py-16 text-muted-foreground font-mono text-sm">
                                        <Translate size={28} className="mx-auto mb-3 text-primary" weight="duotone" />
                                        Choose a language and click <span className="text-foreground">[TRANSLATE]</span>.
                                    </div>
                                )}
                                {translation && (
                                    <div data-testid="translate-output" className="font-mono text-sm leading-relaxed max-h-[55vh] overflow-y-auto whitespace-pre-wrap">
                                        {translation.translated_text}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === "content" && (
                    <div className="border border-border bg-card">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <span className="pulse-dot" />
                                <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                                    SYS.CONTENT / creator-pack
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {contentPack && (
                                    <button
                                        onClick={() => copyText(
                                            [
                                                "=== YouTube Description ===", contentPack.youtube_description || "",
                                                "\n=== Title Ideas ===", ...(contentPack.title_ideas || []).map((t, i) => `${i + 1}. ${t}`),
                                                "\n=== Tags ===", (contentPack.tags || []).join(", "),
                                                "\n=== Blog Article ===", contentPack.blog_article || "",
                                                "\n=== Instagram Captions ===", ...(contentPack.instagram_captions || []),
                                            ].join("\n"),
                                            setCopiedContent
                                        )}
                                        className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                        {copiedContent ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                                        {copiedContent ? "Copied" : "Copy All"}
                                    </button>
                                )}
                                <button
                                    data-testid="generate-content-btn"
                                    onClick={onGenerateContent}
                                    disabled={generatingContent}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-xs font-mono uppercase tracking-[0.2em] btn-brutal disabled:opacity-60"
                                >
                                    {generatingContent ? (
                                        <>
                                            <SpinnerGap size={14} className="animate-spin" /> GENERATING
                                        </>
                                    ) : contentPack ? (
                                        "Re-generate"
                                    ) : (
                                        "Generate"
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="p-6 lg:p-8 space-y-8">
                            {!contentPack && !generatingContent && !errorContent && (
                                <div className="text-center py-16 text-muted-foreground font-mono text-sm">
                                    <Lightning size={28} className="mx-auto mb-3 text-primary" weight="duotone" />
                                    Generate creator-ready YouTube descriptions, title ideas, tags, blog content, and Instagram captions.
                                </div>
                            )}
                            {errorContent && (
                                <div className="text-xs font-mono text-destructive border-l-2 border-destructive pl-3">
                                    ERR &gt; {errorContent}
                                </div>
                            )}
                            {contentPack && (
                                <>
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// YOUTUBE_DESCRIPTION</span>
                                            <button onClick={() => copyText(contentPack.youtube_description || "", setCopiedYtDesc)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedYtDesc ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedYtDesc ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed">{contentPack.youtube_description}</div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// TITLE_IDEAS</span>
                                            <button onClick={() => copyText((contentPack.title_ideas || []).map((t, i) => `${i + 1}. ${t}`).join("\n"), setCopiedTitleIdeas)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedTitleIdeas ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedTitleIdeas ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <ol className="space-y-2 font-mono text-sm">
                                            {(contentPack.title_ideas || []).map((item, idx) => (
                                                <li key={idx} className="flex gap-3">
                                                    <span className="text-muted-foreground">[{String(idx + 1).padStart(2, "0")}]</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// TAGS</span>
                                            <button onClick={() => copyText((contentPack.tags || []).join(", "), setCopiedTags)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedTags ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedTags ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(contentPack.tags || []).map((tag, idx) => (
                                                <span key={idx} className="px-3 py-1.5 border border-border text-xs font-mono text-muted-foreground">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// BLOG_ARTICLE</span>
                                            <button onClick={() => copyText(contentPack.blog_article || "", setCopiedBlog)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedBlog ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedBlog ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed">{contentPack.blog_article}</div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono uppercase tracking-[0.3em] text-primary">// INSTAGRAM_CAPTIONS</span>
                                            <button onClick={() => copyText((contentPack.instagram_captions || []).join("\n\n---\n\n"), setCopiedInsta)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-1 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                {copiedInsta ? <Check size={10} weight="bold" /> : <Copy size={10} weight="bold" />}
                                                {copiedInsta ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(contentPack.instagram_captions || []).map((caption, idx) => (
                                                <div key={idx} className="border border-border p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                                                    {caption}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
                {tab === "editor" && (
                    <SubtitleEditor data={data} />
                )}
                {tab === "audio" && (
                    <AudioEnhancement videoId={data?.video_id || data?.url?.split("v=")[1]?.split("&")[0]} />
                )}
            </div>
        </section>
    );
}
