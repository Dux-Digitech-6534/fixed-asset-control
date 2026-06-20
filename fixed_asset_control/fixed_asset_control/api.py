import json

import frappe
from frappe.utils import flt, nowdate


def _filters(filters):
	if isinstance(filters, str):
		return json.loads(filters or "{}")
	return filters or {}


def _date_filters(filters):
	out = []
	if filters.get("from_date"):
		out.append(["posting_date", ">=", filters["from_date"]])
	if filters.get("to_date"):
		out.append(["posting_date", "<=", filters["to_date"]])
	return out


def _location_display(holder_type, location):
	return f"{holder_type}: {location}" if holder_type and location else ""


def _asset_title(asset):
	return frappe.db.get_value("Asset", asset, "asset_name") or asset


def _source_link(row):
	return row.source_id if row.source_id else ""


def _asset_fields(fields):
	meta = frappe.get_meta("Asset")
	return [field for field in fields if field == "name" or meta.has_field(field)]


def sync_purchase_receipt_asset_bins(doc, method=None):
	if doc.doctype != "Purchase Receipt" or doc.docstatus != 1:
		return

	for item in doc.get("items", []):
		if not (item.get("is_fixed_asset") and item.get("warehouse")):
			continue

		qty = flt(item.get("qty"))
		if qty <= 0:
			continue

		asset = _get_purchase_receipt_item_asset(doc.name, item.name)
		if not asset:
			continue

		_sync_asset_bin_from_purchase_receipt(doc, item, asset, qty)


def _get_purchase_receipt_item_asset(purchase_receipt, purchase_receipt_item):
	return frappe.db.get_value(
		"Asset",
		{
			"purchase_receipt": purchase_receipt,
			"purchase_receipt_item": purchase_receipt_item,
		},
		"name",
		order_by="name asc",
	)


def _sync_asset_bin_from_purchase_receipt(doc, item, asset, qty):
	filters = {
		"company": doc.company,
		"asset": asset,
		"holder_type": "Warehouse",
		"warehouse": item.warehouse,
		"source_type": "Purchase Receipt",
		"source_id": doc.name,
		"source_row_id": item.name,
		"disabled": 0,
	}
	rate = flt(item.get("rate"))
	amount = flt(item.get("amount")) or qty * rate
	name = frappe.db.get_value("Asset Bin", filters, "name")
	if name:
		bin_doc = frappe.get_doc("Asset Bin", name)
	else:
		bin_doc = frappe.get_doc({
			"doctype": "Asset Bin",
			**filters,
		})

	bin_doc.asset_name = frappe.db.get_value("Asset", asset, "asset_name") or asset
	bin_doc.qty = qty
	bin_doc.rate = rate
	bin_doc.amount = amount
	bin_doc.posting_date = doc.posting_date
	bin_doc.save(ignore_permissions=True) if bin_doc.name else bin_doc.insert(ignore_permissions=True)


@frappe.whitelist()
def get_dashboard_data(filters=None):
	filters = _filters(filters)
	bin_rows = get_asset_bin_rows(filters)
	total_rows = get_asset_bin_rows({"asset": filters.get("asset")} if filters.get("asset") else {})
	movements = get_movement_history(filters)

	return {
		"total_asset_qty": sum(flt(row.get("qty")) for row in total_rows),
		"warehouse_qty": sum(flt(row.get("qty")) for row in bin_rows if row.get("holder_type") == "Warehouse"),
		"department_qty": sum(flt(row.get("qty")) for row in bin_rows if row.get("holder_type") == "Department"),
		"total_asset_value": sum(flt(row.get("amount")) for row in bin_rows),
		"asset_bin_rows": bin_rows[:8],
		"latest_movements": movements[:6],
	}


@frappe.whitelist()
def get_filter_options(holder_type=None):
	holder_type = holder_type or ""
	assets = frappe.get_all("Asset", fields=["name", "asset_name"], order_by="modified desc", limit_page_length=200)
	warehouses = []
	departments = []
	locations = []

	if not holder_type or holder_type == "All" or holder_type == "Warehouse":
		warehouses = frappe.get_all("Warehouse", fields=["name"], order_by="name asc", limit_page_length=500)
		locations.extend({"value": row.name, "label": f"Warehouse: {row.name}", "holder_type": "Warehouse"} for row in warehouses)

	if not holder_type or holder_type == "All" or holder_type == "Department":
		departments = frappe.get_all("Department", fields=["name"], order_by="name asc", limit_page_length=500)
		locations.extend({"value": row.name, "label": f"Department: {row.name}", "holder_type": "Department"} for row in departments)

	return {
		"assets": assets,
		"locations": locations,
		"warehouses": warehouses,
		"departments": departments,
	}


