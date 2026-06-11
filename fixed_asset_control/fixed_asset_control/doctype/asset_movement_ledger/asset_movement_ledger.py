# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AssetMovementLedger(Document):
	def validate(self):
		self.set_asset_name()
		self.set_location_display()
		self.set_amount()
		self.validate_qty()

	def set_asset_name(self):
		if self.asset:
			self.asset_name = frappe.db.get_value("Asset", self.asset, "asset_name") or self.asset_name

	def set_location_display(self):
		from_location = self.from_warehouse if self.from_holder_type == "Warehouse" else self.from_department
		to_location = self.to_warehouse if self.to_holder_type == "Warehouse" else self.to_department
		self.from_location_display = f"{self.from_holder_type}: {from_location}" if from_location else None
		self.to_location_display = f"{self.to_holder_type}: {to_location}" if to_location else None

	def set_amount(self):
		self.qty = flt(self.qty)
		self.rate = flt(self.rate)
		self.amount = self.qty * self.rate

	def validate_qty(self):
		if flt(self.qty) <= 0:
			frappe.throw(_("Qty must be greater than 0."))
