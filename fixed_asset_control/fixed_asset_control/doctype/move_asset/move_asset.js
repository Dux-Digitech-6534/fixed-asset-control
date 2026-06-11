frappe.ui.form.on("Move Asset", {
	onload(frm) {
		set_link_queries(frm);
		clear_source_rows_html(frm);
		toggle_holder_fields(frm);
		if (!can_autofill_on_load(frm)) {
			update_movement_summary(frm);
			return;
		}
		fetch_selected_asset_details(frm);
		fetch_source_balance(frm);
		calculate_move_qty_value(frm);
		update_movement_summary(frm);
	},

	refresh(frm) {
		clear_source_rows_html(frm);
		toggle_holder_fields(frm);
		if (!can_autofill_on_load(frm)) {
			update_movement_summary(frm);
			return;
		}
		fetch_selected_asset_details(frm);
		fetch_source_balance(frm);
		calculate_move_qty_value(frm);
		update_movement_summary(frm);
	},

	validate(frm) {
		if (is_submitted(frm)) {
			return;
		}
		sanitize_location_fields(frm);
		validate_move_asset(frm);
	},

	asset_name(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		fetch_selected_asset_details(frm);
		fetch_source_balance(frm);
	},

	company(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		fetch_selected_asset_details(frm);
		fetch_source_balance(frm);
	},

	from_holder_type(frm) {
		toggle_holder_fields(frm);
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		clear_irrelevant_source_field(frm);
		fetch_source_balance(frm);
		update_movement_summary(frm);
	},

	from_warehouse(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		sanitize_location_fields(frm);
		fetch_source_balance(frm);
		update_movement_summary(frm);
	},

	from_department(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		sanitize_location_fields(frm);
		fetch_source_balance(frm);
		update_movement_summary(frm);
	},

	available_qty_at_source(frm) {
		update_reference_location(frm);
		update_movement_summary(frm);
	},

	to_holder_type(frm) {
		toggle_holder_fields(frm);
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		clear_irrelevant_target_field(frm);
		update_movement_summary(frm);
	},

	to_warehouse(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		sanitize_location_fields(frm);
		update_movement_summary(frm);
	},

	to_department(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		sanitize_location_fields(frm);
		update_movement_summary(frm);
	},

	move_qty(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		fetch_source_balance(frm).then(() => {
			calculate_move_qty_value(frm);
			update_movement_summary(frm);
		});
	},

	rate(frm) {
		if (is_submitted(frm)) {
			update_movement_summary(frm);
			return;
		}
		calculate_move_qty_value(frm);
		update_movement_summary(frm);
	},

	move_qty_value(frm) {
		update_movement_summary(frm);
	},
});

function is_submitted(frm) {
	return cint(frm.doc.docstatus) === 1;
}

function can_autofill_on_load(frm) {
	return frm.is_new() && !is_submitted(frm);
}

function is_saved_clean_draft(frm) {
	return !frm.is_new() && cint(frm.doc.docstatus) === 0 && !frm.is_dirty();
}

function set_values_if_changed(frm, values) {
	if (is_submitted(frm) || is_saved_clean_draft(frm)) {
		return Promise.resolve();
	}

	const changed = {};
	Object.keys(values).forEach((fieldname) => {
		const value = values[fieldname];
		if (!values_are_equal(fieldname, frm.doc[fieldname], value)) {
			changed[fieldname] = normalize_field_value(fieldname, value);
		}
	});

	if (!Object.keys(changed).length) {
		return Promise.resolve();
	}
	return frm.set_value(changed);
}

function set_if_changed(frm, fieldname, value) {
	if (is_submitted(frm) || is_saved_clean_draft(frm)) {
		return Promise.resolve();
	}
	if (values_are_equal(fieldname, frm.doc[fieldname], value)) {
		return Promise.resolve();
	}
	return frm.set_value(fieldname, normalize_field_value(fieldname, value));
}

function values_are_equal(fieldname, current_value, new_value) {
	const current_normalized = normalize_field_value(fieldname, current_value);
	const new_normalized = normalize_field_value(fieldname, new_value);

	if (is_numeric_field(fieldname)) {
		return to_float(current_normalized) === to_float(new_normalized);
	}
	return (current_normalized || "") === (new_normalized || "");
}

function normalize_field_value(fieldname, value) {
	if (is_numeric_field(fieldname)) {
		return to_float(value);
	}
	return value || "";
}

function is_numeric_field(fieldname) {
	return ["available_qty_at_source", "rate", "move_qty_value", "total_available_qty"].includes(fieldname);
}

function set_link_queries(frm) {
	frm.set_query("asset_name", () => get_asset_query(frm));
	["from_warehouse", "to_warehouse"].forEach((fieldname) => {
		frm.set_query(fieldname, () => get_company_filter(frm));
	});
	["from_department", "to_department"].forEach((fieldname) => {
		frm.set_query(fieldname, () => get_company_filter(frm));
	});
}

function get_company_filter(frm) {
	if (!frm.doc.company) {
		return {};
	}
	return { filters: { company: frm.doc.company } };
}

