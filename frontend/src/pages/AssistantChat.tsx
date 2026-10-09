import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AssistantChatProps = {
  dashboardPath: string;
  audience: "farmer" | "buyer";
};

type AssistantResponse = { answer: string; model?: string };
type AssistantStatus = {
  provider: string;
  configured: boolean;
  model: string;
};

const SUGGESTIONS = [
  "How can I improve soil health naturally?",
  "What should I check before choosing a crop?",
  "How can I reduce post-harvest losses?",
];

function AssistantChat({ dashboardPath, audience }: AssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);
  const [activeModel, setActiveModel] = useState("");
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let active = true;
    void apiRequest<AssistantStatus>("/api/assistant/status")
      .then((status) => {
        if (active) {
          setAssistantStatus(status);
          setActiveModel((current) => current || status.model);
        }
      })
      .catch(() => {
        if (active) setAssistantStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function sendMessage(event?: FormEvent<HTMLFormElement>, text = input) {
    event?.preventDefault();
    const question = text.trim();
    if (!question || loading) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const data = await apiRequest<AssistantResponse>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ messages: nextMessages.slice(-12) }),
      });
      if (data.model) setActiveModel(data.model);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Assistant request failed.");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(undefined, input);
    }
  }

  function clearConversation() {
    setMessages([]);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link to={dashboardPath} className="text-xl font-bold text-emerald-800">
              AgriGO
            </Link>
            <p className="text-sm text-slate-500">Agriculture Assistant</p>
          </div>
          <Link
            to={dashboardPath}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6">
        <section
          aria-label="Agriculture assistant chat"
          className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h1 className="font-semibold text-slate-900">Gemini AI Assistant</h1>
              <p className="text-sm text-slate-500">
                Practical agriculture guidance for {audience === "farmer" ? "farmers" : "buyers"}
              </p>
              <p
                className={`mt-1 text-xs font-medium ${
                  assistantStatus?.configured
                    ? "text-emerald-700"
                    : assistantStatus
                      ? "text-amber-700"
                      : "text-slate-500"
                }`}
                role="status"
              >
                {assistantStatus?.configured
                  ? `Gemini configured · ${activeModel || assistantStatus.model}`
                  : assistantStatus
                    ? "Gemini is not configured on the backend"
                    : "Checking Gemini connection…"}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearConversation}
                disabled={loading}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                New chat
              </button>
            )}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-[26rem] max-w-2xl flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                  🌱
                </div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Ask Gemini about agriculture
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                  Ask a question and continue with follow-ups. Share your crop, location,
                  soil, or growing conditions for more relevant guidance.
                </p>
                <div className="mt-7 grid w-full gap-3 sm:grid-cols-3">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void sendMessage(undefined, suggestion)}
                      disabled={loading}
                      className="rounded-xl border border-slate-200 p-3 text-left text-sm text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] ${
                      message.role === "user"
                        ? "rounded-br-md bg-emerald-700 text-white"
                        : "rounded-bl-md bg-slate-100 text-slate-800"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <p className="mb-1 text-xs font-semibold text-emerald-800">
                        Gemini · AgriGO
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start" role="status" aria-live="polite">
                <div className="rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  AgriGO is thinking…
                </div>
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          <div className="border-t border-slate-100 p-4 sm:px-6">
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <form onSubmit={(event) => void sendMessage(event)}>
              <label htmlFor="assistant-message" className="sr-only">
                Message the agriculture assistant
              </label>
              <div className="flex items-end gap-3 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                <textarea
                  ref={inputRef}
                  id="assistant-message"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a follow-up or start a new question…"
                  rows={2}
                  maxLength={4000}
                  disabled={loading}
                  className="max-h-40 min-h-[3rem] flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                Enter to send · Shift+Enter for a new line · AI can make mistakes; verify important advice.
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AssistantChat;
