'use strict';
function toHistory(row) {
  return { historyId: String(row.hid), tripId: String(row.tid),
    ...(row.from_s != null ? { fromStatus: row.from_s } : {}), toStatus: row.to_s,
    changedAt: new Date(row.chg_at).toISOString() };
}
module.exports = { toHistory };