function get_asset_query(frm) {
	const filters = {};
	if (frm.doc.company) {
		filters.company = frm.doc.company;
	}
	return { filters };
}

function clear_source_rows_html(frm) {
	const field = frm.fields_dict.from_location_intro_html;
	if (field && field.$wrapper) {
		field.$wrapper.empty();
	}
}

function fetch_selected_asset_details(frm) {
	if (is_submitted(frm)) {
		return Promise.resolve();
	}
	if (!frm.doc.asset_name) {
		return set_values_if_changed(frm, {
			asset_category: "",
			total_available_qty: 0,
			purchase_receipt: "",
			rate: 0,
			available_qty_at_source: 0,
			selected_source_location: "",
		});
	}

	frappe
		.call({
			method: "fixed_asset_control.fixed_asset_control.doctype.move_asset.move_asset.get_asset_details",
			args: {
				asset: frm.doc.asset_name,
				company: frm.doc.company,
			},
		})
		.then((r) => {
			const asset = r.message || {};
			const values = {
				asset_category: asset.asset_category || "",
				total_available_qty: to_float(asset.total_available_qty),
			};
			if (!frm.doc.company && asset.company) {
				values.company = asset.company;
			}
			set_values_if_changed(frm, values).then(() => {
				fetch_source_balance(frm);
				calculate_move_qty_value(frm);
				update_movement_summary(frm);
			});
		});
}

function fetch_source_balance(frm) {
	if (is_submitted(frm)) {
		return Promise.resolve();
	}
	const holder_type = frm.doc.from_holder_type;
	const location = get_from_location(frm);

	if (!frm.doc.asset_name || !frm.doc.company || !holder_type || !location) {
		set_source_balance_values(frm, {});
		return Promise.resolve();
	}

	return frappe
		.call({
			method: "fixed_asset_control.fixed_asset_control.doctype.move_asset.move_asset.get_source_asset_bin",
			args: {
				asset: frm.doc.asset_name,
				company: frm.doc.company,
				holder_type,
				location,
			},
		})
		.then((r) => {
			set_source_balance_values(frm, r.message || {});
		});
}

function set_source_balance_values(frm, source) {
	if (is_submitted(frm)) {
		return Promise.resolve();
	}
	const qty = to_float(source.qty);
	const rate = to_float(source.rate);
	const source_id = source.source_id || "";
	const source_type = source.source_type || "";
	const has_source = Boolean(source.name);
	const purchase_receipt = source_type === "Purchase Receipt" ? source_id : "";
	const selected_source_location = has_source
		? build_source_location_text(frm.doc.from_holder_type, get_from_location(frm), qty, source_id)
		: "";

	return set_values_if_changed(frm, {
		available_qty_at_source: qty,
		purchase_receipt,
		rate,
		selected_source_location,
	}).then(() => {
		calculate_move_qty_value(frm);
		update_movement_summary(frm);
	});
}

function toggle_holder_fields(frm) {
	const from_is_warehouse = frm.doc.from_holder_type === "Warehouse";
	const from_is_department = frm.doc.from_holder_type === "Department";
	const to_is_warehouse = frm.doc.to_holder_type === "Warehouse";
	const to_is_department = frm.doc.to_holder_type === "Department";

	set_field_state(frm, "from_warehouse", from_is_warehouse);
	set_field_state(frm, "from_department", from_is_department);
	set_field_state(frm, "to_warehouse", to_is_warehouse);
	set_field_state(frm, "to_department", to_is_department);
}

function set_field_state(frm, fieldname, visible_and_mandatory) {
	frm.toggle_display(fieldname, visible_and_mandatory);
	frm.toggle_reqd(fieldname, visible_and_mandatory);
}

function clear_irrelevant_source_field(frm) {
	if (frm.doc.from_holder_type === "Warehouse" && frm.doc.from_department) {
		set_if_changed(frm, "from_department", "");
	}
	if (frm.doc.from_holder_type === "Department" && frm.doc.from_warehouse) {
		set_if_changed(frm, "from_warehouse", "");
	}
}

function clear_irrelevant_target_field(frm) {
	if (frm.doc.to_holder_type === "Warehouse" && frm.doc.to_department) {
		set_if_changed(frm, "to_department", "");
	}
	if (frm.doc.to_holder_type === "Department" && frm.doc.to_warehouse) {
		set_if_changed(frm, "to_warehouse", "");
	}
}

function calculate_move_qty_value(frm) {
	if (is_submitted(frm)) {
		return;
	}
	const value = to_float(frm.doc.rate) * to_float(frm.doc.move_qty);
	set_if_changed(frm, "move_qty_value", value);
}

function update_reference_location(frm) {
	if (is_submitted(frm)) {
		return;
	}
	const holder_type = frm.doc.from_holder_type;
	const location = get_from_location(frm);
	const qty = to_float(frm.doc.available_qty_at_source);
	const source = frm.doc.purchase_receipt || "";
	const text = holder_type && location && qty > 0 ? build_source_location_text(holder_type, location, qty, source) : "";

	set_if_changed(frm, "selected_source_location", text);
}

