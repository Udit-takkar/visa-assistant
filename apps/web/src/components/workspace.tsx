"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  FileText,
  FolderOpen,
  Globe2,
  MessageCircle,
  Layers3,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useSources,
  useSourceSearch,
  registerSource,
  saveSourceText,
  importLegacyDrafts,
} from "@/lib/source-store";
import { EvidenceReview } from "@/components/evidence-review";
import { RevisionHistory } from "@/components/revision-history";
import { parseThreadUrl, type Source } from "@/lib/sources";
import { AssistantPanel } from "@/components/assistant-panel";

export function Workspace({
  sourceId,
  view,
}: {
  sourceId?: string;
  view?: "assistant";
}) {
  const assistant = view === "assistant";
  const {
    sources,
    ready,
    error: databaseError,
    refresh,
    legacy,
  } = useSources();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const {
    results: visibleSources,
    searching,
    error: searchError,
  } = useSourceSearch(query, sources);
  const [error, setError] = useState("");
  const source = sources.find((item) => item.id === sourceId);
  const captured = sources.filter((item) => item.capturedAt).length;

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingSource(true);
    try {
      const parsed = parseThreadUrl(String(form.get("url")));
      await registerSource({
        url: parsed.url,
        title: String(form.get("title")).trim(),
        reason: String(form.get("reason")).trim(),
      });
      setAdding(false);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check your link and try again."
      );
    } finally {
      setSavingSource(false);
    }
  }

  async function importDrafts() {
    setImporting(true);
    try {
      const conflicts = await importLegacyDrafts(legacy);
      setImportNotice(
        conflicts.length
          ? `Kept existing database text for: ${conflicts.join(
              ", "
            )}. Original browser drafts remain available.`
          : "Browser drafts imported. Original copies remain in this browser."
      );
    } catch (error) {
      setImportNotice(
        error instanceof Error
          ? error.message
          : "Import failed. Browser drafts remain available."
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Compass size={23} />
            </span>
            <span>
              visa<span className="brand-light">notes</span>
              <small>SCHENGEN KNOWLEDGE</small>
            </span>
          </Link>
          <div className="workspace-label">RESEARCH WORKSPACE</div>
          <nav aria-label="Main navigation">
            <Link href="/" className={`nav-item ${!assistant ? "active" : ""}`}>
              <FolderOpen size={18} /> Source library{" "}
              <span>{sources.length}</span>
            </Link>
            <Link
              href="/assistant"
              className={`nav-item assistant-nav ${assistant ? "active" : ""}`}
            >
              <MessageCircle size={18} /> Assistant
            </Link>
            <Link href="/#workflow" className="nav-item">
              <Layers3 size={18} /> How it works <ArrowUpRight size={14} />
            </Link>
          </nav>
          <div className="sidebar-note">
            <span className="little-icon">
              <BookOpen size={18} />
            </span>
            <strong>A little less guesswork.</strong>
            <p>
              Build useful visa guidance, one well-understood source at a time.
            </p>
            <span className="note-rule" />{" "}
            <small>Made for applicants from India</small>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">IN</span>
            <div>
              Personal workspace<small>Local prototype</small>
            </div>
            <span className="online-dot" />
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div>
              <span>Workspace</span>
              <ChevronRight size={14} />
              <span>{assistant ? "Assistant" : "Source library"}</span>
              {sourceId && (
                <>
                  <ChevronRight size={14} />
                  <span>Capture</span>
                </>
              )}
            </div>
            <span className="local-label">
              <span className="online-dot" />{" "}
              {databaseError
                ? "Database unavailable"
                : ready
                ? "Saved in PostgreSQL"
                : "Connecting to database"}
            </span>
          </header>
          <main id="main-content">
            {databaseError && (
              <div role="alert" className="database-banner error-text">
                {databaseError}
                <Button
                  variant="outline"
                  onClick={() => {
                    void refresh();
                  }}
                >
                  Retry connection
                </Button>
              </div>
            )}
            {legacy.length > 0 && (
              <div className="database-banner">
                <div>
                  <strong>
                    {legacy.length} browser draft
                    {legacy.length === 1 ? "" : "s"} found
                  </strong>
                  <p>
                    Import them without replacing existing database text.
                    Original copies will remain here.
                  </p>
                </div>
                <Button loading={importing} onClick={importDrafts}>
                  Import browser drafts
                </Button>
              </div>
            )}
            {importNotice && (
              <p role="status" className="import-notice">
                {importNotice}
              </p>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={assistant ? "assistant" : sourceId || "library"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {assistant ? (
                  <AssistantPanel />
                ) : sourceId ? (
                  !ready ? (
                    <p role="status">Loading saved source…</p>
                  ) : databaseError ? null : source ? (
                    <Capture key={source.id} source={source} />
                  ) : (
                    <div className="empty-state">
                      <FileText />
                      <h1>Source not found</h1>
                      <p>
                        This browser doesn’t have that thread in its library.
                      </p>
                      <Button render={<Link href="/" />}>
                        Back to library
                      </Button>
                    </div>
                  )
                ) : (
                  <>
                    <div className="page-heading">
                      <div>
                        <div className="eyebrow">
                          <span /> YOUR KNOWLEDGE STARTS HERE
                        </div>
                        <h1>
                          Every useful answer
                          <br />
                          starts with a source.
                        </h1>
                        <p>
                          Collect real experiences. Keep the context.
                          <br className="desktop-break" /> Make every detail
                          traceable.
                        </p>
                      </div>
                      <div className="heading-illustration" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="paper-back" />
                        <div className="paper-front">
                          <Globe2 size={28} />
                          <div />
                          <div />
                          <div />
                          <span>
                            <Check size={13} /> SOURCE FIRST
                          </span>
                        </div>
                        <span className="spark">
                          <Sparkles size={20} />
                        </span>
                      </div>
                    </div>
                    <div className="stats-grid">
                      <Stat
                        label="Sources in your library"
                        value={sources.length}
                        icon={<BookOpen size={18} />}
                      />
                      <Stat
                        label="Text captured"
                        value={captured}
                        icon={<FileText size={18} />}
                      />
                      <Stat
                        label="Reviewed observations"
                        value={sources.reduce(
                          (sum, row) => sum + (row.reviewedCount ?? 0),
                          0
                        )}
                        icon={<ShieldCheck size={18} />}
                      />
                    </div>
                    <section
                      className="library-section"
                      aria-labelledby="library-title"
                    >
                      <div className="section-heading">
                        <div>
                          <h2 id="library-title">
                            Source library <span>{sources.length}</span>
                          </h2>
                          <p>A small collection. A clear trail of evidence.</p>
                        </div>
                        <Button
                          onClick={() => {
                            setAdding(!adding);
                            setError("");
                          }}
                        >
                          <Plus size={16} /> Add a source
                        </Button>
                      </div>
                      <AnimatePresence>
                        {adding && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="add-container"
                          >
                            <form onSubmit={addSource} className="add-form">
                              <div className="section-heading">
                                <h3>Keep another useful thread</h3>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Close source form"
                                  onClick={() => setAdding(false)}
                                  type="button"
                                >
                                  <X size={16} />
                                </Button>
                              </div>
                              <label>
                                Reddit thread URL
                                <Input
                                  name="url"
                                  type="url"
                                  required
                                  placeholder="https://www.reddit.com/r/SchengenVisa/comments/…"
                                />
                              </label>
                              <div className="form-columns">
                                <label>
                                  Display title
                                  <Input
                                    name="title"
                                    maxLength={160}
                                    placeholder="Give this source a useful name"
                                  />
                                </label>
                                <label>
                                  Why keep it?
                                  <Input
                                    name="reason"
                                    maxLength={500}
                                    placeholder="The question this thread could help answer"
                                  />
                                </label>
                              </div>
                              {error && (
                                <p role="alert" className="error-text">
                                  {error}
                                </p>
                              )}
                              <Button type="submit" loading={savingSource}>
                                Save source <ArrowUpRight size={15} />
                              </Button>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="library-toolbar">
                        <div className="search-field">
                          <Search size={16} />
                          <Input
                            aria-label="Search sources"
                            placeholder="Search your sources…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                          />
                        </div>
                        <span>
                          All sources <ChevronRight size={13} />
                        </span>
                      </div>
                      <div className="source-list">
                        {visibleSources.map((item, index) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04 }}
                          >
                            <Link
                              href={`/sources/${item.id}`}
                              className="source-card"
                            >
                              <div className="source-cover">
                                <span className="cover-grid" />
                                <span className="cover-label">
                                  COMMUNITY EXPERIENCE
                                </span>
                                <div className="mountains" aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                                <span className="cover-footer">
                                  <Globe2 size={15} /> REDDIT · r/SchengenVisa
                                </span>
                                <span className="cover-arrow">
                                  <ArrowUpRight size={20} />
                                </span>
                              </div>
                              <div className="source-card-body">
                                <div className="source-status">
                                  <span
                                    className={
                                      item.capturedAt
                                        ? "status captured"
                                        : "status"
                                    }
                                  >
                                    <span />
                                    {item.capturedAt
                                      ? "Text captured"
                                      : "Pending capture"}
                                  </span>
                                  <span className="source-number">
                                    SOURCE {String(index + 1).padStart(2, "0")}
                                  </span>
                                </div>
                                <h3>{item.title}</h3>
                                <p>
                                  {item.reason ||
                                    "A selected thread awaiting capture and evidence review."}
                                </p>
                                <div className="card-bottom">
                                  <span>
                                    <Link2 size={14} /> Original link preserved
                                  </span>
                                  <span>
                                    Open source <ChevronRight size={15} />
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        ))}
                        {searching && (
                          <p role="status">Searching source text…</p>
                        )}
                        {searchError && (
                          <p role="alert" className="error-text">
                            {searchError}
                          </p>
                        )}
                        {!searching &&
                          !searchError &&
                          visibleSources.length === 0 && (
                            <div className="empty-state">
                              <Search />
                              <h3>No matching sources</h3>
                              <p>Try a different title or thread ID.</p>
                              <Button
                                variant="outline"
                                onClick={() => setQuery("")}
                              >
                                Clear search
                              </Button>
                            </div>
                          )}
                      </div>
                    </section>
                    <section id="workflow" className="workflow">
                      <div className="section-heading">
                        <div>
                          <div className="eyebrow">
                            A SIMPLE, REPEATABLE PROCESS
                          </div>
                          <h2>From a thread to something useful.</h2>
                        </div>
                        <ArrowDown size={20} />
                      </div>
                      <div className="workflow-grid">
                        {[
                          {
                            icon: <Link2 />,
                            title: "Keep the source",
                            body: "Choose a thread that answers a real applicant question.",
                          },
                          {
                            icon: <FileText />,
                            title: "Read in context",
                            body: "Capture text and relevant replies without filling in the gaps.",
                          },
                          {
                            icon: <ShieldCheck />,
                            title: "Review the evidence",
                            body: "Check each observation against the exact source passage.",
                          },
                        ].map((step, index) => (
                          <div key={step.title}>
                            <span className="step-number">0{index + 1}</span>
                            <div className="step-icon">{step.icon}</div>
                            <h3>{step.title}</h3>
                            <p>{step.body}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <footer className="page-footer">
                      <span>
                        <ShieldCheck size={15} /> Community experiences are not
                        official visa requirements.
                      </span>
                      <span>Built one source at a time.</span>
                    </footer>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <span className="stat-value">{String(value).padStart(2, "0")}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Capture({ source }: { source: Source }) {
  const [body, setBody] = useState(source.body);
  const [baseSource, setBaseSource] = useState(source);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = body !== baseSource.body;
  async function save() {
    setSaving(true);
    try {
      const saved = await saveSourceText(
        {
          ...baseSource,
          version:
            source.body === baseSource.body
              ? source.version
              : baseSource.version,
        },
        body
      );
      setBaseSource(saved);
      setError("");
      setNotice(
        "Source text saved in PostgreSQL. Evidence review is the next step."
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save your text."
      );
    } finally {
      setSaving(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            source: { ...source, body },
            coverage: "post_only",
            draft: dirty,
            reviewStatus: "unreviewed",
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reddit-${source.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="capture-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Source library
      </Link>
      <div className="capture-heading">
        <div>
          <div className="eyebrow">SOURCE CAPTURE</div>
          <h1>{source.title}</h1>
          <p>
            {source.reason ||
              "Capture this selected thread before extracting observations."}
          </p>
        </div>
        <Button
          variant="outline"
          render={
            <a href={source.url} target="_blank" rel="noopener noreferrer" />
          }
        >
          Open Reddit <ArrowUpRight size={16} />
        </Button>
      </div>
      <div className="capture-layout">
        <section className="capture-editor">
          <div className="editor-top">
            <h2>Original post text</h2>
            <span className="status">
              <span />
              {source.capturedAt ? "Unreviewed" : "Awaiting capture"}
            </span>
          </div>
          <p>
            Paste the original post exactly as written. Keep paragraphs and
            lists intact.
          </p>
          <label className="sr-only" htmlFor="source-body">
            Original post text
          </label>
          <Textarea
            id="source-body"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setNotice("");
            }}
            placeholder="The source text has not been captured yet. Open the thread and paste its post here."
            className="source-textarea"
          />
          <div className="editor-actions">
            <span>
              {body.length.toLocaleString()} characters
              {dirty ? " · Unsaved changes" : ""}
            </span>
            <div>
              <Button variant="outline" onClick={download}>
                Export JSON
              </Button>
              <Button onClick={save} disabled={!dirty} loading={saving}>
                Save text <Check size={15} />
              </Button>
            </div>
          </div>
          {notice && (
            <p role="status" className="success-text">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </section>
        <aside className="capture-context">
          <div className="context-card">
            <span className="little-icon">
              <Link2 size={18} />
            </span>
            <h3>Keep the evidence attached.</h3>
            <p>This text stays connected to the original Reddit thread.</p>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              r/SchengenVisa · {source.id} <ArrowUpRight size={14} />
            </a>
            <dl>
              <div>
                <dt>Coverage</dt>
                <dd>Partial capture</dd>
              </div>
              <div>
                <dt>Comments</dt>
                <dd>See capture below</dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>See review queue</dd>
              </div>
              <div>
                <dt>Last saved</dt>
                <dd>
                  {source.capturedAt
                    ? new Date(source.capturedAt).toLocaleDateString("en-IN")
                    : "Not yet"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="context-note">
            <ShieldCheck size={18} />
            <p>
              Missing facts stay unknown. Capturing text does not verify an
              applicant’s claims.
            </p>
          </div>
        </aside>
      </div>
      <RevisionHistory sourceId={source.id} />
      <EvidenceReview sourceId={source.id} version={source.version ?? 0} />
    </div>
  );
}
