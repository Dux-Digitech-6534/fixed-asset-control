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
