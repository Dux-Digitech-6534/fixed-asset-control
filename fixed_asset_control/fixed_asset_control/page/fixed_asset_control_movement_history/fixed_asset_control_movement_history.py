import json

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_movement_history(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	query_filters = [["docstatus", "=", 1]]
	if filters.get("asset"):
		query_filters.append(["asset_name", "=", filters["asset"]])
	if filters.get("from_date"):
		query_filters.append(["posting_date", ">=", filters["from_date"]])
	if filters.get("to_date"):
		query_filters.append(["posting_date", "<=", filters["to_date"]])

	rows = frappe.get_all(
		"Move Asset",
		filters=query_filters,
		fields=[
			"name",
			"posting_date",
			"asset_name",
			"from_holder_type",
			"from_warehouse",
			"from_department",
			"to_holder_type",
			"to_warehouse",
			"to_department",
			"move_qty",
			"rate",
			"move_qty_value",
			"purchase_receipt",
			"selected_source_location",
			"docstatus",
		],
		order_by="posting_date desc, modified desc",
		limit_page_length=200,
	)

	history = []
	for row in rows:
		from_location = _location_display(
			row.from_holder_type, row.from_warehouse if row.from_holder_type == "Warehouse" else row.from_department
		)
		to_location = _location_display(
			row.to_holder_type, row.to_warehouse if row.to_holder_type == "Warehouse" else row.to_department
		)
		if filters.get("holder_type") and filters["holder_type"] not in {row.from_holder_type, row.to_holder_type}:
			continue
		if filters.get("location"):
			needle = filters["location"].strip().lower()
			if needle and needle not in (from_location or "").lower() and needle not in (to_location or "").lower():
				continue

		asset_title = frappe.db.get_value("Asset", row.asset_name, "asset_name") or row.asset_name
		amount = flt(row.move_qty_value) or flt(row.move_qty) * flt(row.rate)
		history.append(
			{
				"posting_date": row.posting_date,
				"asset": row.asset_name,
				"asset_title": asset_title,
				"move_asset": row.name,
				"qty": flt(row.move_qty),
				"from_location_display": from_location,
				"to_location_display": to_location,
				"source_id": row.purchase_receipt or "",
				"source_doctype": "Purchase Receipt" if row.purchase_receipt else "",
				"rate": flt(row.rate),
				"amount": amount,
				"status": "Submitted" if row.docstatus == 1 else "",
			}
		)

	return history


def _location_display(holder_type, location):
	return f"{holder_type}: {location}" if holder_type and location else ""
