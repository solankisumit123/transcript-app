import { useState, useRef, useCallback } from "react";
import {
    Plus,
    Trash,
    DownloadSimple,
    MagnifyingGlass,
    ArrowClockwise,
    Copy,
    Check,
    PencilSimple,
    FloppyDisk,
} from "@phosphor-icons/react";

function pad(n, len = 2) { return String(Math.floor(n)).padStart(len, "0"); }

function secToSrt(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

function secToVtt(s) { return secToSrt(s).replace(",", "."); }

function srtToSec(str) {
    const clean = str.replace(",", ".");
    const [hms, ms = "0"] = clean.split(/[,\.]/);
    const parts = hms.split(":").map(Number);
    const [h = 0, m = 0, sec = 0] = parts;
    return h * 3600 + m * 60 + sec + Number(ms) / 1000;
}

function buildSrt(segs) {
    return segs.map((seg, i) =>
        `${i + 1}\n${secToSrt(seg.start)} --> ${secToSrt(seg.end)}\n${seg.text}`
    ).join("\n\n");
}

function buildVtt(segs) {
    return "WEBVTT\n\n" + segs.map((seg, i) =>
        `${i + 1}\n${secToVtt(seg.start)} --> ${secToVtt(seg.end)}\n${seg.text}`
    ).join("\n\n");
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function TimeInput({ value, onChange }) {
    const [editing, setEditing] = useState(false);
    const [raw, setRaw] = useState("");

    const display = secToSrt(value);

    const start = () => { setRaw(display); setEditing(true); };
    const commit = () => {
        const s = srtToSec(raw);
        if (!isNaN(s) && s >= 0) onChange(s);
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                autoFocus
                value={raw}
                onChange={e => setRaw(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
                className="bg-background border border-primary text-primary text-[11px] font-mono px-1 py-0.5 w-32 outline-none"
            />
        );
    }
    return (
        <button onClick={start} className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors w-32 text-left">
            {display}
        </button>
    );
}

export function SubtitleEditor({ data }) {
    const initSegs = () =>
        (data?.segments || []).map((seg, i) => ({
            id: i,
            start: seg.start,
            end: seg.end ?? seg.start + (seg.duration || 2),
            text: seg.text,
        }));

    const [segs, setSegs] = useState(initSegs);
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState("");
    const [search, setSearch] = useState("");
    const [replace, setReplace] = useState("");
    const [searchActive, setSearchActive] = useState(false);
    const [copied, setCopied] = useState(false);
    const [saved, setSaved] = useState(false);
    const nextId = useRef(segs.length);

    const updateSeg = useCallback((id, patch) =>
        setSegs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)), []);

    const deleteSeg = (id) => setSegs(prev => prev.filter(s => s.id !== id));

    const addAfter = (id) => {
        const idx = segs.findIndex(s => s.id === id);
        const cur = segs[idx];
        const newSeg = { id: nextId.current++, start: cur.end, end: cur.end + 2, text: "New subtitle" };
        setSegs(prev => {
            const next = [...prev];
            next.splice(idx + 1, 0, newSeg);
            return next;
        });
        setEditingId(newSeg.id);
        setEditText(newSeg.text);
    };

    const startEdit = (seg) => { setEditingId(seg.id); setEditText(seg.text); };
    const commitEdit = () => {
        if (editingId !== null) updateSeg(editingId, { text: editText });
        setEditingId(null);
    };

    const doReplace = () => {
        if (!search) return;
        setSegs(prev => prev.map(s => ({ ...s, text: s.text.replaceAll(search, replace) })));
    };

    const copyAll = async () => {
        const text = segs.map((s, i) => `${i + 1}. [${secToSrt(s.start)}] ${s.text}`).join("\n");
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
    };

    const filtered = search && searchActive
        ? segs.filter(s => s.text.toLowerCase().includes(search.toLowerCase()))
        : segs;

    const safeTitle = (data?.title || data?.video_id || "subtitle").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "subtitle";

    return (
        <div className="border border-border bg-card">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <span className="pulse-dot" />
                    <span className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                        SYS.EDITOR / subtitle
                    </span>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* Search/Replace toggle */}
                    <button
                        onClick={() => setSearchActive(p => !p)}
                        className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border transition-colors ${searchActive ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
                    >
                        <MagnifyingGlass size={12} weight="bold" /> Find &amp; Replace
                    </button>
                    <button onClick={copyAll} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        {copied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={() => downloadFile(buildSrt(segs), `${safeTitle}.srt`, "text/plain")} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        <DownloadSimple size={12} weight="bold" /> SRT
                    </button>
                    <button onClick={() => downloadFile(buildVtt(segs), `${safeTitle}.vtt`, "text/vtt")} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-3 py-2 border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        <DownloadSimple size={12} weight="bold" /> VTT
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 bg-primary text-primary-foreground btn-brutal">
                        {saved ? <Check size={12} weight="bold" /> : <FloppyDisk size={12} weight="bold" />}
                        {saved ? "Saved" : "Save"}
                    </button>
                </div>
            </div>

            {/* Search & Replace bar */}
            {searchActive && (
                <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-background/60">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">Find</span>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search text..."
                        className="bg-background border border-border px-3 py-1.5 text-xs font-mono outline-none focus:border-primary w-48"
                    />
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">Replace</span>
                    <input
                        value={replace}
                        onChange={e => setReplace(e.target.value)}
                        placeholder="Replace with..."
                        className="bg-background border border-border px-3 py-1.5 text-xs font-mono outline-none focus:border-primary w-48"
                    />
                    <button onClick={doReplace} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.2em] bg-primary text-primary-foreground btn-brutal">
                        <ArrowClockwise size={12} weight="bold" /> Replace All
                    </button>
                    <span className="text-xs font-mono text-muted-foreground">{filtered.length} match{filtered.length !== 1 ? "es" : ""}</span>
                </div>
            )}

            {/* Column headers */}
            <div className="grid grid-cols-[3rem_10rem_10rem_1fr_5rem] gap-0 px-6 py-2 border-b border-border bg-background/40 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                <span>#</span>
                <span>Start</span>
                <span>End</span>
                <span>Text</span>
                <span className="text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="max-h-[65vh] overflow-y-auto">
                {filtered.map((seg, idx) => {
                    const isEditing = editingId === seg.id;
                    const isMatch = searchActive && search && seg.text.toLowerCase().includes(search.toLowerCase());
                    return (
                        <div
                            key={seg.id}
                            className={`grid grid-cols-[3rem_10rem_10rem_1fr_5rem] gap-0 px-6 py-2 border-b border-border/50 items-start transition-colors hover:bg-card/60 ${isMatch ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                        >
                            {/* Index */}
                            <span className="text-[11px] font-mono text-muted-foreground pt-1">{idx + 1}</span>

                            {/* Start time */}
                            <div className="pt-1">
                                <TimeInput value={seg.start} onChange={v => updateSeg(seg.id, { start: v })} />
                            </div>

                            {/* End time */}
                            <div className="pt-1">
                                <TimeInput value={seg.end} onChange={v => updateSeg(seg.id, { end: v })} />
                            </div>

                            {/* Text */}
                            <div className="pr-4">
                                {isEditing ? (
                                    <textarea
                                        autoFocus
                                        value={editText}
                                        onChange={e => setEditText(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); } }}
                                        rows={2}
                                        className="w-full bg-background border border-primary text-sm font-mono px-2 py-1 outline-none resize-none leading-relaxed"
                                    />
                                ) : (
                                    <button
                                        onClick={() => startEdit(seg)}
                                        className="text-sm font-mono text-left w-full leading-relaxed hover:text-primary transition-colors group"
                                    >
                                        {searchActive && search
                                            ? seg.text.split(new RegExp(`(${search})`, "gi")).map((part, i) =>
                                                part.toLowerCase() === search.toLowerCase()
                                                    ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark>
                                                    : part
                                            )
                                            : seg.text}
                                        <PencilSimple size={10} className="inline ml-1.5 opacity-0 group-hover:opacity-50" />
                                    </button>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-start justify-end gap-1 pt-0.5">
                                <button
                                    onClick={() => addAfter(seg.id)}
                                    title="Add row after"
                                    className="p-1 text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <Plus size={13} weight="bold" />
                                </button>
                                <button
                                    onClick={() => deleteSeg(seg.id)}
                                    title="Delete row"
                                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <Trash size={13} weight="bold" />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Add row at bottom */}
                <button
                    onClick={() => {
                        const last = segs[segs.length - 1];
                        const newSeg = { id: nextId.current++, start: last ? last.end : 0, end: (last ? last.end : 0) + 2, text: "New subtitle" };
                        setSegs(prev => [...prev, newSeg]);
                        setEditingId(newSeg.id);
                        setEditText(newSeg.text);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-t border-border"
                >
                    <Plus size={12} weight="bold" /> Add Subtitle
                </button>
            </div>

            {/* Footer stats */}
            <div className="flex flex-wrap gap-4 px-6 py-3 border-t border-border text-[10px] font-mono text-muted-foreground">
                <span>TOTAL [{segs.length}]</span>
                <span>DURATION [{segs.length ? `${secToSrt(segs[segs.length - 1]?.end ?? 0)}` : "00:00:00,000"}]</span>
                <span>WORDS [{segs.reduce((a, s) => a + s.text.split(/\s+/).length, 0)}]</span>
            </div>
        </div>
    );
}
