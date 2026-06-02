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
const MODE_KEY = "jw-assistant-mode";

type Mode = "default" | "etude" | "pratique" | "apologetique" | "perle";

const MODES: { id: Mode; label: string; description: string }[] = [
  { id: "default", label: "Discussion", description: "Dialogue libre" },
  { id: "etude", label: "Étude", description: "Réflexion approfondie sur un sujet" },
  { id: "pratique", label: "Pratique", description: "Conseils concrets et applicables" },
  { id: "apologetique", label: "Apologétique", description: "Arguments pour défendre" },
  { id: "perle", label: "Perle", description: "Analyse verset par verset" },
];

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

function loadMode(): Mode {
  if (typeof window === "undefined") return "default";
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored && MODES.some((m) => m.id === stored)) return stored as Mode;
  } catch {}
  return "default";
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
  const [mode, setMode] = useState<Mode>("default");
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const loaded = loadConversations();
    setConversations(loaded);
    setMode(loadMode());
  }, []);

  function changeMode(newMode: Mode) {
    setMode(newMode);
    try {
      localStorage.setItem(MODE_KEY, newMode);
    } catch {}
  }

  // Detect scroll position to show/hide the floating scroll-to-bottom button.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    function update() {
      if (!container) return;
      const threshold = 200;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollDown(distanceFromBottom > threshold && messages.length > 0);
    }
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [messages.length]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Keep layout height in sync with the actual visible viewport.
  // On mobile, when the keyboard appears, the visual viewport shrinks.
  // We resize the layout so the header stays at the top and only the
  // messages area shrinks to make room for the keyboard.
  useEffect(() => {
    function update() {
      const h =
        window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    }
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  // Scroll only when user sends a new message (tied to their action).
  // When the assistant message is added or content streams, NO auto-scroll
  // at all — the screen stays exactly where it is.
  useEffect(() => {
    const newCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;

    if (newCount !== prevCount + 1) return;

    const lastMessage = messages[newCount - 1];
    if (lastMessage?.role === "user") {
      // Place the user's new message at the top of the messages container,
      // just under the header. Compute the scroll offset manually for reliability.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current;
          const el = lastMessageRef.current;
          if (!container || !el) return;
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const target = elRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: target, behavior: "smooth" });
        });
      });
    }
    // Assistant message added: do nothing (no scroll)
  }, [messages]);


  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxH = Math.floor(window.innerHeight * 0.5);
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, maxH) + "px";
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
    // Sync ref so the scroll effect doesn't treat this as a new message
    prevMessageCountRef.current = 0;
    setMessages([]);
    setSidebarOpen(false);
  }

  function openConversation(conv: Conversation) {
    setActiveId(conv.id);
    // Sync ref so loading messages from another conversation doesn't trigger scroll
    prevMessageCountRef.current = conv.messages.length;
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
          mode,
        }),
      });

      if (!response.ok) throw new Error("Erreur serveur");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Pas de stream");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let sourcesMap: Record<string, { title: string; url: string; external: boolean }> = {};

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
              if (parsed.sources && Array.isArray(parsed.sources)) {
                // Build the ID -> source map
                sourcesMap = {};
                for (const s of parsed.sources) {
                  sourcesMap[s.id] = {
                    title: s.title,
                    url: s.url,
                    external: !!s.external,
                  };
                }
              }
              if (parsed.text) {
                assistantContent += parsed.text;
                const resolved = resolveSourceIds(assistantContent, sourcesMap);
                setMessages([
                  ...newMessages,
                  { role: "assistant", content: resolved },
                ]);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
      // Final resolution after streaming (in case last chunk had partial pattern)
      assistantContent = resolveSourceIds(assistantContent, sourcesMap);

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
    <div
      className="flex w-full overflow-hidden bg-[#f8f7ff]"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
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
      <div className="flex flex-col flex-1 min-w-0 relative">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 py-4 flex items-center gap-4 shrink-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
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
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-[#3b3260] tracking-tight">
              Assistant Recherche
            </h1>
            <p className="text-xs text-gray-400 tracking-wide">
              Recherche sur jw.org et wol.jw.org
            </p>
          </div>
        </header>

        {/* Mode selector */}
        <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-3 py-2 shrink-0 z-10">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide max-w-full">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => changeMode(m.id)}
                title={m.description}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  mode === m.id
                    ? "bg-[#3b3260] text-white shadow-sm"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-[#3b3260]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
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
                {MODES.find((m) => m.id === mode)?.description ??
                  "Je recherche les informations sur jw.org et wol.jw.org pour vous fournir des réponses précises et sourcées."}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#3b3260]/60">
                Mode : {MODES.find((m) => m.id === mode)?.label}
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                return (
                <div
                  key={i}
                  ref={isLast ? lastMessageRef : undefined}
                  className={`flex message-enter ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-3xl px-6 py-4 ${
                      msg.role === "user"
                        ? "max-w-[85%] bg-gradient-to-br from-[#3b3260] to-[#4a4170] text-white/95 shadow-[0_4px_18px_rgba(59,50,96,0.22),0_1px_2px_rgba(59,50,96,0.08)]"
                        : "w-full bg-white text-gray-700 shadow-[0_1px_2px_rgba(59,50,96,0.04),0_8px_28px_rgba(59,50,96,0.06)]"
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
                );
              })}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start message-enter">
                  <div className="bg-white rounded-3xl px-6 py-4 shadow-[0_1px_2px_rgba(59,50,96,0.04),0_8px_28px_rgba(59,50,96,0.06)] flex items-center gap-3">
                    <img src="/livre-ouvert.gif" alt="Recherche..." className="w-8 h-8" />
                    <span className="text-sm text-[#3b3260]/50">Recherche en cours...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom floating button */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            aria-label="Descendre"
            className="float-in absolute right-4 sm:right-6 z-20 w-10 h-10 rounded-full bg-[#3b3260] text-white shadow-[0_4px_14px_rgba(59,50,96,0.35)] hover:bg-[#4a4170] hover:shadow-[0_6px_20px_rgba(59,50,96,0.45)] transition-all flex items-center justify-center"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)" }}
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
                strokeWidth={2.5}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        )}

        {/* Disclaimer */}
        <div className="bg-white/80 backdrop-blur-md px-4 pb-1 pt-2 shrink-0 z-10">
          <p className="text-[11px] text-gray-300 text-center max-w-2xl mx-auto leading-relaxed italic">
            Cet assistant peut commettre des erreurs. Veuillez toujours vous référer directement aux sources originales pour vérifier les informations.
          </p>
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white/80 backdrop-blur-md px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0 z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.02)]">
          <form
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto"
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
                  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
                  if (e.key === "Enter" && !e.shiftKey && !isMobile && !isLoading) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Posez votre question..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[#3b3260] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3b3260]/20 focus:border-[#3b3260]/30 focus:bg-white transition-all"
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

// Common abbreviations used by Gemini and other LLMs
const BIBLE_ABBREV: Record<string, number> = {
  "gn": 1, "ge": 1, "gen": 1,
  "ex": 2, "exo": 2,
  "lv": 3, "lev": 3,
  "nb": 4, "nbr": 4, "nbs": 4, "nu": 4, "nm": 4,
  "dt": 5, "deut": 5, "deu": 5,
  "jos": 6, "jg": 7, "rt": 8,
  "1s": 9, "1sa": 9, "1sam": 9,
  "2s": 10, "2sa": 10, "2sam": 10,
  "1r": 11, "1ro": 11, "2r": 12, "2ro": 12,
  "1ch": 13, "1chr": 13, "2ch": 14, "2chr": 14,
  "esd": 15, "ne": 16, "neh": 16, "est": 17,
  "ps": 19, "pr": 20, "prov": 20, "ec": 21, "eccl": 21, "ct": 22, "cant": 22,
  "is": 23, "isa": 23, "es": 23, "esa": 23,
  "jr": 24, "jer": 24, "lam": 25, "ez": 26, "eze": 26, "ezk": 26,
  "dn": 27, "dan": 27,
  "os": 28, "ose": 28, "jl": 29, "joel": 29, "am": 30,
  "ab": 31, "jon": 32, "mi": 33, "mic": 33,
  "na": 34, "nah": 34, "ha": 35, "hab": 35, "so": 36, "soph": 36,
  "ag": 37, "ag2": 37, "za": 38, "zac": 38, "ml": 39, "mal": 39,
  "mt": 40, "mat": 40, "matt": 40,
  "mc": 41, "mr": 41, "mar": 41,
  "lc": 42, "lu": 42, "luc": 42,
  "jn": 43, "jean": 43,
  "ac": 44, "act": 44, "actes": 44,
  "rm": 45, "rom": 45,
  "1co": 46, "1cor": 46, "2co": 47, "2cor": 47,
  "ga": 48, "gal": 48,
  "ep": 49, "eph": 49,
  "ph": 50, "phil": 50, "phl": 50,
  "col": 51,
  "1th": 52, "1thes": 52, "2th": 53, "2thes": 53,
  "1tm": 54, "1tim": 54, "2tm": 55, "2tim": 55,
  "tt": 56, "tit": 56,
  "phm": 57, "phlm": 57,
  "he": 58, "heb": 58,
  "jc": 59, "jac": 59, "jas": 59,
  "1p": 60, "1pi": 60, "1pe": 60, "2p": 61, "2pi": 61, "2pe": 61,
  "1jn": 62, "2jn": 63, "3jn": 64,
  "jud": 65, "jude": 65,
  "ap": 66, "apo": 66, "apoc": 66, "re": 66, "rev": 66, "rev2": 66,
};

function normalizeBookName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip diacritics (é → e, è → e, ç → c, etc.)
}

function resolveBookNumber(rawBookName: string): number | null {
  const normalized = normalizeBookName(rawBookName);

  // 1. Exact match against normalized BIBLE_BOOKS keys
  for (const [key, num] of Object.entries(BIBLE_BOOKS)) {
    if (normalizeBookName(key) === normalized) return num;
  }

  // 2. Common abbreviations (no spaces)
  const noSpace = normalized.replace(/\s/g, "");
  if (BIBLE_ABBREV[noSpace]) return BIBLE_ABBREV[noSpace];

  // 3. Abbreviations with space (e.g., "1 co")
  if (BIBLE_ABBREV[normalized]) return BIBLE_ABBREV[normalized];

  return null;
}

function buildVerseUrl(reference: string): string | null {
  // Permissive regex: "Book Chap:Verses" where Verses can be a list like
  // "12", "12-15", "12, 21, 24-26", etc. We extract the FIRST verse number
  // to build the anchor URL.
  const match = reference.match(/^(.+?)\s+(\d+)\s*[:,.]\s*(.+?)$/);
  if (!match) return null;

  const rawBookName = match[1];
  const chapter = match[2];
  const verseList = match[3];

  // First verse number in the verse list (the anchor target)
  const firstVerseMatch = verseList.match(/^\s*(\d+)/);
  if (!firstVerseMatch) return null;
  const verseStart = firstVerseMatch[1];

  const bookNum = resolveBookNumber(rawBookName);
  if (!bookNum) return null;

  return `https://wol.jw.org/fr/wol/b/r30/lp-f/nwtsty/${bookNum}/${chapter}#v${bookNum}:${chapter}:${verseStart}`;
}

function resolveSourceIds(
  text: string,
  sources: Record<string, { title: string; url: string; external: boolean }>
): string {
  if (!sources || Object.keys(sources).length === 0) return text;
  const allSources = Object.entries(sources).map(([id, s]) => ({ id, ...s }));

  return text.replace(/<<source:\s*([^>]+?)>>/g, (match, content: string) => {
    // Skip if already resolved (contains markdown link)
    if (/\]\(https?:\/\//.test(content)) return match;

    const trimmed = content.trim();

    // Path 1 — IDs only ("1", "E2", "1, 3")
    const tokens = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allLookLikeIds = tokens.every((t) => /^E?\d+$/i.test(t));

    if (allLookLikeIds) {
      const resolved = tokens
        .map((id) => sources[id])
        .filter(Boolean)
        .map((src) => {
          const tag = src.external ? " (source externe)" : "";
          return `<<source: [${src.title}${tag}](${src.url})>>`;
        });
      if (resolved.length > 0) return resolved.join(" ");
      return ""; // drop unknown IDs
    }

    // Path 2 — LLM wrote the title instead of an ID. Try to match.
    const lower = trimmed.toLowerCase();
    let best = allSources.find((s) => s.title.toLowerCase() === lower);
    if (!best) {
      best = allSources.find(
        (s) =>
          s.title.toLowerCase().includes(lower) ||
          lower.includes(s.title.toLowerCase())
      );
    }
    if (best) {
      const tag = best.external ? " (source externe)" : "";
      return `<<source: [${best.title}${tag}](${best.url})>>`;
    }

    // Last resort — drop the malformed citation
    return "";
  });
}

function renderTextWithVerses(text: string) {
  // Split by inline sources, {{Verse}}, [text](url), **bold**, *italic*
  const parts = text.split(/(<<source:.*?>>|\{\{[^}]+\}\}|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^\n]+?\*\*|(?<![*\w])\*[^\n*]+?\*(?![*\w]))/g);
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

    // Handle **bold** — recurse so inner verses/sources stay clickable
    if (/^\*\*[^\n]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold text-[#3b3260]">
          {renderTextWithVerses(part.slice(2, -2))}
        </strong>
      );
    }

    // Handle *italic* — recurse for the same reason
    if (/^\*[^\n*]+\*$/.test(part)) {
      return <em key={i}>{renderTextWithVerses(part.slice(1, -1))}</em>;
    }

    return <span key={i}>{part}</span>;
  });
}

