(function () {
	const PAGE_ROUTE = "fixed-asset-control";
	const API = "fixed_asset_control.fixed_asset_control.api.";
	const SCREENS = {
		dashboard: { title: "Dashboard" },
		move: { title: "Move Asset" },
		bin: { title: "Asset Bin" },
		history: { title: "Movement History" },
	};

	frappe.pages[PAGE_ROUTE] = frappe.pages[PAGE_ROUTE] || {};
	frappe.pages[PAGE_ROUTE].on_page_load = (wrapper) => new FACSinglePage(wrapper);

	class FACSinglePage {
		constructor(wrapper) {
			this.wrapper = wrapper;
			this.current_screen = "dashboard";
			this.controls = {};
			this.form = {};
			this.source = {};
			this.source_rows = [];
			this.bin_rows = [];
			this.last_submit = null;
			this.page = frappe.ui.make_app_page({ parent: wrapper, title: "", single_column: true });
			this.make_shell();
			this.show_screen("dashboard");
		}

		make_shell() {
			const $wrapper = $(this.wrapper);
			$wrapper.addClass("fac-page-wrapper");
			$wrapper.closest(".page-container").addClass("fac-page-container");
			$wrapper.closest(".page-body").addClass("fac-page-body");
			$wrapper.find(".layout-main-section, .layout-main-section-wrapper, .page-body").addClass("fac-full-width-section");
			$wrapper.find(".page-head").hide();
			this.sync_fullscreen_class();
			this.hide_native_sidebar();
			this.page.main.empty();
			this.$root = $(`
				<div class="fac-shell fac-app">
					<button type="button" class="fac-mobile-toggle fac-shell-menu" data-open-sidebar aria-label="Open menu">&#9776;</button>
					<div class="fac-sidebar-overlay" data-close-sidebar></div>
					<aside class="fac-sidebar">
						<button type="button" class="fac-sidebar-close" data-close-sidebar aria-label="Close menu">&times;</button>
						<button type="button" class="fac-sidebar-toggle" data-toggle-sidebar aria-label="Collapse sidebar">‹</button>
						<div class="fac-brand">
							<div class="fac-collapsed-logo">
								<img src="/private/files/dux-mark-black.png" alt="DUX">
							</div>
							<div class="fac-logo-card">
								<img src="/assets/fixed_asset_control/images/transparent_logo.png" alt="Dux Digitech">
							</div>
							<div class="fac-brand-title">Fixed Asset Control</div>
							<div class="fac-brand-subtitle">Asset Movement System</div>
						</div>
						<nav class="fac-nav">
							<button type="button" data-screen="dashboard"><span class="fac-nav-icon">DB</span><span>Dashboard</span></button>
							<button type="button" data-screen="move"><span class="fac-nav-icon">MV</span><span>Move Asset</span></button>
							<button type="button" data-screen="bin"><span class="fac-nav-icon">AB</span><span>Asset Bin</span></button>
							<button type="button" data-screen="history"><span class="fac-nav-icon">MH</span><span>Movement History</span></button>
						</nav>
					</aside>
					<main class="fac-main"></main>
				</div>
			`).appendTo(this.page.main);
			this.$main = this.$root.find(".fac-main");
			this.inject_style();
			this.$root.on("click", "[data-screen]", (event) => {
				this.show_screen($(event.currentTarget).data("screen"));
				if (window.matchMedia("(max-width: 768px)").matches) this.close_sidebar();
			});
			this.$root.on("click", "[data-open-sidebar]", () => this.open_sidebar());
			this.$root.on("click", "[data-close-sidebar]", () => this.close_sidebar());
			this.$root.on("click", "[data-toggle-sidebar]", () => this.toggle_sidebar());

			
		}

		sync_fullscreen_class() {
			const apply = () => {
				const route = frappe.get_route ? frappe.get_route().join("/") : "";
				$("body, html").toggleClass("fac-fullscreen-page", route === PAGE_ROUTE);
			};
			$("body, html").addClass("fac-fullscreen-page");
			if (frappe.router && frappe.router.on && !FACSinglePage.fullscreen_bound) {
				frappe.router.on("change", apply);
				FACSinglePage.fullscreen_bound = true;
			}
			setTimeout(apply, 0);
		}

		hide_native_sidebar() {
			const route = frappe.get_route ? frappe.get_route().join("/") : "";
			if (route !== PAGE_ROUTE) return;
			const $container = $(this.wrapper).closest(".page-container, .desk-page, .layout-main");
			$container
				.find(".layout-side-section, .standard-sidebar, .desk-sidebar, .desk-sidebar-wrapper, .page-sidebar, .sidebar-column")
				.addClass("fac-native-sidebar-hidden");
		}

		open_sidebar() {
			this.$root.addClass("fac-sidebar-open");
		}

		close_sidebar() {
			this.$root.removeClass("fac-sidebar-open");
		}

		toggle_sidebar() {
			if (window.matchMedia("(max-width: 768px)").matches) {
				this.open_sidebar();
				return;
			}
			this.$root.toggleClass("fac-sidebar-collapsed");
		}

		show_screen(screen, prefill) {
			this.current_screen = screen || "dashboard";
			this.prefill = prefill || null;
			this.controls = {};
			this.form = {};
			this.$root.find("[data-screen]").removeClass("active");
			this.$root.find(`[data-screen="${this.current_screen}"]`).addClass("active");
			if (this.current_screen === "dashboard") this.render_dashboard();
			if (this.current_screen === "move") this.render_move();
			if (this.current_screen === "bin") this.render_bin();
			if (this.current_screen === "history") this.render_history();
		}

		header(title, subtitle, show_button = true) {
			return `
				<div class="fac-page-title">
					<button type="button" class="fac-mobile-toggle" data-open-sidebar aria-label="Open menu">&#9776;</button>
					<div class="fac-title-copy"><h1>${title}</h1><p>${subtitle}</p></div>
					${show_button ? '<button type="button" class="fac-primary" data-open-move>Move Asset</button>' : ""}
				</div>
			`;
		}

		bind_header_actions() {
			this.$main.find("[data-open-move]").on("click", () => this.show_screen("move"));
		}

		render_dashboard() {
			this.$main.html(`
				${this.dashboard_hero()}
				<div class="fac-filter-box" data-filter-box></div>
				<div class="fac-metrics" data-metrics></div>
				<div class="fac-grid">
					<section class="fac-card">
						<div class="fac-card-header fac-row">
							<div><h2>Asset Current Balance</h2><p>Same asset can exist in multiple locations with different quantities.</p></div>
							<button type="button" class="fac-clear" data-view-bin>View All</button>
						</div>
						<table class="fac-table"><thead><tr><th>Asset</th><th>Location</th><th>Qty</th><th>Source ID</th><th>Rate</th><th>Amount</th></tr></thead><tbody data-bin-rows></tbody></table>
					</section>
					<section class="fac-card">
						<div class="fac-card-header"><h2>Latest Movements</h2><p>Recent location changes.</p></div>
						<table class="fac-table"><thead><tr><th>Asset</th><th>Qty</th><th>To</th></tr></thead><tbody data-move-rows></tbody></table>
					</section>
				</div>
			`);
			this.bind_header_actions();
			this.$main.find("[data-view-bin]").on("click", () => this.show_screen("bin"));
			this.make_filters(() => this.load_dashboard(), false, { default_dates: true, dynamic_location: true });
			this.load_location_options();
			this.load_dashboard();
		}

		dashboard_hero() {
			return `
				<section class="fac-hero">
					<div>
						<div class="fac-hero-date">${this.dashboard_date_line()}</div>
						<h1>${this.dashboard_greeting()}</h1>
						<p>Track asset movement, current balance and purchase receipt references.</p>
					</div>
					<button type="button" class="fac-primary" data-open-move>Move Asset</button>
				</section>
			`;
		}

		dashboard_greeting() {
			const hour = new Date().getHours();
			const greeting = hour >= 17 ? "Good evening" : hour >= 12 ? "Good afternoon" : hour >= 5 ? "Good morning" : "Good evening";
			const user = frappe.boot && frappe.boot.user ? frappe.boot.user : {};
			const raw_name = user.full_name || frappe.session.user || "";
			const name = raw_name && raw_name !== "Guest" ? raw_name.split("@")[0] : "";
			return name ? `${greeting}, ${this.esc(name)}.` : `${greeting}.`;
		}

		dashboard_date_line() {
			const now = new Date();
			const weekday = now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
			const day = String(now.getDate()).padStart(2, "0");
			const month = now.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
			return `${weekday} · ${day} ${month} ${now.getFullYear()}`;
		}

		render_bin() {
			this.$main.html(`
				${this.header("Asset Bin", "Location-wise asset balance with qty, rate and amount.")}
				<section class="fac-card">
					<div class="fac-filter-box" data-filter-box></div>
					<table class="fac-table"><thead><tr><th>Asset</th><th>Item / Asset Name</th><th>Location</th><th>Qty</th><th>Source ID</th><th>Rate</th><th>Amount</th><th>Action</th></tr></thead><tbody data-bin-rows></tbody></table>
				</section>
			`);
			this.bind_header_actions();
			this.make_filters(() => this.load_bin());
			if (this.prefill && this.prefill.filters) {
				this.apply_filters(this.prefill.filters);
			}
			this.$main.on("click", "[data-move-row]", (event) => {
				const row = this.bin_rows[Number($(event.currentTarget).data("move-row"))];
				this.show_screen("move", {
					asset: row.asset,
					company: row.company,
					from_holder_type: row.holder_type,
					from_warehouse: row.warehouse,
					from_department: row.department,
				});
			});
			this.load_bin();
		}

		render_history() {
			this.$main.html(`
				${this.header("Movement History", "Submitted asset movements with valuation source, rate and amount.")}
				<section class="fac-card">
					<div class="fac-card-header"><h2>Movement History</h2><p>Audit trail with source, target, quantity, rate, amount and reference.</p></div>
					<div class="fac-filter-box" data-filter-box></div>
					<table class="fac-table"><thead><tr><th>Date</th><th>Asset</th><th>Qty</th><th>From</th><th>To</th><th>Source ID</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody data-history-rows></tbody></table>
				</section>
			`);
			this.bind_header_actions();
			this.make_filters(() => this.load_history(), true);
			this.load_history();
		}

		render_move() {
			this.$main.html(`
				${this.header("Move Asset", "Select asset, choose source location, enter qty and select target location.")}
				<div class="fac-move-layout">
					<section class="fac-card">
						<div class="fac-card-header fac-row"><div><h2>Move Asset</h2><p>Select asset first, then choose which current location quantity you want to move.</p></div><span class="fac-chip">Draft</span></div>
						<div data-submit-message></div>
						<div class="fac-section">
							<h3>Select Asset <span>1</span></h3>
							<div class="fac-form-grid">
								<div data-field="posting_date"></div>
								<div data-field="company"></div>
								<div data-field="asset_name" class="fac-wide"></div>
								<div class="fac-read"><label>Asset Name</label><strong data-asset-title>-</strong></div>
								<div class="fac-read"><label>Total Available Qty</label><strong data-total>0</strong></div>
								<div class="fac-read"><label>Asset Category</label><strong data-category>-</strong></div>
							</div>
						</div>
						<div class="fac-section">
							<h3>Select From Location <span>2</span></h3>
							<div class="fac-form-grid">
								<div data-field="from_holder_type"></div>
								<div data-field="from_warehouse"></div>
								<div data-field="from_department"></div>
								<div class="fac-from-qty-row">
									<div class="fac-read"><label>Available Qty at Source</label><strong data-source-qty>0</strong></div>
									<div data-field="move_qty"></div>
								</div>
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
						<div class="fac-actions"><button type="button" class="fac-clear" data-reset>Reset</button><button type="button" class="fac-primary" data-submit>Submit Movement</button></div>
					</section>
					<aside class="fac-card fac-ref">
						<div class="fac-card-header fac-row"><h2>Purchase Receipt Reference</h2><a data-pr-link href="#">View</a></div>
						<div class="fac-ref-box"><label>Purchase Receipt ID</label><strong><a data-pr-id href="#">-</a></strong></div>
						<div class="fac-ref-box"><label>Selected Source Location</label><strong data-source>-</strong></div>
						<div class="fac-ref-box"><label>Available Qty</label><strong data-source-qty-ref>0</strong></div>
						<div class="fac-card-header fac-row"><h2>Rate & Amount</h2><span class="fac-chip">Auto</span></div>
						<div class="fac-dark"><div><label>Rate</label><strong data-rate>0</strong></div><div><label>Move Qty Value</label><strong data-value>0</strong></div></div>
						<div class="fac-note">Rate and value are taken from the selected source Asset Bin row. The Purchase Receipt reference is shown above when available.</div>
					</aside>
				</div>
			`);
			this.bind_header_actions();
			this.make_move_controls();
		}

		make_filters(on_change, history_mode, options = {}) {
			const box = this.$main.find("[data-filter-box]");
			const date_defaults = options.default_dates ? this.default_date_range() : {};
			const fire_change = () => {
				if (!this.suppress_filter_change) on_change();
			};
			const holder_change = () => {
				if (this.suppress_filter_change) return;
				if (options.dynamic_location) {
					this.set_control_value(this.filter_controls.location, "");
					this.load_location_options();
				}
				on_change();
			};
			const location_df = options.dynamic_location
				? { label: history_mode ? "From / To Location" : "Location", fieldtype: "Select", options: "\n", placeholder: "All Locations" }
				: { label: history_mode ? "From / To Location" : "Location", fieldtype: "Data", placeholder: "All Locations" };
			this.filter_controls = {
				asset: this.control(box, "asset", { label: "Asset", fieldtype: "Link", options: "Asset", placeholder: "All Assets" }, fire_change),
				holder_type: this.control(box, "holder_type", { label: "Holder Type", fieldtype: "Select", options: "All\nWarehouse\nDepartment", default: "All" }, holder_change),
				location: this.control(box, "location", location_df, fire_change),
				from_date: this.control(box, "from_date", { label: "From Date", fieldtype: "Date", default: date_defaults.from_date || "" }, fire_change),
				to_date: this.control(box, "to_date", { label: "To Date", fieldtype: "Date", default: date_defaults.to_date || "" }, fire_change),
			};
			if (options.default_dates) {
				this.suppress_filter_change = true;
				this.set_control_value(this.filter_controls.from_date, date_defaults.from_date || "");
				this.set_control_value(this.filter_controls.to_date, date_defaults.to_date || "");
				this.suppress_filter_change = false;
			}
			$('<button type="button" class="fac-clear">Clear</button>').appendTo(box).on("click", () => {
				this.suppress_filter_change = true;
				this.set_control_value(this.filter_controls.asset, "");
				this.set_control_value(this.filter_controls.holder_type, "All");
				this.set_control_value(this.filter_controls.location, "");
				this.set_control_value(this.filter_controls.from_date, date_defaults.from_date || "");
				this.set_control_value(this.filter_controls.to_date, date_defaults.to_date || "");
				this.suppress_filter_change = false;
				if (options.dynamic_location) this.load_location_options();
				on_change();
			});
		}

		load_location_options() {
			if (!this.filter_controls || !this.filter_controls.location) return Promise.resolve();
			const holder = this.filter_controls.holder_type.get_value();
			const holder_type = holder === "All" ? "" : holder;
			return this.call("get_move_asset_form_options").then((data) => {
				const control = this.filter_controls.location;
				const warehouses = holder_type === "Department" ? [] : (data.warehouses || []).map((row) => ({ label: `Warehouse: ${row.name || row}`, value: row.name || row }));
				const departments = holder_type === "Warehouse" ? [] : (data.departments || []).map((row) => ({ label: `Department: ${row.name || row}`, value: row.name || row }));
				const labels = [...warehouses, ...departments].map((row) => row.label);
				control.df.options = ["", ...labels].join("\n");
				control.refresh();
				if (control.get_value() && !labels.includes(control.get_value())) {
					control.set_value("");
				}
			});
		}

		default_date_range() {
			const today = frappe.datetime && frappe.datetime.nowdate ? frappe.datetime.nowdate() : new Date().toISOString().slice(0, 10);
			let from_date = "";
			if (frappe.datetime && frappe.datetime.add_months) {
				from_date = frappe.datetime.add_months(today, -1);
			} else {
				const from = new Date(`${today}T00:00:00`);
				from.setMonth(from.getMonth() - 1);
				from_date = from.toISOString().slice(0, 10);
			}
			return { from_date, to_date: today };
		}

		make_move_controls() {
			const company_query = () => {
				const company = this.form.company && this.form.company.get_value();
				return company ? { filters: { company } } : {};
			};
			const asset_query = () => {
				const company = this.form.company && this.form.company.get_value();
				if (!company) {
					frappe.msgprint("Please select Company first.");
					return { filters: { name: "__no_asset_without_company__" } };
				}
				return { filters: { company } };
			};
			const source_type_change = () => this.toggle_source_fields(true);
			const source_change = () => this.fetch_source();
			this.form.posting_date = this.control(this.$main, "posting_date", { label: "Posting Date", fieldtype: "Date", default: frappe.datetime.nowdate(), reqd: 1 }, () => {});
			this.form.company = this.control(this.$main, "company", { label: "Company", fieldtype: "Link", options: "Company", reqd: 1 }, () => this.on_company_change());
			this.form.asset_name = this.control(this.$main, "asset_name", { label: "Asset Name", fieldtype: "Link", options: "Asset", get_query: asset_query, reqd: 1 }, () => this.fetch_asset());
			this.form.from_holder_type = this.control(this.$main, "from_holder_type", { label: "From Holder Type", fieldtype: "Select", options: "Warehouse\nDepartment", default: "Warehouse", reqd: 1 }, source_type_change);
			this.form.from_warehouse = this.control(this.$main, "from_warehouse", { label: "From Warehouse", fieldtype: "Link", options: "Warehouse", get_query: company_query }, source_change);
			this.form.from_department = this.control(this.$main, "from_department", { label: "From Department", fieldtype: "Link", options: "Department", get_query: company_query }, source_change);
			this.form.move_qty = this.control(this.$main, "move_qty", { label: "Move Qty", fieldtype: "Float", reqd: 1 }, () => this.update_summary());
			this.form.to_holder_type = this.control(this.$main, "to_holder_type", { label: "To Holder Type", fieldtype: "Select", options: "Warehouse\nDepartment", default: "Warehouse", reqd: 1 }, () => this.toggle_target_fields());
			this.form.to_warehouse = this.control(this.$main, "to_warehouse", { label: "To Warehouse", fieldtype: "Link", options: "Warehouse", get_query: company_query }, () => this.update_summary());
			this.form.to_department = this.control(this.$main, "to_department", { label: "To Department", fieldtype: "Link", options: "Department", get_query: company_query }, () => this.update_summary());
			this.form.remarks = this.control(this.$main, "remarks", { label: "Remarks", fieldtype: "Small Text" }, () => {});
			this.set_control_value(this.form.posting_date, frappe.datetime.nowdate());
			this.toggle_source_fields();
			this.toggle_target_fields();
			this.$main.find("[data-submit]").on("click", () => this.submit_move());
			this.$main.find("[data-reset]").on("click", () => this.reset_move_form(""));
			this.$main.find("[data-pr-link],[data-pr-id]").on("click", (event) => {
				const purchase_receipt = this.source && this.source.source_type === "Purchase Receipt" ? this.source.source_id : "";
				if (!purchase_receipt) {
					event.preventDefault();
					frappe.show_alert({ message: "No Purchase Receipt reference available.", indicator: "orange" });
					return;
				}
				event.preventDefault();
				frappe.set_route("Form", "Purchase Receipt", purchase_receipt);
			});
			this.call("get_move_asset_form_options").then((opts) => {
				if (!this.form.company.get_value() && opts.companies && opts.companies.length) {
					this.form.company.set_value(opts.companies[0]);
				}
				this.apply_prefill();
			});
			this.update_summary();
		}

		set_control_value(control, value) {
			if (!control) return;
			control.set_value(value || "");
			if (control.$input) control.$input.val(value || "");
		}

		on_company_change() {
			this.set_control_value(this.form.asset_name, "");
			this.clear_asset_context();
		}

		clear_asset_context() {
			this.set_source({});
			this.$main.find("[data-asset-title]").text("-");
			this.$main.find("[data-category]").text("-");
			this.$main.find("[data-total]").text("0");
			this.set_control_value(this.form.from_holder_type, "Warehouse");
			this.set_control_value(this.form.from_warehouse, "");
			this.set_control_value(this.form.from_department, "");
			this.set_control_value(this.form.move_qty, "");
			this.set_control_value(this.form.to_warehouse, "");
			this.set_control_value(this.form.to_department, "");
			this.toggle_source_fields();
			this.update_summary();
		}

		reset_move_form(company) {
			this.$main.find("[data-submit-message]").empty();
			this.set_control_value(this.form.posting_date, frappe.datetime.nowdate());
			this.set_control_value(this.form.company, company || "");
			this.clear_asset_context();
			this.set_control_value(this.form.to_holder_type, "Warehouse");
			this.set_control_value(this.form.remarks, "");
			this.toggle_target_fields();
			this.set_source({});
			this.$main.find("[data-summary]").empty();
		}

		apply_prefill() {
			const opts = this.prefill || {};
			if (opts.company) this.form.company.set_value(opts.company);
			if (opts.asset) this.form.asset_name.set_value(opts.asset).then(() => this.fetch_asset());
			if (opts.from_holder_type) this.form.from_holder_type.set_value(opts.from_holder_type);
			const location = opts.from_holder_type === "Department" ? opts.from_department : opts.from_warehouse;
			if (location && opts.from_holder_type === "Department") this.form.from_department.set_value(location).then(() => this.fetch_source());
			if (location && opts.from_holder_type !== "Department") this.form.from_warehouse.set_value(location).then(() => this.fetch_source());
		}

		apply_filters(filters) {
			Object.keys(filters || {}).forEach((fieldname) => {
				if (this.filter_controls[fieldname]) this.filter_controls[fieldname].set_value(filters[fieldname]);
			});
		}

		filters() {
			const holder = this.filter_controls.holder_type.get_value();
			const location = this.filter_controls.location.get_value();
			const date_defaults = this.current_screen === "dashboard" ? this.default_date_range() : {};
			return {
				asset: this.filter_controls.asset.get_value(),
				holder_type: holder === "All" ? "" : holder,
				location: location === "All Locations" ? "" : location.replace(/^(Warehouse|Department):\s*/, ""),
				from_date: this.filter_controls.from_date.get_value() || date_defaults.from_date || "",
				to_date: this.filter_controls.to_date.get_value() || date_defaults.to_date || "",
			};
		}

		load_dashboard() {
			this.call("get_dashboard_data", { filters: this.filters() }).then((data) => {
				this.$main.find("[data-metrics]").html(`
					${this.metric("Total Asset Qty", data.total_asset_qty, "Open", "bin", {})}
					${this.metric("Warehouse Qty", data.warehouse_qty, "Warehouse", "bin", { holder_type: "Warehouse" })}
					${this.metric("Department Qty", data.department_qty, "Department", "bin", { holder_type: "Department" })}
					${this.metric("Total Asset Value", this.money(data.total_asset_value), "Value", "bin", {})}
				`);
				this.render_bin_rows(data.asset_bin_rows || [], this.$main.find("[data-bin-rows]"), false);
				this.$main.find("[data-move-rows]").html((data.latest_movements || []).map((row) => `
					<tr><td>${this.asset_link(row.asset)}</td><td>${row.qty}</td><td>${this.esc(row.to_location_display)}</td></tr>
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
				this.$main.find("[data-history-rows]").html((rows || []).map((row) => `
					<tr><td>${this.date(row.posting_date)}</td><td>${this.asset_link(row.asset)}</td><td>${row.qty}</td><td>${this.esc(row.from_location_display)}</td><td>${this.esc(row.to_location_display)}</td><td>${this.source_link(row)}</td><td>${this.money(row.rate)}</td><td>${this.money(row.amount)}</td><td><span class="fac-status">Submitted</span></td></tr>
				`).join("") || this.empty(9));
			});
		}

		render_bin_rows(rows, target, action) {
			this.bin_rows = rows;
			target.html(rows.map((row, index) => {
				const asset_cell = `${this.asset_link(row.asset)}<div class="fac-small">${this.esc(row.asset_name)}</div>`;
				if (!action) {
					return `<tr><td>${asset_cell}</td><td>${this.esc(row.location_display)}</td><td>${row.qty}</td><td>${this.source_link(row)}</td><td>${this.money(row.rate)}</td><td>${this.money(row.amount)}</td></tr>`;
				}
				return `<tr><td>${this.asset_link(row.asset)}</td><td>${this.esc(row.asset_name)}</td><td>${this.esc(row.location_display)}</td><td>${row.qty}</td><td>${this.source_link(row)}</td><td>${this.money(row.rate)}</td><td>${this.money(row.amount)}</td><td><button type="button" class="fac-row-btn" data-move-row="${index}">Move</button></td></tr>`;
			}).join("") || this.empty(action ? 8 : 6));
		}

		fetch_asset() {
			const asset = this.form.asset_name.get_value();
			const company = this.form.company.get_value();
			if (!company) {
				if (asset) frappe.msgprint("Please select Company first.");
				this.set_control_value(this.form.asset_name, "");
				this.clear_asset_context();
				return;
			}
			if (!asset) {
				this.clear_asset_context();
				return;
			}
			this.call("get_asset_details", { asset, company }).then((details) => {
				if (!this.form.company.get_value() && details.company) this.form.company.set_value(details.company);
				this.$main.find("[data-asset-title]").text(details.asset_name || "-");
				this.$main.find("[data-category]").text(details.asset_category || "-");
				this.$main.find("[data-total]").text(details.total_available_qty || 0);
				this.fetch_source();
			});
		}

		render_source_rows(rows) {
			return;
		}

		select_source_row(index) {
			return;
		}

		fetch_source() {
			const holder_type = this.form.from_holder_type.get_value();
			const location = holder_type === "Department" ? this.form.from_department.get_value() : this.form.from_warehouse.get_value();
			if (!this.form.asset_name.get_value() || !this.form.company.get_value() || !holder_type || !location) {
				this.set_source({});
				return;
			}
			const args = {
				asset: this.form.asset_name.get_value(),
				company: this.form.company.get_value(),
				holder_type,
				warehouse: holder_type === "Warehouse" ? location : "",
				department: holder_type === "Department" ? location : "",
			};
			this.call("get_source_balance", args).then((source) => this.set_source(source || {}));
		}

		set_source(source) {
			this.source = source || {};
			this.$main.find("[data-source-qty]").text(this.source.available_qty_at_source || 0);
			this.$main.find("[data-source-qty-ref]").text(this.source.available_qty_at_source || 0);
			const purchase_receipt = this.source.source_type === "Purchase Receipt" ? this.source.source_id || "" : "";
			this.$main.find("[data-pr-id]").text(purchase_receipt || "-");
			this.$main.find("[data-source]").text(this.source.selected_source_location || "-");
			this.$main.find("[data-rate]").html(this.money(this.source.rate));
			const has_purchase_receipt = Boolean(purchase_receipt);
			this.$main.find("[data-pr-link],[data-pr-id]").attr("href", has_purchase_receipt ? `/app/purchase-receipt/${encodeURIComponent(purchase_receipt)}` : "#");
			this.update_summary();
		}

		toggle_source_fields(clear_location) {
			const holder_type = this.form.from_holder_type.get_value() || "Warehouse";
			this.form.from_warehouse.toggle(holder_type === "Warehouse");
			this.form.from_department.toggle(holder_type === "Department");
			if (clear_location) {
				this.set_control_value(this.form.from_warehouse, "");
				this.set_control_value(this.form.from_department, "");
				this.set_source({});
			}
			this.fetch_source();
		}

		toggle_target_fields() {
			const holder_type = this.form.to_holder_type.get_value();
			this.form.to_warehouse.toggle(holder_type === "Warehouse");
			this.form.to_department.toggle(holder_type === "Department");
			this.update_summary();
		}

		update_summary() {
			if (!this.form.move_qty) return;
			const qty = this.num(this.form.move_qty.get_value());
			const rate = this.num(this.source.rate);
			const value = qty * rate;
			const from_type = this.form.from_holder_type.get_value() || "-";
			const from_location = from_type === "Department" ? this.form.from_department.get_value() : this.form.from_warehouse.get_value();
			const to_type = this.form.to_holder_type.get_value() || "-";
			const to_location = to_type === "Department" ? this.form.to_department.get_value() : this.form.to_warehouse.get_value();
			this.$main.find("[data-value]").html(this.money(value));
			this.$main.find("[data-summary]").html(`
				<span>${this.esc(this.form.asset_name.get_value() || "-")}</span>
				<span>${this.esc(from_type)}: ${this.esc(from_location)}</span>
				<b>&rarr;</b>
				<span>${this.esc(to_type)}: ${this.esc(to_location || "-")}</span>
				<span>Qty: ${qty || 0}</span>
				<span>Value: ${this.money(value)}</span>
			`);
		}

		submit_move() {
			const holder_type = this.form.from_holder_type.get_value();
			const source_location = holder_type === "Department" ? this.form.from_department.get_value() : this.form.from_warehouse.get_value();
			const to_type = this.form.to_holder_type.get_value();
			const to_location = to_type === "Department" ? this.form.to_department.get_value() : this.form.to_warehouse.get_value();
			const move_qty = this.num(this.form.move_qty.get_value());

			if (!this.form.company.get_value() || !this.form.asset_name.get_value() || !source_location || !to_location || move_qty <= 0) {
				frappe.msgprint("Please select asset, source, target and move quantity.");
				return;
			}
			if (move_qty > this.num(this.source.available_qty_at_source)) {
				frappe.msgprint("Move Qty cannot be greater than Available Qty at Source.");
				return;
			}
			if (holder_type === to_type && source_location === to_location) {
				frappe.msgprint("From and To location cannot be same.");
				return;
			}

			const data = {
				posting_date: this.form.posting_date.get_value(),
				company: this.form.company.get_value(),
				asset_name: this.form.asset_name.get_value(),
				from_holder_type: holder_type,
				from_warehouse: holder_type === "Warehouse" ? source_location : "",
				from_department: holder_type === "Department" ? source_location : "",
				move_qty,
				to_holder_type: to_type,
				to_warehouse: to_type === "Warehouse" ? to_location : "",
				to_department: to_type === "Department" ? to_location : "",
				remarks: this.form.remarks.get_value(),
			};

			this.call("submit_move_asset", { data }).then((result) => {
				this.last_submit = result;
				frappe.show_alert({ message: `Submitted ${result.move_asset}`, indicator: "green" });
				this.reset_move_form("");
				this.$main.find("[data-submit-message]").html(`
					<div class="fac-success">Submitted <a href="/app/move-asset/${encodeURIComponent(result.move_asset)}">${this.esc(result.move_asset)}</a>. Dashboard, Asset Bin and Movement History will load updated data when opened.</div>
				`);
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

		metric(label, value, chip, screen, filter) {
			return `<div class="fac-metric"><div><p>${label}</p><strong>${value}</strong><small>Asset balance summary</small></div><span>${chip}</span></div>`;
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
			if (document.getElementById("fac-single-page-style")) return;
			$(`<style id="fac-single-page-style">
				body.fac-fullscreen-page .navbar,body.fac-fullscreen-page header.navbar,body.fac-fullscreen-page .desk-navbar,body.fac-fullscreen-page .search-bar{display:none!important}
				body.fac-fullscreen-page .page-container,body.fac-fullscreen-page .page-body,body.fac-fullscreen-page .layout-main-section{padding-top:0!important;margin-top:0!important}
				html.fac-fullscreen-page body.fac-fullscreen-page .fac-native-sidebar-hidden,html.fac-fullscreen-page body.fac-fullscreen-page .body-sidebar-container,html.fac-fullscreen-page body.fac-fullscreen-page .body-sidebar,html.fac-fullscreen-page body.fac-fullscreen-page .layout-side-section,html.fac-fullscreen-page body.fac-fullscreen-page .standard-sidebar,html.fac-fullscreen-page body.fac-fullscreen-page .desk-sidebar,html.fac-fullscreen-page body.fac-fullscreen-page .desk-sidebar-wrapper,html.fac-fullscreen-page body.fac-fullscreen-page .page-sidebar,html.fac-fullscreen-page body.fac-fullscreen-page .sidebar-column,html.fac-fullscreen-page body.fac-fullscreen-page .col-lg-2.layout-side-section{display:none!important}
				html.fac-fullscreen-page body.fac-fullscreen-page .layout-main-section,html.fac-fullscreen-page body.fac-fullscreen-page .layout-main-section-wrapper,html.fac-fullscreen-page body.fac-fullscreen-page .layout-main,html.fac-fullscreen-page body.fac-fullscreen-page .page-content,html.fac-fullscreen-page body.fac-fullscreen-page .page-body,html.fac-fullscreen-page body.fac-fullscreen-page .page-container,html.fac-fullscreen-page body.fac-fullscreen-page .container.page-body,html.fac-fullscreen-page body.fac-fullscreen-page .main-section,html.fac-fullscreen-page body.fac-fullscreen-page .desk-page{margin-left:0!important;padding-left:0!important;width:100%!important;max-width:none!important}
				.page-container.fac-page-container,.page-container:has(.fac-app){max-width:none!important;width:100%!important;padding:0!important}
				.page-container.fac-page-container .container,.page-container.fac-page-container .page-body,.page-container.fac-page-container .page-content,.page-container.fac-page-container .layout-main,.page-container.fac-page-container .layout-main-section-wrapper,.page-container.fac-page-container .layout-main-section,.page-container:has(.fac-app) .container,.page-container:has(.fac-app) .page-body,.page-container:has(.fac-app) .page-content,.page-container:has(.fac-app) .layout-main,.page-container:has(.fac-app) .layout-main-section-wrapper,.page-container:has(.fac-app) .layout-main-section{max-width:none!important;width:100%!important;padding-left:0!important;padding-right:0!important;margin-left:0!important;margin-right:0!important}
				.page-container.fac-page-container .page-head,.page-container:has(.fac-app) .page-head{display:none!important}
				.fac-page-wrapper .fac-full-width-section{max-width:none!important;width:100%!important;padding:0!important;margin:0!important}
				html.fac-fullscreen-page body.fac-fullscreen-page .fac-shell,html.fac-fullscreen-page body.fac-fullscreen-page .fac-sidebar{min-height:100vh!important}
				.fac-shell{display:flex;width:100%;min-height:calc(100vh - 56px);margin:0;background:linear-gradient(180deg,#f7f5f0 0%,#eef1f5 100%);color:#071326;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
				.fac-sidebar{width:260px;background:linear-gradient(180deg,#101827 0%,#0f1b2d 62%,#0b1322 100%);color:#fff;padding:24px 18px;flex:0 0 260px;min-height:calc(100vh - 56px);position:sticky;top:0;align-self:flex-start;box-shadow:18px 0 34px rgba(15,23,42,.12);transition:width .18s ease,flex-basis .18s ease,padding .18s ease}.fac-sidebar-toggle{position:absolute;right:-14px;top:196px;width:28px;height:36px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:#fff;color:#0f1b2d;display:grid;place-items:center;font-size:20px;font-weight:800;line-height:1;box-shadow:0 10px 24px rgba(15,23,42,.18);z-index:4}.fac-sidebar-toggle:hover{background:#fff7ed;color:#b45309}.fac-app.fac-sidebar-collapsed .fac-sidebar{width:78px;flex-basis:78px;padding:24px 12px}.fac-app.fac-sidebar-collapsed .fac-sidebar-toggle{transform:rotate(180deg)}.fac-app.fac-sidebar-collapsed .fac-logo-card,.fac-app.fac-sidebar-collapsed .fac-brand-title,.fac-app.fac-sidebar-collapsed .fac-brand-subtitle,.fac-app.fac-sidebar-collapsed .fac-nav button span:not(.fac-nav-icon){display:none}.fac-app.fac-sidebar-collapsed .fac-brand{align-items:center}.fac-app.fac-sidebar-collapsed .fac-nav button{justify-content:center;padding:12px 0}.fac-app.fac-sidebar-collapsed .fac-main{width:calc(100vw - 78px)}.fac-brand{display:flex;flex-direction:column;gap:10px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:24px;margin-bottom:24px}
				.fac-collapsed-logo{display:none;width:44px;height:44px;border-radius:14px;background:#fff;align-items:center;justify-content:center;box-shadow:0 12px 24px rgba(15,23,42,.18)}.fac-collapsed-logo img{display:block;max-width:32px;max-height:32px;width:auto;height:auto;object-fit:contain}.fac-app.fac-sidebar-collapsed .fac-collapsed-logo{display:flex}.fac-logo-card{background:transparent;border:0;border-radius:0;padding:0;box-shadow:none;width:170px;height:72px;max-width:100%;display:flex;align-items:center;justify-content:flex-start}.fac-logo-card img{display:block;max-width:160px;max-height:70px;width:auto;height:auto;object-fit:contain}.fac-brand-title{font-weight:650;font-size:18px;letter-spacing:0}.fac-brand-subtitle{font-size:12px;color:#cbd5e1}
				.fac-nav{display:flex;flex-direction:column;gap:10px}.fac-nav button{border:0;background:transparent;color:#dbeafe;text-align:left;padding:12px 13px;border-radius:12px;font-weight:650;display:flex;align-items:center;gap:11px;transition:background .16s ease,color .16s ease,transform .16s ease}.fac-nav button:hover{background:rgba(255,255,255,.08);color:#fff;transform:translateX(2px)}.fac-nav button.active{background:#fff;color:#071326;box-shadow:0 14px 28px rgba(0,0,0,.22)}.fac-nav-icon{width:28px;height:28px;border-radius:9px;background:rgba(245,158,11,.16);display:grid;place-items:center;font-size:10px;font-weight:650;color:#fde68a}.fac-nav button.active .fac-nav-icon{background:#fff7ed;color:#b45309}
				.fac-mobile-toggle,.fac-sidebar-overlay,.fac-sidebar-close,.fac-shell-menu{display:none}
				.fac-main{flex:1;min-width:0;width:calc(100vw - 260px);padding:32px;overflow:auto}.fac-page-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.fac-page-title h1{font-size:30px;margin:0 0 8px;font-weight:650;letter-spacing:0}.fac-page-title p{margin:0;color:#53627c;font-size:15px}.fac-greeting{margin:-4px 0 18px;color:#475569;font-size:15px;font-weight:500}.fac-hero{display:flex;align-items:center;justify-content:space-between;gap:22px;background:linear-gradient(135deg,#101827 0%,#17233a 100%);color:#fff;border-radius:18px;padding:28px 30px;margin-bottom:22px;box-shadow:0 16px 34px rgba(15,23,42,.12)}.fac-hero-date{color:#f59e0b;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700;margin-bottom:10px}.fac-hero h1{font-size:29px;line-height:1.2;margin:0 0 8px;font-weight:650;color:#fff!important}.fac-hero p{margin:0;color:#dbeafe!important;font-size:15px}.fac-hero .fac-primary{box-shadow:none;white-space:nowrap}
				.fac-primary{background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;border:0;border-radius:12px;padding:12px 22px;font-weight:650;box-shadow:0 14px 28px rgba(245,158,11,.22);transition:transform .16s ease,box-shadow .16s ease}.fac-primary:hover{transform:translateY(-1px);box-shadow:0 18px 34px rgba(245,158,11,.28)}.fac-card{background:rgba(255,255,255,.94);border:1px solid #e8e2d8;border-radius:18px;padding:22px;box-shadow:0 14px 34px rgba(15,23,42,.06);backdrop-filter:saturate(130%) blur(4px);overflow-x:auto}
				.fac-card-header h2{font-size:20px;margin:0 0 5px;font-weight:650}.fac-card-header p{margin:0 0 18px;color:#53627c}.fac-row{display:flex;justify-content:space-between;align-items:center}
				.fac-filter-box{display:grid;width:100%;grid-template-columns:minmax(170px,1.25fr) minmax(150px,1fr) minmax(170px,1.2fr) minmax(150px,1fr) minmax(150px,1fr) minmax(92px,auto);gap:12px;align-items:end;border:1px solid #e8e2d8;border-radius:18px;padding:16px;background:rgba(255,255,255,.9);box-shadow:0 12px 28px rgba(15,23,42,.05);margin-bottom:18px}.fac-filter .form-group{margin-bottom:0}.fac-filter .control-label,.fac-form-grid .control-label{font-size:11px;font-weight:650;color:#53627c;text-transform:none}.fac-filter .form-control,.fac-form-grid .form-control{border-radius:12px;height:44px;border:1px solid #e5ded4;background:#fff}
				.fac-clear{height:44px;border:1px solid #e8e2d8;background:#fff;border-radius:12px;padding:0 18px;font-weight:650;box-shadow:0 8px 18px rgba(15,23,42,.04)}.fac-filter-box>.fac-clear{align-self:end;width:100%;min-width:82px;margin:0}.fac-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:18px}.fac-metric{background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);border:1px solid #e8e2d8;border-radius:18px;padding:21px;display:flex;justify-content:space-between;text-align:left;box-shadow:0 12px 28px rgba(15,23,42,.06);cursor:default}.fac-metric p{color:#53627c;font-weight:650;margin:0 0 8px}.fac-metric strong{font-size:30px;line-height:1}.fac-metric small{display:block;color:#53627c;margin-top:10px}.fac-metric span,.fac-chip{height:26px;padding:5px 12px;border-radius:999px;background:#e8f8ef;color:#047333;font-weight:650;font-size:12px}
				.fac-grid{display:grid;width:100%;grid-template-columns:minmax(0,1.45fr) minmax(360px,1fr);gap:18px}.fac-table{width:100%;min-width:720px;border-collapse:separate;border-spacing:0}.fac-table th{font-size:12px;text-transform:uppercase;color:#53627c;background:#f8fafc;border-bottom:1px solid #e8e2d8;padding:15px 12px;position:sticky;top:0;z-index:1}.fac-table td{border-bottom:1px solid #eee7dd;padding:14px 12px;vertical-align:middle}.fac-table tbody tr{transition:background .14s ease}.fac-table tbody tr:hover{background:#f8fbff}.fac-link{font-weight:650;color:#b45309;text-decoration:none}.fac-link:hover{text-decoration:underline}.fac-source{color:#92400e;font-weight:750}.fac-status{display:inline-block;background:#dcfce7;color:#047333;border-radius:999px;padding:4px 10px;font-weight:650;font-size:12px}.fac-muted{text-align:center;color:#68758b;padding:30px!important}.fac-small{font-size:12px;color:#53627c;margin-top:3px}.fac-row-btn{border:1px solid #e8e2d8;background:#fff;border-radius:11px;padding:8px 16px;font-weight:650;box-shadow:0 8px 18px rgba(15,23,42,.04)}
				.fac-move-layout{display:grid;grid-template-columns:minmax(0,1fr) 410px;gap:20px}.fac-section{border:1px solid #e8e2d8;border-radius:16px;padding:17px;margin-top:16px;background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)}.fac-section h3{margin:0 0 14px;font-size:16px;font-weight:650;display:flex;justify-content:space-between}.fac-section h3 span{background:#fff7ed;color:#b45309;border-radius:999px;padding:4px 10px}.fac-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start}.fac-from-qty-row{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start}.fac-wide{grid-column:1/-1}.fac-read{border:0;border-radius:0;padding:0;background:transparent;min-height:0}.fac-read label,.fac-ref-box label,.fac-dark label{display:block;font-size:11px;font-weight:650;color:#53627c;margin-bottom:7px}.fac-read strong{display:flex;align-items:center;min-height:44px;border:1px solid #e5ded4;border-radius:12px;background:#fff;padding:10px 12px;font-weight:650}.fac-summary{display:flex;gap:8px;flex-wrap:wrap;border:1px dashed #94b6ff;background:#f8fbff;border-radius:14px;padding:13px;margin-top:16px}.fac-summary span{border:1px solid #e8e2d8;background:#fff;border-radius:10px;padding:8px 11px;font-weight:650}.fac-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:15px}.fac-ref{height:max-content;position:sticky;top:18px}.fac-ref-box{border:1px solid #adc2ff;background:#edf3ff;border-radius:14px;padding:15px;margin-bottom:12px}.fac-ref-box a{color:#92400e;text-decoration:none}.fac-ref-box a:hover{text-decoration:underline}.fac-dark{background:linear-gradient(135deg,#101827 0%,#17233a 100%);color:#fff;border-radius:16px;padding:19px;display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;box-shadow:0 18px 30px rgba(15,23,42,.22)}.fac-dark strong{font-size:23px}.fac-note{border:1px solid #e8e2d8;background:#fff;border-radius:14px;padding:12px;font-weight:750;color:#53627c}
				.fac-source-list{display:flex;flex-direction:column;gap:9px;margin-bottom:13px}.fac-source-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;width:100%;border:1px solid #e8e2d8;background:#fff;border-radius:13px;text-align:left;padding:13px;transition:background .16s ease,border-color .16s ease,box-shadow .16s ease}.fac-source-row.active,.fac-source-row:hover{border-color:#6694ff;background:#edf3ff;box-shadow:inset 4px 0 0 #2563eb}.fac-source-row small{display:block;color:#53627c;margin-top:4px}.fac-source-row em{font-style:normal;background:#eefcf5;color:#047333;border-radius:999px;padding:5px 11px;font-weight:650;font-size:12px}.fac-source-row em:last-child{background:#fff4e5;color:#b45309}.fac-empty-source{border:1px dashed #e8e2d8;border-radius:13px;padding:15px;color:#53627c;background:#fff}.fac-success{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:13px;padding:12px;margin:12px 0;font-weight:650}
				.fac-card,.fac-metric,.fac-filter-box,.fac-section,.fac-ref-box,.fac-read strong{transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease,background .18s ease}.fac-card:hover{border-color:#f1d6ad;box-shadow:0 18px 42px rgba(15,23,42,.09)}.fac-section:hover{border-color:#f3c98f;background:linear-gradient(180deg,#fff 0%,#fffaf3 100%)}.fac-metric:hover{transform:translateY(-2px);border-color:#f3c98f;box-shadow:0 16px 36px rgba(15,23,42,.09)}.fac-filter .form-control:focus,.fac-form-grid .form-control:focus{border-color:#f59e0b!important;box-shadow:0 0 0 3px rgba(245,158,11,.14)!important}.fac-read:hover strong,.fac-ref-box:hover{border-color:#9bbcff;box-shadow:0 10px 22px rgba(37,99,235,.08)}.fac-table tbody tr:hover td{background:#fffaf3}.fac-table td:first-child,.fac-table th:first-child{padding-left:18px}.fac-primary:active,.fac-clear:active,.fac-row-btn:active{transform:translateY(1px)}.fac-clear:hover,.fac-row-btn:hover{border-color:#f59e0b;color:#92400e;background:#fffaf3}.fac-link,.fac-source{transition:color .16s ease}.fac-link:hover,.fac-source:hover{color:#f59e0b}.fac-chip,.fac-status,.fac-metric span{box-shadow:inset 0 0 0 1px rgba(4,115,51,.06)}.fac-dark{transition:transform .18s ease,box-shadow .18s ease}.fac-dark:hover{transform:translateY(-1px);box-shadow:0 22px 38px rgba(15,23,42,.28)}
				@media(max-width:1400px){.fac-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.fac-grid,.fac-move-layout{grid-template-columns:1fr}}
				@media(max-width:1100px){.fac-filter-box{grid-template-columns:1fr}.fac-form-grid,.fac-from-qty-row{grid-template-columns:1fr}.fac-ref{position:relative;top:auto}}
				@media(max-width:700px){.fac-metrics{grid-template-columns:1fr}.fac-source-row{grid-template-columns:1fr}.fac-page-title{display:block}.fac-page-title .fac-primary{margin-top:14px;width:100%}}
				@media(min-width:769px){.fac-sidebar-close{display:none!important}}
				@media(max-width:768px){.fac-app{display:block;position:relative}.fac-mobile-toggle{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;border:1px solid #d8e0ef;background:#fff;font-size:22px;font-weight:800;flex:0 0 42px}.fac-shell-menu{display:inline-flex;position:absolute;top:16px;left:16px;z-index:5}.fac-sidebar-toggle{display:none}.fac-sidebar{position:fixed!important;top:0!important;left:-290px!important;width:280px!important;height:100vh!important;min-height:100vh!important;z-index:10000;transition:left .25s ease;overflow-y:auto}.fac-app.fac-sidebar-open .fac-sidebar{left:0!important}.fac-sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999}.fac-app.fac-sidebar-open .fac-sidebar-overlay{display:block}.fac-sidebar-close{display:inline-flex;align-items:center;justify-content:center;position:absolute;top:12px;right:12px;width:34px;height:34px;border:0;border-radius:10px;background:rgba(255,255,255,.12);color:#fff;font-size:24px;line-height:1}.fac-main{width:100%;padding:16px}.fac-page-title{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}.fac-title-copy{flex:1;min-width:0}.fac-page-title h1{font-size:30px}.fac-page-title .fac-primary{width:100%;margin-top:8px}.fac-hero{display:block;padding:64px 22px 22px}.fac-hero .fac-primary{width:100%;margin-top:18px}.fac-filter-box,.fac-metrics,.fac-grid,.fac-move-layout{grid-template-columns:1fr!important}.fac-actions{justify-content:stretch}.fac-actions .fac-clear,.fac-actions .fac-primary{flex:1}.fac-card{width:100%}.fac-table{min-width:720px}}
			</style>`).appendTo("head");
		}
	}
})();
