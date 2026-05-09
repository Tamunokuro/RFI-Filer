/**
 * exportProjectReportToExcel(project, rfis, contractChanges, filename?)
 *
 * Creates a two-sheet Excel workbook for a single project:
 *   1. "RFI Log"           — every RFI for the project (active + closed)
 *   2. "Contract Changes"  — every contract change linked to the project
 *
 * The RFI Log sheet opens with a three-row project-info block so that anyone
 * adding rows manually knows the project name, SLA, and export date at a glance.
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

// ── Status / display helpers ───────────────────────────────────────────────────

const RFI_STATUS_LABEL = {
  open:         "Open",
  submitted:    "Submitted",
  under_review: "Under Review",
  responded:    "Responded",
  closed:       "Closed",
};

const PRIORITY_LABEL = {
  low:      "Low",
  medium:   "Medium",
  high:     "High",
  critical: "Critical",
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
  const due   = new Date(rfi.due_date);
  const diff  = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return "FFFEE2E2"; // red-100
  if (diff <= 3) return "FFFEF9C3"; // yellow-100
  return "FFDCFCE7";                // green-100
}

function changeRowFill(status) {
  if (status === "issued")    return "FFDCFCE7"; // green-100
  if (status === "cancelled") return "FFE5E7EB"; // gray-200
  return "FFFEF3C7";                             // amber-100 (pending)
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

function fmtDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString();
}

// ── Column definitions ────────────────────────────────────────────────────────

// NOTE: no `header` on column definitions — we add the header row manually
// so we can insert the project-info block above it.
const RFI_COLS = [
  { key: "rfi_number",   width: 14 },
  { key: "rfi_name",     width: 32 },
  { key: "priority",     width: 12 },
  { key: "trade",        width: 10 },
  { key: "received",     width: 14 },
  { key: "due",          width: 14 },
  { key: "sla_due",      width: 26 },
  { key: "designers",    width: 28 },
  { key: "cas",          width: 28 },
  { key: "status",       width: 14 },
  { key: "responded_by", width: 22 },
  { key: "responded_at", width: 18 },
  { key: "closed_at",    width: 18 },
];

const RFI_HEADERS = [
  "RFI Number", "RFI Name", "Priority", "Trade",
  "Received", "Due Date", `SLA Due (Received + {sla} days)`,
  "Designers", "Contract Admins",
  "Status", "Responded By", "Responded At", "Closed At",
];

const CHANGE_COLUMNS = [
  { header: "Status",           key: "status",           width: 12 },
  { header: "Reference",        key: "reference",        width: 16 },
  { header: "Anticipated Type", key: "anticipated_type", width: 28 },
  { header: "Issued Type",      key: "issued_type",      width: 22 },
  { header: "RFI Number",       key: "rfi_number",       width: 14 },
  { header: "RFI Name",         key: "rfi_name",         width: 28 },
  { header: "Description",      key: "description",      width: 40 },
  { header: "Notes",            key: "notes",            width: 28 },
  { header: "Created By",       key: "created_by",       width: 20 },
  { header: "Created At",       key: "created_at",       width: 18 },
  { header: "Issued By",        key: "issued_by",        width: 20 },
  { header: "Issued At",        key: "issued_at",        width: 18 },
];

// ── Styling helpers ───────────────────────────────────────────────────────────

const NAVY = "FF172554"; // blue-950

function styleHeaderRow(row) {
  row.height = 22;
  row.font   = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function styleDataRow(row, argb) {
  row.height = 18;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

// ── SLA due-date calculator ───────────────────────────────────────────────────

function calcSlaDue(receivedDate, slaDays) {
  if (!receivedDate || !slaDays) return "";
  const d = new Date(receivedDate + "T00:00:00");
  d.setDate(d.getDate() + slaDays);
  return d.toLocaleDateString();
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function exportProjectReportToExcel(project, rfis, contractChanges, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RFI Filer";
  wb.created = new Date();

  const sla      = project.sla_days ?? 14;
  const exported = new Date().toLocaleDateString();

  // ── Sheet 1: RFI Log ──────────────────────────────────────────────────────
  const rfiSheet = wb.addWorksheet("RFI Log");

  // Set column keys + widths (no auto-header so we control row order)
  rfiSheet.columns = RFI_COLS;

  // ── Rows 1-3: project info block ─────────────────────────────────────────
  const col1 = RFI_COLS[0].key; // "rfi_number" — anchors left-hand content

  const infoRow1 = rfiSheet.addRow({
    [col1]: `${project.project_number}  –  ${project.project_name}`,
  });
  infoRow1.getCell(1).font      = { bold: true, size: 12, color: { argb: "FF" + "1e3a5f" } };
  infoRow1.getCell(1).alignment = { vertical: "middle" };
  infoRow1.height = 20;
  // Right-align "Exported" label in the last column
  infoRow1.getCell(RFI_COLS.length).value = `Exported: ${exported}`;
  infoRow1.getCell(RFI_COLS.length).font  = { italic: true, size: 9, color: { argb: "FF6b7280" } };
  infoRow1.getCell(RFI_COLS.length).alignment = { horizontal: "right" };

  const infoRow2 = rfiSheet.addRow({
    [col1]: `SLA: ${sla} calendar days  ·  Default due = Received Date + ${sla} days  ·  PM: ${project.project_manager_name || "—"}`,
  });
  infoRow2.getCell(1).font      = { size: 9, color: { argb: "FF6b7280" } };
  infoRow2.getCell(1).alignment = { vertical: "middle" };
  infoRow2.height = 16;

  const infoRow3 = rfiSheet.addRow({}); // blank separator
  infoRow3.height = 6;

  // ── Row 4: column headers ─────────────────────────────────────────────────
  const resolvedHeaders = RFI_HEADERS.map((h) =>
    h.replace("{sla}", String(sla))
  );
  const headerRow = rfiSheet.addRow(resolvedHeaders);
  styleHeaderRow(headerRow);

  // ── Rows 5+: data ─────────────────────────────────────────────────────────
  rfis.forEach((rfi) => {
    const row = rfiSheet.addRow([
      rfi.rfi_number ?? "",
      rfi.rfi_name   ?? "",
      PRIORITY_LABEL[rfi.priority] || (rfi.priority ?? "Medium"),
      rfi.trade      ?? "",
      fmtDate(rfi.received_date),
      fmtDate(rfi.due_date),
      calcSlaDue(rfi.received_date, sla),
      rfi.designers_detail?.length
        ? rfi.designers_detail.map((m) => m.name).join(", ")
        : "—",
      rfi.contract_administrators_detail?.length
        ? rfi.contract_administrators_detail.map((m) => m.name).join(", ")
        : "—",
      RFI_STATUS_LABEL[rfi.status] || rfi.status,
      rfi.responded_by_name || "",
      fmtDateTime(rfi.responded_at),
      fmtDateTime(rfi.closed_at),
    ]);
    styleDataRow(row, rfiRowFill(rfi));
  });

  // Merge the info rows across all columns so they read as full-width lines
  const totalCols = RFI_COLS.length;
  rfiSheet.mergeCells(1, 1, 1, totalCols - 1); // row 1 main text
  rfiSheet.mergeCells(2, 1, 2, totalCols);     // row 2 SLA text

  // ── Sheet 2: Contract Changes ─────────────────────────────────────────────
  const ccSheet = wb.addWorksheet("Contract Changes");
  ccSheet.columns = CHANGE_COLUMNS;
  styleHeaderRow(ccSheet.getRow(1));

  contractChanges.forEach((c) => {
    const row = ccSheet.addRow({
      status:           CHANGE_STATUS_LABEL[c.status]         || c.status,
      reference:        c.reference_number                    || "",
      anticipated_type: CHANGE_TYPE_LABEL[c.anticipated_type] || c.anticipated_type,
      issued_type:      c.issued_type
                          ? (CHANGE_TYPE_LABEL[c.issued_type] || c.issued_type)
                          : "",
      rfi_number:       c.rfi_number   || "",
      rfi_name:         c.rfi_name     || "",
      description:      c.description  || "",
      notes:            c.notes        || "",
      created_by:       c.created_by_name || "",
      created_at:       fmtDateTime(c.created_at),
      issued_by:        c.issued_by_name  || "",
      issued_at:        fmtDateTime(c.issued_at),
    });
    styleDataRow(row, changeRowFill(c.status));
  });

  // ── Trigger download ──────────────────────────────────────────────────────
  const safeNumber = (project.project_number || "project").replace(/[^A-Za-z0-9_-]+/g, "_");
  const finalName  = filename || `${safeNumber}_report.xlsx`;
  const buffer     = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = finalName;
  a.click();
  URL.revokeObjectURL(url);
}
