import { useEffect, useState } from "react";
import axios from "axios";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";

import { Navigation, Hero, API } from "@/components/HeroNav";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { ToolsGrid, Marquee, Docs, Footer } from "@/components/Marketing";
import { PipelineSection } from "@/components/Pipeline";

function Home() {
    const [urlValue, setUrlValue] = useState("");
    const [transcript, setTranscript] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [summary, setSummary] = useState(null);
    const [summarizing, setSummarizing] = useState(false);
    const [errorSummary, setErrorSummary] = useState("");

    const [translation, setTranslation] = useState(null);
    const [translating, setTranslating] = useState(false);
    const [errorTranslate, setErrorTranslate] = useState("");

    const [contentPack, setContentPack] = useState(null);
    const [generatingContent, setGeneratingContent] = useState(false);
    const [errorContent, setErrorContent] = useState("");

    const [languages, setLanguages] = useState([]);

    useEffect(() => {
        axios
            .get(`${API}/languages`)
            .then((r) => setLanguages(r.data.languages || []))
            .catch(() => setLanguages([]));
    }, []);

    const [jobProgress, setJobProgress] = useState(null);

    const handleExtract = async (url) => {
        if (!url || !url.trim()) {
            setError("Provide a YouTube URL or video ID.");
            return;
        }
        setLoading(true);
        setJobProgress(null);
        setError("");
        setSummary(null);
        setTranslation(null);
        setContentPack(null);
        setErrorSummary("");
        setErrorTranslate("");
        setErrorContent("");
        try {
            // Note: server now returns 202 with job_id if falling back to AI
            const resp = await axios.post(`${API}/transcript/extract`, { url });
            
            if (resp.status === 202 && resp.data.job_id) {
                // Background job started (AI Fallback)
                setJobProgress(resp.data.message || "Generating transcript using AI...");
                const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
                // Determine the base URL dynamically for production deployments
                let baseUrl = "";
                if (API.startsWith("http")) {
                    baseUrl = API.replace(/^https?:/, wsProtocol).replace(/\/api$/, "");
                } else {
                    baseUrl = `${wsProtocol}//${window.location.host}`;
                }
                const ws = new WebSocket(`${baseUrl}${resp.data.stream}`);
                
                ws.onmessage = (e) => {
                    const msg = JSON.parse(e.data);
                    // The backend WebSocket returns "status", not "type"
                    if (msg.status === "processing") {
                        setJobProgress(`${msg.message || "Processing..."} (${msg.progress}%)`);
                    } else if (msg.status === "done") {
                        ws.close();
                        setJobProgress("Finalizing...");
                        // Fetch the final result using the job's result_id
                        axios.get(`${API}/jobs/${resp.data.job_id}/result`).then(jobRes => {
                            setTranscript(jobRes.data.result || jobRes.data);
                            setLoading(false);
                            setJobProgress(null);
                            setTimeout(() => {
                                document.getElementById("viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 80);
                        }).catch(err => {
                            setError("Failed to fetch generated AI transcript.");
                            setLoading(false);
                            setJobProgress(null);
                        });
                    } else if (msg.status === "failed") {
                        ws.close();
                        setError(msg.message || "AI transcription failed.");
                        setLoading(false);
                        setJobProgress(null);
                    }
                };
                
                ws.onerror = () => {
                    setError("WebSocket connection error. Could not track AI transcription progress.");
                    setLoading(false);
                    setJobProgress(null);
                };
            } else {
                // Immediate sync response
                setTranscript(resp.data);
                setLoading(false);
                setTimeout(() => {
                    document.getElementById("viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 80);
            }
        } catch (e) {
            const msg = e?.response?.data?.detail || e.message || "Extraction failed.";
            setError(typeof msg === "string" ? msg : JSON.stringify(msg));
            setLoading(false);
            setJobProgress(null);
        }
    };

    const handleSummarize = async () => {
        if (!transcript) return;
        setSummarizing(true);
        setErrorSummary("");
        try {
            const { data } = await axios.post(`${API}/transcript/summarize`, {
                transcript: transcript.full_text,
                video_title: transcript.title,
                style: "comprehensive",
            });
            setSummary(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || e.message || "Summarization failed.";
            setErrorSummary(typeof msg === "string" ? msg : JSON.stringify(msg));
        } finally {
            setSummarizing(false);
        }
    };

    const handleTranslate = async (langName) => {
        if (!transcript) return;
        setTranslating(true);
        setErrorTranslate("");
        setTranslation(null);
        try {
            const { data } = await axios.post(`${API}/transcript/translate`, {
                transcript: transcript.full_text,
                target_language: langName,
            });
            setTranslation(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || e.message || "Translation failed.";
            setErrorTranslate(typeof msg === "string" ? msg : JSON.stringify(msg));
        } finally {
            setTranslating(false);
        }
    };

    const handleGenerateContent = async () => {
        if (!transcript) return;
        setGeneratingContent(true);
        setErrorContent("");
        try {
            const { data } = await axios.post(`${API}/transcript/content`, {
                transcript: transcript.full_text,
                video_title: transcript.title,
            });
            setContentPack(data);
        } catch (e) {
            const msg = e?.response?.data?.detail || e.message || "Content generation failed.";
            setErrorContent(typeof msg === "string" ? msg : JSON.stringify(msg));
        } finally {
            setGeneratingContent(false);
        }
    };

    return (
        <div id="top" className="App grain min-h-screen relative">
            <div className="relative z-10">
                <Navigation />
                <Hero
                    onExtract={handleExtract}
                    loading={loading}
                    jobProgress={jobProgress}
                    error={error}
                    urlValue={urlValue}
                    setUrlValue={setUrlValue}
                />
                {transcript && (
                    <TranscriptViewer
                        data={transcript}
                        onSummarize={handleSummarize}
                        onTranslate={handleTranslate}
                        onGenerateContent={handleGenerateContent}
                        summary={summary}
                        translation={translation}
                        contentPack={contentPack}
                        summarizing={summarizing}
                        translating={translating}
                        generatingContent={generatingContent}
                        languages={languages}
                        errorSummary={errorSummary}
                        errorTranslate={errorTranslate}
                        errorContent={errorContent}
                    />
                )}
                <Marquee />
                <ToolsGrid />
                <PipelineSection />
                <Docs />
                <Footer />
            </div>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
