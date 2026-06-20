import frappe
from frappe.utils import flt


def _location_display(holder_type, location):
	return f"{holder_type}: {location}" if holder_type and location else ""


def _asset_title(asset):
	return frappe.db.get_value("Asset", asset, "asset_name") or asset


def _asset_bin_option(row):
	location = row.location_display or _location_display(
		row.holder_type,
		row.warehouse if row.holder_type == "Warehouse" else row.department,
	)
	parts = [row.asset_name or _asset_title(row.asset)]
	if location:
		parts.append(location)
	parts.append(f"Qty: {flt(row.qty):g}")
	if row.source_id:
		parts.append(row.source_id)

	return {
		"name": row.name,
		"value": row.name,
		"label": " | ".join(parts),
		"company": row.company,
		"asset": row.asset,
		"asset_name": row.asset_name or _asset_title(row.asset),
		"holder_type": row.holder_type,
		"warehouse": row.warehouse,
		"department": row.department,
		"location_display": location,
		"qty": flt(row.qty),
		"rate": flt(row.rate),
		"amount": flt(row.amount),
		"source_type": row.source_type,
		"source_id": row.source_id,
		"purchase_receipt": row.source_id if row.source_type == "Purchase Receipt" else "",
		"posting_date": row.posting_date,
	}


@frappe.whitelist()
def search_asset_bins(txt="", company=None, limit=20):
	txt = (txt or "").strip()
	filters = [["disabled", "=", 0], ["qty", ">", 0]]
	if company:
		filters.append(["company", "=", company])

	or_filters = None
	if txt:
		like = f"%{txt}%"
		or_filters = [
			["asset_name", "like", like],
			["asset", "like", like],
			["source_id", "like", like],
			["location_display", "like", like],
		]

	query = {
		"filters": filters,
		"fields": [
			"name",
			"company",
			"asset",
			"asset_name",
			"holder_type",
			"warehouse",
			"department",
			"location_display",
			"qty",
			"rate",
			"amount",
			"source_type",
			"source_id",
			"posting_date",
		],
		"order_by": "posting_date desc, creation desc",
		"limit_page_length": int(limit or 20),
	}
	if or_filters:
		query["or_filters"] = or_filters

	rows = frappe.get_all("Asset Bin", **query)
	return [_asset_bin_option(row) for row in rows]
