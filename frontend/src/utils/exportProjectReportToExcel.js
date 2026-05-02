/**
 * exportProjectReportToExcel(project, rfis, contractChanges, filename?)
 *
 * Creates a two-sheet Excel workbook for a single project:
 *   1. "RFI Log"           — every RFI for the project (active + closed)
 *   2. "Contract Changes"  — every contract change linked to the project
 *
 * Row colours mirror the in-app cues:
 *   RFI Log:
 *     red-100    → Overdue (open RFI past due date)
 *     yellow-100 → Due Soon (within 3 days)
 *     green-100  → Active
 *     gray-100   → Closed (or no due date)
 *   Contract Changes:
 *     amber-100  → Pending
 *     green-100  → Issued
 *     gray-100   → Cancelled
 */

import ExcelJS from "exceljs";

// ── Status / status-display helpers ──────────────────────────────────────────

const RFI_STATUS_LABEL = {
  open:         "Open",
  submitted:    "Submitted",
  under_review: "Under Review",
  responded:    "Responded",
  closed:       "Closed",
};

const CHANGE_TYPE_LABEL = {
  PCN:   "Project Change Notice (PCN)",
  SI:    "Site Instruction (SI)",
  CD:    "Change Directive (CD)",
  CO:    "Change Order (CO)",
  Other: "Other",
};

const CHANGE_STATUS_LABEL = {
  pending:   "Pending",
  issued:    "Issued",
  cancelled: "Cancelled",
};

function rfiRowFill(rfi) {
  if (rfi.status === "closed") return "FFF3F4F6"; // gray-100
  if (!rfi.due_date) return "FFF3F4F6";
  const today = new Date();
  const due = new Date(rfi.due_date);
  const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "FFFEE2E2"; // red-100
  if (diff <= 3) return "FFFEF9C3"; // yellow-100
  return "FFDCFCE7"; // green-100
}

function changeRowFill(status) {
  if (status === "issued") return "FFDCFCE7"; // green-100
  if (status === "cancelled") return "FFE5E7EB"; // gray-200
  return "FFFEF3C7"; // amber-100 (pending)
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

function fmtDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

// ── RFI Log columns ──────────────────────────────────────────────────────────

const RFI_COLUMNS = [
  { header: "RFI Number",    key: "rfi_number",    width: 14 },
  { header: "RFI Name",      key: "rfi_name",      width: 32 },
  { header: "Trade",         key: "trade",         width: 10 },
  { header: "Received",      key: "received",      width: 14 },
  { header: "Due Date",      key: "due",           width: 14 },
  { header: "Designers",     key: "designers",     width: 28 },
  { header: "Contract Admins", key: "cas",         width: 28 },
  { header: "Status",        key: "status",        width: 14 },
  { header: "Responded By",  key: "responded_by",  width: 22 },
  { header: "Responded At",  key: "responded_at",  width: 18 },
  { header: "Closed At",     key: "closed_at",     width: 18 },
];

// ── Contract Changes columns ─────────────────────────────────────────────────

const CHANGE_COLUMNS = [
  { header: "Status",         key: "status",         width: 12 },
  { header: "Reference",      key: "reference",      width: 16 },
  { header: "Anticipated Type", key: "anticipated_type", width: 28 },
  { header: "Issued Type",    key: "issued_type",    width: 22 },
  { header: "RFI Number",     key: "rfi_number",     width: 14 },
  { header: "RFI Name",       key: "rfi_name",       width: 28 },
  { header: "Description",    key: "description",    width: 40 },
  { header: "Notes",          key: "notes",          width: 28 },
  { header: "Created By",     key: "created_by",     width: 20 },
  { header: "Created At",     key: "created_at",     width: 18 },
  { header: "Issued By",      key: "issued_by",      width: 20 },
  { header: "Issued At",      key: "issued_at",      width: 18 },
];

// ── Header styling helper ────────────────────────────────────────────────────

function styleHeaderRow(row) {
  row.height = 22;
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF172554" }, // blue-950
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function styleDataRow(row, argb) {
  row.height = 18;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function exportProjectReportToExcel(project, rfis, contractChanges, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RFI Filer";
  wb.created = new Date();

  // ── Sheet 1: RFI Log ──────────────────────────────────────────────────────
  const rfiSheet = wb.addWorksheet("RFI Log");
  rfiSheet.columns = RFI_COLUMNS;
  styleHeaderRow(rfiSheet.getRow(1));

  rfis.forEach((rfi) => {
    const row = rfiSheet.addRow({
      rfi_number:   rfi.rfi_number ?? "",
      rfi_name:     rfi.rfi_name ?? "",
      trade:        rfi.trade ?? "",
      received:     fmtDate(rfi.received_date),
      due:          fmtDate(rfi.due_date),
      designers:    rfi.designers_detail?.length
                    ? rfi.designers_detail.map((m) => m.name).join(", ")
                    : "—",
      cas:          rfi.contract_administrators_detail?.length
                    ? rfi.contract_administrators_detail.map((m) => m.name).join(", ")
                    : "—",
      status:       RFI_STATUS_LABEL[rfi.status] || rfi.status,
      responded_by: rfi.responded_by_name || "",
      responded_at: fmtDateTime(rfi.responded_at),
      closed_at:    fmtDateTime(rfi.closed_at),
    });
    styleDataRow(row, rfiRowFill(rfi));
  });

  // ── Sheet 2: Contract Changes ─────────────────────────────────────────────
  const ccSheet = wb.addWorksheet("Contract Changes");
  ccSheet.columns = CHANGE_COLUMNS;
  styleHeaderRow(ccSheet.getRow(1));

  contractChanges.forEach((c) => {
    const row = ccSheet.addRow({
      status:           CHANGE_STATUS_LABEL[c.status] || c.status,
      reference:        c.reference_number || "",
      anticipated_type: CHANGE_TYPE_LABEL[c.anticipated_type] || c.anticipated_type,
      issued_type:      c.issued_type ? (CHANGE_TYPE_LABEL[c.issued_type] || c.issued_type) : "",
      rfi_number:       c.rfi_number || "",
      rfi_name:         c.rfi_name || "",
      description:      c.description || "",
      notes:            c.notes || "",
      created_by:       c.created_by_name || "",
      created_at:       fmtDateTime(c.created_at),
      issued_by:        c.issued_by_name || "",
      issued_at:        fmtDateTime(c.issued_at),
    });
    styleDataRow(row, changeRowFill(c.status));
  });

  // ── Trigger download ──────────────────────────────────────────────────────
  const safeNumber = (project.project_number || "project").replace(/[^A-Za-z0-9_-]+/g, "_");
  const finalName = filename || `${safeNumber}_report.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  a.click();
  URL.revokeObjectURL(url);
}
