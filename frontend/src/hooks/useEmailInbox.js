/**
 * useEmailInbox
 *
 * Fetches paginated inbound emails from /api/email/inbound/.
 * Supports status filtering and subject/sender search.
 */

import { useState, useEffect, useCallback } from "react";
import api from "../api";

export const EMAIL_STATUSES = {
  pending:      "pending",
  auto_created: "auto_created",
  approved:     "approved",
  rejected:     "rejected",
  error:        "error",
};

const useEmailInbox = ({
  status = "",
  search = "",
  page = 1,
  pageSize = 20,
  configId = null,
  emailType = null,
  folderId = null,
} = {}) => {
  const [emails, setEmails]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [count, setCount]     = useState(0);
  const [next, setNext]       = useState(null);
  const [prev, setPrev]       = useState(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: pageSize };
      if (status)            params.status     = status;
      if (search.trim())     params.search     = search.trim();
      if (configId)          params.config     = configId;
      if (emailType)         params.email_type = emailType;
      if (folderId)          params.folder     = folderId;

      const res = await api.get("/api/email/inbound/", { params });
      setEmails(res.data.results);
      setCount(res.data.count);
      setNext(res.data.next);
      setPrev(res.data.previous);
    } catch (err) {
      console.error("Failed to fetch inbound emails:", err);
      setError("Failed to load emails. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [status, search, page, pageSize, configId, emailType, folderId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const deleteEmail = useCallback(async (id) => {
    try {
      await api.delete(`/api/email/inbound/${id}/`);
      await fetchEmails(); // refetch so next-page emails slide in automatically
      return { ok: true };
    } catch (err) {
      console.error("Failed to delete email:", err);
      return { ok: false };
    }
  }, [fetchEmails]);

  const bulkDeleteEmails = useCallback(async (ids) => {
    try {
      const res = await api.post("/api/email/inbound/bulk-delete/", { ids });
      const deleted = res.data.deleted ?? ids.length;
      await fetchEmails(); // refetch so the page refills from the server
      return { ok: true, deleted };
    } catch (err) {
      console.error("Failed to bulk-delete emails:", err);
      return { ok: false };
    }
  }, [fetchEmails]);

  return { emails, loading, error, count, next, prev, refetch: fetchEmails, deleteEmail, bulkDeleteEmails };
};

export default useEmailInbox;
