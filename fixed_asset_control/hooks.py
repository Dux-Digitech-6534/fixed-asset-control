app_name = "fixed_asset_control"
app_title = "Fixed Asset Control"
app_publisher = "Dux Digitech"
app_description = "Fixed Asset Control"
app_email = "support@duxdigitech.com"
app_license = "MIT"

doc_events = {
	"Purchase Receipt": {
		"on_submit": "fixed_asset_control.fixed_asset_control.purchase_receipt_hooks.sync_purchase_receipt_asset_bins",
		"on_cancel": "fixed_asset_control.fixed_asset_control.purchase_receipt_hooks.remove_purchase_receipt_asset_bins",
	},
}

doctype_js = {
	"Item": "public/item.js",
}

from fixed_asset_control.fixed_asset_control.purchase_receipt_location_override import apply_patch as _apply_purchase_receipt_asset_location_patch

_apply_purchase_receipt_asset_location_patch()
