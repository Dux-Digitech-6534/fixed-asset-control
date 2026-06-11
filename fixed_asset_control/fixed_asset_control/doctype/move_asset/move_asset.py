# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MoveAsset(Document):
	def validate(self):
		self.normalize_location_values()
		self.validate_required_fields()
		self.validate_holder_types()
		self.validate_locations()
		self.set_source_snapshot()
		self.validate_move_qty()
		self.validate_source_and_target_are_different()
		self.set_move_qty_value()

	def before_submit(self):
		self.set_source_snapshot(self.get_source_bin_for_submit())
		self.validate_move_qty()

	def normalize_location_values(self):
		self.from_warehouse = self.clean_location_value(self.from_warehouse, "Warehouse")
		self.from_department = self.clean_location_value(self.from_department, "Department")
		self.to_warehouse = self.clean_location_value(self.to_warehouse, "Warehouse")
		self.to_department = self.clean_location_value(self.to_department, "Department")

	def clean_location_value(self, value, holder_type):
		value = (value or "").strip()
		if not value:
			return value

		prefix = f"{holder_type}:"
		if value.startswith(prefix):
			value = value[len(prefix) :].strip()
		return value.split("|")[0].strip()

	def set_source_snapshot(self, bin_row=None):
		bin_row = bin_row or self.get_selected_asset_bin()
		if not bin_row:
			self.available_qty_at_source = flt(self.available_qty_at_source)
			self.rate = flt(self.rate)
			self.move_qty = flt(self.move_qty)
			self.move_qty_value = flt(self.rate) * flt(self.move_qty)
			return

		source_qty = flt(bin_row.qty)
		source_rate = flt(bin_row.rate)
		source_id = bin_row.source_id or ""

		self.available_qty_at_source = source_qty
		self.rate = source_rate
		self.move_qty = flt(self.move_qty)
		self.move_qty_value = flt(self.move_qty) * source_rate
		self.selected_source_location = self.get_source_location_display(bin_row, source_qty, source_id)
		self.purchase_receipt = source_id if bin_row.source_type == "Purchase Receipt" else None

	def get_source_location_display(self, bin_row, source_qty, source_id=None):
		location_display = bin_row.location_display or self.get_location_display(
			self.from_holder_type, self.get_source_location()
		)
		text = f"{location_display} | Qty {source_qty:g}" if location_display else f"Qty {source_qty:g}"
		if source_id:
			text += f" | {source_id}"
		return text

	def get_location_display(self, holder_type, location):
		return f"{holder_type}: {location}" if holder_type and location else None

	def get_selected_asset_bin(self):
		filters = self.get_source_bin_filters()
		if not filters:
			return None

		rows = frappe.get_all(
			"Asset Bin",
			filters=filters,
			fields=["name", "qty", "rate", "source_type", "source_id", "location_display"],
			order_by="qty desc, modified desc",
			limit=1,
		)
		return rows[0] if rows else None

	def get_source_bin_filters(self):
		if not (self.company and self.asset_name and self.from_holder_type):
			return None

		filters = {
			"company": self.company,
			"asset": self.asset_name,
			"holder_type": self.from_holder_type,
			"disabled": 0,
		}
		if self.from_holder_type == "Warehouse" and self.from_warehouse:
			filters["warehouse"] = self.from_warehouse
		elif self.from_holder_type == "Department" and self.from_department:
			filters["department"] = self.from_department
		else:
			return None

		return filters

	def validate_required_fields(self):
		for fieldname, label in (
			("posting_date", _("Posting Date")),
			("company", _("Company")),
			("asset_name", _("Asset Name")),
			("from_holder_type", _("From Holder Type")),
			("to_holder_type", _("To Holder Type")),
		):
			if not self.get(fieldname):
				frappe.throw(_("{0} is required.").format(label))

	def validate_holder_types(self):
		valid_holder_types = {"Warehouse", "Department"}
		if self.from_holder_type not in valid_holder_types:
			frappe.throw(_("From Holder Type must be Warehouse or Department."))
		if self.to_holder_type not in valid_holder_types:
			frappe.throw(_("To Holder Type must be Warehouse or Department."))

	def validate_locations(self):
		if self.from_holder_type == "Warehouse" and not self.from_warehouse:
			frappe.throw(_("From Warehouse is required."))
		if self.from_holder_type == "Department" and not self.from_department:
			frappe.throw(_("From Department is required."))
		if self.to_holder_type == "Warehouse" and not self.to_warehouse:
			frappe.throw(_("To Warehouse is required."))
		if self.to_holder_type == "Department" and not self.to_department:
			frappe.throw(_("To Department is required."))

	def validate_move_qty(self):
		move_qty = flt(self.move_qty)
		available_qty = flt(self.available_qty_at_source)

		if move_qty <= 0:
			frappe.throw(_("Move Qty must be greater than 0."))
		if available_qty <= 0:
			frappe.throw(_("No Asset Bin balance found for selected asset and source location."))
		if move_qty > available_qty:
			frappe.throw(
				_("Move Qty {0} cannot be greater than Available Qty at Source {1}.").format(
					move_qty, available_qty
				)
			)

	def validate_source_and_target_are_different(self):
		from_location = self.get_source_location()
		to_location = self.get_target_location()

		if self.from_holder_type == self.to_holder_type and from_location == to_location:
			frappe.throw(_("To location cannot be same as From location."))

	def set_move_qty_value(self):
		self.move_qty_value = flt(self.rate) * flt(self.move_qty)

	def get_source_location(self):
		if self.from_holder_type == "Warehouse":
			return self.from_warehouse
		if self.from_holder_type == "Department":
			return self.from_department
		return None

	def get_target_location(self):
		if self.to_holder_type == "Warehouse":
			return self.to_warehouse
		if self.to_holder_type == "Department":
			return self.to_department
		return None

	def on_submit(self):
		source_bin = self.get_source_bin_for_submit()
		move_qty = flt(self.move_qty)
		rate = flt(self.rate) or flt(source_bin.rate)
		source_type = source_bin.source_type or "Opening"
		source_id = source_bin.source_id
		self.set_source_snapshot(source_bin)

		source_bin.qty = flt(source_bin.qty) - move_qty
		source_bin.rate = flt(source_bin.rate) or rate
		source_bin.amount = flt(source_bin.qty) * flt(source_bin.rate)
		source_bin.save(ignore_permissions=True)

		target_bin = self.get_or_create_target_bin(source_type, source_id, rate)
		target_bin.qty = flt(target_bin.qty) + move_qty
		target_bin.rate = rate
		target_bin.amount = flt(target_bin.qty) * flt(target_bin.rate)
		target_bin.posting_date = self.posting_date
		target_bin.save(ignore_permissions=True)

		# Movement History now reads submitted Move Asset records directly.

	def get_source_bin_for_submit(self):
		filters = self.get_source_bin_filters()
		if not filters:
			frappe.throw(_("Valid source Asset Bin could not be identified."))

		rows = frappe.get_all(
			"Asset Bin",
			filters=filters,
			fields=["name", "qty", "rate", "source_type", "source_id", "location_display"],
			order_by="qty desc, modified desc",
			limit=1,
		)
		if not rows:
			frappe.throw(_("No Asset Bin balance found for selected asset and source location."))

		row = rows[0]
		if flt(row.qty) < flt(self.move_qty):
			frappe.throw(
				_("Move Qty {0} cannot be greater than Available Qty at Source {1}.").format(
					flt(self.move_qty), flt(row.qty)
				)
			)
		return frappe.get_doc("Asset Bin", row.name)

	def get_or_create_target_bin(self, source_type, source_id, rate):
		filters = {
			"company": self.company,
			"asset": self.asset_name,
			"holder_type": self.to_holder_type,
			"disabled": 0,
		}
		if self.to_holder_type == "Warehouse":
			filters["warehouse"] = self.to_warehouse
		else:
			filters["department"] = self.to_department

		name = frappe.db.get_value("Asset Bin", filters, "name")
		if name:
			return frappe.get_doc("Asset Bin", name)

		asset_name = frappe.db.get_value("Asset", self.asset_name, "asset_name")
		return frappe.get_doc({
			"doctype": "Asset Bin",
			"company": self.company,
			"asset": self.asset_name,
			"asset_name": asset_name,
			"holder_type": self.to_holder_type,
			"warehouse": self.to_warehouse if self.to_holder_type == "Warehouse" else None,
			"department": self.to_department if self.to_holder_type == "Department" else None,
			"qty": 0,
			"rate": rate,
			"source_type": source_type or "Opening",
			"source_id": source_id,
			"posting_date": self.posting_date,
			"disabled": 0,
		}).insert(ignore_permissions=True)

	def create_movement_ledger(self, source_type, source_id, rate):
		frappe.get_doc({
			"doctype": "Asset Movement Ledger",
			"posting_date": self.posting_date,
			"company": self.company,
			"asset": self.asset_name,
			"from_holder_type": self.from_holder_type,
			"from_warehouse": self.from_warehouse if self.from_holder_type == "Warehouse" else None,
			"from_department": self.from_department if self.from_holder_type == "Department" else None,
			"to_holder_type": self.to_holder_type,
			"to_warehouse": self.to_warehouse if self.to_holder_type == "Warehouse" else None,
			"to_department": self.to_department if self.to_holder_type == "Department" else None,
			"qty": flt(self.move_qty),
			"rate": rate,
			"amount": flt(self.move_qty) * flt(rate),
			"source_type": source_type,
			"source_id": source_id,
			"move_asset": self.name,
			"remarks": self.remarks,
		}).insert(ignore_permissions=True)

	def on_cancel(self):
		frappe.throw(_("Cancel reversal for Asset Bin is not implemented yet."))


