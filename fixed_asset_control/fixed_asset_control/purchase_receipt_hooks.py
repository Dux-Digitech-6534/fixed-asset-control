import frappe
from frappe.utils import flt


def _asset_has_field(fieldname):
	return frappe.get_meta("Asset").has_field(fieldname)


def _clean_filters(filters):
	return {key: value for key, value in filters.items() if value not in (None, "")}


def _get_asset_for_purchase_receipt_item(doc, item):
	direct_asset = item.get("asset")
	if direct_asset and frappe.db.exists("Asset", direct_asset):
		return direct_asset

	candidate_filters = []
	if _asset_has_field("purchase_receipt") and _asset_has_field("purchase_receipt_item"):
		candidate_filters.append({
			"purchase_receipt": doc.name,
			"purchase_receipt_item": item.name,
		})

	if _asset_has_field("purchase_receipt"):
		candidate_filters.append({
			"purchase_receipt": doc.name,
			"item_code": item.get("item_code"),
			"company": doc.company,
		})
		candidate_filters.append({
			"purchase_receipt": doc.name,
			"asset_name": item.get("item_name"),
			"company": doc.company,
		})

	for filters in candidate_filters:
		asset = frappe.db.get_value("Asset", _clean_filters(filters), "name", order_by="creation asc")
		if asset:
			return asset

	return None


def _get_purchase_receipt_item_warehouse(doc, item):
	warehouse = item.get("warehouse") or doc.get("set_warehouse")
	if warehouse:
		return warehouse

	abbr = frappe.db.get_value("Company", doc.company, "abbr")
	if abbr:
		default_warehouse = f"Stores - {abbr}"
		if frappe.db.exists("Warehouse", default_warehouse):
			return default_warehouse

	return None


def _create_asset_for_purchase_receipt_item(doc, item):
	item_data = frappe.get_cached_value(
		"Item", item.item_code, ["asset_naming_series", "asset_category"], as_dict=1
	) or {}
	asset_category = item.get("asset_category") or item_data.get("asset_category")
	if not asset_category:
		frappe.log_error(
			title="Fixed Asset Control: Asset Category missing",
			message=f"Purchase Receipt: {doc.name}, Item Row: {item.name}, Item Code: {item.get('item_code')}",
		)
		return None

	qty = flt(item.get("qty"))
	rate = flt(item.get("rate") or item.get("valuation_rate"))
	purchase_amount = flt(item.get("amount")) or qty * rate
	asset = frappe.get_doc({
		"doctype": "Asset",
		"item_code": item.item_code,
		"asset_name": item.get("item_name") or item.item_code,
		"naming_series": item_data.get("asset_naming_series") or "ACC-ASS-.YYYY.-",
		"asset_category": asset_category,
		"company": doc.company,
		"status": "Draft",
		"supplier": doc.get("supplier"),
		"purchase_date": doc.get("posting_date"),
		"calculate_depreciation": 0,
		"purchase_amount": purchase_amount,
		"net_purchase_amount": purchase_amount,
		"gross_purchase_amount": purchase_amount,
		"asset_quantity": qty or 1,
		"purchase_receipt": doc.name,
		"purchase_receipt_item": item.name,
	})
	asset.flags.ignore_validate = True
	asset.flags.ignore_mandatory = True
	asset.insert(ignore_permissions=True, ignore_mandatory=True)
	return asset.name


def sync_purchase_receipt_asset_bins(doc, method=None):
	if doc.doctype != "Purchase Receipt" or doc.docstatus != 1:
		return

	for item in doc.get("items", []):
		if not item.get("is_fixed_asset"):
			continue

		warehouse = _get_purchase_receipt_item_warehouse(doc, item)
		if not warehouse:
			frappe.log_error(
				title="Fixed Asset Control: Warehouse not found for Purchase Receipt Item",
				message=f"Purchase Receipt: {doc.name}, Item Row: {item.name}, Item Code: {item.get('item_code')}",
			)
			continue

		qty = flt(item.get("qty"))
		if qty <= 0:
			continue

		asset = _get_asset_for_purchase_receipt_item(doc, item) or _create_asset_for_purchase_receipt_item(doc, item)
		if not asset:
			frappe.log_error(
				title="Fixed Asset Control: Asset not found for Purchase Receipt Item",
				message=f"Purchase Receipt: {doc.name}, Item Row: {item.name}, Item Code: {item.get('item_code')}",
			)
			continue

		filters = {
			"company": doc.company,
			"asset": asset,
			"holder_type": "Warehouse",
			"warehouse": warehouse,
			"source_type": "Purchase Receipt",
			"source_id": doc.name,
			"source_row_id": item.name,
			"disabled": 0,
		}
		name = frappe.db.get_value("Asset Bin", filters, "name")
		if name:
			bin_doc = frappe.get_doc("Asset Bin", name)
		else:
			bin_doc = frappe.get_doc({
				"doctype": "Asset Bin",
				**filters,
			})

		qty = flt(item.get("qty"))
		rate = flt(item.get("rate"))
		bin_doc.asset_name = frappe.db.get_value("Asset", asset, "asset_name") or asset
		bin_doc.qty = qty
		bin_doc.rate = rate
		bin_doc.amount = flt(item.get("amount")) or qty * rate
		bin_doc.posting_date = doc.posting_date
		if bin_doc.name:
			bin_doc.save(ignore_permissions=True)
		else:
			bin_doc.insert(ignore_permissions=True)


def remove_purchase_receipt_asset_bins(doc, method=None):
	if isinstance(doc, str):
		purchase_receipt = doc
	else:
		if doc.doctype != "Purchase Receipt":
			return
		purchase_receipt = doc.name

	for name in frappe.get_all(
		"Asset Bin",
		filters={
			"source_type": "Purchase Receipt",
			"source_id": purchase_receipt,
		},
		pluck="name",
	):
		frappe.delete_doc("Asset Bin", name, ignore_permissions=True, force=True)


def cleanup_cancelled_purchase_receipt_asset_bins():
	cancelled_receipts = frappe.get_all("Purchase Receipt", filters={"docstatus": 2}, pluck="name")
	for purchase_receipt in cancelled_receipts:
		remove_purchase_receipt_asset_bins(purchase_receipt)
