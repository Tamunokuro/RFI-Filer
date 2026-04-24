import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import Footer from "./Footer";
import Header from "./Header";
import RfiDiscussion from "./RfiDiscussion";
import OfficialResponsePanel from "./OfficialResponsePanel";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const RfiDetail = () => {
  const { pk } = useParams();
  const navigate = useNavigate();
  const [rfi, setRfi] = useState(null);
  const [error, setError] = useState("");

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
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-red-500">{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!rfi) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Header title="RFI" />
          <p className="text-gray-500">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  const closed = rfi.status === "closed";
  const assignees = rfi.assigned_to_detail?.map((m) => m.name).join(", ") || "—";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        <Header title={`RFI ${rfi.rfi_number}`} />

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {rfi.rfi_name}
              </h2>
              <p className="text-sm text-gray-500">
                {rfi.project_number} — {rfi.project_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  closed
                    ? "bg-gray-200 text-gray-700"
                    : "bg-green-100 text-green-800"
                }`}
                data-testid="rfi-status-badge"
              >
                {closed ? "Closed" : "Open"}
              </span>
              {!closed && (
                <button
                  onClick={() => navigate(`/rfi/${rfi.id}/${rfi.slug}/edit`)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-gray-500">Trade</dt>
              <dd className="text-gray-900">{rfi.trade || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Received</dt>
              <dd className="text-gray-900">{formatDate(rfi.received_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Due</dt>
              <dd className="text-gray-900">{formatDate(rfi.due_date)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Project Manager</dt>
              <dd className="text-gray-900">{rfi.project_manager_name || "—"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-gray-500">Assigned To</dt>
              <dd className="text-gray-900">{assignees}</dd>
            </div>
            {rfi.remarks && (
              <div className="md:col-span-4">
                <dt className="text-gray-500">Remarks</dt>
                <dd className="whitespace-pre-wrap text-gray-900">
                  {rfi.remarks}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <OfficialResponsePanel rfi={rfi} onClosed={(updated) => setRfi(updated)} />

        <RfiDiscussion rfiId={rfi.id} isClosed={closed} onActivity={() => {}} />
      </div>
      <Footer />
    </div>
  );
};

export default RfiDetail;