function renderMarkdownBody(text: string) {
  // Split text into blocks (paragraphs, lists, sub-headings)
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let paraBuffer: string[] = [];
  let ulBuffer: string[] = [];
  let olBuffer: string[] = [];

  function flushPara() {
    if (paraBuffer.length === 0) return;
    const content = paraBuffer.join("\n");
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {renderTextWithVerses(content)}
      </p>
    );
    paraBuffer = [];
  }

  function flushUl() {
    if (ulBuffer.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${blocks.length}`}
        className="list-disc pl-5 space-y-1 my-1"
      >
        {ulBuffer.map((item, k) => (
          <li key={k} className="leading-relaxed">
            {renderTextWithVerses(item)}
          </li>
        ))}
      </ul>
    );
    ulBuffer = [];
  }

  function flushOl() {
    if (olBuffer.length === 0) return;
    blocks.push(
      <ol
        key={`ol-${blocks.length}`}
        className="list-decimal pl-5 space-y-1 my-1"
      >
        {olBuffer.map((item, k) => (
          <li key={k} className="leading-relaxed">
            {renderTextWithVerses(item)}
          </li>
        ))}
      </ol>
    );
    olBuffer = [];
  }

  function flushAll() {
    flushPara();
    flushUl();
    flushOl();
  }

  let pendingBlank = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const subHeadingMatch = line.match(/^#{2,4}\s*(.+)$/);

    if (subHeadingMatch) {
      flushAll();
      pendingBlank = false;
      blocks.push(
        <h4
          key={`h-${blocks.length}`}
          className="font-semibold text-[#3b3260] mt-3 mb-1"
        >
          {renderTextWithVerses(subHeadingMatch[1])}
        </h4>
      );
    } else if (ulMatch) {
      flushPara();
      flushOl();
      pendingBlank = false;
      ulBuffer.push(ulMatch[1]);
    } else if (olMatch) {
      flushPara();
      flushUl();
      pendingBlank = false;
      olBuffer.push(olMatch[1]);
    } else if (line.trim() === "") {
      pendingBlank = true;
    } else {
      // Non-list, non-empty line — breaks any pending list
      if (pendingBlank || ulBuffer.length > 0 || olBuffer.length > 0) {
        flushUl();
        flushOl();
      }
      pendingBlank = false;
      paraBuffer.push(line);
    }
  }
  flushAll();

  return <div className="space-y-2">{blocks}</div>;
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
    return <div className="text-sm text-gray-600">{renderMarkdownBody(content)}</div>;
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
            <div className="text-sm text-gray-600">
              {renderMarkdownBody(body)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
