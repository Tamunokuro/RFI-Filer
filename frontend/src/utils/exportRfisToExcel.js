/**
 * exportRfisToExcel(rfis, filename?)
 *
 * Converts an array of RFI objects into a styled .xlsx workbook and
 * triggers a browser download.
 *
 * Columns exported (messages/unread is intentionally omitted):
 *   Project Number | RFI Number | RFI Name | Project | Project Manager | Trade |
 *   Received | Due Date | Designers | Contract Administrators | Status
 *
 * Row background colours mirror the Tailwind status badges in RfiList:
 *   Active   → green-100  (#dcfce7)
 *   Overdue  → red-100    (#fee2e2)
 *   Due Soon → yellow-100 (#fef9c3)  (due within 3 days)
 *   No date  → gray-100   (#f3f4f6)
 */

import ExcelJS from "exceljs";

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { header: "Project Number",         key: "project_number",         width: 18 },
  { header: "RFI Number",             key: "rfi_number",             width: 14 },
  { header: "RFI Name",               key: "rfi_name",               width: 32 },
  { header: "Project",                key: "project_name",           width: 26 },
  { header: "Project Manager",        key: "project_manager",        width: 22 },
  { header: "Trade",                  key: "trade",                  width: 10 },
  { header: "Priority",               key: "priority",               width: 12 },
  { header: "Received",               key: "received_date",          width: 14 },
  { header: "Due Date",               key: "due_date",               width: 14 },
  { header: "Designers",              key: "designers",              width: 28 },
  { header: "Contract Administrators",key: "contract_administrators", width: 28 },
  { header: "Status",                 key: "status",                 width: 13 },
];

// ── Colour helpers ────────────────────────────────────────────────────────────

// Returns an ARGB hex string that matches the Tailwind bg used in RfiList.
function rowFillArgb(dueDate) {
  if (!dueDate) return "FFF3F4F6"; // gray-100
  const today = new Date();
  const due   = new Date(dueDate);
  const diff  = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diff < 0)  return "FFFEE2E2"; // red-100    – Overdue
  if (diff <= 3) return "FFFEF9C3"; // yellow-100 – Due Soon
  return "FFDCFCE7";                // green-100  – Active
}

function statusLabel(dueDate) {
  if (!dueDate) return "";
  const diff = Math.ceil(
    (new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0)  return "Overdue";
  if (diff <= 3) return "Due Soon";
  return "Active";
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportRfisToExcel(rfis, filename = "rfi-list.xlsx") {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "RFI Filer";
  wb.created  = new Date();

  const ws = wb.addWorksheet("RFIs");
  ws.columns = COLUMNS;

  // ── Header row ─────────────────────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF172554" }, // blue-950 – matches app primary colour
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // ── Data rows ──────────────────────────────────────────────────────────────
  rfis.forEach((rfi) => {
    const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
    const row = ws.addRow({
      project_number:  rfi.project_number       ?? "",
      rfi_number:      rfi.rfi_number           ?? "",
      rfi_name:        rfi.rfi_name             ?? "",
      project_name:    rfi.project_name         ?? "",
      project_manager: rfi.project_manager_name ?? "—",
      trade:           rfi.trade                ?? "",
      priority:        PRIORITY_LABEL[rfi.priority] || (rfi.priority ?? "Medium"),
      received_date:   fmtDate(rfi.received_date),
      due_date:        fmtDate(rfi.due_date),
      designers:               rfi.designers_detail?.length
                               ? rfi.designers_detail.map((m) => m.name).join(", ")
                               : "—",
      contract_administrators: rfi.contract_administrators_detail?.length
                               ? rfi.contract_administrators_detail.map((m) => m.name).join(", ")
                               : "—",
      status:          statusLabel(rfi.due_date),
    });

    const argb = rowFillArgb(rfi.due_date);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb } };
      cell.alignment = { vertical: "middle" };
    });
  });

  // ── Trigger download ───────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
