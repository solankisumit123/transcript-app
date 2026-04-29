import {
    SpeakerHigh,
    Stack,
    Brain,
    Translate,
    GlobeHemisphereWest,
    Lightning,
    PlayCircle,
    DownloadSimple,
    BookOpen,
    Check,
    ArrowRight,
} from "@phosphor-icons/react";

// ----- Tools/Features Grid ---------------------------------------------------
const TOOLS = [
    { id: "transcribe", icon: PlayCircle, title: "Transcript Extraction", desc: "Pull captions from any YouTube URL with timestamp-locked precision and speaker tagging.", badge: "LIVE" },
    { id: "summarize", icon: Brain, title: "AI Summarizer", desc: "TL;DR, key points and chapter breakdowns powered by Claude Sonnet 4.5.", badge: "LIVE" },
    { id: "translate", icon: Translate, title: "100+ Languages", desc: "Context-aware neural translation. Spanish to Swahili in under one second.", badge: "LIVE" },
    { id: "content-generator", icon: Lightning, title: "AI Content Generator", desc: "Turn transcripts into YouTube descriptions, title ideas, tags, blog articles, and Instagram captions.", badge: "LIVE" },
    { id: "subtitles", icon: SpeakerHigh, title: "Subtitle Editor", desc: "Adjust timing, formatting and multi-line layout. Export SRT, VTT, ASS.", badge: "BETA" },
    { id: "subtitle-generator", icon: DownloadSimple, title: "Subtitle Generator (SRT/VTT)", desc: "Auto-generate subtitle files from transcript segments and download them instantly in SRT or VTT format.", badge: "LIVE" },
    { id: "batch", icon: Stack, title: "Batch Processing", desc: "Queue up to 1,000 files. Live progress, retries, webhooks.", badge: "PRO" },
    { id: "enhance", icon: Lightning, title: "Audio Enhancement", desc: "Noise reduction, dialogue isolation, volume normalization.", badge: "PRO" },
    { id: "moderate", icon: GlobeHemisphereWest, title: "Content Moderation", desc: "Filter NSFW, hate, violence and PII before downstream consumption.", badge: "ENT" },
];