@frappe.whitelist()
def get_asset_bin_rows(filters=None):
	filters = _filters(filters)
	query_filters = [["disabled", "=", 0]]
	if filters.get("company"):
		query_filters.append(["company", "=", filters["company"]])
	if filters.get("asset"):
		query_filters.append(["asset", "=", filters["asset"]])
	if filters.get("holder_type"):
		query_filters.append(["holder_type", "=", filters["holder_type"]])
	query_filters += _date_filters(filters)

	rows = frappe.get_all(
		"Asset Bin",
		filters=query_filters,
		fields=[
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
		order_by="posting_date desc, creation desc",
		limit_page_length=300,
	)

	location = (filters.get("location") or "").strip().lower()
	out = []
	for row in rows:
		if location and location not in (row.location_display or "").lower():
			continue
		out.append(
			{
				"name": row.name,
				"company": row.company,
				"asset": row.asset,
				"asset_name": row.asset_name or _asset_title(row.asset),
				"holder_type": row.holder_type,
				"warehouse": row.warehouse,
				"department": row.department,
				"location_display": row.location_display,
				"qty": flt(row.qty),
				"rate": flt(row.rate),
				"amount": flt(row.amount),
				"source_type": row.source_type,
				"source_id": _source_link(row),
				"posting_date": row.posting_date,
			}
		)
	return out


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


@frappe.whitelist()
def get_movement_history(filters=None):
	filters = _filters(filters)
	query_filters = [["docstatus", "=", 1]]
	if filters.get("asset"):
		query_filters.append(["asset_name", "=", filters["asset"]])
	query_filters += _date_filters(filters)

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
			"docstatus",
		],
		order_by="posting_date desc, modified desc",
		limit_page_length=300,
	)

	out = []
	for row in rows:
		from_location = _location_display(
			row.from_holder_type,
			row.from_warehouse if row.from_holder_type == "Warehouse" else row.from_department,
		)
		to_location = _location_display(
			row.to_holder_type,
			row.to_warehouse if row.to_holder_type == "Warehouse" else row.to_department,
		)
		if filters.get("holder_type") and filters["holder_type"] not in {row.from_holder_type, row.to_holder_type}:
			continue
		if filters.get("location"):
			needle = filters["location"].strip().lower()
			if needle not in from_location.lower() and needle not in to_location.lower():
				continue
		out.append(
			{
				"posting_date": row.posting_date,
				"asset": row.asset_name,
				"asset_name": _asset_title(row.asset_name),
				"move_asset": row.name,
				"qty": flt(row.move_qty),
				"from_location_display": from_location,
				"to_location_display": to_location,
				"source_id": row.purchase_receipt or "",
				"source_type": "Purchase Receipt" if row.purchase_receipt else "",
				"rate": flt(row.rate),
				"amount": flt(row.move_qty_value) or flt(row.move_qty) * flt(row.rate),
				"status": "Submitted",
			}
		)
	return out


@frappe.whitelist()
def get_move_asset_form_options():
	return {
		"companies": frappe.get_all("Company", pluck="name", limit_page_length=50),
		"warehouses": frappe.get_all("Warehouse", fields=["name", "company"], order_by="name asc", limit_page_length=200),
		"departments": frappe.get_all("Department", fields=["name", "company"], order_by="name asc", limit_page_length=200),
		"assets": frappe.get_all(
			"Asset",
			fields=_asset_fields(["name", "asset_name", "item_code", "company", "asset_category"]),
			order_by="modified desc",
			limit_page_length=50,
		),
	}


