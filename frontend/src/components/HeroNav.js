import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "@/App.css";
import {
    ArrowRight,
    Copy,
    Check,
    Lightning,
    GlobeHemisphereWest,
    Brain,
    Stack,
    Microphone,
    DownloadSimple,
    SpeakerHigh,
    Translate,
    PlayCircle,
    SpinnerGap,
    CaretRight,
    GithubLogo,
    BookOpen,
} from "@phosphor-icons/react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ---------------------------------------------------------------------------
// Demo URL pool — popular videos with reliable English transcripts
// ---------------------------------------------------------------------------
const DEMO_VIDEOS = [
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", label: "Music Video" },
    { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", label: "First YouTube Video" },
    { url: "https://www.youtube.com/watch?v=9bZkp7q19f0", label: "Gangnam Style" },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const fmt = (n) => new Intl.NumberFormat("en-US").format(n);

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function Navigation() {
    return (
        <nav
            data-testid="main-nav"
            className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-white/10"
        >
            <div className="max-w-[1600px] mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
                <a
                    href="#top"
                    data-testid="brand-logo"
                    className="font-[Outfit] font-black tracking-tighter text-xl"
                >
                    Y/T<span className="text-primary">_</span>TRANSCRIPT
                </a>
                <div className="hidden md:flex items-center gap-8 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    <a data-testid="nav-tools" href="#tools" className="hover:text-foreground transition-colors">Tools</a>
                    <a data-testid="nav-pipeline" href="#pipeline" className="hover:text-foreground transition-colors">Pipeline</a>
                    <a data-testid="nav-docs" href="#docs" className="hover:text-foreground transition-colors">Docs</a>
                </div>
                <a
                    data-testid="nav-cta"
                    href="#extract"
                    className="hidden md:inline-flex items-center gap-2 h-10 px-5 bg-primary text-primary-foreground text-xs uppercase tracking-[0.2em] btn-brutal"
                >
                    Extract <ArrowRight size={14} weight="bold" />
                </a>
            </div>
        </nav>
    );
}

// ---------------------------------------------------------------------------
// Hero with brutalist URL input
// ---------------------------------------------------------------------------
function Hero({ onExtract, loading, error, urlValue, setUrlValue }) {
    return (
        <section
            id="extract"
            data-testid="hero-section"
            className="relative pt-32 pb-20 px-6 lg:px-12 border-b border-border"
        >
            <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7">
                    <div data-testid="hero-eyebrow" className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mb-6 fade-up fade-up-1">
                        <span className="pulse-dot inline-block mr-3 align-middle" /> SYS.ONLINE / v1.0.0 / OPERATIONAL
                    </div>
                    <h1 className="font-[Outfit] font-black text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-[0.9] mb-8 fade-up fade-up-2">
                        Read YouTube.<br />
                        Faster than <span className="text-primary">watching</span><span className="blink"></span>
                    </h1>
                    <p className="text-base lg:text-lg text-muted-foreground max-w-xl mb-10 fade-up fade-up-3">
                        Enterprise-grade media intelligence. Extract transcripts, generate AI summaries,
                        translate into 100+ languages, and process up to 1,000 files in batch — at studio fidelity.
                    </p>

                    <form
                        data-testid="extract-form"
                        onSubmit={(e) => {
                            e.preventDefault();
                            onExtract(urlValue);
                        }}
                        className="fade-up fade-up-4"
                    >
                        <div className="flex flex-col sm:flex-row border border-border bg-card">
                            <div className="flex items-center px-4 sm:px-6 border-b sm:border-b-0 sm:border-r border-border text-muted-foreground text-xs font-mono uppercase tracking-[0.2em] py-4 sm:py-0">
                                URL/&gt;
                            </div>
                            <input
                                data-testid="url-input-field"
                                type="text"
                                placeholder="paste youtube link or video id..."
                                value={urlValue}
                                onChange={(e) => setUrlValue(e.target.value)}
                                className="flex-1 h-16 px-5 bg-transparent outline-none text-base font-mono placeholder:text-muted-foreground/60"
                            />
                            <button
                                data-testid="extract-submit-btn"
                                type="submit"
                                disabled={loading}
                                className="h-16 px-8 bg-primary text-primary-foreground font-mono uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-2 btn-brutal disabled:opacity-60"
                            >
                                {loading ? (
                                    <>
                                        <SpinnerGap size={18} className="animate-spin" /> EXTRACTING
                                    </>
                                ) : (
                                    <>
                                        EXTRACT <ArrowRight size={16} weight="bold" />
                                    </>
                                )}
                            </button>
                        </div>
                        {error && (
                            <div data-testid="extract-error" className="mt-4 text-xs font-mono text-destructive border-l-2 border-destructive pl-3">
                                ERR &gt; {error}
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono">
                            <span className="text-muted-foreground uppercase tracking-[0.2em]">try:</span>
                            {DEMO_VIDEOS.map((v) => (
                                <button
                                    key={v.url}
                                    type="button"
                                    data-testid={`demo-${v.label.replace(/\s+/g, "-").toLowerCase()}`}
                                    onClick={() => {
                                        setUrlValue(v.url);
                                        onExtract(v.url);
                                    }}
                                    className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                                >
                                    [{v.label}]
                                </button>
                            ))}
                        </div>
                    </form>
                </div>

                <div className="lg:col-span-5 fade-up fade-up-5">
                    <div className="border border-border bg-card p-6 lg:p-8 h-full flex flex-col gap-6">
                        <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">// SYSTEM_STATUS</div>
                        <div className="grid grid-cols-2 gap-4 font-mono">
                            <Stat label="Languages" value="100+" />
                            <Stat label="Batch Size" value="1,000" />
                            <Stat label="Whisper Model" value="Faster" />
                            <Stat label="Uptime SLA" value="99.9%" />
                            <Stat label="API Latency" value="<500ms" />
                            <Stat label="Concurrency" value="10K" />
                        </div>
                        <div className="mt-auto pt-6 border-t border-border">
                            <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2">
                                // ACTIVE_PIPELINES
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                                {["TRANSCRIBE", "SUMMARIZE", "TRANSLATE", "ENHANCE", "MODERATE"].map((p) => (
                                    <span key={p} className="px-2 py-1 border border-border text-muted-foreground">
                                        {p}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Stat({ label, value }) {
    return (
        <div className="border border-border p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
            <div className="text-2xl font-[Outfit] font-bold mt-1">{value}</div>
        </div>
    );
}

export {
    Navigation,
    Hero,
    DEMO_VIDEOS,
    fmt,
    API,
    BACKEND_URL,
};
