import frappe
from frappe.utils import flt


def sync_purchase_receipt_asset_bins(doc, method=None):
	if doc.doctype != "Purchase Receipt" or doc.docstatus != 1:
		return

	for item in doc.get("items", []):
		if not (item.get("is_fixed_asset") and item.get("warehouse")):
			continue

		qty = flt(item.get("qty"))
		if qty <= 0:
			continue

		asset = frappe.db.get_value(
			"Asset",
			{
				"purchase_receipt": doc.name,
				"purchase_receipt_item": item.name,
			},
			"name",
			order_by="name asc",
		)
		if not asset:
			continue

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
