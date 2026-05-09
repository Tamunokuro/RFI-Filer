import { useEffect, useRef, useState, useCallback, Fragment } from "react";
import api from "../api";
import toast from "../toast";
import { PaperClipIcon, XMarkIcon } from "@heroicons/react/24/outline";

const formatTimestamp = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
};

// ── URL linkification ─────────────────────────────────────────────────────────

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"']+)/g;
const URL_TEST_RE  = /^https?:\/\//;

function linkifySegment(text, keyBase) {
  return text.split(URL_SPLIT_RE).map((part, i) => {
    if (URL_TEST_RE.test(part)) {
      return (
        <a
          key={`${keyBase}-u${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 underline break-all hover:text-indigo-800 dark:hover:text-indigo-300"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

// ── @mention rendering ────────────────────────────────────────────────────────

function CommentBody({ text, memberNames = [] }) {
  if (!text) return null;

  let parts;
  if (memberNames.length > 0) {
    const sorted  = [...memberNames].sort((a, b) => b.length - a.length);
    const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    parts = text.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  } else {
    parts = text.split(/(@\S+)/g);
  }

  return (
    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 break-words">
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span
              key={i}
              className="font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded px-0.5"
            >
              {part.slice(1)}
            </span>
          );
        }
        return (
          <Fragment key={i}>{linkifySegment(part, i)}</Fragment>
        );
      })}
    </p>
  );
}

// ── Attachment display ────────────────────────────────────────────────────────

function AttachmentDisplay({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att) => {
        const isImage = att.content_type?.startsWith("image/");
        const isVideo = att.content_type?.startsWith("video/");

        if (isImage) {
          return (
            <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer">
              <img
                src={att.file_url}
                alt={att.original_filename}
                className="max-h-48 max-w-xs rounded-lg border border-gray-200 dark:border-gray-600 object-contain cursor-pointer hover:opacity-90 transition-opacity"
              />
            </a>
          );
        }

        if (isVideo) {
          return (
            <video
              key={att.id}
              controls
              className="max-h-48 max-w-xs rounded-lg border border-gray-200 dark:border-gray-600"
            >
              <source src={att.file_url} type={att.content_type} />
              <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                {att.original_filename}
              </a>
            </video>
          );
        }

        // Document / other — pill download link
        return (
          <a
            key={att.id}
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <PaperClipIcon className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate max-w-[200px]">{att.original_filename}</span>
          </a>
        );
      })}
    </div>
  );
}

// ── Pending-file preview chip ─────────────────────────────────────────────────

function PendingFileChip({ file, onRemove }) {
  const isImage = file.type.startsWith("image/");
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  return (
    <div className="relative group shrink-0">
      {isImage ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="h-16 w-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
        />
      ) : (
        <div className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-1 text-center">
          <PaperClipIcon className="h-5 w-5 text-gray-400 shrink-0" />
          <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate w-full leading-tight mt-0.5">
            {file.name}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow"
      >
        <XMarkIcon className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ALLOWED_ACCEPT =
  "image/*,video/*,application/pdf," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "text/csv";

const RfiDiscussion = ({ rfiId, projectId, targetCommentId, isClosed, onActivity }) => {
  const [comments, setComments]   = useState([]);
  const [body, setBody]           = useState("");
  const [posting, setPosting]     = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);

  // @mention state
  const [members, setMembers]           = useState([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery,  setMentionQuery]  = useState("");
  const [mentionStart,  setMentionStart]  = useState(0);
  const [mentionIndex,  setMentionIndex]  = useState(0);

  // highlight animation for deep-linked comment
  const [highlightedId, setHighlightedId] = useState(null);

  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const commentRefs  = useRef({});   // { [commentId]: DOMElement }

  // ── Fetch project members for @mentions ───────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    api
      .get(`/api/projects/${projectId}/members/`)
      .then(({ data }) => {
        const list = Array.isArray(data)
          ? data
              .map((m) => ({ id: m.member?.id ?? m.id, name: m.member?.name ?? m.name }))
              .filter((m) => m.name)
          : [];
        setMembers(list);
      })
      .catch(() => {});
  }, [projectId]);

  const memberNames = members.map((m) => m.name);
  const filteredMembers = mentionActive
    ? members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  // ── Comments fetch & polling ──────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/rfis/${rfiId}/comments/`);
      setComments(data);
      setLoadError("");
    } catch {
      setLoadError("Unable to load discussion.");
    }
  }, [rfiId]);

  const markRead = useCallback(async () => {
    try {
      await api.post(`/api/rfis/${rfiId}/mark-read/`);
      if (onActivity) onActivity();
    } catch { /* silent */ }
  }, [rfiId, onActivity]);

  useEffect(() => { fetchComments(); markRead(); }, [fetchComments, markRead]);

  useEffect(() => {
    const poll = setInterval(fetchComments, 10_000);
    return () => clearInterval(poll);
  }, [fetchComments]);

  // Auto-scroll to newest comment
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [comments.length]);

  // ── Deep-link: scroll to + highlight target comment ───────────────────────
  useEffect(() => {
    if (!targetCommentId || comments.length === 0) return;

    const raf = requestAnimationFrame(() => {
      const el = commentRefs.current[targetCommentId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(targetCommentId);
    });

    const fade = setTimeout(() => setHighlightedId(null), 3500);

    return () => { cancelAnimationFrame(raf); clearTimeout(fade); };
  }, [targetCommentId, comments.length]);

  // ── Close @mention dropdown on outside click ──────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        textareaRef.current && !textareaRef.current.contains(e.target)
      ) setMentionActive(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── @mention detection ────────────────────────────────────────────────────
  const handleBodyChange = (e) => {
    const value = e.target.value;
    const pos   = e.target.selectionStart;
    setBody(value);

    const atMatch = value.slice(0, pos).match(/@([^@\n]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(pos - atMatch[0].length);
      setMentionActive(true);
      setMentionIndex(0);
    } else {
      setMentionActive(false);
      setMentionQuery("");
    }
  };

  const insertMention = useCallback((member) => {
    const pos     = textareaRef.current?.selectionStart ?? body.length;
    const newBody = `${body.slice(0, mentionStart)}@${member.name} ${body.slice(pos)}`;
    setBody(newBody);
    setMentionActive(false);
    setMentionQuery("");
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const cursor = mentionStart + 1 + member.name.length + 1;
      textareaRef.current.setSelectionRange(cursor, cursor);
      textareaRef.current.focus();
    });
  }, [body, mentionStart]);

  const handleKeyDown = (e) => {
    if (!mentionActive || filteredMembers.length === 0) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1)); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMembers[mentionIndex]); }
    else if (e.key === "Escape") { setMentionActive(false); }
  };

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) setPendingFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    const hasBody  = body.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if ((!hasBody && !hasFiles) || posting) return;

    setPosting(true);
    try {
      let payload;
      if (hasFiles) {
        payload = new FormData();
        payload.append("body", body.trim());
        pendingFiles.forEach((f) => payload.append("files", f));
      } else {
        payload = { body: body.trim() };
      }

      const { data } = await api.post(`/api/rfis/${rfiId}/comments/`, payload);
      setComments((prev) => [...prev, data]);
      setBody("");
      setPendingFiles([]);
      setMentionActive(false);
      markRead();
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
        err.response?.data?.body?.[0] ||
        "Failed to send message."
      );
    } finally {
      setPosting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section
      className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
      aria-label="RFI discussion"
    >
      <header className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Discussion</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Messages are visible to all project members assigned to this RFI.
        </p>
      </header>

      {/* ── Comment list ── */}
      <div
        className="max-h-[480px] overflow-y-auto px-5 py-4 space-y-3"
        data-testid="rfi-discussion-list"
      >
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
        {!loadError && comments.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No messages yet. Start the conversation below.
          </p>
        )}

        {comments.map((c) => {
          const isHighlighted = highlightedId === c.id;
          return (
            <article
              key={c.id}
              id={`comment-${c.id}`}
              ref={(el) => { if (el) commentRefs.current[c.id] = el; }}
              className={`rounded-lg px-4 py-3 transition-all duration-700 ${
                isHighlighted
                  ? "ring-2 ring-indigo-400 dark:ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/40"
                  : c.is_official_response
                  ? "bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700"
                  : "bg-gray-50 dark:bg-gray-700"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {c.author_name || "Unknown"}
                  {c.author_role && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      {c.author_role}
                    </span>
                  )}
                  {c.is_official_response && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white">
                      Official Response
                    </span>
                  )}
                </div>
                <time className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {formatTimestamp(c.created_at)}
                </time>
              </div>

              {c.body && <CommentBody text={c.body} memberNames={memberNames} />}
              <AttachmentDisplay attachments={c.attachments} />
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Compose area ── */}
      <form
        onSubmit={handleSend}
        className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-2"
      >
        {isClosed ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            This RFI is closed. New messages cannot be added.
          </p>
        ) : (
          <>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_ACCEPT}
              className="sr-only"
              onChange={handleFileSelect}
            />

            {/* Pending file previews */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {pendingFiles.map((f, i) => (
                  <PendingFileChip key={i} file={f} onRemove={() => removeFile(i)} />
                ))}
              </div>
            )}

            {/* Textarea wrapper with @mention dropdown */}
            <div className="relative">
              {mentionActive && filteredMembers.length > 0 && (
                <div
                  ref={dropdownRef}
                  role="listbox"
                  aria-label="Mention a team member"
                  className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-20"
                >
                  {filteredMembers.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={i === mentionIndex}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                        i === mentionIndex
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                          : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                      }`}
                    >
                      <span className="font-semibold text-indigo-500 dark:text-indigo-400">@</span>
                      <span className="font-medium">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <label htmlFor="rfi-comment-body" className="sr-only">Message</label>
              <textarea
                ref={textareaRef}
                id="rfi-comment-body"
                rows={3}
                value={body}
                onChange={handleBodyChange}
                onKeyDown={handleKeyDown}
                placeholder="Write a message… type @ to mention someone"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={posting}
              />
            </div>

            {/* Toolbar row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {/* Attach button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={posting}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40"
                  title="Attach file"
                >
                  <PaperClipIcon className="h-4 w-4" />
                  Attach
                </button>

                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Type{" "}
                  <kbd className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded text-[11px]">
                    @
                  </kbd>{" "}
                  to mention
                </span>
              </div>

              <button
                type="submit"
                disabled={posting || (!body.trim() && pendingFiles.length === 0)}
                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-colors"
              >
                {posting ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
};

export default RfiDiscussion;
