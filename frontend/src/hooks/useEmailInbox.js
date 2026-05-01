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

const useEmailInbox = ({ status = "", search = "", page = 1, pageSize = 20 } = {}) => {
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
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();

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
  }, [status, search, page, pageSize]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return { emails, loading, error, count, next, prev, refetch: fetchEmails };
};

export default useEmailInbox;
