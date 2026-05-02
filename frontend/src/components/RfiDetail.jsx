import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import Footer from "./Footer";
import Header from "./Header";
import RfiDiscussion from "./RfiDiscussion";
import OfficialResponsePanel from "./OfficialResponsePanel";
import RfiAttachments from "./RfiAttachments";
import { useAuth } from "../context/Auth";
import toast from "../toast";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const RfiDetail = () => {
  const { pk } = useParams();
  const navigate = useNavigate();
  const { memberId } = useAuth();
  const [rfi, setRfi] = useState(null);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadRfi = async () => {
    try {
      const { data } = await api.get(`/api/rfis/${pk}/`);
      setRfi(data);
      setError("");
    } catch (err) {
      setError("Failed to load RFI.");
    }
  };

  useEffect(() => {
    loadRfi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-red-500 dark:text-red-400">{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!rfi) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  const closed = rfi.status === "closed";
  const designers = rfi.designers_detail?.map((m) => m.name).join(", ") || "—";
  const contractAdmins = rfi.contract_administrators_detail?.map((m) => m.name).join(", ") || "—";

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const response = await api.get(`/api/rfis/${pk}/pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      // Trigger the browser's Save dialog so the user gets a local copy.
      // The "View in RFI Filer →" link and the attachment hyperlinks inside
      // the PDF still work after the file is saved and reopened.
      const link = document.createElement("a");
      link.href = url;
      link.download = `${rfi.rfi_number} - ${rfi.rfi_name}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The download is queued synchronously on click, so the blob can be
      // released immediately.
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        <Header title={rfi.rfi_number} />

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {rfi.rfi_name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {rfi.project_number} — {rfi.project_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  closed
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    : "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300"
                }`}
                data-testid="rfi-status-badge"
              >
                {closed ? "Closed" : "Open"}
              </span>

              {/* PDF export */}
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                title="Download as PDF"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600
                           px-3 py-1 text-sm text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700
                           disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {pdfLoading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                              stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                         stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M9 13h6m-3-3v6" />
                    </svg>
                    Export PDF
                  </>
                )}
              </button>

              {!closed && (
                <button
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}/edit`)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Trade</dt>
              <dd className="text-gray-900 dark:text-gray-100">{rfi.trade || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Received</dt>
              <dd className="text-gray-900 dark:text-gray-100">{formatDate(rfi.received_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Due</dt>
              <dd className="text-gray-900 dark:text-gray-100">{formatDate(rfi.due_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Project Manager</dt>
              <dd className="text-gray-900 dark:text-gray-100">{rfi.project_manager_name || "—"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Designers</dt>
              <dd className="text-gray-900 dark:text-gray-100">{designers}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Contract Administrators</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contractAdmins}</dd>
            </div>
            {rfi.question && (
              <div className="md:col-span-4">
                <dt className="text-gray-500 dark:text-gray-400">Question</dt>
                <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {rfi.question}
                </dd>
              </div>
            )}
            {rfi.proposed_solution && (
              <div className="md:col-span-4">
                <dt className="text-gray-500 dark:text-gray-400">Proposed Solution</dt>
                <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {rfi.proposed_solution}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <RfiAttachments
          rfiId={rfi.id}
          currentMemberId={memberId}
          isClosed={closed}
        />

        <OfficialResponsePanel rfi={rfi} onClosed={(updated) => setRfi(updated)} />

        <RfiDiscussion rfiId={rfi.id} isClosed={closed} onActivity={() => {}} />
      </div>
      <Footer />
    </div>
  );
};

export default RfiDetail;
