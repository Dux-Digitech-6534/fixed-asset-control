import frappe
from frappe.utils import flt

from erpnext.controllers.buying_controller import BuyingController


_original_make_asset = BuyingController.make_asset


def make_asset_without_required_location(self, row, accounting_dimensions, is_grouped_asset=False):
	if self.doctype != "Purchase Receipt":
		return _original_make_asset(self, row, accounting_dimensions, is_grouped_asset)

	item_data = frappe.get_cached_value(
		"Item", row.item_code, ["asset_naming_series", "asset_category"], as_dict=1
	)
	asset_quantity = row.qty if is_grouped_asset else 1
	purchase_amount = flt(row.valuation_rate) * asset_quantity

	asset = frappe.get_doc(
		{
			"doctype": "Asset",
			"item_code": row.item_code,
			"asset_name": row.item_name,
			"naming_series": item_data.get("asset_naming_series") or "AST",
			"asset_category": item_data.get("asset_category"),
			"location": row.asset_location,
			"company": self.company,
			"status": "Draft",
			"supplier": self.supplier,
			"purchase_date": self.posting_date,
			"calculate_depreciation": 0,
			"purchase_amount": purchase_amount,
			"net_purchase_amount": purchase_amount,
			"asset_quantity": asset_quantity,
			"purchase_receipt": self.name,
			"purchase_invoice": None,
			"purchase_receipt_item": row.name,
			"purchase_invoice_item": None,
		}
	)
	for dimension in accounting_dimensions[0]:
		fieldname = dimension["fieldname"]
		default_dimension = accounting_dimensions[1].get(self.company, {}).get(fieldname)
		asset.update({fieldname: row.get(fieldname) or self.get(fieldname) or default_dimension})

	asset.flags.ignore_validate = True
	asset.flags.ignore_mandatory = True
	asset.set_missing_values()
	asset.db_insert()

	return asset.name


def apply_patch():
	if getattr(BuyingController.make_asset, "_fixed_asset_control_location_optional", False):
		return
	make_asset_without_required_location._fixed_asset_control_location_optional = True
	BuyingController.make_asset = make_asset_without_required_location