export function ToolsGrid() {
    return (
        <section id="tools" data-testid="tools-section" className="border-b border-border">
            <div className="max-w-[1600px] mx-auto px-6 lg:px-12 py-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-12">
                    <div className="lg:col-span-5">
                        <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">
                            // CAPABILITIES_MATRIX
                        </div>
                        <h2 className="font-[Outfit] font-black text-4xl lg:text-5xl tracking-tighter leading-[0.95]">
                            One platform.<br />
                            Every <span className="text-primary">media op.</span>
                        </h2>
                    </div>
                    <p className="lg:col-span-7 self-end text-base text-muted-foreground max-w-2xl">
                        From paste-and-go transcripts to enterprise batch pipelines — built for content teams,
                        researchers, podcasters and the engineers who automate them.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-l border-t border-border">
                    {TOOLS.map((t) => (
                        <div
                            key={t.id}
                            data-testid={`tool-card-${t.id}`}
                            className="p-8 border-r border-b border-border bg-card hover:bg-accent/40 transition-colors group"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <t.icon size={28} weight="duotone" className="text-primary" />
                                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground border border-border px-2 py-1">
                                    {t.badge}
                                </span>
                            </div>
                            <h3 className="font-[Outfit] font-bold text-xl mb-3 tracking-tight">{t.title}</h3>
                            <p className="text-sm font-mono text-muted-foreground leading-relaxed">{t.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ----- Pricing removed per product direction. Kept stub so callers don't break. ----
export function Pricing() {
    return null;
}

// ----- Marquee strip -------------------------------------------------------
export function Marquee() {
    const items = [
        "100+ LANGUAGES",
        "—",
        "4K DOWNLOADS",
        "—",
        "BATCH × 1000",
        "—",
        "SPEAKER ID",
        "—",
        "GDPR READY",
        "—",
        "99.9% UPTIME",
        "—",
        "SUB-500MS API",
        "—",
        "OAUTH 2.0",
        "—",
    ];
    return (
        <div className="border-b border-border bg-card py-5 marquee">
            {[0, 1].map((k) => (
                <div key={k} className="marquee__inner font-[Outfit] font-bold text-2xl lg:text-3xl tracking-tight">
                    {items.map((t, i) => (
                        <span key={i} className={t === "—" ? "text-primary" : "text-muted-foreground"}>
                            {t}
                        </span>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ----- Docs / API teaser ---------------------------------------------------
export function Docs() {
    return (
        <section id="docs" data-testid="docs-section" className="border-b border-border">
            <div className="max-w-[1600px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-5">
                    <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">
                        // DOCS.QUICKSTART
                    </div>
                    <h2 className="font-[Outfit] font-black text-4xl lg:text-5xl tracking-tighter leading-[0.95] mb-6">
                        Built for <span className="text-primary">engineers.</span>
                    </h2>
                    <p className="text-base font-mono text-muted-foreground mb-8 leading-relaxed">
                        Drop a YouTube URL into our REST API and get a structured transcript with timestamps,
                        word counts and a stable video ID. Compose summaries and translation in a single chained call.
                    </p>
                    <a
                        href="/SPECIFICATION.md"
                        target="_blank"
                        rel="noreferrer"
                        data-testid="spec-link"
                        className="inline-flex items-center gap-2 h-12 px-6 border border-border text-xs font-mono uppercase tracking-[0.2em] hover:border-primary hover:text-primary btn-brutal"
                    >
                        <BookOpen size={14} weight="bold" /> Read full specification
                    </a>
                </div>
                <div className="lg:col-span-7 border border-border bg-card font-mono text-xs lg:text-[13px] leading-relaxed">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-muted-foreground uppercase tracking-[0.2em]">
                        <span className="w-2 h-2 bg-primary" /> API.EXAMPLE — /api/transcript/extract
                    </div>
                    <pre className="p-5 overflow-x-auto text-foreground whitespace-pre-wrap">
{`POST /api/transcript/extract
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ"
}

→ 200 OK
{
  "id": "0d6e...",
  "video_id": "dQw4w9WgXcQ",
  "language": "en",
  "duration": 213.0,
  "word_count": 412,
  "segments": [
    { "index": 0, "start": 0.0, "timestamp": "0:00",
      "text": "We're no strangers to love..." },
    ...
  ]
}`}
                    </pre>
                </div>
            </div>
        </section>
    );
}

// ----- Footer with giant CTA ----------------------------------------------
export function Footer() {
    return (
        <footer data-testid="footer" className="border-t border-border">
            <div className="max-w-[1600px] mx-auto px-6 lg:px-12 py-20">
                <a
                    href="#extract"
                    data-testid="footer-cta"
                    className="block font-[Outfit] font-black tracking-tighter leading-[0.85] hover:text-primary transition-colors"
                    style={{ fontSize: "clamp(2.5rem, 11vw, 11rem)" }}
                >
                    START EXTRACTING →
                </a>
                <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-border pt-10 text-xs font-mono">
                    <div>
                        <div className="uppercase tracking-[0.3em] text-muted-foreground mb-3">// product</div>
                        <ul className="space-y-2">
                            <li><a href="#tools" className="hover:text-primary">Tools</a></li>
                            <li><a href="#pipeline" className="hover:text-primary">Pipeline</a></li>
                            <li><a href="#docs" className="hover:text-primary">Docs</a></li>
                            <li><a href="/SPECIFICATION.md" target="_blank" rel="noreferrer" className="hover:text-primary">Specification</a></li>
                        </ul>
                    </div>
                    <div>
                        <div className="uppercase tracking-[0.3em] text-muted-foreground mb-3">// company</div>
                        <ul className="space-y-2">
                            <li>About</li>
                            <li>Careers</li>
                            <li>Press</li>
                            <li>Security</li>
                        </ul>
                    </div>
                    <div>
                        <div className="uppercase tracking-[0.3em] text-muted-foreground mb-3">// legal</div>
                        <ul className="space-y-2">
                            <li>Terms</li>
                            <li>Privacy</li>
                            <li>GDPR</li>
                            <li>SOC 2</li>
                        </ul>
                    </div>
                    <div>
                        <div className="uppercase tracking-[0.3em] text-muted-foreground mb-3">// system</div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><span className="pulse-dot inline-block" /> All systems operational</li>
                            <li>v1.0.0</li>
                            <li>© {new Date().getFullYear()} Y/T_TRANSCRIPT</li>
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}