@frappe.whitelist()
def get_asset_details(asset, company=None):
	if frappe.db.exists("Asset Bin", asset):
		row = frappe.db.get_value(
			"Asset Bin",
			asset,
			[
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
			as_dict=True,
		)
		if not row:
			return {}
		asset_doc = frappe.db.get_value(
			"Asset",
			row.asset,
			_asset_fields(["name", "asset_name", "item_code", "item_name", "asset_category", "company"]),
			as_dict=True,
		) or {}
		source = _asset_bin_option(row)
		return {
			"asset": row.asset,
			"asset_bin": row.name,
			"asset_name": row.asset_name or asset_doc.get("asset_name") or row.asset,
			"item_code": asset_doc.get("item_code"),
			"item_name": asset_doc.get("item_name"),
			"item_display": asset_doc.get("item_name") or asset_doc.get("item_code") or "",
			"asset_category": asset_doc.get("asset_category"),
			"company": row.company or asset_doc.get("company"),
			"total_available_qty": flt(row.qty),
			"available_qty_at_source": flt(row.qty),
			"source_type": row.source_type,
			"source_id": row.source_id,
			"purchase_receipt": row.source_id if row.source_type == "Purchase Receipt" else "",
			"holder_type": row.holder_type,
			"warehouse": row.warehouse,
			"department": row.department,
			"location_display": source.get("location_display"),
			"selected_source_location": _source_location_text(source),
			"rate": flt(row.rate),
			"amount": flt(row.amount),
			"bins": [source],
		}
	if not asset:
		return {}
	asset_doc = frappe.db.get_value(
		"Asset",
		asset,
		_asset_fields(["name", "asset_name", "item_code", "item_name", "asset_category", "company"]),
		as_dict=True,
	)
	if not asset_doc:
		return {}
	balance_company = company or asset_doc.company
	filters = {"asset": asset, "disabled": 0}
	if balance_company:
		filters["company"] = balance_company
	total = sum(
		flt(row.qty)
		for row in frappe.get_all("Asset Bin", filters=filters, fields=["qty"], limit_page_length=0)
	)
	bins = [
		row
		for row in get_asset_bin_rows({"asset": asset, "company": balance_company, "holder_type": "", "location": ""})
		if flt(row.get("qty")) > 0
	]
	source = bins[0] if bins else {}
	return {
		"asset": asset_doc.get("name"),
		"asset_name": asset_doc.get("asset_name"),
		"item_code": asset_doc.get("item_code"),
		"item_name": asset_doc.get("item_name"),
		"item_display": asset_doc.get("item_name") or asset_doc.get("item_code") or "",
		"asset_category": asset_doc.get("asset_category"),
		"company": asset_doc.get("company"),
		"total_available_qty": flt(total),
		"asset_bin": source.get("name"),
		"available_qty_at_source": flt(source.get("qty")),
		"source_type": source.get("source_type"),
		"source_id": source.get("source_id"),
		"purchase_receipt": source.get("source_id") if source.get("source_type") == "Purchase Receipt" else "",
		"holder_type": source.get("holder_type"),
		"warehouse": source.get("warehouse"),
		"department": source.get("department"),
		"location_display": source.get("location_display"),
		"selected_source_location": _source_location_text(source),
		"rate": flt(source.get("rate")),
		"amount": flt(source.get("amount")),
		"bins": bins[:20],
	}


def _source_location_text(source):
	if not source:
		return ""
	location = source.get("location_display")
	qty = flt(source.get("qty"))
	text = f"{location} | Qty {qty:g}" if location else f"Qty {qty:g}"
	if source.get("source_id"):
		text += f" | {source.get('source_id')}"
	return text


@frappe.whitelist()
def get_source_balance(asset, company, holder_type, warehouse=None, department=None):
	if frappe.db.exists("Asset Bin", asset):
		row = frappe.db.get_value(
			"Asset Bin",
			asset,
			["name", "qty", "rate", "amount", "source_type", "source_id", "location_display"],
			as_dict=True,
		)
		if not row:
			return {"available_qty_at_source": 0, "rate": 0, "amount": 0}
		selected = f"{row.location_display} | Qty {flt(row.qty):g}" if row.location_display else f"Qty {flt(row.qty):g}"
		if row.source_id:
			selected += f" | {row.source_id}"
		return {
			"asset_bin": row.name,
			"available_qty_at_source": flt(row.qty),
			"rate": flt(row.rate),
			"amount": flt(row.amount),
			"source_type": row.source_type,
			"source_id": row.source_id,
			"location_display": row.location_display,
			"selected_source_location": selected,
		}
	location = warehouse if holder_type == "Warehouse" else department
	if not (asset and company and holder_type and location):
		return {"available_qty_at_source": 0, "rate": 0, "amount": 0}

	filters = {
		"asset": asset,
		"company": company,
		"holder_type": holder_type,
		"disabled": 0,
	}
	if holder_type == "Warehouse":
		filters["warehouse"] = warehouse
	else:
		filters["department"] = department

	rows = frappe.get_all(
		"Asset Bin",
		filters=filters,
		fields=["name", "qty", "rate", "amount", "source_type", "source_id", "location_display"],
		order_by="qty desc, modified desc",
		limit_page_length=0,
	)
	if not rows:
		return {"available_qty_at_source": 0, "rate": 0, "amount": 0}
	total_qty = sum(flt(row.qty) for row in rows)
	total_amount = sum(flt(row.amount) for row in rows)
	row = rows[0]
	rate = flt(total_amount) / total_qty if total_qty else flt(row.rate)
	selected = f"{row.location_display} | Qty {total_qty:g}" if row.location_display else f"Qty {total_qty:g}"
	if len(rows) == 1 and row.source_id:
		selected += f" | {row.source_id}"
	return {
		"available_qty_at_source": flt(total_qty),
		"rate": flt(rate),
		"amount": flt(total_amount),
		"source_type": row.source_type if len(rows) == 1 else "",
		"source_id": row.source_id if len(rows) == 1 else "",
		"location_display": row.location_display,
		"selected_source_location": selected,
	}


@frappe.whitelist()
def submit_move_asset(data):
	if isinstance(data, str):
		data = json.loads(data or "{}")
	data = data or {}

	selected_asset_bin = data.get("asset_bin")
	if selected_asset_bin:
		bin_row = frappe.db.get_value(
			"Asset Bin",
			selected_asset_bin,
			["asset", "company", "holder_type", "warehouse", "department"],
			as_dict=True,
		)
		if not bin_row:
			frappe.throw("Selected Asset Bin was not found.")
		data["asset_name"] = bin_row.asset
		data["company"] = data.get("company") or bin_row.company
		data["from_holder_type"] = bin_row.holder_type
		data["from_warehouse"] = bin_row.warehouse if bin_row.holder_type == "Warehouse" else ""
		data["from_department"] = bin_row.department if bin_row.holder_type == "Department" else ""

	details = get_asset_details(selected_asset_bin or data.get("asset_name"), data.get("company"))
	source = get_source_balance(
		selected_asset_bin or data.get("asset_name"),
		data.get("company"),
		data.get("from_holder_type"),
		data.get("from_warehouse"),
		data.get("from_department"),
	)
	move_qty = flt(data.get("move_qty"))
	rate = flt(source.get("rate"))

	doc = frappe.get_doc(
		{
			"doctype": "Move Asset",
			"posting_date": data.get("posting_date") or nowdate(),
			"company": data.get("company"),
			"asset_name": data.get("asset_name"),
			"total_available_qty": flt(details.get("total_available_qty")),
			"asset_category": details.get("asset_category"),
			"from_holder_type": data.get("from_holder_type"),
			"from_warehouse": data.get("from_warehouse") if data.get("from_holder_type") == "Warehouse" else None,
			"from_department": data.get("from_department") if data.get("from_holder_type") == "Department" else None,
			"available_qty_at_source": flt(source.get("available_qty_at_source")),
			"move_qty": move_qty,
			"to_holder_type": data.get("to_holder_type"),
			"to_warehouse": data.get("to_warehouse") if data.get("to_holder_type") == "Warehouse" else None,
			"to_department": data.get("to_department") if data.get("to_holder_type") == "Department" else None,
			"rate": rate,
			"move_qty_value": move_qty * rate,
			"purchase_receipt": source.get("source_id") if source.get("source_type") == "Purchase Receipt" else None,
			"selected_source_location": source.get("selected_source_location"),
			"remarks": data.get("remarks"),
		}
	)
	doc.flags.ignore_permissions = True
	doc.flags.selected_asset_bin = selected_asset_bin
	doc.insert()
	doc.flags.ignore_permissions = True
	doc.flags.selected_asset_bin = selected_asset_bin
	doc.submit()
	return {
		"success": True,
		"move_asset": doc.name,
		"asset_bin_rows": get_asset_bin_rows({"asset": doc.asset_name}),
	}
