# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AssetBin(Document):
	def validate(self):
		self.set_asset_name()
		self.validate_holder_location()
		self.set_location_display()
		self.set_amount()
		self.validate_qty()
		self.validate_duplicate_active_bin()

	def set_asset_name(self):
		if self.asset:
			self.asset_name = frappe.db.get_value("Asset", self.asset, "asset_name") or self.asset_name

	def validate_holder_location(self):
		if self.holder_type == "Warehouse":
			if not self.warehouse:
				frappe.throw(_("Warehouse is required."))
			self.department = None
		elif self.holder_type == "Department":
			if not self.department:
				frappe.throw(_("Department is required."))
			self.warehouse = None
		else:
			frappe.throw(_("Holder Type must be Warehouse or Department."))

	def set_location_display(self):
		location = self.warehouse if self.holder_type == "Warehouse" else self.department
		self.location_display = f"{self.holder_type}: {location}" if location else None

	def set_amount(self):
		self.qty = flt(self.qty)
		self.rate = flt(self.rate)
		self.amount = self.qty * self.rate

	def validate_qty(self):
		if flt(self.qty) < 0:
			frappe.throw(_("Qty cannot be negative."))

	def validate_duplicate_active_bin(self):
		if self.disabled:
			return

		filters = {
			"company": self.company,
			"asset": self.asset,
			"holder_type": self.holder_type,
			"disabled": 0,
		}
		if self.source_id:
			filters["source_id"] = self.source_id
		if self.holder_type == "Warehouse":
			filters["warehouse"] = self.warehouse
		else:
			filters["department"] = self.department

		duplicate = frappe.db.get_value("Asset Bin", filters, "name")
		if duplicate and duplicate != self.name:
			frappe.throw(_("Active Asset Bin already exists for this asset, location and source."))
