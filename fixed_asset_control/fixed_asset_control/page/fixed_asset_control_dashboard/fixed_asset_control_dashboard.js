(function () {
	const ROUTES = {
		dashboard: "fixed-asset-control-dashboard",
		move: "fixed-asset-control-move-asset",
		bin: "fixed-asset-control-asset-bin",
		history: "fixed-asset-control-movement-history",
	};
	const API = "fixed_asset_control.fixed_asset_control.api.";

	Object.keys(ROUTES).forEach((key) => {
		const route = ROUTES[key];
		frappe.pages[route] = frappe.pages[route] || {};
		frappe.pages[route].on_page_load = (wrapper) => new FACCustomPage(wrapper, key);
	});

	class FACCustomPage {
		constructor(wrapper, page_type) {
			this.wrapper = wrapper;
			this.page_type = page_type;
			this.controls = {};
			this.form = {};
			this.source = {};
			this.details = {};
			this.rows = [];
			this.page = frappe.ui.make_app_page({ parent: wrapper, title: "", single_column: true });
			this.make_shell();
			this.render();
		}

		make_shell() {
			$(this.wrapper).find(".page-head").hide();
			this.page.main.empty();
			this.$root = $(`
				<div class="fac-shell">
					<aside class="fac-sidebar">
						<div class="fac-brand">
							<div class="fac-logo">FA</div>
							<div>
								<div class="fac-brand-title">Fixed Asset Control</div>
								<div class="fac-brand-subtitle">Asset Movement System</div>
							</div>
						</div>
						<nav class="fac-nav">
							<button data-nav="dashboard">Dashboard</button>
							<button data-nav="move">Move Asset</button>
							<button data-nav="bin">Asset Bin</button>
							<button data-nav="history">Movement History</button>
						</nav>
					</aside>
					<main class="fac-main"></main>
				</div>
			`).appendTo(this.page.main);
			this.$main = this.$root.find(".fac-main");
			this.inject_style();
			this.$root.find(`[data-nav="${this.page_type}"]`).addClass("active");
			this.$root.find("[data-nav]").on("click", (e) => {
				frappe.set_route(ROUTES[$(e.currentTarget).data("nav")]);
			});
		}

		render() {
			if (this.page_type === "dashboard") this.render_dashboard();
			if (this.page_type === "move") this.render_move();
			if (this.page_type === "bin") this.render_bin();
			if (this.page_type === "history") this.render_history();
		}

		title(title, subtitle) {
			return `
				<div class="fac-page-title">
					<div><h1>${title}</h1><p>${subtitle}</p></div>
					<button class="fac-primary" data-open-move>Move Asset</button>
				</div>
			`;
		}

		bind_move_button() {
			this.$main.find("[data-open-move]").on("click", () => frappe.set_route(ROUTES.move));
		}

		render_dashboard() {
			this.$main.html(`
				${this.title("Fixed Asset Dashboard", "Asset location, quantity and purchase receipt reference tracking.")}
				<div class="fac-filter-box" data-filter-box></div>
				<div class="fac-metrics" data-metrics></div>
				<div class="fac-grid">
					<section class="fac-card">
						<div class="fac-card-header fac-row">
							<div><h2>Asset Current Balance</h2><p>Same asset can exist in multiple locations with different quantities.</p></div>
							<button class="fac-clear" data-view-bin>View All</button>
						</div>
						<table class="fac-table">
							<thead><tr><th>Asset</th><th>Location</th><th>Qty</th><th>Source ID</th><th>Rate</th><th>Amount</th></tr></thead>
							<tbody data-bin-rows></tbody>
						</table>
					</section>
					<section class="fac-card">
						<div class="fac-card-header"><h2>Latest Movements</h2><p>Recent location changes.</p></div>
						<table class="fac-table">
							<thead><tr><th>Asset</th><th>Qty</th><th>To</th></tr></thead>
							<tbody data-move-rows></tbody>
						</table>
					</section>
				</div>
			`);
			this.bind_move_button();
			this.$main.find("[data-view-bin]").on("click", () => frappe.set_route(ROUTES.bin));
			this.make_filters(() => this.load_dashboard());
			this.load_dashboard();
		}

		render_bin() {
			this.$main.html(`
				${this.title("Asset Bin", "Location-wise asset balance with qty, rate and amount.")}
				<section class="fac-card">
					<div class="fac-filter-box" data-filter-box></div>
					<table class="fac-table">
						<thead><tr><th>Asset</th><th>Item / Asset Name</th><th>Location</th><th>Qty</th><th>Source ID</th><th>Rate</th><th>Amount</th><th>Action</th></tr></thead>
						<tbody data-bin-rows></tbody>
					</table>
				</section>
			`);
			this.bind_move_button();
			this.make_filters(() => this.load_bin());
			this.$main.on("click", "[data-move-row]", (e) => {
				const row = this.rows[Number($(e.currentTarget).data("move-row"))];
				frappe.route_options = {
					asset: row.asset,
					company: row.company,
					from_holder_type: row.holder_type,
					from_warehouse: row.warehouse,
					from_department: row.department,
				};
				frappe.set_route(ROUTES.move);
			});
			this.load_bin();
		}

		render_history() {
			this.$main.html(`
				${this.title("Movement History", "Submitted asset movements with valuation source, rate and amount.")}
				<section class="fac-card">
					<div class="fac-card-header"><h2>Movement History</h2><p>Audit trail with source, target, quantity, rate, amount and reference.</p></div>
					<div class="fac-filter-box" data-filter-box></div>
					<table class="fac-table">
						<thead><tr><th>Date</th><th>Asset</th><th>Qty</th><th>From</th><th>To</th><th>Source ID</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead>
						<tbody data-history-rows></tbody>
					</table>
				</section>
			`);
			this.bind_move_button();
			this.make_filters(() => this.load_history(), true);
			this.load_history();
		}

		render_move() {
			this.$main.html(`
				${this.title("Move Asset", "Select asset, choose source location, enter qty and select target location.")}
				<div class="fac-move-layout">
					<section class="fac-card">
						<div class="fac-card-header"><h2>Move Asset</h2><p>Select asset first, then choose which current location quantity you want to move.</p></div>
						<div class="fac-section">
							<h3>Select Asset <span>1</span></h3>
							<div class="fac-form-grid">
								<div data-field="posting_date"></div>
								<div data-field="company"></div>
								<div data-field="asset_name" class="fac-wide"></div>
								<div class="fac-read"><label>Asset Name</label><strong data-asset-title>-</strong></div>
								<div class="fac-read"><label>Asset Category</label><strong data-category>-</strong></div>
								<div class="fac-read"><label>Total Available Qty</label><strong data-total>0</strong></div>
							</div>
						</div>
						<div class="fac-section">
							<h3>Select From Location <span>2</span></h3>
							<div class="fac-source-list" data-source-list></div>
							<div class="fac-form-grid">
								<div data-field="from_holder_type"></div>
								<div data-field="from_warehouse"></div>
								<div data-field="from_department"></div>
								<div class="fac-read"><label>Available Qty at Source</label><strong data-source-qty>0</strong></div>
								<div data-field="move_qty"></div>
							</div>
						</div>
						<div class="fac-section">
							<h3>Select To Location <span>3</span></h3>
							<div class="fac-form-grid">
								<div data-field="to_holder_type"></div>
								<div data-field="to_warehouse"></div>
								<div data-field="to_department"></div>
								<div data-field="remarks" class="fac-wide"></div>
							</div>
						</div>
						<div class="fac-summary" data-summary></div>
						<div class="fac-actions"><button class="fac-clear" data-reset>Reset</button><button class="fac-primary" data-submit>Submit Movement</button></div>
					</section>
					<aside class="fac-card fac-ref">
						<div class="fac-card-header fac-row"><h2>Purchase Receipt Reference</h2><a data-pr-link>View</a></div>
						<div class="fac-ref-box"><label>Purchase Receipt ID</label><strong data-pr>-</strong></div>
						<div class="fac-ref-box"><label>Selected Source Location</label><strong data-source>-</strong></div>
						<div class="fac-card-header"><h2>Rate & Amount</h2></div>
						<div class="fac-dark"><div><label>Rate</label><strong data-rate>0</strong></div><div><label>Move Qty Value</label><strong data-value>0</strong></div></div>
						<div class="fac-note">Rate aur value selected source Asset Bin row se li ja rahi hai.</div>
					</aside>
				</div>
			`);
			this.bind_move_button();
			this.make_move_controls();
		}

		make_filters(on_change, history_mode) {
			const box = this.$main.find("[data-filter-box]");
			this.filter_controls = {
				asset: this.control(box, "asset", { label: "Asset", fieldtype: "Link", options: "Asset", placeholder: "All Assets" }, on_change),
				holder_type: this.control(box, "holder_type", { label: "Holder Type", fieldtype: "Select", options: "All\nWarehouse\nDepartment", default: "All" }, on_change),
				location: this.control(box, "location", { label: history_mode ? "From / To Location" : "Location", fieldtype: "Data", placeholder: "All Locations" }, on_change),
				from_date: this.control(box, "from_date", { label: "From Date", fieldtype: "Date" }, on_change),
				to_date: this.control(box, "to_date", { label: "To Date", fieldtype: "Date" }, on_change),
			};
			$('<button class="fac-clear">Clear</button>').appendTo(box).on("click", () => {
				Object.values(this.filter_controls).forEach((control) => control.set_value(""));
				this.filter_controls.holder_type.set_value("All");
				on_change();
			});
		}

		make_move_controls() {
			const company_query = () => {
				const company = this.form.company && this.form.company.get_value();
				return company ? { filters: { company } } : {};
			};
			const change_asset = () => this.fetch_asset();
			const change_source = () => this.fetch_source();
			this.form.posting_date = this.control(this.$main, "posting_date", { label: "Posting Date", fieldtype: "Date", default: frappe.datetime.nowdate(), reqd: 1 }, () => {});
			this.form.company = this.control(this.$main, "company", { label: "Company", fieldtype: "Link", options: "Company", reqd: 1 }, change_asset);
			this.form.asset_name = this.control(this.$main, "asset_name", { label: "Asset", fieldtype: "Link", options: "Asset", get_query: company_query, reqd: 1 }, change_asset);
			this.form.from_holder_type = this.control(this.$main, "from_holder_type", { label: "From Holder Type", fieldtype: "Select", options: "Warehouse\nDepartment", default: "Warehouse", reqd: 1 }, change_source);
			this.form.from_warehouse = this.control(this.$main, "from_warehouse", { label: "From Warehouse", fieldtype: "Link", options: "Warehouse", get_query: company_query }, change_source);
			this.form.from_department = this.control(this.$main, "from_department", { label: "From Department", fieldtype: "Link", options: "Department", get_query: company_query }, change_source);
			this.form.move_qty = this.control(this.$main, "move_qty", { label: "Move Qty", fieldtype: "Float", reqd: 1 }, () => this.update_summary());
			this.form.to_holder_type = this.control(this.$main, "to_holder_type", { label: "To Holder Type", fieldtype: "Select", options: "Warehouse\nDepartment", default: "Warehouse", reqd: 1 }, () => this.toggle_move_fields());
			this.form.to_warehouse = this.control(this.$main, "to_warehouse", { label: "To Warehouse", fieldtype: "Link", options: "Warehouse", get_query: company_query }, () => this.update_summary());
			this.form.to_department = this.control(this.$main, "to_department", { label: "To Department", fieldtype: "Link", options: "Department", get_query: company_query }, () => this.update_summary());
			this.form.remarks = this.control(this.$main, "remarks", { label: "Remarks", fieldtype: "Small Text" }, () => {});
			this.toggle_move_fields();
			this.$main.find("[data-submit]").on("click", () => this.submit_move());
			this.$main.find("[data-reset]").on("click", () => frappe.set_route(ROUTES.move));
			this.$main.on("click", "[data-source-row]", (e) => this.select_source_row(Number($(e.currentTarget).data("source-row"))));
			this.call("get_move_asset_form_options").then((opts) => {
				if (!this.form.company.get_value() && opts.companies && opts.companies.length) {
					this.form.company.set_value(opts.companies[0]);
				}
				this.apply_route_options();
			});
			this.update_summary();
		}

		apply_route_options() {
			const opts = frappe.route_options || {};
			frappe.route_options = null;
			if (opts.company) this.form.company.set_value(opts.company);
			if (opts.asset) this.form.asset_name.set_value(opts.asset).then(() => this.fetch_asset());
			if (opts.from_holder_type) this.form.from_holder_type.set_value(opts.from_holder_type);
			if (opts.from_warehouse) this.form.from_warehouse.set_value(opts.from_warehouse).then(() => this.fetch_source());
			if (opts.from_department) this.form.from_department.set_value(opts.from_department).then(() => this.fetch_source());
		}

		filters() {
			const holder = this.filter_controls.holder_type.get_value();
			return {
				asset: this.filter_controls.asset.get_value(),
				holder_type: holder === "All" ? "" : holder,
				location: this.filter_controls.location.get_value(),
				from_date: this.filter_controls.from_date.get_value(),
				to_date: this.filter_controls.to_date.get_value(),
			};
		}

		load_dashboard() {
			this.call("get_dashboard_data", { filters: this.filters() }).then((data) => {
				this.$main.find("[data-metrics]").html(`
					${this.metric("Total Asset Qty", data.total_asset_qty, "Open")}
					${this.metric("Warehouse Qty", data.warehouse_qty, "Warehouse")}
					${this.metric("Department Qty", data.department_qty, "Department")}
					${this.metric("Total Asset Value", this.money(data.total_asset_value), "Value")}
				`);
				this.render_bin_rows(data.asset_bin_rows || [], this.$main.find("[data-bin-rows]"), false);
				this.$main.find("[data-move-rows]").html((data.latest_movements || []).map((r) => `
					<tr><td>${this.asset_link(r.asset)}</td><td>${r.qty}</td><td>${this.esc(r.to_location_display)}</td></tr>
				`).join("") || this.empty(3));
			});
		}

		load_bin() {
			this.call("get_asset_bin_rows", { filters: this.filters() }).then((rows) => {
				this.render_bin_rows(rows || [], this.$main.find("[data-bin-rows]"), true);
			});
		}

		load_history() {
			this.call("get_movement_history", { filters: this.filters() }).then((rows) => {
				this.$main.find("[data-history-rows]").html((rows || []).map((r) => `
					<tr><td>${this.date(r.posting_date)}</td><td>${this.asset_link(r.asset)}</td><td>${r.qty}</td><td>${this.esc(r.from_location_display)}</td><td>${this.esc(r.to_location_display)}</td><td>${this.source_link(r)}</td><td>${this.money(r.rate)}</td><td>${this.money(r.amount)}</td><td><span class="fac-status">Submitted</span></td></tr>
				`).join("") || this.empty(9));
			});
		}

		render_bin_rows(rows, target, action) {
			this.rows = rows;
			target.html(rows.map((r, i) => {
				const asset_cell = `${this.asset_link(r.asset)}<div class="fac-small">${this.esc(r.asset_name)}</div>`;
				if (!action) {
					return `<tr><td>${asset_cell}</td><td>${this.esc(r.location_display)}</td><td>${r.qty}</td><td>${this.source_link(r)}</td><td>${this.money(r.rate)}</td><td>${this.money(r.amount)}</td></tr>`;
				}
				return `<tr><td>${this.asset_link(r.asset)}</td><td>${this.esc(r.asset_name)}</td><td>${this.esc(r.location_display)}</td><td>${r.qty}</td><td>${this.source_link(r)}</td><td>${this.money(r.rate)}</td><td>${this.money(r.amount)}</td><td><button class="fac-row-btn" data-move-row="${i}">Move</button></td></tr>`;
			}).join("") || this.empty(action ? 8 : 6));
		}

		fetch_asset() {
			const asset = this.form.asset_name.get_value();
			const company = this.form.company.get_value();
			if (!asset) {
				this.details = {};
				this.render_source_rows([]);
				return;
			}
			this.call("get_asset_details", { asset, company }).then((details) => {
				this.details = details || {};
				if (!company && details.company) this.form.company.set_value(details.company);
				this.$main.find("[data-asset-title]").text(details.asset_name || "-");
				this.$main.find("[data-category]").text(details.asset_category || "-");
				this.$main.find("[data-total]").text(details.total_available_qty || 0);
				this.render_source_rows(details.bins || []);
				this.fetch_source();
			});
		}

		render_source_rows(rows) {
			this.source_rows = rows || [];
			this.$main.find("[data-source-list]").html(this.source_rows.map((row, i) => `
				<button class="fac-source-row" data-source-row="${i}">
					<span><strong>${this.esc(row.location_display)}</strong><small>Source reference: ${this.esc(row.source_id || "-")}</small></span>
					<em>Qty ${row.qty}</em>
					<em>Value ${this.money(row.amount)}</em>
				</button>
			`).join(""));
		}

		select_source_row(index) {
			const row = this.source_rows[index];
			if (!row) return;
			this.form.from_holder_type.set_value(row.holder_type);
			if (row.holder_type === "Warehouse") {
				this.form.from_department.set_value("");
				this.form.from_warehouse.set_value(row.warehouse).then(() => this.fetch_source());
			} else {
				this.form.from_warehouse.set_value("");
				this.form.from_department.set_value(row.department).then(() => this.fetch_source());
			}
		}

		fetch_source() {
			const args = {
				asset: this.form.asset_name.get_value(),
				company: this.form.company.get_value(),
				holder_type: this.form.from_holder_type.get_value(),
				warehouse: this.form.from_warehouse.get_value(),
				department: this.form.from_department.get_value(),
			};
			this.toggle_move_fields(false);
			if (!args.asset || !args.company || !args.holder_type) {
				this.set_source({});
				return;
			}
			const location = args.holder_type === "Warehouse" ? args.warehouse : args.department;
			if (!location) {
				this.set_source({});
				return;
			}
			this.call("get_source_balance", args).then((source) => this.set_source(source || {}));
		}

		set_source(source) {
			this.source = source || {};
			this.$main.find("[data-source-qty]").text(this.source.available_qty_at_source || 0);
			this.$main.find("[data-pr]").text(this.source.source_type === "Purchase Receipt" ? this.source.source_id || "-" : "-");
			this.$main.find("[data-source]").text(this.source.selected_source_location || "-");
			this.$main.find("[data-rate]").html(this.money(this.source.rate));
			this.$main.find("[data-pr-link]").attr("href", this.source.source_id ? `/app/purchase-receipt/${encodeURIComponent(this.source.source_id)}` : "#");
			this.update_summary();
		}

		toggle_move_fields(refresh_summary = true) {
			const from = this.form.from_holder_type.get_value();
			const to = this.form.to_holder_type.get_value();
			this.form.from_warehouse.toggle(from === "Warehouse");
			this.form.from_department.toggle(from === "Department");
			this.form.to_warehouse.toggle(to === "Warehouse");
			this.form.to_department.toggle(to === "Department");
			if (refresh_summary) this.update_summary();
		}

		update_summary() {
			const qty = this.num(this.form.move_qty.get_value());
			const rate = this.num(this.source.rate);
			const value = qty * rate;
			const from_type = this.form.from_holder_type.get_value() || "-";
			const to_type = this.form.to_holder_type.get_value() || "-";
			const from = from_type === "Warehouse" ? this.form.from_warehouse.get_value() : this.form.from_department.get_value();
			const to = to_type === "Warehouse" ? this.form.to_warehouse.get_value() : this.form.to_department.get_value();
			this.$main.find("[data-value]").html(this.money(value));
			this.$main.find("[data-summary]").html(`
				<span>${this.esc(this.form.asset_name.get_value() || "-")}</span>
				<span>${this.esc(from_type)}: ${this.esc(from || "-")}</span>
				<b>&rarr;</b>
				<span>${this.esc(to_type)}: ${this.esc(to || "-")}</span>
				<span>Qty: ${qty || 0}</span>
				<span>Value: ${this.money(value)}</span>
			`);
		}

		submit_move() {
			const data = {
				posting_date: this.form.posting_date.get_value(),
				company: this.form.company.get_value(),
				asset_name: this.form.asset_name.get_value(),
				from_holder_type: this.form.from_holder_type.get_value(),
				from_warehouse: this.form.from_warehouse.get_value(),
				from_department: this.form.from_department.get_value(),
				move_qty: this.num(this.form.move_qty.get_value()),
				to_holder_type: this.form.to_holder_type.get_value(),
				to_warehouse: this.form.to_warehouse.get_value(),
				to_department: this.form.to_department.get_value(),
				remarks: this.form.remarks.get_value(),
			};
			const from_location = data.from_holder_type === "Warehouse" ? data.from_warehouse : data.from_department;
			const to_location = data.to_holder_type === "Warehouse" ? data.to_warehouse : data.to_department;
			if (!data.company || !data.asset_name || !from_location || !to_location || !data.move_qty) {
				frappe.msgprint("Please select asset, source, target and move quantity.");
				return;
			}
			if (data.from_holder_type === data.to_holder_type && from_location === to_location) {
				frappe.msgprint("From and To location cannot be same.");
				return;
			}
			this.call("submit_move_asset", { data }).then((result) => {
				frappe.show_alert({ message: `Submitted ${result.move_asset}`, indicator: "green" });
				frappe.set_route("Form", "Move Asset", result.move_asset);
			});
		}

		control(root, fieldname, df, change) {
			const holder = root.find(`[data-field="${fieldname}"]`);
			const parent = holder.length ? holder : $('<div class="fac-filter"></div>').appendTo(root);
			return frappe.ui.form.make_control({
				parent,
				df: { fieldname, change, ...df },
				render_input: 1,
			});
		}

		call(method, args) {
			return frappe.call({ method: API + method, args }).then((response) => response.message || {});
		}

		metric(label, value, chip) {
			return `<div class="fac-metric"><div><p>${label}</p><strong>${value}</strong><small>Click to view asset balance entries</small></div><span>${chip}</span></div>`;
		}

		asset_link(asset) {
			return asset ? `<a class="fac-link" href="/app/asset/${encodeURIComponent(asset)}">${this.esc(asset)}</a>` : "";
		}

		source_link(row) {
			if (row.source_type === "Purchase Receipt" && row.source_id) {
				return `<a class="fac-source" href="/app/purchase-receipt/${encodeURIComponent(row.source_id)}">${this.esc(row.source_id)}</a>`;
			}
			return this.esc(row.source_id || "");
		}

		empty(cols) {
			return `<tr><td colspan="${cols}" class="fac-muted">No records found.</td></tr>`;
		}

		date(value) {
			if (!value) return "";
			const parts = String(value).split("-");
			return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : value;
		}

		money(value) {
			return frappe.format(this.num(value), { fieldtype: "Currency" });
		}

		num(value) {
			const parsed = parseFloat(value || 0);
			return Number.isFinite(parsed) ? parsed : 0;
		}

		esc(value) {
			return frappe.utils.escape_html(String(value || ""));
		}

		inject_style() {
			if (document.getElementById("fac-pages-style")) return;
			$(`<style id="fac-pages-style">
				.fac-shell{display:flex;min-height:calc(100vh - 56px);margin:-15px;background:#f3f6fb;color:#071326;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
				.fac-sidebar{width:228px;background:#0b1220;color:#fff;padding:28px 18px;flex:0 0 228px}.fac-brand{display:flex;gap:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:24px;margin-bottom:26px}
				.fac-logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#10b981);display:grid;place-items:center;font-weight:800}.fac-brand-title{font-weight:800;font-size:16px}.fac-brand-subtitle{font-size:12px;color:#d5e1f3}
				.fac-nav{display:flex;flex-direction:column;gap:12px}.fac-nav button{border:0;background:transparent;color:#fff;text-align:left;padding:12px 14px;border-radius:10px;font-weight:800}.fac-nav button.active{background:#fff;color:#071326}
				.fac-main{flex:1;padding:30px;overflow:auto}.fac-page-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:24px}.fac-page-title h1{font-size:30px;margin:0 0 8px;font-weight:800}.fac-page-title p{margin:0;color:#53627c}
				.fac-primary{background:#2557d6;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-weight:800;box-shadow:0 12px 24px rgba(37,87,214,.2)}.fac-card{background:#fff;border:1px solid #dfe5ee;border-radius:14px;padding:20px;box-shadow:0 18px 38px rgba(15,23,42,.08)}
				.fac-card-header h2{font-size:20px;margin:0 0 4px;font-weight:800}.fac-card-header p{margin:0 0 18px;color:#53627c}.fac-row{display:flex;justify-content:space-between;align-items:center}
				.fac-filter-box{display:grid;grid-template-columns:1.25fr 1fr 1.2fr 1fr 1fr auto;gap:10px;align-items:end;border:1px solid #dfe5ee;border-radius:14px;padding:14px 12px;margin-bottom:16px;background:#fbfcff}.fac-filter .form-group{margin-bottom:0}.fac-filter .control-label,.fac-form-grid .control-label{font-size:11px;font-weight:800;color:#53627c}.fac-filter .form-control,.fac-form-grid .form-control{border-radius:8px;height:42px}
				.fac-clear{height:42px;border:1px solid #dfe5ee;background:#fff;border-radius:10px;padding:0 18px;font-weight:800}.fac-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}.fac-metric{background:#fff;border:1px solid #dfe5ee;border-radius:16px;padding:20px;display:flex;justify-content:space-between;box-shadow:0 16px 30px rgba(15,23,42,.06)}.fac-metric p{color:#53627c;font-weight:800;margin:0 0 8px}.fac-metric strong{font-size:32px}.fac-metric small{display:block;color:#53627c;margin-top:8px}.fac-metric span{height:26px;padding:5px 12px;border-radius:999px;background:#e8f8ef;color:#047333;font-weight:800}
				.fac-grid{display:grid;grid-template-columns:1.45fr 1fr;gap:18px}.fac-table{width:100%;border-collapse:collapse}.fac-table th{font-size:12px;text-transform:uppercase;color:#53627c;background:#f8fafc;border-bottom:1px solid #dfe5ee;padding:14px 12px}.fac-table td{border-bottom:1px solid #dfe5ee;padding:13px 12px;vertical-align:middle}.fac-link{font-weight:800;color:#1557d8}.fac-source{color:#0f3f93}.fac-status{display:inline-block;background:#dcfce7;color:#047333;border-radius:999px;padding:4px 10px;font-weight:800;font-size:12px}.fac-muted{text-align:center;color:#68758b;padding:26px!important}.fac-small{font-size:12px;color:#53627c}.fac-row-btn{border:1px solid #dfe5ee;background:#fff;border-radius:9px;padding:8px 16px;font-weight:800}
				.fac-move-layout{display:grid;grid-template-columns:1fr 408px;gap:20px}.fac-section{border:1px solid #dfe5ee;border-radius:14px;padding:16px;margin-top:16px}.fac-section h3{margin:0 0 14px;font-size:16px;font-weight:800;display:flex;justify-content:space-between}.fac-section h3 span{background:#eaf1ff;color:#2557d6;border-radius:999px;padding:4px 10px}.fac-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fac-wide{grid-column:1/-1}.fac-read{border:1px solid #dfe5ee;border-radius:10px;padding:12px}.fac-read label,.fac-ref-box label,.fac-dark label{display:block;font-size:11px;font-weight:800;color:#53627c;margin-bottom:6px}.fac-summary{display:flex;gap:8px;flex-wrap:wrap;border:1px dashed #a8c2ff;border-radius:12px;padding:12px;margin-top:16px}.fac-summary span{border:1px solid #dfe5ee;border-radius:8px;padding:8px 10px;font-weight:800}.fac-actions{text-align:right;margin-top:14px}.fac-ref{height:max-content}.fac-ref-box{border:1px solid #adc2ff;background:#edf3ff;border-radius:12px;padding:14px;margin-bottom:12px}.fac-dark{background:#0b1220;color:#fff;border-radius:14px;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px}.fac-dark strong{font-size:22px}.fac-note{border:1px solid #dfe5ee;border-radius:12px;padding:12px;font-weight:700;color:#53627c}
				.fac-source-list{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.fac-source-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;width:100%;border:1px solid #dfe5ee;background:#fff;border-radius:10px;text-align:left;padding:12px}.fac-source-row:hover{border-color:#8fb0ff;background:#f5f8ff}.fac-source-row small{display:block;color:#53627c;margin-top:3px}.fac-source-row em{font-style:normal;background:#eefcf5;color:#047333;border-radius:999px;padding:4px 10px;font-weight:800;font-size:12px}.fac-source-row em:last-child{background:#fff4e5;color:#b45309}
				@media(max-width:1100px){.fac-shell{display:block}.fac-sidebar{width:auto}.fac-filter-box,.fac-metrics,.fac-grid,.fac-move-layout{grid-template-columns:1fr}.fac-form-grid{grid-template-columns:1fr}}
			</style>`).appendTo("head");
		}
	}
})();
