frappe.ui.form.on("Item", {
	item_code(frm) {
		sync_item_name_from_code(frm);
	},

	is_fixed_asset(frm) {
		if (frm.doc.is_fixed_asset && !frm.doc.auto_create_assets) {
			frm.set_value("auto_create_assets", 1);
		}
	},

	validate(frm) {
		sync_item_name_from_code(frm);
	},
});

function sync_item_name_from_code(frm) {
	const item_code = frm.doc.item_code || "";
	if (frm.doc.item_name !== item_code) {
		frm.set_value("item_name", item_code);
	}
}
