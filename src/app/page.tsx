"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

const STORAGE_KEY = "jw-assistant-conversations";

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadConversations();
    setConversations(loaded);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  const persistMessages = useCallback(
    (id: string, msgs: Message[], convs: Conversation[]) => {
      const title =
        msgs.find((m) => m.role === "user")?.content.slice(0, 50) ||
        "Nouvelle conversation";
      const updated = convs.map((c) =>
        c.id === id
          ? { ...c, messages: msgs, title, updatedAt: Date.now() }
          : c
      );
      setConversations(updated);
      saveConversations(updated);
    },
    []
  );

  function startNewConversation() {
    const id = Date.now().toString();
    const newConv: Conversation = {
      id,
      title: "Nouvelle conversation",
      messages: [],
      updatedAt: Date.now(),
    };
    const updated = [newConv, ...conversations];
    setConversations(updated);
    saveConversations(updated);
    setActiveId(id);
    setMessages([]);
    setSidebarOpen(false);
  }

  function openConversation(conv: Conversation) {
    setActiveId(conv.id);
    setMessages(conv.messages);
    setSidebarOpen(false);
  }

  function startRenaming(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(title);
  }

  function saveRename(id: string) {
    if (editingTitle.trim()) {
      const updated = conversations.map((c) =>
        c.id === id ? { ...c, title: editingTitle.trim() } : c
      );
      setConversations(updated);
      saveConversations(updated);
    }
    setEditingId(null);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    saveConversations(updated);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    let currentId = activeId;
    let currentConvs = conversations;
    if (!currentId) {
      const id = Date.now().toString();
      const newConv: Conversation = {
        id,
        title: trimmed.slice(0, 50),
        messages: [],
        updatedAt: Date.now(),
      };
      currentConvs = [newConv, ...conversations];
      setConversations(currentConvs);
      saveConversations(currentConvs);
      currentId = id;
      setActiveId(id);
    }

    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          image: selectedImage || undefined,
        }),
      });

      if (!response.ok) throw new Error("Erreur serveur");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Pas de stream");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages([...newMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantContent += parsed.text;
                setMessages([
                  ...newMessages,
                  { role: "assistant", content: assistantContent },
                ]);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      const finalMessages = [
        ...newMessages,
        { role: "assistant" as const, content: assistantContent },
      ];
      setMessages(finalMessages);
      persistMessages(currentId, finalMessages, currentConvs);
    } catch {
      const errorMessages: Message[] = [
        ...newMessages,
        {
          role: "assistant",
          content: "Désolé, une erreur est survenue. Veuillez réessayer.",
        },
      ];
      setMessages(errorMessages);
      persistMessages(currentId, errorMessages, currentConvs);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSuggestedQuestion(question: string) {
    setInput(question);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex h-screen bg-[#f8f7ff]">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static z-30 h-full w-72 bg-[#3b3260] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-white/10">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center gap-2.5 px-4 py-3 bg-white/10 text-white/90 rounded-xl hover:bg-white/15 transition-all font-medium text-sm tracking-wide"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nouvelle conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-sm text-white/30 text-center mt-8 px-4">
              Aucune conversation
            </p>
          ) : (
            <div className="p-2 space-y-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-all ${
                    activeId === conv.id
                      ? "bg-white/15 text-white"
                      : "text-white/50 hover:bg-white/8 hover:text-white/70"
                  }`}
                >
                  <svg
                    className="w-4 h-4 shrink-0 opacity-40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                  {editingId === conv.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveRename(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="flex-1 bg-white/20 text-white text-sm rounded px-1.5 py-0.5 outline-none min-w-0"
                    />
                  ) : (
                    <span className="truncate flex-1">{conv.title}</span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => startRenaming(conv.id, conv.title, e)}
                      className="p-1 hover:text-white transition-all"
                      title="Renommer"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="p-1 hover:text-red-400 transition-all"
                      title="Supprimer"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Sidebar footer */}
        <div className="p-4 border-t border-white/10">
          <p className="text-[10px] text-white/20 text-center tracking-wider uppercase">
            Assistant Recherche
          </p>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-50"
          >
            <svg
              className="w-5 h-5 text-[#3b3260]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="w-10 h-10 bg-[#3b3260] rounded-xl flex items-center justify-center">
            <svg
              className="w-5 h-5 text-purple-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#3b3260] tracking-tight">
              Assistant Recherche
            </h1>
            <p className="text-xs text-gray-400 tracking-wide">
              Recherche sur jw.org et wol.jw.org
            </p>
          </div>
        </header>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 bg-[#3b3260] rounded-2xl flex items-center justify-center mb-6">
                <svg
                  className="w-10 h-10 text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-[#3b3260] mb-2 tracking-tight">
                Posez votre question
              </h2>
              <p className="text-gray-400 max-w-sm leading-relaxed text-sm">
                Je recherche les informations sur jw.org et wol.jw.org pour vous
                fournir des réponses précises et sourcées.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                      msg.role === "user"
                        ? "bg-[#3b3260] text-white/90"
                        : "bg-white border border-gray-100 text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <AssistantMessage
                        content={msg.content}
                        onSuggestedQuestion={handleSuggestedQuestion}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
                    <img src="/livre-ouvert.gif" alt="Recherche..." className="w-8 h-8" />
                    <span className="text-sm text-[#3b3260]/50">Recherche en cours...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-4 pb-1 pt-2 shrink-0">
          <p className="text-[11px] text-gray-300 text-center max-w-2xl mx-auto leading-relaxed italic">
            Cet assistant peut commettre des erreurs. Veuillez toujours vous référer directement aux sources originales pour vérifier les informations.
          </p>
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white px-5 py-4 shrink-0">
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto"
          >
            {selectedImage && (
              <div className="mb-2 relative inline-block">
                <img
                  src={selectedImage}
                  alt="Image jointe"
                  className="h-20 rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                >
                  x
                </button>
              </div>
            )}
            <div className="flex gap-3 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 hover:text-[#3b3260] hover:border-[#3b3260]/30 transition-all"
                disabled={isLoading}
                title="Ajouter une image"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Posez votre question..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[#3b3260] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3b3260]/20 focus:border-[#3b3260]/30 focus:bg-white transition-all"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !selectedImage)}
                className="bg-[#3b3260] text-white rounded-xl px-4 py-3 font-medium hover:bg-[#4a4170] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const BIBLE_BOOKS: Record<string, number> = {
  "genèse": 1, "exode": 2, "lévitique": 3, "nombres": 4, "deutéronome": 5,
  "josué": 6, "juges": 7, "ruth": 8, "1 samuel": 9, "2 samuel": 10,
  "1 rois": 11, "2 rois": 12, "1 chroniques": 13, "2 chroniques": 14,
  "esdras": 15, "néhémie": 16, "esther": 17, "job": 18, "psaumes": 19, "psaume": 19,
  "proverbes": 20, "ecclésiaste": 21, "cantique des cantiques": 22,
  "isaïe": 23, "ésaïe": 23, "jérémie": 24, "lamentations": 25, "ézéchiel": 26, "daniel": 27,
  "osée": 28, "joël": 29, "amos": 30, "abdias": 31, "jonas": 32, "michée": 33,
  "nahoum": 34, "habacuc": 35, "sophonie": 36, "aggée": 37, "zacharie": 38, "malachie": 39,
  "matthieu": 40, "marc": 41, "luc": 42, "jean": 43,
  "actes": 44, "romains": 45,
  "1 corinthiens": 46, "2 corinthiens": 47,
  "galates": 48, "éphésiens": 49, "philippiens": 50, "colossiens": 51,
  "1 thessaloniciens": 52, "2 thessaloniciens": 53,
  "1 timothée": 54, "2 timothée": 55, "tite": 56, "philémon": 57,
  "hébreux": 58, "jacques": 59,
  "1 pierre": 60, "2 pierre": 61,
  "1 jean": 62, "2 jean": 63, "3 jean": 64,
  "jude": 65, "révélation": 66, "apocalypse": 66,
};

function buildVerseUrl(reference: string): string | null {
  const match = reference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;

  const bookName = match[1].toLowerCase().trim();
  const chapter = match[2];
  const verseStart = match[3];
  const bookNum = BIBLE_BOOKS[bookName];

  if (!bookNum) return null;

  return `https://wol.jw.org/fr/wol/b/r30/lp-f/nwtsty/${bookNum}/${chapter}#v${bookNum}:${chapter}:${verseStart}`;
}

function renderTextWithVerses(text: string) {
  // Split by inline sources <<source: [Title](URL)>>, {{Verse}}, and [text](url)
  const parts = text.split(/(<<source:.*?>>|\{\{[^}]+\}\}|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, i) => {
    // Handle <<source: [Title](URL)>> inline sources
    const sourceMatch = part.match(/^<<source:\s*(.+?)>>$/);
    if (sourceMatch) {
      const sourceContent = sourceMatch[1];
      const links = [...sourceContent.matchAll(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g)];
      if (links.length > 0) {
        return (
          <span key={i} className="inline-flex flex-wrap items-center gap-1 ml-1">
            {links.map((link, j) => (
              <a
                key={j}
                href={link[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] bg-[#3b3260]/8 text-[#3b3260] px-2 py-0.5 rounded-full hover:bg-[#3b3260]/15 transition-colors"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {link[1]}
              </a>
            ))}
          </span>
        );
      }
      return null;
    }

    // Handle {{Verse}} format
    const verseMatch = part.match(/^\{\{(.+?)\}\}$/);
    if (verseMatch) {
      const ref = verseMatch[1];
      const url = buildVerseUrl(ref);
      return (
        <a
          key={i}
          href={url || `https://wol.jw.org/fr/wol/s/r30/lp-f?q=${encodeURIComponent(ref)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[#3b3260] font-medium underline decoration-purple-300 underline-offset-2 hover:decoration-[#3b3260] transition-colors"
        >
          {ref}
        </a>
      );
    }

    // Handle [text](url) markdown links
    const linkMatch = part.match(/\[(.+?)\]\((https?:\/\/[^)]+)\)/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#3b3260] font-medium underline decoration-purple-300 underline-offset-2 hover:decoration-[#3b3260] transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function AssistantMessage({
  content,
  onSuggestedQuestion,
}: {
  content: string;
  onSuggestedQuestion: (q: string) => void;
}) {
  const sections = content.split(/^## /m).filter(Boolean);

  if (sections.length <= 1) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="space-y-5">
      {sections.map((section, i) => {
        const lines = section.split("\n");
        const title = lines[0]?.trim();
        const body = lines.slice(1).join("\n").trim();

        if (!body) return null;

        if (title === "Questions suggérées") {
          const questions = body
            .split("\n")
            .map((l) => l.replace(/^[-*\d.]\s*/, "").trim())
            .filter(Boolean);
          return (
            <div key={i} className="pt-2 border-t border-gray-100">
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-3">
                {title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {questions.map((q, j) => (
                  <button
                    key={j}
                    onClick={() => onSuggestedQuestion(q)}
                    className="text-sm text-[#3b3260] bg-gray-50 hover:bg-[#3b3260] hover:text-white rounded-lg px-3.5 py-2 text-left transition-all border border-gray-100 hover:border-[#3b3260]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (title === "Sources") {
          const links = body.split("\n").filter((l) => l.trim());
          return (
            <div key={i} className="mt-3 bg-[#3b3260]/5 rounded-xl p-4 border border-[#3b3260]/10">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold text-[#3b3260] uppercase tracking-[0.15em] mb-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {title}
              </h3>
              <div className="space-y-2">
                {links.map((link, j) => {
                  const match = link.match(/\[(.+?)\]\((.+?)\)/);
                  if (match) {
                    return (
                      <a
                        key={j}
                        href={match[2]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-sm text-[#3b3260]/70 hover:text-[#3b3260] transition-colors group"
                      >
                        <svg
                          className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        <span className="truncate group-hover:underline">{match[1]}</span>
                      </a>
                    );
                  }
                  const rawUrl = link.replace(/^[-*]\s*/, "").trim();
                  const urlMatch = rawUrl.match(/(https?:\/\/[^\s]+)/);
                  if (urlMatch) {
                    return (
                      <a
                        key={j}
                        href={urlMatch[1]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-sm text-[#3b3260]/70 hover:text-[#3b3260] transition-colors group"
                      >
                        <svg
                          className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        <span className="truncate group-hover:underline">{rawUrl}</span>
                      </a>
                    );
                  }
                  return (
                    <p key={j} className="text-sm text-gray-400">
                      {rawUrl}
                    </p>
                  );
                })}
              </div>
            </div>
          );
        }

        return (
          <div key={i}>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-2">
              {title}
            </h3>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-600">
              {renderTextWithVerses(body)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
