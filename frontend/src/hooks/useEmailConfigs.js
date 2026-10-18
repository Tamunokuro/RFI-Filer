import { useState, useEffect, useCallback } from "react";
import api from "../api";
import toast from "../toast";

/**
 * useEmailConfigs
 * ---------------
 * Manages the full lifecycle of EmailConfig objects:
 *   - fetching the list
 *   - creating / updating / deleting a single config
 *   - testing a connection
 *
 * Also manages EmailFolder CRUD.
 */
const useEmailConfigs = () => {
  const [configs, setConfigs]         = useState([]);
  const [folders, setFolders]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [testingId, setTestingId]     = useState(null); // config id currently being tested
  const [testResult, setTestResult]   = useState({});  // { [id]: { ok, detail } }
  const [pollingId, setPollingId]     = useState(null); // config id currently being polled

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cfgRes, folderRes] = await Promise.all([
        api.get("/api/email/configs/"),
        api.get("/api/email/folders/"),
      ]);
      setConfigs(Array.isArray(cfgRes.data) ? cfgRes.data : []);
      setFolders(Array.isArray(folderRes.data) ? folderRes.data : []);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to load email configurations.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // -----------------------------------------------------------------------
  // Config CRUD
  // -----------------------------------------------------------------------

  const createConfig = async (data) => {
    try {
      const res = await api.post("/api/email/configs/", data);
      setConfigs((prev) => [...prev, res.data]);
      toast.success("Inbox added successfully.");
      return { ok: true, data: res.data };
    } catch (err) {
      const errors = err.response?.data || {};
      const messages = Object.entries(errors).flatMap(([field, errs]) =>
        Array.isArray(errs) ? errs.map((e) => `${field}: ${e}`) : [`${field}: ${String(errs)}`]
      );
      messages.forEach((m) => toast.error(m));
      return { ok: false, errors };
    }
  };

  const updateConfig = async (id, data) => {
    try {
      const res = await api.patch(`/api/email/configs/${id}/`, data);
      setConfigs((prev) => prev.map((c) => (c.id === id ? res.data : c)));
      toast.success("Inbox updated.");
      return { ok: true, data: res.data };
    } catch (err) {
      const errors = err.response?.data || {};
      const messages = Object.entries(errors).flatMap(([field, errs]) =>
        Array.isArray(errs) ? errs.map((e) => `${field}: ${e}`) : [`${field}: ${String(errs)}`]
      );
      messages.forEach((m) => toast.error(m));
      return { ok: false, errors };
    }
  };

  const deleteConfig = async (id) => {
    try {
      await api.delete(`/api/email/configs/${id}/`);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      toast.success("Inbox removed.");
      return { ok: true };
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove inbox.");
      return { ok: false };
    }
  };

  const testConfig = async (id) => {
    setTestingId(id);
    setTestResult((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await api.post(`/api/email/configs/${id}/test/`);
      setTestResult((prev) => ({ ...prev, [id]: res.data }));
    } catch (err) {
      const detail = err.response?.data?.detail || "Connection test failed.";
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, detail } }));
    } finally {
      setTestingId(null);
    }
  };

  const pollConfig = async (id) => {
    setPollingId(id);
    try {
      const res = await api.post(`/api/email/configs/${id}/poll/`);
      const { emails_processed, last_polled_at } = res.data;
      // Patch the last_polled_at in the local list so the card updates immediately
      setConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, last_polled_at } : c))
      );
      const noun = emails_processed === 1 ? "email" : "emails";
      toast.success(`Poll complete — ${emails_processed} new ${noun} processed.`);
      return { ok: true, data: res.data };
    } catch (err) {
      const detail = err.response?.data?.detail || "Poll failed.";
      toast.error(detail);
      return { ok: false };
    } finally {
      setPollingId(null);
    }
  };

  // -----------------------------------------------------------------------
  // Folder CRUD
  // -----------------------------------------------------------------------

  const createFolder = async (data) => {
    try {
      const res = await api.post("/api/email/folders/", data);
      setFolders((prev) => [...prev, res.data]);
      toast.success("Folder created.");
      return { ok: true, data: res.data };
    } catch (err) {
      const errors = err.response?.data || {};
      const messages = Object.entries(errors).flatMap(([field, errs]) =>
        Array.isArray(errs) ? errs.map((e) => `${field}: ${e}`) : [`${field}: ${String(errs)}`]
      );
      messages.forEach((m) => toast.error(m));
      return { ok: false, errors };
    }
  };

  const updateFolder = async (id, data) => {
    try {
      const res = await api.patch(`/api/email/folders/${id}/`, data);
      setFolders((prev) => prev.map((f) => (f.id === id ? res.data : f)));
      toast.success("Folder updated.");
      return { ok: true, data: res.data };
    } catch (err) {
      const errors = err.response?.data || {};
      const messages = Object.entries(errors).flatMap(([field, errs]) =>
        Array.isArray(errs) ? errs.map((e) => `${field}: ${e}`) : [`${field}: ${String(errs)}`]
      );
      messages.forEach((m) => toast.error(m));
      return { ok: false, errors };
    }
  };

  const deleteFolder = async (id) => {
    try {
      await api.delete(`/api/email/folders/${id}/`);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      toast.success("Folder deleted.");
      return { ok: true };
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete folder.");
      return { ok: false };
    }
  };

  const applyFolders = async () => {
    try {
      const res = await api.post("/api/email/folders/apply/");
      toast.success(res.data.detail);
      // Refresh folder email counts
      fetchConfigs();
      return { ok: true, data: res.data };
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to apply folder rules.");
      return { ok: false };
    }
  };

  return {
    configs,
    folders,
    loading,
    error,
    testingId,
    testResult,
    pollingId,
    fetchConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    testConfig,
    pollConfig,
    createFolder,
    updateFolder,
    deleteFolder,
    applyFolders,
  };
};

export default useEmailConfigs;
