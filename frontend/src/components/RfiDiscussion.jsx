import { useEffect, useRef, useState } from "react";
import api from "../api";
import { toast } from "react-toastify";

const formatTimestamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
};

const RfiDiscussion = ({ rfiId, isClosed, onActivity }) => {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const bottomRef = useRef(null);

  const fetchComments = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${rfiId}/comments/`);
      setComments(data);
      setLoadError("");
    } catch (err) {
      console.error("Failed to load comments", err);
      setLoadError("Unable to load discussion.");
    }
  };

  const markRead = async () => {
    try {
      await api.post(`/api/rfis/${rfiId}/mark-read/`);
      if (onActivity) onActivity();
    } catch (err) {
      /* silent */
    }
  };

  useEffect(() => {
    fetchComments();
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfiId]);

  useEffect(() => {
    const poll = setInterval(fetchComments, 10000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfiId]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [comments.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      const { data } = await api.post(`/api/rfis/${rfiId}/comments/`, {
        body: body.trim(),
      });
      setComments((prev) => [...prev, data]);
      setBody("");
      markRead();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.body?.[0] ||
        "Failed to send message.";
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section
      className="border border-gray-200 rounded-xl bg-white"
      aria-label="RFI discussion"
    >
      <header className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">Discussion</h3>
        <p className="text-xs text-gray-500">
          Messages are visible to all project members assigned to this RFI.
        </p>
      </header>

      <div
        className="max-h-[480px] overflow-y-auto px-5 py-4 space-y-3"
        data-testid="rfi-discussion-list"
      >
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!loadError && comments.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            No messages yet. Start the conversation below.
          </p>
        )}
        {comments.map((c) => (
          <article
            key={c.id}
            className={`rounded-lg px-4 py-3 ${
              c.is_official_response
                ? "bg-indigo-50 border border-indigo-200"
                : "bg-gray-50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium text-gray-900">
                {c.author_name || "Unknown"}
                {c.author_role && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {c.author_role}
                  </span>
                )}
                {c.is_official_response && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white">
                    Official Response
                  </span>
                )}
              </div>
              <time className="text-xs text-gray-500">
                {formatTimestamp(c.created_at)}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
              {c.body}
            </p>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-gray-100 px-5 py-4 space-y-2"
      >
        {isClosed ? (
          <p className="text-sm text-gray-500 italic">
            This RFI is closed. New messages cannot be added.
          </p>
        ) : (
          <>
            <label htmlFor="rfi-comment-body" className="sr-only">
              Message
            </label>
            <textarea
              id="rfi-comment-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a message…"
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={posting}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={posting || !body.trim()}
                className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
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