@frappe.whitelist()
def get_asset_details(asset, company=None):
	if not asset:
		return {}

	asset_doc = frappe.db.get_value(
		"Asset",
		asset,
		["asset_name", "asset_category", "company"],
		as_dict=True,
	) or {}
	balance_company = company or asset_doc.get("company")
	filters = {"asset": asset, "disabled": 0}
	if balance_company:
		filters["company"] = balance_company

	total_qty = frappe.get_all(
		"Asset Bin",
		filters=filters,
		fields=["sum(qty) as total_available_qty"],
	)[0].total_available_qty or 0

	return {
		"asset_name": asset_doc.get("asset_name") or asset,
		"asset_category": asset_doc.get("asset_category"),
		"company": asset_doc.get("company"),
		"total_available_qty": flt(total_qty),
	}


@frappe.whitelist()
def get_source_asset_bin(asset, company, holder_type, location):
	if not (asset and company and holder_type and location):
		return {"qty": 0, "rate": 0}

	filters = {
		"asset": asset,
		"company": company,
		"holder_type": holder_type,
		"disabled": 0,
	}
	if holder_type == "Warehouse":
		filters["warehouse"] = location
	elif holder_type == "Department":
		filters["department"] = location
	else:
		return {"qty": 0, "rate": 0}

	rows = frappe.get_all(
		"Asset Bin",
		filters=filters,
		fields=[
			"name",
			"qty",
			"rate",
			"amount",
			"source_type",
			"source_id",
			"location_display",
		],
		order_by="qty desc, modified desc",
		limit=1,
	)
	if not rows:
		return {"qty": 0, "rate": 0}

	return rows[0]


@frappe.whitelist()
def get_asset_bins(asset, company):
	if not asset or not company:
		return []

	rows = frappe.get_all(
		"Asset Bin",
		filters={"asset": asset, "company": company, "disabled": 0},
		fields=[
			"name",
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
			"source_row_id",
			"posting_date",
		],
		order_by="holder_type desc, location_display asc",
	)
	return [row for row in rows if flt(row.qty) > 0]