function update_movement_summary(frm) {
	if (!frm.fields_dict.movement_summary_html) {
		return;
	}

	const asset_name = frm.doc.asset_name || "-";
	const from_text = get_location_text(frm.doc.from_holder_type, get_from_location(frm));
	const to_text = get_location_text(frm.doc.to_holder_type, get_to_location(frm));
	const qty = to_float(frm.doc.move_qty);
	const value = to_float(frm.doc.move_qty_value);
	const summary = `${escape_html(asset_name)} &rarr; ${escape_html(from_text)} &rarr; ${escape_html(to_text)} | Qty: ${escape_html(qty || 0)} | Value: ${escape_html(format_summary_currency(value))}`;

	frm.fields_dict.movement_summary_html.$wrapper.html(`
		<div class="move-asset-summary" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 0;">
			<span style="border:1px solid var(--border-color); border-radius:6px; padding:6px 10px; background:var(--fg-color); font-weight:600;">${summary}</span>
		</div>
	`);
}

function get_location_text(holder_type, location) {
	if (!holder_type || !location) {
		return "-";
	}
	return `${holder_type}: ${location}`;
}

function get_from_location(frm) {
	if (frm.doc.from_holder_type === "Warehouse") {
		return sanitize_location_value("Warehouse", frm.doc.from_warehouse);
	}
	if (frm.doc.from_holder_type === "Department") {
		return sanitize_location_value("Department", frm.doc.from_department);
	}
	return "";
}

function get_to_location(frm) {
	if (frm.doc.to_holder_type === "Warehouse") {
		return sanitize_location_value("Warehouse", frm.doc.to_warehouse);
	}
	if (frm.doc.to_holder_type === "Department") {
		return sanitize_location_value("Department", frm.doc.to_department);
	}
	return "";
}

function sanitize_location_fields(frm) {
	if (is_submitted(frm)) {
		return;
	}
	set_raw_location_value(frm, "from_warehouse", "Warehouse");
	set_raw_location_value(frm, "from_department", "Department");
	set_raw_location_value(frm, "to_warehouse", "Warehouse");
	set_raw_location_value(frm, "to_department", "Department");
}

function set_raw_location_value(frm, fieldname, holder_type) {
	const raw_value = sanitize_location_value(holder_type, frm.doc[fieldname]);
	if (raw_value !== (frm.doc[fieldname] || "")) {
		set_if_changed(frm, fieldname, raw_value).then(() => frm.refresh_field(fieldname));
	}
}

function sanitize_location_value(holder_type, value) {
	let raw_value = (value || "").toString().trim();
	if (!raw_value || !holder_type) {
		return raw_value;
	}

	const prefix = `${holder_type}:`;
	if (raw_value.startsWith(prefix)) {
		raw_value = raw_value.slice(prefix.length).trim();
	}
	return raw_value.split("|")[0].trim();
}

function build_source_location_text(holder_type, location, qty, source_reference) {
	let text = get_location_text(holder_type, location);
	text += ` | Qty ${to_float(qty)}`;
	if (source_reference) {
		text += ` | ${source_reference}`;
	}
	return text;
}

function validate_move_asset(frm) {
	if (is_submitted(frm)) {
		return;
	}
	const move_qty = to_float(frm.doc.move_qty);
	const available_qty = to_float(frm.doc.available_qty_at_source);

	if (move_qty <= 0) {
		frappe.validated = false;
		frappe.msgprint(__("Move Qty must be greater than 0."));
		return;
	}

	if (available_qty <= 0) {
		frappe.validated = false;
		frappe.msgprint(__("No Asset Bin balance found for selected asset and source location."));
		return;
	}

	if (move_qty > available_qty) {
		frappe.validated = false;
		frappe.msgprint(
			__("Move Qty {0} cannot be greater than Available Qty at Source {1}.", [move_qty, available_qty])
		);
		return;
	}

	if (frm.doc.from_holder_type === frm.doc.to_holder_type && get_from_location(frm) === get_to_location(frm)) {
		frappe.validated = false;
		frappe.msgprint(__("To location cannot be same as From location."));
	}
}

function to_float(value) {
	if (typeof flt === "function") {
		return flt(value);
	}
	const number_value = parseFloat(value || 0);
	return Number.isFinite(number_value) ? number_value : 0;
}

function format_summary_currency(value) {
	let formatted = "";
	if (typeof format_currency === "function") {
		formatted = format_currency(value, frappe.defaults.get_default("currency"), 0);
	} else {
		formatted = frappe.format(value || 0, { fieldtype: "Currency" });
	}
	return strip_html(formatted || value || 0);
}

function strip_html(value) {
	return String(value || "").replace(/<[^>]*>/g, "").trim();
}

function escape_html(value) {
	if (frappe.utils && frappe.utils.escape_html) {
		return frappe.utils.escape_html(String(value));
	}
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
