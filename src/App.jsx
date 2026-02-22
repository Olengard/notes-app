import { useState, useEffect, useRef, useCallback } from "react";
// ─── Supabase ──────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = "https://pchldmiavycxzpkzochn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjaGxkbWlhdnljeHpwa3pvY2huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2Mjk5MDAsImV4cCI6MjA4NzIwNTkwMH0.bVhCJfeCMnPcR5Ub4hLqNSmVdST5P6cT6T_2kzdKGYM";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Supabase sync helpers ─────────────────────────────────────────────────────

// Convert app note → DB rows (notes + todos + quotes)
function noteToRows(note, userId) {
  const row = {
    id: note.id, user_id: userId,
    type: note.type, title: note.title || "",
    content: note.content || null,
    folder: note.folder || "Generale",
    tags: note.tags || [],
    due_date: note.dueDate || null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
  const todos = (note.todos || []).map((t, i) => ({
    id: t.id, note_id: note.id, user_id: userId,
    text: t.text, done: t.done, due: t.due || null, position: i,
  }));
  const quotes = (note.quotes || []).map((q, i) => ({
    id: q.id, note_id: note.id, user_id: userId,
    text: q.text, author: q.author || null, book_title: q.bookTitle || null,
    chapter: q.chapter || null, page: q.page || null,
    comment: q.comment || null, tags: q.tags || [], position: i,
  }));
  return { row, todos, quotes };
}

// Convert DB rows → app note
function rowsToNote(row, todos, quotes) {
  return {
    id: row.id, type: row.type, title: row.title,
    content: row.content || "",
    folder: row.folder, tags: row.tags || [],
    dueDate: row.due_date || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    todos: todos.map((t) => ({ id: t.id, text: t.text, done: t.done, due: t.due || null })),
    quotes: quotes.map((q) => ({
      id: q.id, text: q.text, author: q.author || "", bookTitle: q.book_title || "",
      chapter: q.chapter || "", page: q.page || "", comment: q.comment || "", tags: q.tags || [],
    })),
  };
}

async function syncNoteToSupabase(note, userId) {
  try {
    const { row, todos, quotes } = noteToRows(note, userId);
    await supabase.from("notes").upsert(row, { onConflict: "id" });
    if (todos.length > 0) {
      await supabase.from("todos").delete().eq("note_id", note.id);
      await supabase.from("todos").insert(todos);
    }
    if (quotes.length > 0) {
      await supabase.from("quotes").delete().eq("note_id", note.id);
      await supabase.from("quotes").insert(quotes);
    }
  } catch (e) { console.warn("Sync error:", e); }
}

async function deleteNoteFromSupabase(noteId) {
  try { await supabase.from("notes").delete().eq("id", noteId); }
  catch (e) { console.warn("Delete sync error:", e); }
}

async function syncFolderToSupabase(folder, userId, position) {
  try {
    await supabase.from("folders").upsert(
      { id: folder.id, user_id: userId, name: folder.name, color: folder.color, position },
      { onConflict: "id" }
    );
  } catch (e) { console.warn("Folder sync error:", e); }
}

async function pullFromSupabase(userId) {
  try {
    const [{ data: noteRows }, { data: todoRows }, { data: quoteRows }, { data: folderRows }] = await Promise.all([
      supabase.from("notes").select("*").eq("user_id", userId).is("deleted_at", null),
      supabase.from("todos").select("*").eq("user_id", userId),
      supabase.from("quotes").select("*").eq("user_id", userId),
      supabase.from("folders").select("*").eq("user_id", userId).order("position"),
    ]);
    const notes = (noteRows || []).map((row) => {
      const todos = (todoRows || []).filter((t) => t.note_id === row.id).sort((a, b) => a.position - b.position);
      const quotes = (quoteRows || []).filter((q) => q.note_id === row.id).sort((a, b) => a.position - b.position);
      return rowsToNote(row, todos, quotes);
    });
    const folders = (folderRows || []).map((f) => ({ id: f.id, name: f.name, color: f.color }));
    return { notes, folders };
  } catch (e) { console.warn("Pull error:", e); return null; }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SAMPLE_NOTES = [
  {
    id: "1",
    title: "Benvenuto in NoteS",
    type: "text",
    folder: "Generale",
    tags: ["intro", "guida"],
    content: "<p>Benvenuto in <strong>NoteS</strong> — il tuo spazio per pensare.</p><p>Puoi scrivere note testuali con <em>formattazione</em>, oppure creare <u>to-do list</u> interattive, note di lettura, e molto altro.</p><ul><li>Usa la barra in alto per formattare il testo</li><li>Crea cartelle per organizzare le note</li><li>Aggiungi tag per trovare tutto facilmente</li></ul>",
    createdAt: new Date("2024-01-15").toISOString(),
    updatedAt: new Date("2024-01-15").toISOString(),
  },
  {
    id: "2",
    title: "Lista della spesa",
    type: "todo",
    folder: "Personale",
    tags: ["spesa", "casa"],
    todos: [
      { id: "t1", text: "Pane integrale", done: false },
      { id: "t2", text: "Latte di avena", done: false },
      { id: "t3", text: "Pomodori", done: true },
      { id: "t4", text: "Mozzarella", done: false },
      { id: "t5", text: "Vino rosso", done: true },
    ],
    createdAt: new Date("2024-01-16").toISOString(),
    updatedAt: new Date("2024-01-16").toISOString(),
  },
  {
    id: "3",
    title: "Immagine, merce e spettacolo",
    type: "reading",
    folder: "Letture",
    tags: ["filosofia", "critica", "modernità"],
    quotes: [
      {
        id: "q1",
        author: "Guy Debord",
        bookTitle: "La società dello spettacolo",
        chapter: "I — La separazione portata a perfezione",
        page: "1",
        text: "Tutta la vita delle società nelle quali predominano le condizioni moderne di produzione si presenta come un'immensa accumulazione di spettacoli.",
        comment: "Parafrasa l'incipit del Capitale di Marx. La merce diventa immagine.",
        tags: ["spettacolo", "merce", "apertura"],
      },
      {
        id: "q2",
        author: "Guy Debord",
        bookTitle: "La società dello spettacolo",
        chapter: "I — La separazione portata a perfezione",
        page: "4",
        text: "Lo spettacolo non è un insieme di immagini, ma un rapporto sociale tra persone, mediato dalle immagini.",
        comment: "Definizione centrale. Lo spettacolo come forma di relazione, non di rappresentazione.",
        tags: ["definizione", "relazione-sociale"],
      },
      {
        id: "q3",
        author: "Walter Benjamin",
        bookTitle: "L'opera d'arte nell'epoca della sua riproducibilità tecnica",
        chapter: "II",
        page: "22",
        text: "Ciò che vien meno nell'epoca della riproducibilità tecnica dell'opera d'arte è la sua aura.",
        comment: "Complementare a Debord: Benjamin vede la perdita dell'aura, Debord la sua sostituzione con lo spettacolo.",
        tags: ["aura", "riproduzione", "tecnica"],
      },
    ],
    createdAt: new Date("2024-01-17").toISOString(),
    updatedAt: new Date("2024-01-17").toISOString(),
  },
];

const FOLDER_COLORS = ["#c4a882", "#8ba888", "#8899bb", "#b87e7e", "#9b8ab8", "#b8a84a", "#7eaab8"];

const FOLDERS = [
  { id: "f1", name: "Generale",          color: "#c4a882" },
  { id: "f2", name: "Personale",          color: "#8ba888" },
  { id: "f3", name: "Lavoro",             color: "#8899bb" },
  { id: "f4", name: "Letture",            color: "#b87e7e" },
  { id: "f5", name: "Letture/Filosofia",  color: "#b87e7e" },
  { id: "f6", name: "Letture/Narrativa",  color: "#b87e7e" },
];

const TEMPLATES = [
  {
    id: "meeting",
    label: "📋 Meeting notes",
    type: "meeting",
    titlePrefix: "Meeting — ",
  },
  {
    id: "journal",
    label: "📓 Diario",
    type: "journal",
    titlePrefix: "Diario",
  },
  {
    id: "brainstorm",
    label: "💡 Brainstorming",
    type: "text",
    titlePrefix: "Brainstorm — ",
    content: `<p><strong>Obiettivo:</strong> </p><p><strong>Vincoli:</strong> </p><hr/><p><strong>Idee libere</strong></p><ul><li></li><li></li><li></li></ul><p><strong>Da approfondire</strong></p><ul><li></li></ul>`,
  },
];

function makeMeetingNote(folder) {
  const dateStr = new Date().toLocaleDateString("it-IT");
  return {
    id: generateId(), type: "meeting",
    title: `Meeting — ${dateStr}`,
    folder, tags: ["meeting"],
    content: `<p><strong>Partecipanti:</strong> </p><p><strong>Agenda</strong></p><ul><li></li></ul><p><strong>Note</strong></p><p></p><p><strong>Decisioni</strong></p><ul><li></li></ul>`,
    actions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function makeJournalNote(folder) {
  const entryDate = new Date().toISOString().slice(0, 10);
  return {
    id: generateId(), type: "journal",
    title: "Diario",
    folder, tags: ["journal"],
    entries: [{ id: generateId(), date: entryDate, content: "" }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function execCmd(cmd) {
  document.execCommand(cmd, false, null);
}

function applyMarkdownFormatting(e, editorRef) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;

  const text = node.textContent;
  const offset = range.startOffset;
  const fullText = text.slice(0, offset) + e.key;

  const patterns = [
    { open: "**", close: "**", cmd: "bold" },
    { open: "__", close: "__", cmd: "underline" },
    { open: "_",  close: "_",  cmd: "italic" },
  ];

  for (const { open, close, cmd } of patterns) {
    if (!fullText.endsWith(close)) continue;
    const searchIn = fullText.slice(0, fullText.length - close.length);
    const openIdx = searchIn.lastIndexOf(open);
    if (openIdx === -1) continue;
    const inner = searchIn.slice(openIdx + open.length);
    if (!inner) continue;

    e.preventDefault();
    const replaceRange = document.createRange();
    replaceRange.setStart(node, openIdx);
    replaceRange.setEnd(node, offset);
    replaceRange.deleteContents();
    const textNode = document.createTextNode(inner);
    replaceRange.insertNode(textNode);
    const fmtRange = document.createRange();
    fmtRange.selectNodeContents(textNode);
    sel.removeAllRanges();
    sel.addRange(fmtRange);
    execCmd(cmd);
    sel.collapseToEnd();
    return true;
  }
  return false;
}

function handleEditorKeyDown(e, editorRef) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) {
    if (e.key === "b" || e.key === "B") { e.preventDefault(); execCmd("bold"); return; }
    if (e.key === "i" || e.key === "I") { e.preventDefault(); execCmd("italic"); return; }
    if (e.key === "u" || e.key === "U") { e.preventDefault(); execCmd("underline"); return; }
  }
  if (["*", "_"].includes(e.key)) applyMarkdownFormatting(e, editorRef);
}


// ─── Audio Recorder ───────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = ""; // ← inserisci qui la tua API key Anthropic

async function transcribeAndParse(audioBlob, noteType) {
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);

  // Detect mime type
  const mediaType = audioBlob.type || "audio/webm";

  // Build prompt based on note type
  const prompts = {
    reading: `Sei un assistente per note di lettura. L'utente ha dettato una nota vocale.
Trascrivi e struttura il contenuto nel seguente JSON:
{
  "quotes": [
    { "text": "...", "author": "...", "bookTitle": "...", "chapter": "...", "page": "...", "comment": "..." }
  ],
  "tags": ["..."],
  "title": "..."
}
L'utente potrebbe dire "titolo", "autore", "libro", "capitolo", "pagina", "commento", "tag" per indicare i campi.
Estrai solo i campi menzionati. Rispondi SOLO con JSON valido, nessun testo extra.`,

    todo: `Sei un assistente per liste di cose da fare. L'utente ha dettato una lista vocale.
Trascrivi e struttura nel seguente JSON:
{
  "title": "...",
  "todos": [
    { "text": "...", "done": false, "due": null }
  ],
  "tags": ["..."]
}
Se l'utente menziona date o scadenze, inseriscile in "due" nel formato YYYY-MM-DD.
Rispondi SOLO con JSON valido, nessun testo extra.`,

    meeting: `Sei un assistente per verbali di riunione. L'utente ha dettato note vocali.
Trascrivi e struttura nel seguente JSON:
{
  "title": "...",
  "content": "...",
  "actions": [
    { "text": "...", "done": false, "due": null }
  ],
  "tags": ["..."]
}
Il campo "content" è HTML semplice con i paragrafi delle note. Le azioni sono compiti assegnati.
Se l'utente menziona date o scadenze per le azioni, inseriscile in "due" nel formato YYYY-MM-DD.
Rispondi SOLO con JSON valido, nessun testo extra.`,

    journal: `Sei un assistente per diari personali. L'utente ha dettato un'entry di diario.
Trascrivi il testo della registrazione come entry di diario, preservando il tono personale.
Rispondi con JSON:
{
  "content": "testo trascritto e formattato"
}
Rispondi SOLO con JSON valido, nessun testo extra.`,

    text: `Sei un assistente per prendere note. L'utente ha dettato una nota vocale.
Trascrivi e formatta in JSON:
{
  "title": "titolo sintetico estratto dal contenuto",
  "content": "testo in HTML semplice con paragrafi <p>...</p>",
  "tags": ["..."]
}
Rispondi SOLO con JSON valido, nessun testo extra.`,

    quick: `Trascrivi fedelmente questo messaggio vocale in testo semplice.
Rispondi con JSON: { "content": "testo trascritto" }
Rispondi SOLO con JSON valido, nessun testo extra.`,
  };

  const systemPrompt = prompts[noteType] || prompts.text;

  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [{
          type: "document",
          source: { type: "base64", media_type: mediaType, data: base64 },
        }, {
          type: "text",
          text: "Trascrivi e struttura questa nota vocale."
        }]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Errore API: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map((c) => c.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function AudioRecorder({ noteType, onResult, apiKey }) {
  const [state, setState] = useState("idle"); // idle | recording | processing | done | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const key = apiKey || ANTHROPIC_API_KEY;

  const startRecording = async () => {
    if (!key) { setErrorMsg("API key mancante — vedi istruzioni"); setState("error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setState("processing");
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType });
          const result = await transcribeAndParse(blob, noteType);
          onResult(result);
          setState("done");
          setTimeout(() => setState("idle"), 2000);
        } catch (e) {
          setErrorMsg(e.message);
          setState("error");
        }
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setErrorMsg("Microfono non disponibile");
      setState("error");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  useEffect(() => () => { clearInterval(timerRef.current); mediaRecorderRef.current?.stop(); }, []);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (state === "idle") return (
    <button onClick={startRecording} title="Registra nota vocale"
      style={{ background: "none", border: "1px solid #e0d8cc", borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c4a882"; e.currentTarget.style.background = "#faf7f2"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0d8cc"; e.currentTarget.style.background = "none"; }}>
      🎙 registra
    </button>
  );

  if (state === "recording") return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e05050", animation: "pulse 1s infinite" }} />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#e05050" }}>{fmtTime(seconds)}</span>
      <button onClick={stopRecording}
        style={{ background: "#e05050", border: "none", borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "white" }}>
        ■ ferma
      </button>
    </div>
  );

  if (state === "processing") return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c4a882" }}>⏳ trascrizione…</span>
  );

  if (state === "done") return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#5a9060" }}>✓ trascritto</span>
  );

  if (state === "error") return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c04040" }}>⚠ {errorMsg}</span>
      <button onClick={() => { setState("idle"); setErrorMsg(null); }}
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898", textDecoration: "underline" }}>riprova</button>
    </div>
  );

  return null;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editorRef, onInsertLink }) {
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? "⌘" : "Ctrl";

  const btn = (label, cmd, shortcut) => (
    <button
      key={cmd}
      onMouseDown={(e) => { e.preventDefault(); execCmd(cmd); editorRef.current?.focus(); }}
      title={shortcut ? `${label} (${mod}+${shortcut})` : label}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "5px 8px", fontSize: "13px", color: "#555", borderRadius: "4px",
        fontWeight: cmd === "bold" ? "700" : "400",
        fontStyle: cmd === "italic" ? "italic" : "normal",
        textDecoration: cmd === "underline" ? "underline" : "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.target.style.background = "#f0ede8")}
      onMouseLeave={(e) => (e.target.style.background = "none")}
    >{label}</button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "6px 12px", borderBottom: "1px solid #e8e3db", background: "#faf8f5" }}>
      {btn("B", "bold", "B")}
      {btn("I", "italic", "I")}
      {btn("U", "underline", "U")}
      <div style={{ width: "1px", height: "18px", background: "#ddd", margin: "0 4px" }} />
      {btn("• Lista", "insertUnorderedList")}
      <div style={{ width: "1px", height: "18px", background: "#ddd", margin: "0 4px" }} />
      <button
        onMouseDown={(e) => { e.preventDefault(); onInsertLink?.(); }}
        title="Linka una nota (@)"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", fontSize: "13px", color: "#8b7355", borderRadius: "4px", transition: "background 0.15s" }}
        onMouseEnter={(e) => (e.target.style.background = "#f0ede8")}
        onMouseLeave={(e) => (e.target.style.background = "none")}
      >🔗</button>
      <div style={{ marginLeft: "auto", fontSize: "10px", color: "#c0b8ae", fontFamily: "'DM Mono', monospace", paddingRight: "4px" }}>
        {mod}+B/I/U · @ per linkare
      </div>
    </div>
  );
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, small }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
      {tags.map((t) => (
        <span key={t} style={{
          background: small ? "#e8e3da" : "#f0ede8", color: "#6b5e4e",
          padding: small ? "1px 7px" : "2px 10px",
          borderRadius: "20px", fontSize: small ? "11px" : "12px",
          fontFamily: "'DM Mono', monospace",
          display: "flex", alignItems: "center", gap: "4px",
        }}>
          #{t}
          <span onClick={() => onChange(tags.filter((x) => x !== t))} style={{ cursor: "pointer", color: "#aaa" }}>×</span>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="+ tag"
        style={{
          border: "none", outline: "none", background: "transparent",
          fontFamily: "'DM Mono', monospace", fontSize: small ? "11px" : "12px",
          color: "#8b7355", width: "55px",
        }}
      />
    </div>
  );
}

// ─── Todo Item ────────────────────────────────────────────────────────────────

function TodoItem({ item, onToggle, onEdit, onDelete, onSetDue }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.text);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const inputRef = useRef();
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const today = new Date().toDateString();
  const isOverdue = item.due && !item.done && new Date(item.due).toDateString() !== today && new Date(item.due) < new Date();
  const isDueToday = item.due && !item.done && new Date(item.due).toDateString() === today;
  const dueLabel = item.due ? new Date(item.due).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : null;

  return (
    <div style={{ borderBottom: "1px solid #f0ede8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 4px", opacity: item.done ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <div onClick={() => onToggle(item.id)} style={{
          width: "18px", height: "18px", flexShrink: 0, cursor: "pointer",
          border: `2px solid ${item.done ? "#8b7355" : "#c5bfb5"}`,
          borderRadius: "4px", background: item.done ? "#8b7355" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
        }}>
          {item.done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
        {editing ? (
          <input ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)}
            onBlur={() => { onEdit(item.id, val); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { onEdit(item.id, val); setEditing(false); } }}
            style={{ flex: 1, border: "none", borderBottom: "1px solid #8b7355", outline: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "14px", color: "#333", padding: "1px 0" }}
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)} style={{ flex: 1, fontFamily: "'Lora', Georgia, serif", fontSize: "14px", color: "#333", textDecoration: item.done ? "line-through" : "none", cursor: "text" }}>
            {item.text}
          </span>
        )}
        {/* Due date badge */}
        {dueLabel && !showDatePicker && (
          <span onClick={() => setShowDatePicker(true)} style={{
            fontFamily: "'DM Mono', monospace", fontSize: "10px", padding: "1px 6px", borderRadius: "10px", cursor: "pointer", flexShrink: 0,
            background: isOverdue ? "#fde8e8" : isDueToday ? "#fdf3e0" : "#f0ede8",
            color: isOverdue ? "#c04040" : isDueToday ? "#b07030" : "#8b7355",
            border: `1px solid ${isOverdue ? "#f0c0c0" : isDueToday ? "#e8d090" : "#e0d8cc"}`,
          }}>
            {isOverdue ? "⚠ " : isDueToday ? "⏰ " : "📅 "}{dueLabel}
          </span>
        )}
        {/* Date picker toggle */}
        {!item.due && !showDatePicker && (
          <button onClick={() => setShowDatePicker(true)} title="Aggiungi scadenza"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#d0c8be", fontSize: "13px", padding: "0 2px", flexShrink: 0 }}>
            📅
          </button>
        )}
        <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: "16px", padding: "0 4px" }}>×</button>
      </div>
      {/* Inline date picker */}
      {showDatePicker && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 4px 8px 32px" }}>
          <input type="date" defaultValue={item.due || ""}
            onChange={(e) => { onSetDue(item.id, e.target.value || null); setShowDatePicker(false); }}
            style={{ border: "1px solid #e0d8cc", borderRadius: "5px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#6b5e4e", outline: "none", background: "#faf8f5" }}
          />
          {item.due && (
            <button onClick={() => { onSetDue(item.id, null); setShowDatePicker(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c4a08a" }}>
              rimuovi
            </button>
          )}
          <button onClick={() => setShowDatePicker(false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Quote Card ───────────────────────────────────────────────────────────────

function QuoteCard({ quote, onUpdate, onDelete, dragHandleProps, isDragging }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quote);

  const save = () => { onUpdate(draft); setEditing(false); };

  if (editing) {
    return (
      <div style={{ border: "1px solid #c4a882", borderRadius: "8px", padding: "16px", marginBottom: "16px", background: "#fefcf8" }}>
        {/* Source fields */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <input value={draft.author || ""} onChange={(e) => setDraft({ ...draft, author: e.target.value })}
            placeholder="Autore"
            style={{ flex: 1, minWidth: "100px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'Lora', serif", fontSize: "13px", outline: "none", background: "#faf8f5", fontStyle: "italic" }}
          />
          <input value={draft.bookTitle || ""} onChange={(e) => setDraft({ ...draft, bookTitle: e.target.value })}
            placeholder="Titolo del libro"
            style={{ flex: 2, minWidth: "140px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'Lora', serif", fontSize: "13px", outline: "none", background: "#faf8f5", fontStyle: "italic" }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <input value={draft.chapter || ""} onChange={(e) => setDraft({ ...draft, chapter: e.target.value })}
            placeholder="Capitolo / sezione"
            style={{ flex: 2, minWidth: "120px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'DM Mono', monospace", fontSize: "11px", outline: "none", background: "#faf8f5", color: "#6b5e4e" }}
          />
          <input value={draft.page || ""} onChange={(e) => setDraft({ ...draft, page: e.target.value })}
            placeholder="Pagina"
            style={{ width: "70px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'DM Mono', monospace", fontSize: "11px", outline: "none", background: "#faf8f5" }}
          />
        </div>
        {/* Quote text */}
        <textarea autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder="Testo della citazione..." rows={3}
          style={{ width: "100%", border: "none", borderBottom: "1px solid #e0d8cc", outline: "none", resize: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "14px", lineHeight: "1.65", color: "#333", marginBottom: "10px", fontStyle: "italic" }}
        />
        {/* Comment */}
        <textarea value={draft.comment || ""} onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
          placeholder="Commento / riflessione... usa [[ per linkare una nota" rows={2}
          style={{ width: "100%", border: "none", borderBottom: "1px solid #e0d8cc", outline: "none", resize: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "13px", lineHeight: "1.5", color: "#666", marginBottom: "10px" }}
        />
        <div style={{ marginBottom: "10px" }}>
          <TagInput tags={draft.tags || []} onChange={(tags) => setDraft({ ...draft, tags })} small />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={save} style={{ background: "#8b7355", color: "white", border: "none", borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>Salva</button>
          <button onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid #ddd", borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#999" }}>Annulla</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      borderLeft: "3px solid #c4a882", paddingLeft: "14px", marginBottom: "18px",
      opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s",
      display: "flex", gap: "8px",
    }}>
      {/* Drag handle */}
      <div {...dragHandleProps} style={{ cursor: "grab", color: "#d0c8be", fontSize: "13px", paddingTop: "2px", flexShrink: 0, userSelect: "none" }} title="Trascina per riordinare">⠿</div>

      <div style={{ flex: 1 }}>
        {/* Quote text */}
        <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "14px", lineHeight: "1.7", color: "#333", fontStyle: "italic", margin: "0 0 7px" }}>
          "{quote.text}"
        </p>
        {/* Attribution line */}
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#8b7355", marginBottom: "6px" }}>
          {quote.author && <span style={{ fontWeight: "500" }}>{quote.author}</span>}
          {quote.bookTitle && <span style={{ color: "#a09080" }}> · <em style={{ fontFamily: "'Lora', serif" }}>{quote.bookTitle}</em></span>}
          {quote.chapter && <span style={{ color: "#b0a898" }}> · {quote.chapter}</span>}
          {quote.page && <span style={{ color: "#c0b8ae" }}> · p. {quote.page}</span>}
        </div>
        {/* Tags + actions */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {(quote.tags || []).map((t) => (
            <span key={t} style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#8b7355", background: "#f0ece4", padding: "1px 7px", borderRadius: "10px" }}>#{t}</span>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0b8ae", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>modifica</button>
            <button onClick={() => onDelete(quote.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: "14px" }}>×</button>
          </div>
        </div>
        {/* Comment */}
        {quote.comment && (
          <div onClick={() => setExpanded((v) => !v)}
            style={{ fontFamily: "'Lora', serif", fontSize: "12px", color: "#888", background: "#faf7f2", padding: "6px 10px", borderRadius: "5px", cursor: "pointer", marginTop: "6px", overflow: "hidden", maxHeight: expanded ? "200px" : "34px", transition: "max-height 0.25s ease" }}
          >
            💬 {quote.comment}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reading Editor ───────────────────────────────────────────────────────────

function ReadingEditor({ note, folders, onUpdate, allNotes = [], onPreview, audioApiKey }) {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [folder, setFolder] = useState(note.folder);
  const [quotes, setQuotes] = useState(note.quotes || []);
  const [addingQuote, setAddingQuote] = useState(false);
  const [newQuote, setNewQuote] = useState({ text: "", author: "", bookTitle: "", chapter: "", page: "", comment: "", tags: [] });
  const [groupByBook, setGroupByBook] = useState(true);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  const save = useCallback(() => {
    const n = noteRef.current;
    onUpdate({ ...n, title, tags, folder, quotes, updatedAt: new Date().toISOString() });
  }, [title, tags, folder, quotes, onUpdate]);

  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    const t = setTimeout(() => saveRef.current(), 800);
    return () => clearTimeout(t);
  }, [title, tags, folder, quotes]);

  const addQuote = () => {
    if (!newQuote.text.trim()) return;
    setQuotes((prev) => [...prev, { ...newQuote, id: generateId() }]);
    setNewQuote({ text: "", author: "", bookTitle: "", chapter: "", page: "", comment: "", tags: [] });
    setAddingQuote(false);
  };

  // ── Drag & drop ──
  const onDragStart = (i) => setDragIdx(i);
  const onDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const onDrop = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    const reordered = [...quotes];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(i, 0, moved);
    setQuotes(reordered);
    setDragIdx(null); setDragOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── Grouping ──
  const groupedQuotes = () => {
    const groups = {};
    quotes.forEach((q, idx) => {
      const key = [q.author, q.bookTitle].filter(Boolean).join(" · ") || "Senza fonte";
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...q, _idx: idx });
    });
    return groups;
  };

  const renderQuote = (q, flatIdx) => (
    <div key={q.id}
      draggable
      onDragStart={() => onDragStart(flatIdx)}
      onDragOver={(e) => onDragOver(e, flatIdx)}
      onDrop={() => onDrop(flatIdx)}
      onDragEnd={onDragEnd}
      style={{
        outline: dragOverIdx === flatIdx && dragIdx !== flatIdx ? "2px dashed #c4a882" : "none",
        borderRadius: "4px", transition: "outline 0.1s",
      }}
    >
      <QuoteCard
        quote={q}
        isDragging={dragIdx === flatIdx}
        dragHandleProps={{
          onMouseDown: (e) => e.currentTarget.closest("[draggable]").setAttribute("draggable", true),
        }}
        onUpdate={(updated) => setQuotes((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
        onDelete={(id) => setQuotes((prev) => prev.filter((x) => x.id !== id))}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #e8e3db", background: "#fefcfa" }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tema / titolo della nota..."
          style={{ width: "100%", border: "none", outline: "none", fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", fontWeight: "700", color: "#2c2416", background: "transparent", marginBottom: "12px" }}
        />
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ border: "1px solid #e0d9d0", borderRadius: "6px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#6b5e4e", background: "#faf8f5", outline: "none" }}>
            {folders.map((f) => <option key={f}>{f}</option>)}
          </select>
          <TagInput tags={tags} onChange={setTags} />
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#b0a898", fontFamily: "'DM Mono', monospace" }}>{formatDate(note.updatedAt)}</span>
        </div>
      </div>

      {/* Quotes area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#a09080", textTransform: "uppercase", letterSpacing: "1px" }}>
              {quotes.length} citazion{quotes.length === 1 ? "e" : "i"}
            </div>
            {/* Group toggle */}
            <button
              onClick={() => setGroupByBook((v) => !v)}
              title={groupByBook ? "Vista libera" : "Raggruppa per libro"}
              style={{
                background: groupByBook ? "#f0ece4" : "none",
                border: "1px solid #e0d8cc", borderRadius: "5px",
                padding: "2px 9px", cursor: "pointer",
                fontFamily: "'DM Mono', monospace", fontSize: "10px",
                color: groupByBook ? "#6b5e4e" : "#b0a898",
                transition: "all 0.15s",
              }}
            >
              {groupByBook ? "📚 per libro" : "📋 libera"}
            </button>
          </div>
          <button
            onClick={() => { setAddingQuote(true); setNewQuote({ text: "", author: "", bookTitle: "", chapter: "", page: "", comment: "", tags: [] }); }}
            style={{ background: "#c4a882", border: "none", borderRadius: "6px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#2c2416" }}
          >
            + aggiungi citazione
          </button>
        </div>

        {/* New quote form */}
        {addingQuote && (
          <div style={{ border: "1px solid #c4a882", borderRadius: "8px", padding: "16px", marginBottom: "20px", background: "#fefcf8" }}>
            <div style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#a09080", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Fonte</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <input value={newQuote.author} onChange={(e) => setNewQuote({ ...newQuote, author: e.target.value })}
                placeholder="Autore"
                style={{ flex: 1, minWidth: "100px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'Lora', serif", fontSize: "13px", outline: "none", background: "#fff", fontStyle: "italic" }}
              />
              <input value={newQuote.bookTitle} onChange={(e) => setNewQuote({ ...newQuote, bookTitle: e.target.value })}
                placeholder="Titolo del libro"
                style={{ flex: 2, minWidth: "140px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'Lora', serif", fontSize: "13px", outline: "none", background: "#fff", fontStyle: "italic" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
              <input value={newQuote.chapter} onChange={(e) => setNewQuote({ ...newQuote, chapter: e.target.value })}
                placeholder="Capitolo / sezione"
                style={{ flex: 2, minWidth: "120px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'DM Mono', monospace", fontSize: "11px", outline: "none", background: "#fff", color: "#6b5e4e" }}
              />
              <input value={newQuote.page} onChange={(e) => setNewQuote({ ...newQuote, page: e.target.value })}
                placeholder="Pagina"
                style={{ width: "70px", padding: "5px 9px", border: "1px solid #e0d8cc", borderRadius: "5px", fontFamily: "'DM Mono', monospace", fontSize: "11px", outline: "none", background: "#fff" }}
              />
            </div>
            <div style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#a09080", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Citazione</div>
            <textarea autoFocus value={newQuote.text} onChange={(e) => setNewQuote({ ...newQuote, text: e.target.value })}
              placeholder="Testo della citazione..." rows={3}
              style={{ width: "100%", border: "none", borderBottom: "1px solid #e0d8cc", outline: "none", resize: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "14px", lineHeight: "1.65", color: "#333", marginBottom: "10px", fontStyle: "italic" }}
            />
            <textarea value={newQuote.comment} onChange={(e) => setNewQuote({ ...newQuote, comment: e.target.value })}
              placeholder="Commento / riflessione personale..." rows={2}
              style={{ width: "100%", border: "none", borderBottom: "1px solid #e0d8cc", outline: "none", resize: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "13px", lineHeight: "1.5", color: "#666", marginBottom: "10px" }}
            />
            <div style={{ marginBottom: "10px" }}>
              <TagInput tags={newQuote.tags} onChange={(t) => setNewQuote({ ...newQuote, tags: t })} small />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={addQuote} style={{ background: "#8b7355", color: "white", border: "none", borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>Salva</button>
              <button onClick={() => setAddingQuote(false)} style={{ background: "none", border: "1px solid #ddd", borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#999" }}>Annulla</button>
            </div>
          </div>
        )}

        {/* Quotes list */}
        {quotes.length === 0 && !addingQuote ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#c0b8ae", fontFamily: "'Lora', serif", fontSize: "13px" }}>
            Nessuna citazione ancora.<br /><span style={{ fontSize: "12px" }}>Clicca "+ aggiungi citazione" per iniziare.</span>
          </div>
        ) : groupByBook ? (
          // ── Grouped view ──
          Object.entries(groupedQuotes()).map(([key, group]) => (
            <div key={key} style={{ marginBottom: "28px" }}>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#8b7355",
                borderBottom: "1px solid #f0ede8", paddingBottom: "6px", marginBottom: "14px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span style={{ color: "#c4a882" }}>📖</span>
                {key}
                <span style={{ color: "#c0b8ae", marginLeft: "auto" }}>{group.length} cit.</span>
              </div>
              {group.map((q) => renderQuote(q, q._idx))}
            </div>
          ))
        ) : (
          // ── Free view (drag order) ──
          quotes.map((q, i) => renderQuote(q, i))
        )}
        <BacklinksPanel note={note} allNotes={allNotes} onLinkClick={onPreview} />
      </div>
    </div>
  );
}

// ─── Text / Todo Editor ───────────────────────────────────────────────────────


// ─── Wikilink utilities ───────────────────────────────────────────────────────

// Extract all [[title]] references from a string
function extractWikilinks(text) {
  const matches = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) matches.push(m[1].trim());
  return [...new Set(matches)];
}

// Get plain text content from a note for wikilink scanning
function noteTextContent(note) {
  if (note.type === "text" || note.type === "quick")
    return (note.title || "") + " " + (note.content || "").replace(/<[^>]+>/g, "");
  if (note.type === "reading")
    return (note.title || "") + " " + (note.quotes || []).map((q) => q.comment || "").join(" ");
  if (note.type === "meeting")
    return (note.title || "") + " " + (note.content || "").replace(/<[^>]+>/g, "") + " " + (note.actions || []).map((a) => a.text).join(" ");
  if (note.type === "journal")
    return (note.title || "") + " " + (note.entries || []).map((e) => e.content).join(" ");
  return note.title || "";
}

// Render HTML with [[links]] converted to clickable spans
function renderWikilinks(html, notes, onLinkClick) {
  const parts = html.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!m) return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
    const title = m[1].trim();
    const target = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    return (
      <span key={i}
        onClick={() => target && onLinkClick(target)}
        style={{
          color: target ? "#8b7355" : "#c0b0a0",
          background: target ? "#f5f0e8" : "#faf7f5",
          borderRadius: "3px", padding: "0 4px",
          cursor: target ? "pointer" : "default",
          fontFamily: "'DM Mono', monospace", fontSize: "0.9em",
          border: `1px solid ${target ? "#e0d4c0" : "#e8e0d8"}`,
          textDecoration: "none",
          display: "inline",
        }}
        title={target ? `Apri: ${target.title}` : `Nota non trovata: ${title}`}
      >
        [[{title}]]
      </span>
    );
  });
}

// ─── Wikilink Autocomplete ────────────────────────────────────────────────────

function WikilinkAutocomplete({ query, notes, onSelect, onClose, pos }) {
  const results = notes
    .filter((n) => n.title && n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (results.length === 0) return null;

  // Position: just below the cursor if pos is provided, else fallback
  const style = pos
    ? {
        position: "fixed",
        top: pos.bottom + 4,
        left: Math.min(pos.left, window.innerWidth - 240),
        zIndex: 500,
      }
    : { position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 500 };

  return (
    <div style={{
      ...style,
      background: "#fff", border: "1px solid #e0d8cc",
      borderRadius: "8px", boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
      minWidth: "220px", overflow: "hidden",
    }}>
      {results.map((n) => (
        <div key={n.id} onMouseDown={(e) => { e.preventDefault(); onSelect(n); }}
          style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#faf7f2")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontSize: "12px" }}>
            {{ text: "✏️", todo: "☑", reading: "📖", quick: "⚡", meeting: "📋", journal: "📓" }[n.type] || "✏️"}
          </span>
          <span style={{ fontFamily: "'Lora', serif", fontSize: "13px", color: "#2c2416" }}>{n.title}</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898", marginLeft: "auto" }}>{n.folder}</span>
        </div>
      ))}
      <div style={{ padding: "5px 14px 6px", fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#c0b8ae", borderTop: "1px solid #f0ede8" }}>
        click per inserire · esc per chiudere
      </div>
    </div>
  );
}

// ─── Note Preview Panel ───────────────────────────────────────────────────────

function NotePreviewPanel({ note, allNotes, onClose, onNavigate }) {
  if (!note) return null;
  const typeIcon = { text: "✏️", todo: "☑", reading: "📖", quick: "⚡", meeting: "📋", journal: "📓" }[note.type] || "✏️";

  const previewContent = () => {
    if (note.type === "text" || note.type === "quick") {
      // Render with wikilinks but no click (read-only preview)
      const parts = (note.content || "").split(/(\[\[[^\]]+\]\])/g);
      return (
        <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", lineHeight: "1.75", color: "#333" }}>
          {parts.map((part, i) => {
            const m = part.match(/^\[\[([^\]]+)\]\]$/);
            if (!m) return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
            const title = m[1].trim();
            const target = allNotes.find((n) => n.title.toLowerCase() === title.toLowerCase());
            return (
              <span key={i} onClick={() => target && onNavigate(target)}
                style={{ color: target ? "#8b7355" : "#c0b0a0", background: "#f5f0e8", borderRadius: "3px", padding: "0 3px", cursor: target ? "pointer" : "default", fontFamily: "'DM Mono', monospace", fontSize: "0.85em", border: "1px solid #e0d4c0" }}>
                [[{title}]]
              </span>
            );
          })}
        </div>
      );
    }
    if (note.type === "todo") {
      const pending = (note.todos || []).filter((t) => !t.done);
      const done = (note.todos || []).filter((t) => t.done);
      return (
        <div>
          {pending.map((t) => <div key={t.id} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "4px 0", fontFamily: "'Lora', serif", fontSize: "14px", color: "#333" }}>
            <div style={{ width: "14px", height: "14px", border: "2px solid #c5bfb5", borderRadius: "3px", flexShrink: 0 }} />{t.text}
          </div>)}
          {done.map((t) => <div key={t.id} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "4px 0", fontFamily: "'Lora', serif", fontSize: "13px", color: "#b0a898", textDecoration: "line-through" }}>
            <div style={{ width: "14px", height: "14px", border: "2px solid #8b7355", borderRadius: "3px", background: "#8b7355", flexShrink: 0 }} />{t.text}
          </div>)}
        </div>
      );
    }
    if (note.type === "reading") {
      return (
        <div>
          {(note.quotes || []).map((q) => (
            <div key={q.id} style={{ borderLeft: "3px solid #c4a882", paddingLeft: "12px", marginBottom: "14px" }}>
              <p style={{ fontFamily: "'Lora', serif", fontSize: "13px", fontStyle: "italic", color: "#333", margin: "0 0 4px" }}>"{q.text}"</p>
              {q.author && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355" }}>{q.author}{q.bookTitle ? ` · ${q.bookTitle}` : ""}</div>}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0,
      width: "min(400px, 90vw)",
      background: "#fff",
      borderLeft: "1px solid #e0d8cc",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
      zIndex: 200,
      display: "flex", flexDirection: "column",
      animation: "slideIn 0.2s ease",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0ede8", background: "#fefcfa", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898", marginBottom: "4px" }}>
            {typeIcon} {note.folder}
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "17px", fontWeight: "700", color: "#2c2416", lineHeight: "1.3" }}>
            {note.title || "Senza titolo"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button onClick={() => onNavigate(note)}
            style={{ background: "#f0ede8", border: "none", borderRadius: "5px", padding: "5px 10px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#6b5e4e" }}>
            apri →
          </button>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#b0a898", padding: "2px 4px" }}>×</button>
        </div>
      </div>

      {/* Tags */}
      {note.tags?.length > 0 && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #f5f2ee", display: "flex", gap: "5px", flexWrap: "wrap" }}>
          {note.tags.map((t) => (
            <span key={t} style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#8b7355", background: "#f0ece4", padding: "1px 7px", borderRadius: "10px" }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {previewContent()}
      </div>
    </div>
  );
}

// ─── Backlinks Panel ──────────────────────────────────────────────────────────

function BacklinksPanel({ note, allNotes, onLinkClick }) {
  const [open, setOpen] = useState(true);
  if (!note?.title) return null;

  const backlinks = allNotes.filter((n) => {
    if (n.id === note.id || !note.title) return false;
    const text = noteTextContent(n);
    const titleLower = note.title.toLowerCase();
    // Match @Title (even multi-word) and [[Title]] links
    const textLower = text.toLowerCase();
    const atIdx = textLower.indexOf(`@${titleLower}`);
    const atMatch = atIdx !== -1 && (atIdx + 1 + titleLower.length >= textLower.length || /[^\w]/.test(textLower[atIdx + 1 + titleLower.length]));
    return atMatch || extractWikilinks(text).some((t) => t.toLowerCase() === titleLower);
  });

  if (backlinks.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid #f0ede8", margin: "0 28px", paddingBottom: "24px" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "14px 0 10px", width: "100%" }}>
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s", fontSize: "9px", color: "#b0a898" }}>▶</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#a09080", textTransform: "uppercase", letterSpacing: "1px" }}>
          Citata da {backlinks.length} nota{backlinks.length > 1 ? "" : ""}
        </span>
      </button>
      {open && backlinks.map((n) => (
        <div key={n.id} onClick={() => onLinkClick(n)}
          style={{ padding: "10px 12px", borderRadius: "7px", cursor: "pointer", marginBottom: "6px", background: "#faf7f2", border: "1px solid #f0ede8" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#faf7f2")}
        >
          <div style={{ fontFamily: "'Lora', serif", fontSize: "13px", fontWeight: "500", color: "#2c2416", marginBottom: "3px" }}>
            {{ text: "✏️", todo: "☑", reading: "📖", quick: "⚡", meeting: "📋", journal: "📓" }[n.type]} {n.title}
          </div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: "11px", color: "#9a8f82" }}>
            {noteTextContent(n).replace(/\[\[([^\]]+)\]\]/g, "[[$1]]").slice(0, 80)}…
          </div>
        </div>
      ))}
    </div>
  );
}

function NoteEditor({ note, folders, onUpdate, allNotes = [], onPreview, audioApiKey }) {
  const editorRef = useRef();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [folder, setFolder] = useState(note.folder);
  const [todos, setTodos] = useState(note.todos || []);
  const [showCompleted, setShowCompleted] = useState(true);
  const [newTodo, setNewTodo] = useState("");
  const [wikilinkQuery, setWikilinkQuery] = useState(null);
  const [cursorPos, setCursorPos] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [dueDate, setDueDate] = useState(note.dueDate || ""); // { title, x, y } | null

  // Stable refs — never cause re-renders
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const noteIdRef = useRef(note.id);
  const noteTypeRef = useRef(note.type);

  // Initialize editor content only when switching notes
  useEffect(() => {
    noteIdRef.current = note.id;
    noteTypeRef.current = note.type;
    setTitle(note.title);
    setTags(note.tags);
    setFolder(note.folder);
    setTodos(note.todos || []);
    setDueDate(note.dueDate || "");
    if ((note.type === "text" || note.type === "quick") && editorRef.current)
      editorRef.current.innerHTML = note.content || "";
  }, [note.id]);

  // Debounced save — reads everything from refs/DOM, never from props
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  const folderRef = useRef(folder);
  const todosRef = useRef(todos);
  const dueDateRef = useRef(dueDate);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  useEffect(() => { folderRef.current = folder; }, [folder]);
  useEffect(() => { todosRef.current = todos; }, [todos]);
  useEffect(() => { dueDateRef.current = dueDate; }, [dueDate]);

  const saveTimerRef = useRef(null);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const type = noteTypeRef.current;
      const updated = {
        id: noteIdRef.current, type,
        title: titleRef.current, tags: tagsRef.current,
        folder: folderRef.current, updatedAt: new Date().toISOString(),
        dueDate: dueDateRef.current || null,
      };
      if (type === "text" || type === "quick") updated.content = editorRef.current?.innerHTML || "";
      else updated.todos = todosRef.current;
      onUpdateRef.current(updated);
    }, 800);
  }, []); // empty deps — truly stable

  useEffect(() => { scheduleSave(); }, [title, tags, folder, todos, dueDate]);
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // @ detection — updates linkQuery state only, never triggers save
  const handleEditorInput = () => {
    scheduleSave();
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setWikilinkQuery(null); return; }
    const text = node.textContent.slice(0, sel.getRangeAt(0).startOffset);
    const m = text.match(/@([^@]*)$/);
    if (m) {
      // Capture cursor position for dropdown placement
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setCursorPos({ top: rect.top, bottom: rect.bottom, left: rect.left });
      setWikilinkQuery(m[1]);
    } else {
      setWikilinkQuery(null);
      setCursorPos(null);
    }
  };

  // Called by toolbar button — places cursor, opens dropdown
  const openLinkDropdown = () => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, "@");
    // Capture position after insert
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setCursorPos({ top: rect.top, bottom: rect.bottom, left: rect.left });
    }
    setWikilinkQuery("");
  };

  const insertLink = (targetNote) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) { scheduleSave(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { scheduleSave(); return; }
    const offset = range.startOffset;
    const text = node.textContent;
    // Find the @ and replace everything typed so far after it
    const beforeCursor = text.slice(0, offset);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx === -1) { scheduleSave(); return; }
    // Replace @<partial> with @<full title>
    node.textContent = text.slice(0, atIdx) + `@${targetNote.title}` + text.slice(offset);
    const newRange = document.createRange();
    newRange.setStart(node, Math.min(atIdx + targetNote.title.length + 1, node.textContent.length));
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setWikilinkQuery(null);
    setCursorPos(null);
    scheduleSave();
  };

  const handleEditorKeyDown = (e) => {
    if (wikilinkQuery !== null && e.key === "Escape") { setWikilinkQuery(null); return; }
    if (wikilinkQuery !== null && e.key === "Backspace") {
      // If user deletes the @, close dropdown
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.slice(0, sel.getRangeAt(0).startOffset);
          if (!text.match(/@\S*$/)) setWikilinkQuery(null);
        }
      }
    }
    const mod = navigator.platform.toUpperCase().includes("MAC") ? e.metaKey : e.ctrlKey;
    if (mod) {
      if (e.key === "b" || e.key === "B") { e.preventDefault(); document.execCommand("bold"); return; }
      if (e.key === "i" || e.key === "I") { e.preventDefault(); document.execCommand("italic"); return; }
      if (e.key === "u" || e.key === "U") { e.preventDefault(); document.execCommand("underline"); return; }
    }
    if (["*", "_"].includes(e.key)) applyMarkdownFormatting(e, editorRef);
  };

  const toggleTodo = (id) => { setTodos((p) => p.map((t) => t.id === id ? { ...t, done: !t.done } : t)); };
  const editTodo = (id, text) => { setTodos((p) => p.map((t) => t.id === id ? { ...t, text } : t)); };
  const deleteTodo = (id) => { setTodos((p) => p.filter((t) => t.id !== id)); };
  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((p) => [...p, { id: generateId(), text: newTodo.trim(), done: false }]);
    setNewTodo("");
  };

  // ── @ mention helpers ──
  // Strategy: find the @ before the cursor, then greedily match the longest
  // note title that starts at that position — handles multi-word titles.
  const getAtMentionFromText = (text, offset) => {
    const before = text.slice(0, offset);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return null;
    // Text from @ to end of node
    const fromAt = text.slice(atIdx + 1);
    // Try to match the longest known note title first
    const sorted = [...allNotes].sort((a, b) => b.title.length - a.title.length);
    for (const n of sorted) {
      if (fromAt.toLowerCase().startsWith(n.title.toLowerCase())) {
        // Make sure offset is within the @Title span
        if (offset >= atIdx && offset <= atIdx + 1 + n.title.length) {
          return { title: n.title, target: n };
        }
      }
    }
    // No known note matched — return partial text for tooltip
    const partial = fromAt.split(/(?<=[a-zA-Z0-9àèéìòù])\s{2,}|[^\w\s àèéìòùüöä]/)[0] || fromAt;
    if (!partial.trim()) return null;
    return { title: partial.trimEnd(), target: null };
  };

  const getAtMentionAtCaret = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const node = sel.getRangeAt(0).startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    return getAtMentionFromText(node.textContent, sel.getRangeAt(0).startOffset);
  };

  const getAtMentionFromPoint = (x, y) => {
    const range = document.caretRangeFromPoint?.(x, y) || document.caretPositionFromPoint?.(x, y);
    if (!range) return null;
    const node = range.startContainer || range.offsetNode;
    const offset = range.startOffset || range.offset;
    if (node?.nodeType !== Node.TEXT_NODE) return null;
    return getAtMentionFromText(node.textContent, offset);
  };

  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);
  const isQuick = note.type === "quick";
  const otherNotes = allNotes.filter((n) => n.id !== note.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #e8e3db", background: isQuick ? "#fffdf5" : "#fefcfa" }}>
        {isQuick && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#c4a882", marginBottom: "10px" }}>⚡ NOTA RAPIDA</div>}
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={isQuick ? "Titolo (opzionale)..." : "Titolo della nota..."}
          style={{ width: "100%", border: "none", outline: "none", fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", fontWeight: "700", color: "#2c2416", background: "transparent", marginBottom: "12px" }}
        />
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          {!isQuick && (
            <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ border: "1px solid #e0d9d0", borderRadius: "6px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#6b5e4e", background: "#faf8f5", outline: "none" }}>
              {folders.map((f) => <option key={f}>{f}</option>)}
            </select>
          )}
          <TagInput tags={tags} onChange={setTags} />
          <AudioRecorder noteType={note.type} apiKey={audioApiKey} onResult={(r) => {
            if (r.title) setTitle(r.title);
            if (r.tags)  setTags((p) => [...new Set([...p, ...r.tags])]);
            if (r.content && editorRef.current) editorRef.current.innerHTML = (editorRef.current.innerHTML || "") + (note.type === "quick" ? r.content : (r.content || ""));
            if (r.todos)  setTodos((p) => [...p, ...r.todos.map((t) => ({ ...t, id: generateId() }))]);
            scheduleSave();
          }} />
          {note.type === "todo" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#b0a898" }}>scadenza:</span>
              <input type="date" value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ border: "1px solid #e0d8cc", borderRadius: "5px", padding: "2px 6px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#6b5e4e", outline: "none", background: "#faf8f5" }}
              />
              {dueDate && <button onClick={() => setDueDate("")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c4a08a" }}>✕</button>}
            </div>
          )}
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#b0a898", fontFamily: "'DM Mono', monospace" }}>{formatDate(note.updatedAt)}</span>
        </div>
      </div>

      {note.type === "todo" ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
          {pending.map((item) => <TodoItem key={item.id} item={item} onToggle={toggleTodo} onEdit={editTodo} onDelete={deleteTodo} onSetDue={(id, due) => setTodos((p) => p.map((t) => t.id === id ? { ...t, due } : t))} />)}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px" }}>
            <div style={{ width: "18px", height: "18px", border: "2px dashed #d0c8be", borderRadius: "4px", flexShrink: 0 }} />
            <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTodo()}
              placeholder="Aggiungi elemento..."
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "'Lora', Georgia, serif", fontSize: "14px", color: "#999" }}
            />
          </div>
          {completed.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <button onClick={() => setShowCompleted((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#a09080", display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                <span style={{ display: "inline-block", transform: showCompleted ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▶</span>
                {completed.length} completat{completed.length === 1 ? "o" : "i"}
              </button>
              {showCompleted && completed.map((item) => <TodoItem key={item.id} item={item} onToggle={toggleTodo} onEdit={editTodo} onDelete={deleteTodo} onSetDue={(id, due) => setTodos((p) => p.map((t) => t.id === id ? { ...t, due } : t))} />)}
            </div>
          )}
          <BacklinksPanel note={note} allNotes={allNotes} onLinkClick={onPreview} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {!isQuick && <Toolbar editorRef={editorRef} onInsertLink={openLinkDropdown} />}
          <div style={{ position: "relative", flex: 1 }}>
            <div ref={editorRef} contentEditable suppressContentEditableWarning
              onKeyDown={handleEditorKeyDown}
              onInput={handleEditorInput}
              onClick={(e) => {
                if (!onPreview) return;
                const info = getAtMentionAtCaret();
                if (info) { e.preventDefault(); onPreview(info.target); }
              }}
              onMouseMove={(e) => {
                const info = getAtMentionFromPoint(e.clientX, e.clientY);
                if (info) setHoveredLink({ title: info.title, found: !!info.target, x: e.clientX, y: e.clientY, target: info.target });
                else setHoveredLink(null);
              }}
              onMouseLeave={() => setHoveredLink(null)}
              data-placeholder={isQuick ? "Scrivi qualcosa..." : "Inizia a scrivere... usa @ per linkare una nota"}
              style={{ minHeight: "100%", padding: "24px 28px", outline: "none", fontFamily: "'Lora', Georgia, serif", fontSize: isQuick ? "16px" : "15px", lineHeight: "1.8", color: "#333", background: isQuick ? "#fffdf5" : "#fff", cursor: hoveredLink?.found ? "pointer" : "text" }}
            />
            {wikilinkQuery !== null && (
              <WikilinkAutocomplete query={wikilinkQuery} notes={otherNotes} onSelect={insertLink} onClose={() => { setWikilinkQuery(null); setCursorPos(null); }} pos={cursorPos} />
            )}
            {hoveredLink && (
              <div style={{
                position: "fixed", zIndex: 400, pointerEvents: "none",
                top: hoveredLink.y + 20, left: hoveredLink.x,
                background: hoveredLink.found ? "#2c2416" : "#888",
                color: "#f0e8d8", borderRadius: "5px",
                padding: "3px 8px", fontSize: "11px",
                fontFamily: "'DM Mono', monospace",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                whiteSpace: "nowrap",
              }}>
                {hoveredLink.found ? `Apri: ${hoveredLink.title}` : `Nota non trovata: @${hoveredLink.title}`}
              </div>
            )}
          </div>
          <BacklinksPanel note={note} allNotes={allNotes} onLinkClick={onPreview} />
        </div>
      )}
    </div>
  );
}

// ─── Meeting Editor ───────────────────────────────────────────────────────────

function MeetingEditor({ note, folders, onUpdate, allNotes, onPreview, audioApiKey }) {
  const [title, setTitle] = useState(note.title);
  const [tags,  setTags]  = useState(note.tags);
  const [folder, setFolder] = useState(note.folder);
  const [actions, setActions] = useState(note.actions || []);
  const [newAction, setNewAction] = useState("");
  const editorRef = useRef();

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const noteIdRef = useRef(note.id);
  const titleRef  = useRef(title);
  const tagsRef   = useRef(tags);
  const folderRef = useRef(folder);
  const actionsRef = useRef(actions);
  useEffect(() => { titleRef.current   = title;   }, [title]);
  useEffect(() => { tagsRef.current    = tags;    }, [tags]);
  useEffect(() => { folderRef.current  = folder;  }, [folder]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  useEffect(() => {
    noteIdRef.current = note.id;
    setTitle(note.title); setTags(note.tags); setFolder(note.folder);
    setActions(note.actions || []);
    if (editorRef.current) editorRef.current.innerHTML = note.content || "";
  }, [note.id]);

  const saveTimerRef = useRef(null);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onUpdateRef.current({
        id: noteIdRef.current, type: "meeting",
        title: titleRef.current, tags: tagsRef.current,
        folder: folderRef.current, actions: actionsRef.current,
        content: editorRef.current?.innerHTML || "",
        updatedAt: new Date().toISOString(),
      });
    }, 800);
  }, []);
  useEffect(() => { scheduleSave(); }, [title, tags, folder, actions]);
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const addAction = () => {
    if (!newAction.trim()) return;
    setActions((p) => [...p, { id: generateId(), text: newAction.trim(), done: false, due: null }]);
    setNewAction("");
  };

  const pendingActions  = actions.filter((a) => !a.done);
  const completedActions = actions.filter((a) => a.done);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #e8e3db", background: "#fefcfa" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#8b7355", marginBottom: "10px" }}>📋 MEETING</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Titolo del meeting..."
          style={{ width: "100%", border: "none", outline: "none", fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: "700", color: "#2c2416", background: "transparent", marginBottom: "12px" }}
        />
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <select value={folder} onChange={(e) => setFolder(e.target.value)}
            style={{ border: "1px solid #e0d9d0", borderRadius: "6px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#6b5e4e", background: "#faf8f5", outline: "none" }}>
            {folders.map((f) => <option key={f}>{f}</option>)}
          </select>
          <TagInput tags={tags} onChange={setTags} />
          <AudioRecorder noteType="meeting" apiKey={audioApiKey} onResult={(r) => {
            if (r.title)   setTitle(r.title);
            if (r.tags)    setTags((p) => [...new Set([...p, ...r.tags])]);
            if (r.content && editorRef.current) editorRef.current.innerHTML = r.content;
            if (r.actions) setActions((p) => [...p, ...r.actions.map((a) => ({ ...a, id: generateId() }))]);
            scheduleSave();
          }} />
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#b0a898", fontFamily: "'DM Mono', monospace" }}>{formatDate(note.updatedAt)}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Free-text body */}
        <div style={{ borderBottom: "1px solid #e8e3db" }}>
          <Toolbar editorRef={editorRef} />
          <div ref={editorRef} contentEditable suppressContentEditableWarning
            onInput={scheduleSave}
            onKeyDown={(e) => handleEditorKeyDown(e, editorRef)}
            data-placeholder="Note, agenda, decisioni..."
            style={{ minHeight: "160px", padding: "20px 28px", outline: "none", fontFamily: "'Lora', serif", fontSize: "15px", lineHeight: "1.8", color: "#333" }}
          />
        </div>

        {/* Actions section */}
        <div style={{ padding: "20px 28px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>
            ✅ Azioni
          </div>

          {pendingActions.map((a) => (
            <ActionItem key={a.id} action={a}
              onChange={(updated) => setActions((p) => p.map((x) => x.id === updated.id ? updated : x))}
              onDelete={(id) => setActions((p) => p.filter((x) => x.id !== id))}
            />
          ))}

          {/* Add new action */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 4px" }}>
            <div style={{ width: "18px", height: "18px", border: "2px dashed #d0c8be", borderRadius: "4px", flexShrink: 0 }} />
            <input value={newAction} onChange={(e) => setNewAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAction()}
              placeholder="Aggiungi azione..."
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "'Lora', serif", fontSize: "14px", color: "#999" }}
            />
          </div>

          {/* Completed actions */}
          {completedActions.length > 0 && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #f0ede8" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c0b8ae", marginBottom: "8px" }}>
                {completedActions.length} completat{completedActions.length === 1 ? "a" : "e"}
              </div>
              {completedActions.map((a) => (
                <ActionItem key={a.id} action={a}
                  onChange={(updated) => setActions((p) => p.map((x) => x.id === updated.id ? updated : x))}
                  onDelete={(id) => setActions((p) => p.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}
        </div>

        <BacklinksPanel note={note} allNotes={allNotes} onLinkClick={onPreview} />
      </div>
    </div>
  );
}

function ActionItem({ action, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(action.text);
  const [showDate, setShowDate] = useState(false);
  const inputRef = useRef();
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = action.due && !action.done && action.due < today;
  const isDueToday = action.due && !action.done && action.due === today;
  const dueLabel = action.due ? new Date(action.due).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : null;

  return (
    <div style={{ borderBottom: "1px solid #f5f2ee", opacity: action.done ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 4px" }}>
        <div onClick={() => onChange({ ...action, done: !action.done })} style={{
          width: "18px", height: "18px", flexShrink: 0, cursor: "pointer",
          border: `2px solid ${action.done ? "#8b7355" : "#c5bfb5"}`,
          borderRadius: "4px", background: action.done ? "#8b7355" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {action.done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
        {editing ? (
          <input ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)}
            onBlur={() => { onChange({ ...action, text: val }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { onChange({ ...action, text: val }); setEditing(false); } }}
            style={{ flex: 1, border: "none", borderBottom: "1px solid #8b7355", outline: "none", background: "transparent", fontFamily: "'Lora', serif", fontSize: "14px", color: "#333" }}
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)} style={{ flex: 1, fontFamily: "'Lora', serif", fontSize: "14px", color: "#333", textDecoration: action.done ? "line-through" : "none", cursor: "text" }}>
            {action.text}
          </span>
        )}
        {dueLabel && !showDate && (
          <span onClick={() => setShowDate(true)} style={{
            fontFamily: "'DM Mono', monospace", fontSize: "10px", padding: "1px 6px", borderRadius: "10px", cursor: "pointer", flexShrink: 0,
            background: isOverdue ? "#fde8e8" : isDueToday ? "#fdf3e0" : "#f0ede8",
            color: isOverdue ? "#c04040" : isDueToday ? "#b07030" : "#8b7355",
            border: `1px solid ${isOverdue ? "#f0c0c0" : isDueToday ? "#e8d090" : "#e0d8cc"}`,
          }}>
            {isOverdue ? "⚠ " : isDueToday ? "⏰ " : "📅 "}{dueLabel}
          </span>
        )}
        {!action.due && !showDate && (
          <button onClick={() => setShowDate(true)} title="Aggiungi scadenza"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#d0c8be", fontSize: "13px", padding: "0 2px" }}>📅</button>
        )}
        <button onClick={() => onDelete(action.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: "16px", padding: "0 4px" }}>×</button>
      </div>
      {showDate && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px 8px 32px" }}>
          <input type="date" defaultValue={action.due || ""}
            onChange={(e) => { onChange({ ...action, due: e.target.value || null }); setShowDate(false); }}
            style={{ border: "1px solid #e0d8cc", borderRadius: "5px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#6b5e4e", outline: "none", background: "#faf8f5" }}
          />
          {action.due && <button onClick={() => { onChange({ ...action, due: null }); setShowDate(false); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c4a08a" }}>rimuovi</button>}
          <button onClick={() => setShowDate(false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898" }}>✕</button>
        </div>
      )}
    </div>
  );
}


// ─── Journal Editor ───────────────────────────────────────────────────────────

function JournalEditor({ note, folders, onUpdate, audioApiKey }) {
  const [title,  setTitle]   = useState(note.title);
  const [tags,   setTags]    = useState(note.tags);
  const [folder, setFolder]  = useState(note.folder);
  const [entries, setEntries] = useState(note.entries || []);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const noteIdRef   = useRef(note.id);
  const titleRef    = useRef(title);
  const tagsRef     = useRef(tags);
  const folderRef   = useRef(folder);
  const entriesRef  = useRef(entries);
  useEffect(() => { titleRef.current   = title;   }, [title]);
  useEffect(() => { tagsRef.current    = tags;    }, [tags]);
  useEffect(() => { folderRef.current  = folder;  }, [folder]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  useEffect(() => {
    noteIdRef.current = note.id;
    setTitle(note.title); setTags(note.tags); setFolder(note.folder);
    setEntries(note.entries || []);
  }, [note.id]);

  const saveTimerRef = useRef(null);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onUpdateRef.current({
        id: noteIdRef.current, type: "journal",
        title: titleRef.current, tags: tagsRef.current,
        folder: folderRef.current, entries: entriesRef.current,
        updatedAt: new Date().toISOString(),
      });
    }, 800);
  }, []);
  useEffect(() => { scheduleSave(); }, [title, tags, folder, entries]);
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const addEntry = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (entries.find((e) => e.date === today)) return; // already has today
    setEntries((p) => [{ id: generateId(), date: today, content: "" }, ...p]);
  };

  const todayISO = new Date().toISOString().slice(0, 10);
  const hasToday = entries.some((e) => e.date === todayISO);

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #e8e3db", background: "#fffdf8" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#8b7355", marginBottom: "10px" }}>📓 DIARIO</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            style={{ border: "none", outline: "none", fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: "700", color: "#2c2416", background: "transparent", flex: 1 }}
          />
          {!hasToday && (
            <button onClick={addEntry}
              style={{ background: "#8b7355", border: "none", borderRadius: "7px", padding: "7px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "white", whiteSpace: "nowrap", flexShrink: 0 }}>
              + oggi
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <select value={folder} onChange={(e) => setFolder(e.target.value)}
            style={{ border: "1px solid #e0d9d0", borderRadius: "6px", padding: "3px 8px", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#6b5e4e", background: "#faf8f5", outline: "none" }}>
            {folders.map((f) => <option key={f}>{f}</option>)}
          </select>
          <TagInput tags={tags} onChange={setTags} />
          <AudioRecorder noteType="journal" apiKey={audioApiKey} onResult={(r) => {
            const today = new Date().toISOString().slice(0, 10);
            const existing = entries.find((e) => e.date === today);
            if (existing) {
              setEntries((p) => p.map((e) => e.date === today ? { ...e, content: e.content + "\n" + (r.content || "") } : e));
            } else {
              setEntries((p) => [{ id: generateId(), date: today, content: r.content || "" }, ...p]);
            }
            scheduleSave();
          }} />
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#b0a898", fontFamily: "'DM Mono', monospace" }}>
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "60px 28px", textAlign: "center", color: "#c0b8ae", fontFamily: "'Lora', serif", fontSize: "14px", fontStyle: "italic" }}>
            Il diario è vuoto.<br />
            <button onClick={addEntry} style={{ marginTop: "16px", background: "#8b7355", border: "none", borderRadius: "7px", padding: "8px 18px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "white" }}>
              Scrivi la prima entry
            </button>
          </div>
        ) : (
          sorted.map((entry) => (
            <JournalEntry key={entry.id} entry={entry}
              onChange={(updated) => { setEntries((p) => p.map((e) => e.id === updated.id ? updated : e)); scheduleSave(); }}
              onDelete={(id) => setEntries((p) => p.filter((e) => e.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}

function JournalEntry({ entry, onChange, onDelete }) {
  const editorRef = useRef();
  const [confirmDel, setConfirmDel] = useState(false);
  const contentRef = useRef(entry.content);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = entry.content || "";
  }, [entry.id]);

  const handleInput = () => {
    const html = editorRef.current?.innerHTML || "";
    contentRef.current = html;
    onChange({ ...entry, content: html });
  };

  const dateLabel = new Date(entry.date + "T12:00:00").toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const isToday = entry.date === new Date().toISOString().slice(0, 10);

  return (
    <div style={{ borderBottom: "1px solid #f0ede8" }}>
      {/* Entry header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 28px 8px", background: isToday ? "#fffdf5" : "transparent" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "15px", fontWeight: "600", color: "#2c2416", textTransform: "capitalize" }}>
            {isToday && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c4a882", marginRight: "8px" }}>OGGI</span>}
            {dateLabel}
          </div>
        </div>
        {confirmDel ? (
          <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "#c4a08a" }}>elimina?</span>
            <button onMouseDown={() => onDelete(entry.id)} style={{ background: "#c4a08a", border: "none", borderRadius: "3px", cursor: "pointer", color: "white", fontSize: "10px", padding: "1px 6px", fontFamily: "'DM Mono', monospace" }}>sì</button>
            <button onClick={() => setConfirmDel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#b0a898", fontSize: "10px", fontFamily: "'DM Mono', monospace" }}>no</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDel(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d0c8be", fontSize: "13px", padding: "2px 4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#c4a08a")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#d0c8be")}>✕</button>
        )}
      </div>
      {/* Entry content */}
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={(e) => handleEditorKeyDown(e, editorRef)}
        data-placeholder="Scrivi..."
        style={{ minHeight: "120px", padding: "8px 28px 24px", outline: "none", fontFamily: "'Lora', serif", fontSize: "15px", lineHeight: "1.9", color: "#333", background: isToday ? "#fffdf5" : "transparent" }}
      />
    </div>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({ note, active, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeIcon = { text: "✏️", todo: "☑", reading: "📖", quick: "⚡", meeting: "📋", journal: "📓" }[note.type] || "✏️";
  const preview = note.type === "reading"
    ? `${note.quotes?.length || 0} citazioni`
    : note.type === "todo"
      ? `${note.todos?.filter((t) => !t.done).length || 0} da fare`
      : note.type === "meeting"
        ? `${note.actions?.filter((a) => !a.done).length || 0} azioni aperte`
        : note.type === "journal"
          ? `${note.entries?.length || 0} entr${note.entries?.length === 1 ? "y" : "ies"}`
          : (note.content || "").replace(/<[^>]+>/g, "").slice(0, 80);

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{ padding: "14px 16px", borderBottom: "1px solid #ede8e0", cursor: "pointer", background: active ? "#f5f0e8" : hovered ? "#faf7f2" : "transparent", borderLeft: active ? "3px solid #8b7355" : "3px solid transparent", transition: "background 0.12s", position: "relative" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "14px", fontWeight: "600", color: "#2c2416", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          <span style={{ marginRight: "6px", fontSize: "11px" }}>{typeIcon}</span>
          {note.title || (note.type === "quick" ? "Nota rapida" : "Nota senza titolo")}
        </div>
        {hovered && onDelete && (
          confirmDelete
            ? <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <span style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#c4a08a" }}>elimina?</span>
                <button onMouseDown={(e) => { e.stopPropagation(); onDelete(note.id); }}
                  style={{ background: "#c4a08a", border: "none", borderRadius: "3px", cursor: "pointer", color: "white", fontSize: "10px", padding: "1px 5px", fontFamily: "'DM Mono', monospace" }}>sì</button>
                <button onMouseDown={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#b0a898", fontSize: "10px", fontFamily: "'DM Mono', monospace" }}>no</button>
              </span>
            : <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#c4a08a", fontSize: "14px", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                title="Elimina nota"
              >✕</button>
        )}
      </div>
      <div style={{ fontSize: "12px", color: "#9a8f82", fontFamily: "'Lora', serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "6px" }}>
        {preview || "Nota vuota"}
      </div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
        {note.tags.slice(0, 3).map((t) => (
          <span key={t} style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#8b7355", background: "#f0ece4", padding: "1px 7px", borderRadius: "10px" }}>#{t}</span>
        ))}
      </div>
    </div>
  );
}

// ─── New Note Menu ────────────────────────────────────────────────────────────

function NewNoteMenu({ onSelect, onClose, anchor }) {
  // anchor: { top, right } in viewport coords — menu appears below, right-aligned
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sections = [
    {
      items: [
        { icon: "⚡", label: "Nota rapida", sub: "Apri e scrivi subito", action: "quick" },
        { icon: "✏️", label: "Nota testuale", sub: "Con formattazione ricca", action: "text" },
        { icon: "☑", label: "To-do list", sub: "Lista con checklist", action: "todo" },
        { icon: "📖", label: "Nota di lettura", sub: "Citazioni e commenti", action: "reading" },
      ]
    },
    {
      label: "Template",
      items: [
        { icon: "📋", label: "Meeting notes", sub: "Template riunione", action: "tpl-meeting" },
        { icon: "📓", label: "Journal", sub: "Template diario", action: "tpl-journal" },
        { icon: "💡", label: "Brainstorming", sub: "Template idee", action: "tpl-brainstorm" },
      ]
    }
  ];

  const style = anchor
    ? { position: "fixed", top: anchor.top, right: anchor.right !== undefined ? anchor.right : "auto", left: anchor.left !== undefined ? anchor.left : "auto" }
    : { position: "absolute", top: "calc(100% + 6px)", left: "0" };

  return (
    <div ref={ref} style={{ ...style, background: "#fff", border: "1px solid #e0d8cc", borderRadius: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", zIndex: 400, minWidth: "220px", overflow: "hidden", padding: "6px 0" }}>
      {sections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div style={{ height: "1px", background: "#f0ece4", margin: "6px 0" }} />}
          {section.label && <div style={{ padding: "4px 14px 2px", fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#b0a898", textTransform: "uppercase", letterSpacing: "1px" }}>{section.label}</div>}
          {section.items.map((item) => (
            <div key={item.action}
              onMouseDown={(e) => {
                e.preventDefault();   // prevent blur / outside-click handler firing first
                e.stopPropagation();  // prevent document mousedown from closing menu
                onSelect(item.action);
                onClose();
              }}
              style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#faf7f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "15px" }}>{item.icon}</span>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#2c2416" }}>{item.label}</div>
                <div style={{ fontFamily: "'Lora', serif", fontSize: "11px", color: "#a09080" }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

    </div>
  );
}

// ─── Tag Panel ────────────────────────────────────────────────────────────────

function TagPanel({ allTags, activeTags, onToggle, onClear, tagFrequency }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const PREVIEW_COUNT = 5;

  const visibleTags = tagSearch
    ? allTags.filter((t) => t.includes(tagSearch.toLowerCase()))
    : allTags;

  if (allTags.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid #3d3020", marginTop: "auto" }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 8px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#6a5e4e", textTransform: "uppercase", letterSpacing: "1px" }}>
            Tag
          </span>
          {activeTags.length > 0 && (
            <span style={{
              background: "#c4a882", color: "#2c2416",
              fontSize: "9px", fontFamily: "'DM Mono', monospace",
              padding: "1px 6px", borderRadius: "10px", fontWeight: "600",
            }}>
              {activeTags.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {activeTags.length > 0 && !collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#7a6e5e", cursor: "pointer", textDecoration: "underline" }}
            >
              reset
            </span>
          )}
          <span style={{ fontSize: "10px", color: "#5a5040", transition: "transform 0.2s", display: "inline-block", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}>▲</span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "0 12px 14px" }}>
          {/* Active tags chips (always visible when selected) */}
          {activeTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
              {activeTags.map((t) => (
                <span key={t} onClick={() => onToggle(t)}
                  style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#2c2416", background: "#c4a882", padding: "2px 8px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  #{t} <span style={{ opacity: 0.6 }}>×</span>
                </span>
              ))}
            </div>
          )}

          {/* Search input — shown only when there are enough tags */}
          {allTags.length > PREVIEW_COUNT && (
            <input
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="filtra tag..."
              style={{
                width: "100%", padding: "5px 8px", marginBottom: "8px",
                background: "#3d3020", border: "none", borderRadius: "5px",
                color: "#e8e0d4", outline: "none",
                fontFamily: "'DM Mono', monospace", fontSize: "10px",
              }}
            />
          )}

          {/* Tag list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {visibleTags.length === 0 ? (
              <div style={{ fontSize: "10px", color: "#5a5040", fontFamily: "'DM Mono', monospace", padding: "4px" }}>nessun risultato</div>
            ) : visibleTags.map((t) => {
              const active = activeTags.includes(t);
              return (
                <div key={t} onClick={() => onToggle(t)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "4px 8px", borderRadius: "5px", cursor: "pointer",
                    background: active ? "#4a3820" : "transparent",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#3d3020"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    fontSize: "11px", fontFamily: "'DM Mono', monospace",
                    color: active ? "#f0e8d8" : "#8b7355",
                    fontWeight: active ? "500" : "400",
                  }}>
                    {active && <span style={{ color: "#c4a882", marginRight: "4px" }}>✓</span>}#{t}
                  </span>
                  <span style={{
                    fontSize: "9px", fontFamily: "'DM Mono', monospace",
                    color: active ? "#c4a882" : "#5a5040",
                    background: active ? "#3d2e18" : "#3d3020",
                    padding: "1px 5px", borderRadius: "8px",
                  }}>
                    {tagFrequency[t]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsed preview */}
      {collapsed && activeTags.length > 0 && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {activeTags.map((t) => (
            <span key={t} style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#2c2416", background: "#c4a882", padding: "1px 7px", borderRadius: "10px" }}>
              #{t}
            </span>
          ))}
          <span onClick={onClear} style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#7a6e5e", cursor: "pointer", padding: "1px 4px" }}>reset</span>
        </div>
      )}
    </div>
  );
}


// ─── Folder Panel ─────────────────────────────────────────────────────────────

function FolderPanel({ folders, setFolders, activeFolder, setActiveFolder, notes, onAddFolder }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const renameRef = useRef();

  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);

  const noteCount = (folderName) =>
    notes.filter((n) => n.folder === folderName || n.folder?.startsWith(folderName + "/")).length;

  const buildTree = () => {
    const roots = [];
    const childMap = {};
    folders.forEach((f) => {
      const parts = f.name.split("/");
      if (parts.length === 1) roots.push({ ...f, children: [] });
      else {
        const parent = parts.slice(0, -1).join("/");
        if (!childMap[parent]) childMap[parent] = [];
        childMap[parent].push(f);
      }
    });
    return roots.map((r) => ({ ...r, children: childMap[r.name] || [] }));
  };

  const tree = buildTree();
  const toggleGroup = (name) => setCollapsedGroups((v) => ({ ...v, [name]: !v[name] }));

  const startRename = (f) => { setRenamingId(f.id); setRenameVal(f.name); setColorPickerId(null); };

  const commitRename = (f) => {
    const newName = renameVal.trim();
    if (!newName || newName === f.name) { setRenamingId(null); return; }
    setFolders((prev) => prev.map((x) => {
      if (x.id === f.id) return { ...x, name: newName };
      if (x.name.startsWith(f.name + "/")) return { ...x, name: newName + x.name.slice(f.name.length) };
      return x;
    }));
    if (activeFolder === f.name) setActiveFolder(newName);
    setRenamingId(null);
  };

  const deleteFolder = (f) => {
    const childNames = folders.filter((x) => x.name.startsWith(f.name + "/")).map((x) => x.name);
    const allNames = [f.name, ...childNames];
    const total = notes.filter((n) => allNames.includes(n.folder)).length;
    const msg = total > 0
      ? `Eliminare "${f.name}"${childNames.length > 0 ? " e le sue sottocartelle" : ""}? Le ${total} note al suo interno rimarranno senza cartella.`
      : `Eliminare la cartella "${f.name}"?`;
    setDeleteConfirm({
      id: f.id, msg, names: allNames,
      onConfirm: () => {
        setFolders((prev) => prev.filter((x) => !allNames.includes(x.name)));
        if (allNames.includes(activeFolder)) setActiveFolder("all");
      },
    });
  };

  const setColor = (id, color) => {
    setFolders((prev) => prev.map((f) => f.id === id ? { ...f, color } : f));
    setColorPickerId(null);
  };

  const flatIndexOf = (id) => folders.findIndex((f) => f.id === id);

  const onDragStart = (i) => setDragIdx(i);
  const onDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const onDrop = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    const reordered = [...folders];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(i, 0, moved);
    setFolders(reordered);
    setDragIdx(null); setDragOverIdx(null);
  };

  const renderFolder = (f, depth) => {
    const flatIdx = flatIndexOf(f.id);
    const isActive = activeFolder === f.name;
    const isRenaming = renamingId === f.id;
    const isHovered = hoverId === f.id;
    const count = noteCount(f.name);
    const isDragging = dragIdx === flatIdx;
    const isDragOver = dragOverIdx === flatIdx && dragIdx !== flatIdx;

    return (
      <div key={f.id}
        draggable={!isRenaming}
        onDragStart={() => onDragStart(flatIdx)}
        onDragOver={(e) => onDragOver(e, flatIdx)}
        onDrop={() => onDrop(flatIdx)}
        onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
        style={{ opacity: isDragging ? 0.4 : 1, outline: isDragOver ? "1px dashed #6a5e4e" : "none", borderRadius: "5px" }}
      >
        <div
          onClick={() => !isRenaming && setActiveFolder(f.name)}
          onDoubleClick={() => startRename(f)}
          onMouseEnter={() => setHoverId(f.id)}
          onMouseLeave={() => { setHoverId(null); }}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: `5px 8px 5px ${10 + depth * 14}px`,
            borderRadius: "6px", cursor: "pointer",
            background: isActive ? "#3d3020" : "transparent",
            color: isActive ? "#f0e8d8" : "#9a8f82",
            transition: "all 0.12s", marginBottom: "1px", position: "relative",
          }}
        >
          {/* Color dot */}
          <div
            onClick={(e) => { e.stopPropagation(); setColorPickerId(colorPickerId === f.id ? null : f.id); }}
            title="Cambia colore"
            style={{ width: "8px", height: "8px", borderRadius: "50%", background: f.color || "#c4a882", flexShrink: 0, cursor: "pointer" }}
          />

          {/* Color picker */}
          {colorPickerId === f.id && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: "24px", top: "100%", zIndex: 200, background: "#2c2416", border: "1px solid #4a3820", borderRadius: "8px", padding: "8px", display: "flex", flexWrap: "wrap", gap: "5px", width: "110px", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
              {FOLDER_COLORS.map((c) => (
                <div key={c} onClick={() => setColor(f.id, c)}
                  style={{ width: "20px", height: "20px", borderRadius: "50%", background: c, cursor: "pointer", border: f.color === c ? "2px solid #f0e8d8" : "2px solid transparent" }}
                />
              ))}
            </div>
          )}

          {/* Name or rename input */}
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(f); if (e.key === "Escape") setRenamingId(null); }}
              onBlur={() => commitRename(f)}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, background: "#3d3020", border: "none", borderBottom: "1px solid #c4a882", outline: "none", color: "#f0e8d8", fontFamily: "'DM Mono', monospace", fontSize: "12px", padding: "1px 2px" }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", userSelect: "none" }}>
              {depth > 0 ? f.name.split("/").pop() : f.name}
            </span>
          )}

          {/* Count + delete on hover */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, opacity: isHovered || isActive ? 1 : 0, transition: "opacity 0.15s" }}>
            {count > 0 && (
              <span style={{ fontSize: "9px", fontFamily: "'DM Mono', monospace", color: isActive ? "#f0e8d8" : "#c4a882", background: isActive ? "#3d2e18" : "#5a4a36", padding: "1px 5px", borderRadius: "8px" }}>
                {count}
              </span>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); deleteFolder(f); }}
              title="Elimina cartella"
              style={{ fontSize: "14px", color: "#7a5a4e", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#c47a6a")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#7a5a4e")}
            >×</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 12px 8px" }}>
      <div style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#6a5e4e", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px", padding: "0 4px" }}>
        Cartelle
      </div>

      {/* All notes */}
      <div onClick={() => setActiveFolder("all")}
        onMouseEnter={(e) => setHoverId("__all__")}
        onMouseLeave={(e) => setHoverId(null)}
        style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", background: activeFolder === "all" ? "#3d3020" : "transparent", color: activeFolder === "all" ? "#f0e8d8" : "#9a8f82", marginBottom: "1px" }}
      >
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6a5e4e", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Tutte le note</span>
        <span style={{ fontSize: "9px", fontFamily: "'DM Mono', monospace", color: activeFolder === "all" ? "#f0e8d8" : "#c4a882", background: activeFolder === "all" ? "#3d2e18" : "#5a4a36", padding: "1px 5px", borderRadius: "8px" }}>
          {notes.length}
        </span>
      </div>

      {/* Tree */}
      {tree.map((root) => {
        const hasChildren = root.children.length > 0;
        const isCollapsed = collapsedGroups[root.name];
        return (
          <div key={root.id}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                onClick={() => hasChildren && toggleGroup(root.name)}
                style={{ fontSize: "8px", color: hasChildren ? "#5a5040" : "transparent", cursor: hasChildren ? "pointer" : "default", padding: "5px 3px 5px 0", userSelect: "none", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
              >▾</span>
              <div style={{ flex: 1 }}>{renderFolder(root, 0)}</div>
            </div>
            {!isCollapsed && root.children.map((child) => renderFolder(child, 1))}
          </div>
        );
      })}

      <div onClick={onAddFolder}
        style={{ padding: "5px 10px", cursor: "pointer", fontSize: "11px", color: "#5a5040", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#9a8f82")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#5a5040")}
      >+ nuova cartella</div>
      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "10px", padding: "20px 24px", width: "min(300px,90vw)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", color: "#2c2416", marginBottom: "16px" }}>{deleteConfirm.msg}</div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ background: "none", border: "1px solid #e0d8cc", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#9a8f82" }}>Annulla</button>
              <button onClick={() => { deleteConfirm.onConfirm(); setDeleteConfirm(null); }}
                style={{ background: "#c4a08a", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "white" }}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tags Inline Row ─────────────────────────────────────────────────────────

function TagsInlineRow({ allTags, activeTags, onToggle, onClear }) {
  const PREVIEW = 8;
  const [expanded, setExpanded] = useState(false);
  const hasMore = allTags.length > PREVIEW;
  const visible = expanded ? allTags : allTags.slice(0, PREVIEW);
  // Make sure active tags beyond PREVIEW are always visible
  const hiddenActive = !expanded ? activeTags.filter((t) => !allTags.slice(0, PREVIEW).includes(t)) : [];

  return (
    <div style={{ padding: "7px 12px 0", display: "flex", gap: "5px", flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
      {visible.map((t) => {
        const active = activeTags.includes(t);
        return (
          <button key={t} onClick={() => onToggle(t)}
            style={{ background: active ? "#8b7355" : "#f0ede8", color: active ? "#fff" : "#6b5e4e", border: "none", borderRadius: "20px", padding: "2px 9px", fontFamily: "'DM Mono', monospace", fontSize: "10px", cursor: "pointer", transition: "all 0.15s" }}>
            #{t}
          </button>
        );
      })}
      {/* Hidden active tags — always show even when collapsed */}
      {hiddenActive.map((t) => (
        <button key={t} onClick={() => onToggle(t)}
          style={{ background: "#8b7355", color: "#fff", border: "none", borderRadius: "20px", padding: "2px 9px", fontFamily: "'DM Mono', monospace", fontSize: "10px", cursor: "pointer" }}>
          #{t}
        </button>
      ))}
      {/* Expand/collapse toggle */}
      {hasMore && (
        <button onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "1px solid #e0d8cc", borderRadius: "20px", padding: "2px 9px", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#9a8f82", cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c4a882"; e.currentTarget.style.color = "#8b7355"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0d8cc"; e.currentTarget.style.color = "#9a8f82"; }}>
          {expanded ? "− meno" : `+ altri ${allTags.length - PREVIEW}`}
        </button>
      )}
      {activeTags.length > 0 && (
        <button onClick={onClear}
          style={{ background: "none", border: "none", color: "#b0a898", fontFamily: "'DM Mono', monospace", fontSize: "10px", cursor: "pointer", padding: "2px 4px" }}>
          ✕ tutti
        </button>
      )}
    </div>
  );
}

// ─── Reading Table View ───────────────────────────────────────────────────────

function ReadingTableView({ notes, onOpenNote, onDelete }) {
  const [sortCol, setSortCol] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");

  const readingNotes = notes.filter((n) => n.type === "reading");

  const sorted = [...readingNotes].sort((a, b) => {
    let va, vb;
    if (sortCol === "title") { va = a.title?.toLowerCase() || ""; vb = b.title?.toLowerCase() || ""; }
    else if (sortCol === "author") {
      va = a.quotes?.[0]?.author?.toLowerCase() || ""; vb = b.quotes?.[0]?.author?.toLowerCase() || "";
    }
    else if (sortCol === "quotes") { va = a.quotes?.length || 0; vb = b.quotes?.length || 0; }
    else if (sortCol === "updatedAt") { va = a.updatedAt || ""; vb = b.updatedAt || ""; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const thStyle = (col) => ({
    padding: "10px 14px", textAlign: "left", fontFamily: "'DM Mono', monospace",
    fontSize: "10px", color: sortCol === col ? "#8b7355" : "#b0a898",
    textTransform: "uppercase", letterSpacing: "1px", cursor: "pointer",
    userSelect: "none", whiteSpace: "nowrap", borderBottom: "2px solid #e8e3db",
    background: "#faf8f5",
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#faf7f2" }}>
      {readingNotes.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#b0a898", fontFamily: "'Lora', serif", fontSize: "14px" }}>
          Nessuna nota di lettura ancora.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle("title")} onClick={() => toggleSort("title")}>Titolo{arrow("title")}</th>
              <th style={thStyle("author")} onClick={() => toggleSort("author")}>Autore / libro{arrow("author")}</th>
              <th style={{ ...thStyle("quotes"), textAlign: "center" }} onClick={() => toggleSort("quotes")}>Cit.{arrow("quotes")}</th>
              <th style={thStyle("tags")}>Tag</th>
              <th style={thStyle("updatedAt")} onClick={() => toggleSort("updatedAt")}>Modificata{arrow("updatedAt")}</th>
              <th style={{ ...thStyle(""), cursor: "default", width: "32px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((n) => {
              const authors = [...new Set((n.quotes || []).map((q) => q.author).filter(Boolean))];
              const books = [...new Set((n.quotes || []).map((q) => q.bookTitle).filter(Boolean))];
              const authorStr = authors.slice(0, 2).join(", ") + (authors.length > 2 ? "…" : "");
              const bookStr = books.slice(0, 1).join("") + (books.length > 1 ? ` +${books.length - 1}` : "");
              const subtitle = [authorStr, bookStr].filter(Boolean).join(" · ");
              return (
                <tr key={n.id}
                  onClick={() => onOpenNote(n)}
                  style={{ cursor: "pointer", borderBottom: "1px solid #ede8e0", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "11px 14px", fontFamily: "'Playfair Display', serif", fontSize: "13px", fontWeight: "600", color: "#2c2416", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📖 {n.title || "Senza titolo"}
                  </td>
                  <td style={{ padding: "11px 14px", fontFamily: "'Lora', serif", fontSize: "12px", color: "#6b5e4e", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {subtitle || <span style={{ color: "#c0b8ae", fontStyle: "italic" }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#8b7355" }}>
                    {n.quotes?.length || 0}
                  </td>
                  <td style={{ padding: "11px 14px", maxWidth: "160px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "nowrap", overflow: "hidden" }}>
                      {(n.tags || []).slice(0, 3).map((t) => (
                        <span key={t} style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", background: "#f0ece4", padding: "1px 6px", borderRadius: "10px", whiteSpace: "nowrap" }}>#{t}</span>
                      ))}
                      {(n.tags || []).length > 3 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898" }}>+{n.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898", whiteSpace: "nowrap" }}>
                    {formatDate(n.updatedAt)}
                  </td>
                  <td style={{ padding: "11px 8px" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d0c8be", fontSize: "13px", padding: "2px 4px", borderRadius: "3px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#c4a08a")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#d0c8be")}
                    >✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Today Panel ──────────────────────────────────────────────────────────────

function TodayPanel({ notes, onOpenNote, onCreateNote }) {
  const today = new Date();
  const todayStr = today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const todayDate = today.toDateString();

  // Notes created or modified today
  const todayNotes = notes.filter((n) => {
    const updated = new Date(n.updatedAt || n.createdAt);
    return updated.toDateString() === todayDate;
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Only todos with a due date of today or earlier (not done)
  const todayISO = today.toISOString().slice(0, 10);
  const dueTodos = notes
    .filter((n) => n.type === "todo" || n.type === "meeting")
    .flatMap((n) => {
      const items = n.type === "todo" ? (n.todos || []) : (n.actions || []);
      return items
        .filter((t) => !t.done && t.due && t.due <= todayISO)
        .map((t) => ({ ...t, noteTitle: n.title || "Senza titolo", note: n }));
    })
    .sort((a, b) => a.due.localeCompare(b.due));

  // Also include whole todo notes with a note-level due date
  const dueNotes = notes.filter((n) => n.type === "todo" && n.dueDate && n.dueDate <= todayISO && (n.todos || []).some((t) => !t.done));

  const typeIcon = { text: "✏️", todo: "☑", reading: "📖", quick: "⚡", meeting: "📋", journal: "📓" };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#faf7f2", padding: "40px 48px", maxWidth: "680px", margin: "0 auto", width: "100%" }}>

      {/* Header */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#b0a898", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>
          {today.toLocaleDateString("it-IT", { year: "numeric" })}
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "32px", fontWeight: "700", color: "#2c2416", letterSpacing: "-0.5px", textTransform: "capitalize" }}>
          {todayStr}
        </div>
      </div>

      {/* Pending todos */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
          ☑ Da fare
          {(dueTodos.length + dueNotes.length) > 0 && (
            <span style={{ background: "#c47a30", color: "white", borderRadius: "10px", padding: "1px 7px", fontSize: "9px" }}>
              {dueTodos.length + dueNotes.length}
            </span>
          )}
        </div>
        {dueTodos.length === 0 && dueNotes.length === 0 ? (
          <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", color: "#c0b8ae", fontStyle: "italic" }}>
            Nessuna scadenza per oggi — ottimo!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {/* Note-level due dates */}
            {dueNotes.map((n) => {
              const pending = (n.todos || []).filter((t) => !t.done).length;
              const isOverdue = n.dueDate < todayISO;
              return (
                <div key={n.id} onClick={() => onOpenNote(n)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", borderRadius: "7px", cursor: "pointer", transition: "background 0.12s", background: isOverdue ? "#fdf5f5" : "#fdfaf3", border: `1px solid ${isOverdue ? "#f0d0d0" : "#f0e8c8"}`, marginBottom: "4px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  <span style={{ fontSize: "16px" }}>☑</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "14px", fontWeight: "600", color: "#2c2416" }}>{n.title || "Senza titolo"}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: isOverdue ? "#c04040" : "#b07030" }}>
                      {isOverdue ? "⚠ scaduta il " : "⏰ scade oggi · "}{new Date(n.dueDate).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · {pending} da completare
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Item-level due dates */}
            {dueTodos.map((t) => {
              const isOverdue = t.due < todayISO;
              return (
                <div key={t.id} onClick={() => onOpenNote(t.note)}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "8px 12px", borderRadius: "7px", cursor: "pointer", transition: "background 0.12s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f0ede8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: "16px", height: "16px", border: `2px solid ${isOverdue ? "#e08080" : "#d4b870"}`, borderRadius: "4px", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", color: "#2c2416" }}>{t.text}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: isOverdue ? "#c04040" : "#b07030", marginTop: "2px" }}>
                      {isOverdue ? "⚠ scaduto · " : "⏰ oggi · "}{t.noteTitle}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #e8e3db", marginBottom: "40px" }} />

      {/* Today's notes */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px" }}>
          ✏️ Attività di oggi
        </div>
        {todayNotes.length === 0 ? (
          <div style={{ fontFamily: "'Lora', serif", fontSize: "14px", color: "#c0b8ae", fontStyle: "italic" }}>
            Nessuna nota creata o modificata oggi.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {todayNotes.map((n) => {
              const preview = n.type === "reading"
                ? `${n.quotes?.length || 0} citazioni`
                : n.type === "todo"
                  ? `${(n.todos || []).filter((t) => !t.done).length} da fare`
                  : (n.content || "").replace(/<[^>]+>/g, "").slice(0, 60);
              const time = new Date(n.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={n.id} onClick={() => onOpenNote(n)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "7px", cursor: "pointer", transition: "background 0.12s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f0ede8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: "16px", flexShrink: 0 }}>{typeIcon[n.type] || "✏️"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "14px", fontWeight: "600", color: "#2c2416", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title || "Senza titolo"}
                    </div>
                    {preview && (
                      <div style={{ fontFamily: "'Lora', serif", fontSize: "12px", color: "#9a8f82", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {preview}
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#c0b8ae", flexShrink: 0 }}>{time}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ borderTop: "1px solid #e8e3db", paddingTop: "28px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {[
          { label: "⚡ Nota rapida", action: "quick" },
          { label: "📓 Journal", action: "tpl-journal" },
          { label: "☑ To-do", action: "todo" },
        ].map(({ label, action }) => (
          <button key={action} onClick={() => onCreateNote(action)}
            style={{ background: "#fff", border: "1px solid #e0d8cc", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#6b5e4e", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f0e8"; e.currentTarget.style.borderColor = "#c4a882"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0d8cc"; }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}


// ─── Reset Demo Button ────────────────────────────────────────────────────────

function ResetDemoButton() {
  const [confirming, setConfirming] = useState(false);
  if (confirming) return (
    <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "9px", color: "#c4a08a", fontFamily: "'DM Mono', monospace" }}>sicuro?</span>
      <button onMouseDown={() => { localStorage.clear(); window.location.reload(); }}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "9px", color: "#c4a08a", fontFamily: "'DM Mono', monospace", textDecoration: "underline", padding: 0 }}>sì</button>
      <button onClick={() => setConfirming(false)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "9px", color: "#6a5e4e", fontFamily: "'DM Mono', monospace", padding: 0 }}>no</button>
    </div>
  );
  return (
    <div onClick={() => setConfirming(true)}
      style={{ fontSize: "9px", color: "#4a3d2e", fontFamily: "'DM Mono', monospace", marginTop: "6px", cursor: "pointer", textDecoration: "underline" }}>
      reset demo
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const sendMagicLink = async () => {
    if (!email.trim()) return;
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8", fontFamily: "'Lora', serif" }}>
      <div style={{ width: "min(360px, 90vw)", background: "#fff", borderRadius: "16px", padding: "40px 36px", boxShadow: "0 8px 40px rgba(0,0,0,0.1)" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "28px", fontWeight: "700", color: "#2c2416", marginBottom: "6px" }}>
          Note<span style={{ color: "#c4a882" }}>S</span>
        </div>
        <div style={{ fontSize: "13px", color: "#9a8f82", marginBottom: "32px" }}>le tue idee, sempre con te</div>

        {sent ? (
          <div>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>📬</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "17px", fontWeight: "600", color: "#2c2416", marginBottom: "10px" }}>Controlla la tua email</div>
            <div style={{ fontSize: "13px", color: "#6b5e4e", lineHeight: "1.6" }}>
              Abbiamo inviato un link di accesso a <strong>{email}</strong>.<br />Clicca il link per entrare — nessuna password necessaria.
            </div>
            <button onClick={() => setSent(false)} style={{ marginTop: "20px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#b0a898", textDecoration: "underline" }}>
              Usa un altro indirizzo
            </button>
          </div>
        ) : (
          <div>
            <label style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: "8px" }}>
              Il tuo indirizzo email
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
              placeholder="nome@esempio.com" autoFocus
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #e0d8cc", borderRadius: "8px", fontFamily: "'Lora', serif", fontSize: "14px", outline: "none", marginBottom: "14px", boxSizing: "border-box", color: "#2c2416" }}
            />
            {error && <div style={{ fontSize: "12px", color: "#c04040", marginBottom: "10px", fontFamily: "'DM Mono', monospace" }}>{error}</div>}
            <button onClick={sendMagicLink} disabled={loading || !email.trim()}
              style={{ width: "100%", background: loading ? "#d0c0a8" : "#8b7355", border: "none", borderRadius: "8px", padding: "11px", cursor: loading ? "default" : "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "white", transition: "background 0.2s" }}>
              {loading ? "Invio in corso…" : "Invia link di accesso →"}
            </button>
            <div style={{ marginTop: "20px", fontSize: "11px", color: "#b0a898", fontFamily: "'DM Mono', monospace", textAlign: "center" }}>
              Nessuna password · accesso sicuro via email
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Export / Import ──────────────────────────────────────────────────────────

function noteToMarkdown(note) {
  const date = new Date(note.updatedAt).toLocaleDateString("it-IT");
  const tags = (note.tags || []).map((t) => `#${t}`).join(" ");
  let md = `# ${note.title || "Senza titolo"}
`;
  if (tags) md += `${tags}
`;
  md += `_${date}_

`;

  if (note.type === "text" || note.type === "quick") {
    md += (note.content || "")
      .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<em>(.*?)<\/em>/gi, "_$1_")
      .replace(/<u>(.*?)<\/u>/gi, "$1")
      .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<p>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "---\n")
      .replace(/<[^>]+>/g, "")
      .trim();
  } else if (note.type === "todo") {
    (note.todos || []).forEach((t) => {
      md += `- [${t.done ? "x" : " "}] ${t.text}`;
      if (t.due) md += ` _(entro ${new Date(t.due).toLocaleDateString("it-IT")})_`;
      md += "\n";
    });
  } else if (note.type === "reading") {
    (note.quotes || []).forEach((q) => {
      if (q.author || q.bookTitle) md += `> **${[q.author, q.bookTitle].filter(Boolean).join(" — ")}**\n`;
      md += `> ${q.text}\n`;
      if (q.comment) md += `\n${q.comment}\n`;
      md += "\n---\n\n";
    });
  } else if (note.type === "meeting") {
    md += (note.content || "").replace(/<[^>]+>/g, "").trim() + "\n\n";
    if ((note.actions || []).length > 0) {
      md += "## Azioni\n";
      (note.actions || []).forEach((a) => {
        md += `- [${a.done ? "x" : " "}] ${a.text}`;
        if (a.due) md += ` _(entro ${new Date(a.due).toLocaleDateString("it-IT")})_`;
        md += "\n";
      });
    }
  } else if (note.type === "journal") {
    (note.entries || []).sort((a, b) => b.date.localeCompare(a.date)).forEach((e) => {
      const d = new Date(e.date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      md += `## ${d}\n\n${e.content || ""}\n\n---\n\n`;
    });
  }
  return md;
}

function noteToTxt(note) {
  return noteToMarkdown(note)
    .replace(/^#+\s/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^- /gm, "• ")
    .replace(/^> /gm, "  ");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function slugify(str) {
  return (str || "nota").toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
}

function ExportImportPanel({ notes, folders, onImport, onClose, onSaveApiKey, currentApiKey }) {
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(currentApiKey || '');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const fileInputRef = useRef();

  const exportAllJSON = () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), notes, folders };
    downloadFile(JSON.stringify(data, null, 2), `notes-backup-${new Date().toISOString().slice(0,10)}.json`, "application/json");
  };

  const exportAllMarkdown = () => {
    // Export as a single .md file with all notes separated by ---
    const md = notes.map((n) => noteToMarkdown(n)).join("\n\n---\n\n");
    downloadFile(md, `notes-export-${new Date().toISOString().slice(0,10)}.md`, "text/markdown");
  };

  const exportAllTxt = () => {
    const txt = notes.map((n) => noteToTxt(n)).join("\n\n══════════════════════\n\n");
    downloadFile(txt, `notes-export-${new Date().toISOString().slice(0,10)}.txt`, "text/plain");
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null); setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.notes || !Array.isArray(data.notes)) throw new Error("Formato non valido");
        onImport(data.notes, data.folders || []);
        setImportSuccess(true);
      } catch (err) {
        setImportError(err.message || "Errore nel file");
      }
    };
    reader.readAsText(file);
  };

  const btnStyle = {
    width: "100%", border: "1px solid #e0d8cc", borderRadius: "7px",
    padding: "9px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
    fontSize: "11px", color: "#6b5e4e", background: "#fff",
    display: "flex", alignItems: "center", gap: "8px",
    transition: "all 0.15s", textAlign: "left",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: "14px", padding: "28px 28px 24px", width: "min(380px, 92vw)", boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "18px", fontWeight: "700", color: "#2c2416" }}>Export / Import</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#b0a898" }}>×</button>
        </div>

        {/* Export all */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>
            Esporta tutte le note ({notes.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            <button style={btnStyle} onClick={exportAllJSON}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f2"; e.currentTarget.style.borderColor = "#c4a882"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0d8cc"; }}>
              <span style={{ fontSize: "16px" }}>📦</span>
              <div><div style={{ fontWeight: "500" }}>JSON</div><div style={{ fontSize: "10px", color: "#b0a898" }}>Backup completo — reimportabile</div></div>
            </button>
            <button style={btnStyle} onClick={exportAllMarkdown}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f2"; e.currentTarget.style.borderColor = "#c4a882"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0d8cc"; }}>
              <span style={{ fontSize: "16px" }}>📝</span>
              <div><div style={{ fontWeight: "500" }}>Markdown</div><div style={{ fontSize: "10px", color: "#b0a898" }}>Per Obsidian, Bear, Typora</div></div>
            </button>
            <button style={btnStyle} onClick={exportAllTxt}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f2"; e.currentTarget.style.borderColor = "#c4a882"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e0d8cc"; }}>
              <span style={{ fontSize: "16px" }}>📄</span>
              <div><div style={{ fontWeight: "500" }}>TXT</div><div style={{ fontSize: "10px", color: "#b0a898" }}>Testo semplice, universale</div></div>
            </button>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f0ede8", marginBottom: "20px" }} />

        {/* Audio API Key */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>
            🎙 API Key per note audio
          </div>
          <input type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder="sk-ant-..."
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0d8cc", borderRadius: "7px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#2c2416", outline: "none", boxSizing: "border-box", marginBottom: "7px" }}
          />
          <button onClick={() => { onSaveApiKey(localApiKey); setApiKeySaved(true); setTimeout(() => setApiKeySaved(false), 2000); }}
            style={{ background: "#8b7355", border: "none", borderRadius: "6px", padding: "6px 16px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "white" }}>
            {apiKeySaved ? "✓ salvata" : "Salva"}
          </button>
          <div style={{ marginTop: "6px", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#b0a898" }}>
            La chiave è salvata solo in locale nel tuo browser.
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f0ede8", marginBottom: "20px" }} />

        {/* Import */}
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#8b7355", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>
            Importa da JSON
          </div>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          <button style={{ ...btnStyle, borderStyle: "dashed" }} onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
            <span style={{ fontSize: "16px" }}>📂</span>
            <div><div style={{ fontWeight: "500" }}>Seleziona file .json</div><div style={{ fontSize: "10px", color: "#b0a898" }}>Le note esistenti verranno mantenute</div></div>
          </button>
          {importError && <div style={{ marginTop: "8px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#c04040" }}>⚠ {importError}</div>}
          {importSuccess && <div style={{ marginTop: "8px", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#5a9060" }}>✓ Importazione completata</div>}
        </div>
      </div>
    </div>
  );
}


// ─── Export single note button ────────────────────────────────────────────────

function ExportNoteButton({ note }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!note) return null;
  const name = slugify(note.title);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        title="Esporta questa nota"
        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#b0a898", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#8b7355")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#b0a898")}>
        ↑ esporta
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #e0d8cc", borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 300, minWidth: "160px", overflow: "hidden" }}>
          {[
            { label: "📦 JSON",     action: () => downloadFile(JSON.stringify(note, null, 2), `${name}.json`, "application/json") },
            { label: "📝 Markdown", action: () => downloadFile(noteToMarkdown(note), `${name}.md`, "text/markdown") },
            { label: "📄 TXT",      action: () => downloadFile(noteToTxt(note), `${name}.txt`, "text/plain") },
          ].map(({ label, action }) => (
            <div key={label} onMouseDown={() => { action(); setOpen(false); }}
              style={{ padding: "9px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#6b5e4e" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#faf7f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Editor Delete Button ─────────────────────────────────────────────────────

function EditorDeleteButton({ activeNote, deleteNote, isMobile, setMobileView }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [activeNote?.id]);

  if (!activeNote) return null;

  if (confirming) {
    return (
      <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "#c4a08a" }}>eliminare?</span>
        <button
          onClick={() => { deleteNote(activeNote.id); if (isMobile) setMobileView("list"); }}
          style={{ background: "#c4a08a", border: "none", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", color: "white", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>
          sì
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#b0a898", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>
          no
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)}
      style={{ background: "none", border: "none", cursor: "pointer", color: "#c4a08a", fontSize: "12px", fontFamily: "'DM Mono', monospace" }}>
      ✕ elimina
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const LS_NOTES   = "notes_app_v1";
const LS_FOLDERS = "notes_folders_v1";

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export default function NotesApp() {
  const [notes,   setNotes]   = useState(() => loadLS(LS_NOTES,   SAMPLE_NOTES));
  const [folders, setFolders] = useState(() => loadLS(LS_FOLDERS, FOLDERS));
  const [activeFolder, setActiveFolder] = useState("all");
  const [activeNote,   setActiveNote]   = useState(null);
  const [search,       setSearch]       = useState("");
  const [activeTags,   setActiveTags]   = useState([]);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [listOpen,     setListOpen]     = useState(true);
  const [listView,     setListView]     = useState("cards");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderInput,     setNewFolderInput]     = useState("");
  const [showNewMenu,  setShowNewMenu]  = useState(false);
  const [menuAnchor,   setMenuAnchor]   = useState(null);
  const [saveStatus,   setSaveStatus]   = useState("saved");
  const [previewNote,  setPreviewNote]  = useState(null);
  const [showExport,   setShowExport]   = useState(false);
  const [audioApiKey,  setAudioApiKey]  = useState(() => { try { return localStorage.getItem('notes_anthropic_key') || ''; } catch { return ''; } });
  const [sortOrder,    setSortOrder]    = useState("updated"); // updated | created | alpha

  // ── Auth state ──
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail,   setAuthEmail]   = useState("");
  const [authSent,    setAuthSent]    = useState(false);
  const [authError,   setAuthError]   = useState(null);

  // ── Auth: listen for session changes ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Pull from Supabase on login ──
  useEffect(() => {
    if (!user) return;
    pullFromSupabase(user.id).then((remote) => {
      if (!remote) return;
      // Merge: remote wins if updated_at is newer, else keep local
      setNotes((local) => {
        const localMap = Object.fromEntries(local.map((n) => [n.id, n]));
        const remoteMap = Object.fromEntries(remote.notes.map((n) => [n.id, n]));
        const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
        return [...allIds].map((id) => {
          const l = localMap[id], r = remoteMap[id];
          if (!l) return r;
          if (!r) return l;
          return new Date(l.updatedAt) >= new Date(r.updatedAt) ? l : r;
        });
      });
      if (remote.folders.length > 0) setFolders(remote.folders);
    });
  }, [user?.id]);

  // ── Persist to localStorage (always) + sync to Supabase (when online + logged in) ──
  const syncTimerRef = useRef(null);
  useEffect(() => {
    setSaveStatus("saving");
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LS_NOTES,   JSON.stringify(notes));
        localStorage.setItem(LS_FOLDERS, JSON.stringify(folders));
        setSaveStatus("saved");
      } catch { setSaveStatus("error"); }
    }, 500);
    return () => clearTimeout(t);
  }, [notes, folders]);

  // Background Supabase sync (debounced, non-blocking)
  const pendingSyncRef = useRef(new Set());
  const syncNote = useCallback((note) => {
    if (!user) return;
    clearTimeout(syncTimerRef.current);
    pendingSyncRef.current.add(note.id);
    syncTimerRef.current = setTimeout(() => {
      const ids = [...pendingSyncRef.current];
      pendingSyncRef.current.clear();
      ids.forEach((id) => {
        const n = notes.find((x) => x.id === id);
        if (n) syncNoteToSupabase(n, user.id);
      });
      folders.forEach((f, i) => syncFolderToSupabase(f, user.id, i));
    }, 2000);
  }, [user, notes, folders]);

  const tagFrequency = notes.reduce((acc, n) => {
    const noteTags = [...(n.tags || []), ...(n.type === "reading" ? (n.quotes || []).flatMap((q) => q.tags || []) : [])];
    noteTags.forEach((t) => { acc[t] = (acc[t] || 0) + 1; });
    return acc;
  }, {});

  const allTags = Object.entries(tagFrequency).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const toggleTag = (t) => setActiveTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const folderNames = folders.map((f) => f.name);

  const filtered = notes.filter((n) => {
    const inFolder = activeFolder === "all" || n.folder === activeFolder;
    const bodyText = n.type === "reading"
      ? (n.quotes || []).map((q) => q.text + " " + (q.comment || "")).join(" ")
      : (n.content || "").replace(/<[^>]+>/g, "") + (n.todos || []).map((t) => t.text).join(" ");
    const inSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || bodyText.toLowerCase().includes(search.toLowerCase());
    const allItemTags = [...(n.tags || []), ...(n.type === "reading" ? (n.quotes || []).flatMap((q) => q.tags || []) : [])];
    const inTag = activeTags.length === 0 || activeTags.every((at) => allItemTags.includes(at));
    return inFolder && inSearch && inTag;
  }).sort((a, b) => {
    if (sortOrder === "alpha")   return (a.title || "").localeCompare(b.title || "", "it");
    if (sortOrder === "created") return new Date(b.createdAt) - new Date(a.createdAt);
    return new Date(b.updatedAt) - new Date(a.updatedAt); // default: updated
  });

  const createNote = (action) => {
    const folder = activeFolder === "all" ? "Generale" : activeFolder;
    let n;
    if (action === "quick") n = { id: generateId(), title: "", type: "quick", folder, tags: [], content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    else if (action === "text") n = { id: generateId(), title: "", type: "text", folder, tags: [], content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    else if (action === "todo") n = { id: generateId(), title: "", type: "todo", folder, tags: [], todos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    else if (action === "reading") n = { id: generateId(), title: "", type: "reading", folder: "Letture", tags: [], quotes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    else if (action.startsWith("tpl-")) {
      const tplId = action.replace("tpl-", "");
      if (tplId === "meeting") n = makeMeetingNote(folder);
      else if (tplId === "journal") {
        // If a journal note already exists, open it instead of creating a new one
        const existing = notes.find((x) => x.type === "journal");
        if (existing) { setActiveNote(existing); return; }
        n = makeJournalNote(folder);
      } else {
        const tpl = TEMPLATES.find((t) => t.id === tplId);
        if (!tpl) return;
        n = { id: generateId(), title: tpl.titlePrefix, type: tpl.type, folder, tags: [tpl.id], content: tpl.content || "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      }
    }
    if (n) { setNotes((prev) => [n, ...prev]); setActiveNote(n); if (user) syncNoteToSupabase(n, user.id); }
  };

  const updateNote = (updated) => {
    setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
    syncNote(updated);
  };

  const saveAudioApiKey = (key) => {
    setAudioApiKey(key);
    try { localStorage.setItem('notes_anthropic_key', key); } catch {}
  };

  const importData = (importedNotes, importedFolders) => {
    setNotes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const newNotes = importedNotes.filter((n) => !existingIds.has(n.id));
      return [...prev, ...newNotes];
    });
    if (importedFolders.length > 0) {
      setFolders((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const newFolders = importedFolders.filter((f) => !existingNames.has(f.name));
        return [...prev, ...newFolders];
      });
    }
  };

  const deleteNote = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveNote((prev) => prev?.id === id ? null : prev);
    if (user) deleteNoteFromSupabase(id);
  };

  const addFolder = () => {
    const name = newFolderInput.trim();
    if (!name || folders.some((f) => f.name === name)) return;
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length];
    setFolders((prev) => [...prev, { id: generateId(), name, color }]);
    setActiveFolder(name);
    setNewFolderInput("");
    setShowNewFolderModal(false);
  };

  // ── Responsive breakpoints ──
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1100;

  // Mobile view: "menu" | "list" | "editor"
  const [mobileView, setMobileView] = useState("list");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      const mod = navigator.platform.toUpperCase().includes("MAC") ? e.metaKey : e.ctrlKey;
      // Cmd+N — nuova nota rapida
      if (mod && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        createNote("quick");
        if (isMobile) setMobileView("editor");
      }
      // Cmd+K — focus ricerca
      if (mod && e.key === "k") {
        e.preventDefault();
        // Focus the search input in noteListJSX
        const input = document.querySelector("input[placeholder*='Cerca titolo']");
        if (input) { input.focus(); input.select(); }
        if (isMobile) setMobileView("list");
      }
      // Escape — deseleziona nota / chiudi preview
      if (e.key === "Escape") {
        if (previewNote) { setPreviewNote(null); return; }
        if (showExport)  { setShowExport(false);  return; }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [previewNote, showExport, isMobile]);

  const openNote = (n) => {
    setActiveNote(n);
    if (isMobile) setMobileView("editor");
  };


  // ── Shared sidebar JSX ──
  const sidebarJSX = (
    <div style={{ background: "#2c2416", color: "#e8e0d4", display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #3d3020" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div onClick={() => { setActiveNote(null); setDrawerOpen(false); }}
            style={{ fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: "700", letterSpacing: "-0.5px", color: "#f0e8d8", cursor: "pointer" }}
            title="Torna alla home">
            Note<span style={{ color: "#c4a882" }}>S</span>
          </div>
          {(isMobile || isTablet) && (
            <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7a6e5e", fontSize: "20px" }}>×</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
          <div style={{ fontSize: "10px", color: "#7a6e5e", fontFamily: "'DM Mono', monospace" }}>le tue idee, sempre con te</div>
          <button onClick={() => supabase.auth.signOut()} title="Esci"
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#4a3d2e", textDecoration: "underline" }}>
            esci
          </button>
        </div>
        <ResetDemoButton />
      </div>
      <div style={{ padding: "14px 12px", borderBottom: "1px solid #3d3020", position: "relative" }}>
        <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuAnchor({ top: r.bottom + 6, left: r.left }); setShowNewMenu((v) => !v); }} style={{ width: "100%", background: "#c4a882", border: "none", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#2c2416", fontWeight: "500", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          + Nuova nota <span style={{ fontSize: "9px", opacity: 0.6 }}>▼</span>
        </button>
        {showNewMenu && <NewNoteMenu onSelect={(a) => { createNote(a); setDrawerOpen(false); if (isMobile) setMobileView("editor"); }} onClose={() => { setShowNewMenu(false); setMenuAnchor(null); }} anchor={menuAnchor} />}
      </div>
      <FolderPanel
        folders={folders} setFolders={setFolders}
        activeFolder={activeFolder}
        setActiveFolder={(f) => { setActiveFolder(f); setDrawerOpen(false); if (isMobile) setMobileView("list"); }}
        notes={notes}
        onAddFolder={() => setShowNewFolderModal(true)}
      />
      <div style={{ padding: "12px 16px", borderTop: "1px solid #3d3020", marginTop: "auto" }}>
        <button onClick={() => setShowExport(true)}
          style={{ width: "100%", background: "none", border: "1px solid #4a3d2e", borderRadius: "6px", padding: "7px 12px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#7a6e5e", display: "flex", alignItems: "center", gap: "8px", transition: "all 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c4a882"; e.currentTarget.style.color = "#c4a882"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#4a3d2e"; e.currentTarget.style.color = "#7a6e5e"; }}>
          ↑↓ export / import
        </button>
      </div>
    </div>
  );

  const noteListJSX = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#faf7f2" }}>
      {/* Search bar */}
      <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#c0b8ae", fontSize: "12px" }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca titolo e contenuto..."
            style={{ width: "100%", padding: "7px 10px 7px 28px", background: "#f0ede8", border: "1px solid #e8e3db", borderRadius: "7px", color: "#2c2416", outline: "none", fontFamily: "'DM Mono', monospace", fontSize: "11px", boxSizing: "border-box" }}
          />
          {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#b0a898", fontSize: "14px" }}>×</span>}
        </div>
      </div>
      {/* Tags row */}
      {allTags.length > 0 && (
        <TagsInlineRow allTags={allTags} activeTags={activeTags} onToggle={toggleTag} onClear={() => setActiveTags([])} />
      )}
      {/* List toolbar */}
      <div style={{ padding: "8px 12px 8px", borderBottom: "1px solid #ede8e0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#9a8f82" }}>
          {filtered.length} {filtered.length === 1 ? "nota" : "note"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {/* Sort */}
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
            style={{ border: "none", background: "none", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#9a8f82", cursor: "pointer", outline: "none", padding: "2px 4px" }}>
            <option value="updated">recenti</option>
            <option value="created">creazione</option>
            <option value="alpha">A→Z</option>
          </select>
          {filtered.some((n) => n.type === "reading") && (
            <button onClick={() => setListView((v) => v === "cards" ? "table" : "cards")}
              title={listView === "cards" ? "Vista tabella" : "Vista card"}
              style={{ background: listView === "table" ? "#f0ede8" : "none", border: "none", cursor: "pointer", fontSize: "13px", color: listView === "table" ? "#8b7355" : "#b0a898", borderRadius: "4px", padding: "2px 5px" }}>
              {listView === "cards" ? "⊞" : "☰"}
            </button>
          )}
          {!isMobile && (
            <button onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? "Nascondi sidebar" : "Mostra sidebar"}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#b0a898", fontFamily: "'DM Mono', monospace", padding: "2px 4px" }}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
          )}
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0
          ? <div style={{ padding: "40px 20px", textAlign: "center", color: "#b0a898", fontFamily: "'Lora', serif", fontSize: "13px" }}>Nessuna nota trovata.</div>
          : filtered.map((n) => <NoteCard key={n.id} note={n} active={activeNote?.id === n.id} onClick={() => openNote(n)} onDelete={deleteNote} />)
        }
      </div>
    </div>
  );

  const editorJSX = (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {activeNote ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #e8e3db", background: "#fefcfa", flexShrink: 0 }}>
            {isMobile
              ? <button onClick={() => setMobileView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b0a898", fontSize: "13px", fontFamily: "'DM Mono', monospace" }}>‹ note</button>
              : <button onClick={() => setListOpen((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#b0a898", fontSize: "13px", fontFamily: "'DM Mono', monospace" }}>{listOpen ? "‹ nascondi lista" : "› mostra lista"}</button>
            }
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: saveStatus === "saving" ? "#c4a882" : saveStatus === "error" ? "#c47a6a" : "#b0c8b0", transition: "color 0.3s" }}>
              {saveStatus === "saving" ? "salvataggio…" : saveStatus === "error" ? "⚠ errore" : "✓ salvato"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ExportNoteButton note={activeNote} />
              <EditorDeleteButton activeNote={activeNote} deleteNote={deleteNote} isMobile={isMobile} setMobileView={setMobileView} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {activeNote.type === "reading"
              ? <ReadingEditor key={activeNote.id} note={activeNote} folders={folderNames} onUpdate={updateNote} allNotes={notes} onPreview={setPreviewNote} audioApiKey={audioApiKey} />
              : activeNote.type === "meeting"
                ? <MeetingEditor key={activeNote.id} note={activeNote} folders={folderNames} onUpdate={updateNote} allNotes={notes} onPreview={setPreviewNote} audioApiKey={audioApiKey} />
                : activeNote.type === "journal"
                  ? <JournalEditor key={activeNote.id} note={activeNote} folders={folderNames} onUpdate={updateNote} audioApiKey={audioApiKey} />
                  : <NoteEditor key={activeNote.id} note={activeNote} folders={folderNames} onUpdate={updateNote} allNotes={notes} onPreview={setPreviewNote} audioApiKey={audioApiKey} />
            }
          </div>
        </>
      ) : listView === "table" ? (
        <ReadingTableView notes={filtered} onOpenNote={openNote} onDelete={deleteNote} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center" }}>
          <TodayPanel notes={notes} onOpenNote={openNote} onCreateNote={(action) => { createNote(action); }} />
        </div>
      )}
    </div>
  );

  // ── Auth gate ──
  if (authLoading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8", fontFamily: "'Playfair Display', serif", fontSize: "24px", color: "#c4a882" }}>
      Note<span style={{ color: "#2c2416" }}>S</span>
    </div>
  );
  if (!user) return <AuthScreen />;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Lora', Georgia, serif", background: "#f5f0e8", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d0c8be; border-radius: 2px; }
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #c0b8ae; }
        [contenteditable] ul { padding-left: 20px; }
        [contenteditable] li { margin: 3px 0; }
      `}</style>

      {/* ── New folder modal ── */}
      {showNewFolderModal && (
        <div onClick={() => setShowNewFolderModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "min(320px, 90vw)", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "16px", fontWeight: "700", color: "#2c2416", marginBottom: "6px" }}>Nuova cartella</div>
            <div style={{ fontSize: "12px", color: "#a09080", fontFamily: "'Lora', serif", marginBottom: "16px" }}>
              Usa <code style={{ background: "#f0ede8", padding: "1px 5px", borderRadius: "3px" }}>Padre/Figlio</code> per creare una sottocartella.
            </div>
            <input autoFocus value={newFolderInput} onChange={(e) => setNewFolderInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addFolder(); if (e.key === "Escape") setShowNewFolderModal(false); }}
              placeholder="es. Letture o Letture/Filosofia"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #e0d8cc", borderRadius: "7px", fontFamily: "'Lora', serif", fontSize: "14px", outline: "none", marginBottom: "14px" }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewFolderModal(false)} style={{ background: "none", border: "1px solid #e0d8cc", borderRadius: "7px", padding: "7px 16px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#9a8f82" }}>Annulla</button>
              <button onClick={addFolder} style={{ background: "#8b7355", border: "none", borderRadius: "7px", padding: "7px 16px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "white" }}>Crea</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE ── */}
      {isMobile && (
        <>
          {drawerOpen && (
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: "80vw", maxWidth: "300px", height: "100%", position: "absolute", left: 0 }}>
                {sidebarJSX}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: "#2c2416", borderBottom: "1px solid #3d3020", flexShrink: 0, position: "relative", zIndex: 10, overflow: "visible" }}>
              <button onClick={() => setDrawerOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c4a882", fontSize: "20px", marginRight: "12px" }}>☰</button>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "18px", fontWeight: "700", color: "#f0e8d8", flex: 1 }}>Note<span style={{ color: "#c4a882" }}>S</span></div>
              <div style={{ position: "relative" }}>
                <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuAnchor({ top: r.bottom + 6, right: window.innerWidth - r.right }); setShowNewMenu((v) => !v); }}
                  style={{ background: "#c4a882", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#2c2416" }}>
                  + Nota
                </button>
                {showNewMenu && <NewNoteMenu onSelect={(a) => { createNote(a); setShowNewMenu(false); setMobileView("editor"); setMenuAnchor(null); }} onClose={() => { setShowNewMenu(false); setMenuAnchor(null); }} anchor={menuAnchor} />}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {mobileView === "list" && noteListJSX}
              {mobileView === "editor" && editorJSX}
            </div>
            <div style={{ display: "flex", borderTop: "1px solid #e0d8cc", background: "#faf7f2", flexShrink: 0 }}>
              {[{ view: "menu", icon: "☰", label: "Menu" }, { view: "list", icon: "📋", label: "Note" }, { view: "editor", icon: "✏️", label: "Aperta" }].map(({ view, icon, label }) => (
                <button key={view} onClick={() => view === "menu" ? setDrawerOpen(true) : setMobileView(view)}
                  style={{ flex: 1, border: "none", background: "none", cursor: "pointer", padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", color: mobileView === view ? "#8b7355" : "#b0a898", borderTop: mobileView === view ? "2px solid #8b7355" : "2px solid transparent" }}>
                  <span style={{ fontSize: "18px" }}>{icon}</span>
                  <span style={{ fontSize: "9px", fontFamily: "'DM Mono', monospace" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── TABLET ── */}
      {isTablet && (
        <>
          {drawerOpen && (
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: "260px", height: "100%", position: "absolute", left: 0 }}>
                {sidebarJSX}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <div style={{ width: "44px", flexShrink: 0, background: "#2c2416", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: "20px" }}>
              <button onClick={() => setDrawerOpen((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c4a882", fontSize: "18px" }}>☰</button>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "13px", fontWeight: "700", color: "#f0e8d8", writingMode: "vertical-rl", letterSpacing: "1px" }}>N<span style={{ color: "#c4a882" }}>S</span></div>
            </div>
            <div style={{ width: "260px", flexShrink: 0, borderRight: "1px solid #ddd8ce", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {noteListJSX}
            </div>
            {editorJSX}
          </div>
        </>
      )}

      {/* ── DESKTOP ── */}
      {!isMobile && !isTablet && (
        <>
          {sidebarOpen && <div style={{ width: "210px", flexShrink: 0 }}>{sidebarJSX}</div>}
          {listOpen && <div style={{ width: "260px", flexShrink: 0, borderRight: "1px solid #ddd8ce", overflow: "hidden" }}>{noteListJSX}</div>}
          {editorJSX}
        </>
      )}

      {/* ── Preview Panel ── */}
      {previewNote && (
        <>
          <div onClick={() => setPreviewNote(null)} style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,0.15)" }} />
          <NotePreviewPanel note={previewNote} allNotes={notes} onClose={() => setPreviewNote(null)} onNavigate={(n) => { setActiveNote(n); setPreviewNote(null); }} />
        </>
      )}
      {showExport && (
        <ExportImportPanel notes={notes} folders={folders} onImport={importData} onClose={() => setShowExport(false)} onSaveApiKey={saveAudioApiKey} currentApiKey={audioApiKey} />
      )}
    </div>
  );
}