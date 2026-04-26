import { useEffect, useRef, useState } from "react";
import api from "../api";
import toast from "../toast";
import {
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const kindOf = (att) => {
  const ct = (att.content_type || "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct === "application/pdf") return "pdf";
  if (
    ct === "application/vnd.ms-excel" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "text/csv"
  )
    return "excel";
  return "file";
};

const AttachmentCard = ({ att, canDelete, onDelete }) => {
  const kind = kindOf(att);

  let preview = null;
  if (kind === "image") {
    preview = (
      <a href={att.file_url} target="_blank" rel="noreferrer">
        <img
          src={att.file_url}
          alt={att.original_filename}
          className="h-36 w-full object-cover rounded-md border border-gray-200"
        />
      </a>
    );
  } else if (kind === "video") {
    preview = (
      <video
        controls
        src={att.file_url}
        className="h-36 w-full rounded-md border border-gray-200 bg-black"
      />
    );
  } else if (kind === "pdf") {
    preview = (
      <div className="flex h-36 items-center justify-center rounded-md border border-gray-200 bg-red-50 text-red-800 text-3xl font-bold">
        PDF
      </div>
    );
  } else if (kind === "excel") {
    preview = (
      <div className="flex h-36 items-center justify-center rounded-md border border-gray-200 bg-green-50 text-green-800 text-2xl font-bold">
        XLS
      </div>
    );
  } else {
    preview = (
      <div className="flex h-36 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 text-2xl font-bold">
        FILE
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-3 flex flex-col gap-2"
      data-testid={`attachment-${att.id}`}
      data-kind={kind}
    >
      {preview}
      <div
        className="text-sm text-gray-900 font-medium truncate"
        title={att.original_filename}
      >
        {att.original_filename}
      </div>
      <div className="text-xs text-gray-500">
        {formatSize(att.size)}
        {att.uploaded_by_name && <> · {att.uploaded_by_name}</>}
      </div>
      <div className="flex items-center justify-end gap-4 pt-1 border-t border-gray-100">
        <a
          href={att.file_url}
          target="_blank"
          rel="noreferrer"
          title="Open"
          className="text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
        </a>
        <a
          href={att.file_url}
          download={att.original_filename}
          title="Download"
          className="text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
        </a>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(att)}
            title="Delete"
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

const RfiAttachments = ({ rfiId, currentMemberId, isClosed }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${rfiId}/attachments/`);
      // Official-response attachments are shown inside OfficialResponsePanel
      setAttachments((data || []).filter((a) => !a.is_official_response));
    } catch (err) {
      toast.error("Unable to load attachments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfiId]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("file", f));

    setUploading(true);
    try {
      const { data } = await api.post(`/api/rfis/${rfiId}/attachments/`, fd);
      setAttachments((prev) => [...(data.created || []), ...prev]);
      if (data.errors && data.errors.length > 0) {
        data.errors.forEach((err) =>
          toast.error(`${err.filename}: ${err.error}`)
        );
      } else {
        toast.success("Attachment(s) uploaded.");
      }
    } catch (err) {
      const detail =
        err.response?.data?.detail || "Upload failed. Please try again.";
      toast.error(detail);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (att) => {
    if (!window.confirm(`Delete ${att.original_filename}?`)) return;
    try {
      await api.delete(`/api/rfis/${rfiId}/attachments/${att.id}/`);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      const detail =
        err.response?.data?.detail || "Could not delete attachment.";
      toast.error(detail);
    }
  };

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5"
      aria-label="RFI attachments"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">Attachments</h3>
        {!isClosed && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.csv,.mp4,.mov,.webm,application/pdf,image/*,video/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleUpload}
              className="hidden"
              data-testid="attachment-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {uploading ? "Uploading…" : "Add Files"}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No attachments uploaded yet.
        </p>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          data-testid="attachments-grid"
        >
          {attachments.map((att) => (
            <AttachmentCard
              key={att.id}
              att={att}
              canDelete={
                !isClosed &&
                currentMemberId &&
                String(att.uploaded_by) === String(currentMemberId)
              }
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default RfiAttachments;
