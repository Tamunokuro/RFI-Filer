import { useState } from "react";
import api from "../api";
import { toast } from "react-toastify";
import { canSubmitOfficialResponse, useAuth } from "../context/Auth";

const OfficialResponsePanel = ({ rfi, onClosed }) => {
  const { role } = useAuth();
  const allowed = canSubmitOfficialResponse(role);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (rfi.status === "closed") {
    return (
      <section
        className="rounded-xl border border-indigo-200 bg-indigo-50 p-5"
        data-testid="official-response-closed"
      >
        <h3 className="text-base font-semibold text-indigo-900">
          Official Response
        </h3>
        <p className="mt-1 text-xs text-indigo-700">
          Submitted by {rfi.responded_by_name || "a project member"}
          {rfi.responded_at && (
            <> · {new Date(rfi.responded_at).toLocaleString()}</>
          )}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-indigo-950">
          {rfi.official_response}
        </p>
      </section>
    );
  }

  if (!allowed) {
    return null;
  }

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post(
        `/api/rfis/${rfi.id}/official-response/`,
        { body: body.trim() }
      );
      toast.success("Official response submitted. RFI closed.");
      if (onClosed) onClosed(data);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.body?.[0] ||
        "Failed to submit official response.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5"
      aria-label="Submit official response"
      data-testid="official-response-panel"
    >
      <h3 className="text-base font-semibold text-gray-900">
        Submit Official Response
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Closes this RFI. Only Project Designers, Contract Administrators, and
        Project Managers can submit.
      </p>
      <textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write the official response…"
        className="mt-3 w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        disabled={submitting}
      />
      <div className="mt-3 flex justify-end gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
            >
              {submitting ? "Submitting…" : "Confirm & Close RFI"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => body.trim() && setConfirming(true)}
            disabled={!body.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300"
          >
            Submit & Close RFI
          </button>
        )}
      </div>
    </section>
  );
};

export default OfficialResponsePanel;
