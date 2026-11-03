/**
 * dsh-websearch-local — Browser settings card interface (新版)
 * 
 * This file is part of dsh-websearch-local
 * 
 * Copyright (C) 2026 MYCF711 (original author)
 * Copyright (C) 2026 Local modifications
 * 
 * This program is derived from dsh-websearch-direct v0.4.4
 * https://github.com/MYCF711/dsh-websearch-direct
 * 
 * See LICENSE file for more details.
 */

window.__ModuleLoader__.load({ id: "dsh-websearch-local", factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;

	var react = require("react");
	var ui = require("@deepseek-ai/dsh-client-ui-primitives");

	var createElement = react.createElement;
	var useState = react.useState;
	var useEffect = react.useState;
	var useRef = react.useRef;

	var Input = ui.Input;
	var Button = ui.Button;
	var Switch = ui.Switch;

	var NS = "websearch-local";
	var API = "/dsh-websearch-local/api";

	/* ------------------------------------------------------------ 文案 */

	var TEXT = {
		title: "联网搜索（直连优先）新版",
		description: "免 Key 直连搜索与代码仓库聚合，不消耗模型 token。",
		tabSources: "入口源管理",
		tabBasic: "基础设置",
		apiKey: "API Key",
		apiKeyHint: "留空 = 免 Key 直连（默认）；填写后所有联网搜索使用此 Key。",
		apiKeySet: "已配置",
		apiKeyUnset: "未配置",
		apiKeyPlaceholderKeep: "已配置，留空保持不变",
		apiKeyPlaceholderEmpty: "输入 Key",
		clearKey: "清除",
		proxyTitle: "全局代理地址",
		proxyHint: "例如 http://127.0.0.1:7890。留空 = 不走全局代理。",
		direct: "直连",
		accel: "加速",
		sourcesUnit: " 个源",
		addProxy: "＋ 代理网址",
		proxyUrlPlaceholder: "代理网址 https://…",
		dupUrl: "该网址与同源另一条入口重复",
		dupSummary: "存在重复网址，无法保存",
		removeSource: "移除源",
		addSource: "＋ 添加自定义源",
		sourceName: "源名称（如：哔哩哔哩）",
		sourceUrl: "官方网址 https://…",
		save: "保存",
		cancel: "取消",
		remove: "×",
		saving: "保存中…",
		discard: "放弃修改",
		resetAll: "恢复默认",
		resetAllConfirm: "确认恢复默认？",
		saved: "已保存，即时生效。",
		loadFailed: "配置加载失败：",
		saveFailed: "保存失败：",
		dirty: "未保存",
		testConnectivity: "测试连通性",
		testing: "测试中...",
		testResults: "测试结果",
		success: "成功",
		failed: "失败",
		responseTime: "响应时间：",
	};

	/* ------------------------------------------------------------ 样式 */

	function ensureStyle() {
		if (typeof document === "undefined") return;
		if (document.querySelector("style[data-wsd-card-new]")) return;
		var tag = document.createElement("style");
		tag.dataset.wsdCardNew = "1";
		tag.textContent = [
			".wsd-setCard{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:12px;transition:border-color .16s,background .16s}",
			".wsd-setCard:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}",
			".wsd-setCardOpen{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}",
			".wsd-setHeader{appearance:none;-webkit-appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
			".wsd-setHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}",
			".wsd-setHeadText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
			".wsd-setName{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}",
			".wsd-setDesc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}",
			".wsd-setChevron{color:var(--dsw-alias-label-tertiary,#8b93a1);flex:none;transition:transform .16s;display:inline-flex}",
			".wsd-setChevronOpen{transform:rotate(180deg)}",
			".wsd-setBody{display:none}",
			".wsd-setCardOpen .wsd-setBody{display:block}",
			".wsd-setTabs{display:flex;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 -16px 16px -16px;padding:0 16px}",
			".wsd-setTab{flex:1;text-align:center;font-size:14px;color:var(--dsw-alias-label-tertiary,#8b93a1);border-bottom:2px solid transparent;padding:12px 0;cursor:pointer;transition:color .16s,border-color .16s}",
			".wsd-setTab:hover{color:var(--dsw-alias-label-secondary,#646a73)}",
			".wsd-setTabActive{color:var(--dsw-alias-brand-primary,#4f6ef7);border-bottom-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
			".wsd-setTabText{margin-bottom:2px}",
			".wsd-setTabBadge{display:inline-block;font-size:11px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:2px 6px;color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:1}",
			".wsd-setTabPanel{display:none}",
			".wsd-setTabPanelActive{display:block}",
			".wsd-setRow{margin-bottom:16px}",
			".wsd-setRow:last-child{margin-bottom:0}",
			".wsd-setLabelBox{display:flex;flex-direction:column;gap:4px}",
			".wsd-setLabel{color:var(--dsw-alias-label-primary,#1f2328);font-size:14px;font-weight:500}",
			".wsd-setHint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:1.5}",
			".wsd-tag{display:inline-block;font-size:11px;background:var(--dsw-alias-bg-layer-2,#f7f8fa);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:2px 6px;color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:1}",
			".wsd-tag.on{background:var(--dsw-alias-brand-primary,#4f6ef7);border-color:var(--dsw-alias-brand-primary,#4f6ef7);color:var(--dsw-alias-bg-layer-1,#fff)}",
			".wsd-input{appearance:none;-webkit-appearance:none;width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,#f7f8fa);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:6px;padding:8px 12px;font-size:14px;transition:border-color .16s,background .16s}",
			".wsd-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4f6ef7);background:var(--dsw-alias-bg-layer-3,#fff)}",
			".wsd-input::placeholder{color:var(--dsw-alias-label-tertiary,#8b93a1)}",
			".wsd-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}",
			".wsd-linkbtn{appearance:none;-webkit-appearance:none;width:auto;font:inherit;color:inherit;background:0 0;border:0;border-radius:6px;padding:6px 12px;font-size:13px;color:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;transition:opacity .16s}",
			".wsd-linkbtn:hover{opacity:.8}",
			".wsd-linkbtn:focus{outline:none}",
			".wsd-linkbtn:disabled{opacity:.4;cursor:not-allowed}",
			".wsd-btn{appearance:none;-webkit-appearance:none;width:auto;font:inherit;color:inherit;background:0 0;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:6px;padding:6px 12px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;transition:border-color .16s,background .16s}",
			".wsd-btn:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}",
			".wsd-btn:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4f6ef7)}",
			".wsd-btn:disabled{opacity:.4;cursor:not-allowed}",
			".wsd-btnPrimary{background:var(--dsw-alias-brand-primary,#4f6ef7);border-color:var(--dsw-alias-brand-primary,#4f6ef7);color:var(--dsw-alias-bg-layer-1,#fff)}",
			".wsd-btnPrimary:hover{background:var(--dsw-alias-brand-primary,#4160e6);border-color:var(--dsw-alias-brand-primary,#4160e6)}",
			".wsd-table{width:100%;border-collapse:collapse;margin:16px 0}",
			".wsd-table th{text-align:left;font-size:13px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8b93a1);padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}",
			".wsd-table td{padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}",
			".wsd-table tr:last-child td{border-bottom:none}",
			".wsd-table tr:hover td{background:var(--dsw-alias-bg-layer-2,#f7f8fa)}",
			".wsd-badge{display:inline-block;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:500}",
			".wsd-badgeDirect{background:#e8f5e8;color:#22c55e;border:1px solid #22c55e}",
			".wsd-badgeAccel{background:#fef3c7;color:#f59e0b;border:1px solid #f59e0b}",
			".wsd-badgeProxy{background:#dbeafe;color:#3b82f6;border:1px solid #3b82f6}",
			".wsd-badgeUnset{background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db}",
			".wsd-badgeBad{background:#fee2e2;color:#ef4444;border:1px solid #ef4444}",
			".wsd-badgeSuccess{background:#d1fae5;color:#10b981;border:1px solid #10b981}",
			".wsd-badgeFailed{background:#fee2e2;color:#ef4444;border:1px solid #ef4444}",
			".wsd-addForm{display:grid;grid-template-columns:1fr auto;gap:8px;margin:8px 0}",
			".wsd-addFormInput{font-size:14px}",
			".wsd-addFormBtn{white-space:nowrap}",
			".wsd-entry{display:grid;grid-template-columns:auto 1fr auto auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}",
			".wsd-entry:last-child{border-bottom:none}",
			".wsd-entryKey{font-size:13px;color:var(--dsw-alias-label-secondary,#646a73);font-weight:500}",
			".wsd-entryValue{font-size:14px;color:var(--dsw-alias-label-primary,#1f2328);flex:1}",
			".wsd-entryBadge{font-size:11px}",
			".wsd-entryBtn{padding:4px 8px;font-size:12px}",
			".wsd-entryRemove{padding:4px;color:#ef4444;cursor:pointer}",
			".wsd-entryRemove:hover{background:#fee2e2;border-radius:4px}",
			".wsd-addFormRow{margin-bottom:16px}",
			".wsd-addFormRow:last-child{margin-bottom:0}",
			".wsd-dupError{color:#ef4444;font-size:12px;margin-top:4px}",
			".wsd-emptyText{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;font-style:italic;text-align:center;padding:16px}"
		].join("");
		document.head.appendChild(tag);
	}

	/* ------------------------------------------------------------ 数据管理 */

	function useData() {
		var [data, setData] = useState({
			sources: [
				{
					id: 'web',
					name: '网页搜索',
					engines: [
						{
							id: 'google',
							label: 'Google',
							base: 'https://www.google.com/search',
							type: 'direct',
							tier: 0,
							routes: [
								{ label: '直连', url: '', base: 'https://www.google.com/search' }
							]
						},
						{
							id: 'bing',
							label: 'Bing',
							base: 'https://www.bing.com/search',
							type: 'direct',
							tier: 0,
							routes: [
								{ label: '直连', url: '', base: 'https://www.bing.com/search' }
							]
						}
					]
				},
				{
					id: 'code',
					name: '代码搜索',
					engines: [
						{
							id: 'github',
							label: 'GitHub',
							base: 'https://github.com/search',
							type: 'direct',
							tier: 0,
							routes: [
								{ label: '直连', url: '', base: 'https://github.com/search' }
							]
						}
					]
				}
			],
			apiKey: '',
			proxies: []
		});

		var [snapshot, setSnapshot] = useState(data);
		var [dirty, setDirty] = useState(false);
		var [saving, setSaving] = useState(false);
		var [loadError, setLoadError] = useState(null);

		function load() {
			setLoadError(null);
			setSaving(true);
			
			// 模拟加载配置
			setTimeout(function() {
				try {
					var saved = localStorage.getItem('websearch-config');
					if (saved) {
						var parsed = JSON.parse(saved);
						setData(parsed);
						setSnapshot(parsed);
						setDirty(false);
					}
					setSaving(false);
				} catch (err) {
					setLoadError(err.message);
					setSaving(false);
				}
			}, 800);
		}

		function save() {
			setSaving(true);
			
			// 模拟保存配置
			setTimeout(function() {
				try {
					localStorage.setItem('websearch-config', JSON.stringify(data));
					setSnapshot(data);
					setDirty(false);
					setSaving(false);
					alert(TEXT.saved);
				} catch (err) {
					alert(TEXT.saveFailed + err.message);
					setSaving(false);
				}
			}, 800);
		}

		function reset() {
			if (confirm(TEXT.resetAllConfirm)) {
				setData({
					sources: [
						{
							id: 'web',
							name: '网页搜索',
							engines: [
								{
									id: 'google',
									label: 'Google',
									base: 'https://www.google.com/search',
									type: 'direct',
									tier: 0,
									routes: [
										{ label: '直连', url: '', base: 'https://www.google.com/search' }
									]
								},
								{
									id: 'bing',
									label: 'Bing',
									base: 'https://www.bing.com/search',
									type: 'direct',
									tier: 0,
									routes: [
										{ label: '直连', url: '', base: 'https://www.bing.com/search' }
									]
								}
							]
						},
						{
							id: 'code',
							name: '代码搜索',
							engines: [
								{
									id: 'github',
									label: 'GitHub',
									base: 'https://github.com/search',
									type: 'direct',
									tier: 0,
									routes: [
										{ label: '直连', url: '', base: 'https://github.com/search' }
									]
								}
							]
						}
					],
					apiKey: '',
					proxies: []
				});
				setSnapshot(data);
				setDirty(false);
			}
		}

		return {
			data, setData, snapshot, setSnapshot,
			dirty, setDirty,
			saving, setSaving,
			loadError, setLoadError,
			load, save, reset
		};
	}

	/* ------------------------------------------------------------ 内部组件 */

	function CardHeader({ open, onToggle, title, desc, badge }) {
		return createElement("button", {
			className: "wsd-setHeader" + (open ? " wsd-setCardOpen" : ""),
			onClick: onToggle
		},
			createElement("div", { className: "wsd-setHeadText" },
				createElement("div", { className: "wsd-setName" }, title),
				createElement("div", { className: "wsd-setDesc" }, desc)
			),
			badge && createElement("span", { className: "wsd-tag" + (badge.on ? " on" : "") }, badge.text),
			createElement("div", { className: "wsd-setChevron" + (open ? " wsd-setChevronOpen" : "") })
		);
	}

	function CardBody({ children }) {
		return createElement("div", { className: "wsd-setBody" }, children);
	}

	function Tabs({ tabs, active, onChange }) {
		return createElement("div", { className: "wsd-setTabs" },
			tabs.map(function(tab) {
				return createElement("div", {
					key: tab.id,
					className: "wsd-setTab" + (active === tab.id ? " wsd-setTabActive" : ""),
					onClick: function() { onChange(tab.id); }
				},
					createElement("div", { className: "wsd-setTabText" }, tab.label),
					tab.badge && createElement("span", { className: "wsd-setTabBadge" }, tab.badge)
				);
			})
		);
	}

	function TabPanel({ children, active }) {
		return createElement("div", { className: "wsd-setTabPanel" + (active ? " wsd-setTabPanelActive" : "") }, children);
	}

	function AddSourceForm({ onAddSource, onCancel, existingUrls }) {
		var [name, setName] = useState('');
		var [url, setUrl] = useState('');
		var [error, setError] = useState(null);

		var canSave = name.trim() && url.trim();
		var urlExists = existingUrls.includes(url.trim());

		function handleSubmit() {
			if (!canSave) return;
			if (urlExists) {
			 setError(TEXT.dupUrl);
			 return;
			}
			onAddSource({ name: name.trim(), url: url.trim() }, function() {
				setName('');
				setUrl('');
				setError(null);
			});
		}

		return createElement("div", { className: "wsd-addFormRow" },
			createElement(Input, {
				value: name,
				onChange: function(e) { setName(e.target.value); setError(null); },
				placeholder: TEXT.sourceName,
				className: "wsd-addFormInput"
			}),
			createElement(Input, {
				value: url,
				onChange: function(e) { setUrl(e.target.value); setError(null); },
				placeholder: TEXT.sourceUrl,
				className: "wsd-addFormInput"
			}),
			createElement(Button, {
				size: "sm",
				onClick: handleSubmit,
				disabled: !canSave || urlExists,
				className: "wsd-addFormBtn",
				children: TEXT.addSource
			}),
			error && createElement("div", { className: "wsd-dupError" }, error)
		);
	}

	function SourcesList({ sources, data, setData, onRemoveSource, onRemoveEntry, onAddProxy, onSwitch }) {
		function handleRemoveSource(catId, engId) {
			var newSources = sources.map(function(cat) {
				if (cat.id === catId) {
					return {
						...cat,
						engines: cat.engines.filter(function(eng) { return eng.id !== engId; })
					};
				}
				return cat;
			});
			setData({ ...data, sources: newSources });
		}

		function handleAddProxy(catId, engId, proxyUrl) {
			var newSources = sources.map(function(cat) {
				if (cat.id === catId) {
					var newEngines = cat.engines.map(function(eng) {
						if (eng.id === engId) {
							return {
								...eng,
								routes: [
									...eng.routes,
									{ label: '代理', url: proxyUrl, base: eng.base }
								]
							};
						}
						return eng;
					});
					return { ...cat, engines: newEngines };
				}
				return cat;
			});
			setData({ ...data, sources: newSources });
		}

		return createElement("div", null,
			sources.map(function(cat) {
				return createElement("div", { key: cat.id, className: "wsd-table-container" },
					createElement("table", { className: "wsd-table" },
						createElement("thead", null,
							createElement("tr", null,
								createElement("th", null, "源"),
								createElement("th", null, "入口"),
								createElement("th", null, "机制"),
								createElement("th", null, "操作")
							)
						),
						createElement("tbody", null,
							cat.engines.map(function(eng) {
								return eng.routes.map(function(route, idx) {
									var isProxy = route.url && route.url !== '';
									var mechanism = isProxy ? TEXT.accel : TEXT.direct;
									var mechanismClass = isProxy ? 'accel' : 'direct';
									
									return createElement("tr", { key: `${eng.id}-${idx}` },
										idx === 0 && createElement("td", { rowSpan: eng.routes.length, className: "wsd-entryKey" }, eng.label),
										createElement("td", { className: "wsd-entryValue" }, 
											isProxy ? route.url : route.base
										),
										createElement("td", { className: "wsd-entryBadge wsd-badge" + mechanismClass }, mechanism),
										createElement("td", null,
											isProxy && createElement(Button, {
												size: "sm",
												onClick: function() { onRemoveEntry(cat.id, eng.id, route.url); },
												className: "wsd-entryBtn",
												children: "移除"
											})
										),
										idx === eng.routes.length - 1 && createElement("td", { className: "wsd-entryRemove" },
											createElement("span", {
												onClick: function() { handleRemoveSource(cat.id, eng.id); },
												title: TEXT.removeSource
											}, TEXT.remove)
										)
									);
								});
							})
						)
					),
					createElement(AddSourceForm, {
						onAddSource: function(item, done) {
							var newSources = sources.map(function(cat) {
								if (cat.id === 'web') {
									return {
										...cat,
										engines: [
											...cat.engines,
											{
												id: 'custom-' + Date.now(),
												label: item.name,
												base: item.url,
												type: 'direct',
												tier: 0,
												routes: [
													{ label: '直连', url: '', base: item.url }
												]
											}
										]
									};
								}
								return cat;
							});
							setData({ ...data, sources: newSources });
							done();
						},
						onCancel: function() {},
						existingUrls: []
					})
				);
			}),
			data.proxies.length > 0 && createElement("div", { className: "wsd-addFormRow" },
				createElement("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
					createElement(Input, {
						value: "",
						onChange: function(e) {},
						placeholder: TEXT.proxyUrlPlaceholder,
						className: "wsd-addFormInput"
					}),
					createElement(Button, {
						size: "sm",
						onClick: function() { onAddProxy(''); },
						children: TEXT.addProxy
					})
				)
			)
		);
	}

	function BasicSettings({ data, setData, snapshot }) {
		var [keyVal, setKeyVal] = useState(data.apiKey);
		var [proxyVal, setProxyVal] = useState(data.proxies.join(', '));
		var [keyClear, setKeyClear] = useState(false);

		var apiKeySet = !!data.apiKey;

		function handleKeySave() {
			var newApiKey = keyClear ? '' : keyVal;
			setData({ ...data, apiKey: newApiKey });
			setKeyVal(newApiKey);
		}

		function handleProxySave() {
			var newProxies = proxyVal.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
			setData({ ...data, proxies: newProxies });
		}

		return createElement("div", null,
			createElement("div", { className: "wsd-setRow" },
				createElement("div", { className: "wsd-setLabelBox" },
					createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10 } },
						createElement("span", { className: "wsd-setLabel", style: { flex: 1 } }, TEXT.apiKey),
						createElement("span", { className: "wsd-tag" + (apiKeySet ? " on" : "") },
							apiKeySet ? TEXT.apiKeySet : TEXT.apiKeyUnset)
					),
					createElement(Input, {
						type: "password",
						value: keyVal,
						placeholder: apiKeySet && !keyClear ? TEXT.apiKeyPlaceholderKeep : TEXT.apiKeyPlaceholderEmpty,
						onChange: function(e) { setKeyVal(e.target.value); setKeyClear(false); },
						className: "wsd-input",
						style: { width: "100%", marginTop: 6 },
						spellCheck: false,
					}),
					apiKeySet
						? createElement("div", { style: { marginTop: 4 } },
							createElement(Button, {
								size: "sm",
								onClick: function() { setKeyClear(!keyClear); setKeyVal(''); },
								children: keyClear ? TEXT.discard : TEXT.clearKey
							})
						)
						: null,
					createElement("div", { className: "wsd-setHint" }, TEXT.apiKeyHint)
				),
				createElement(Button, {
					size: "sm",
					variant: "primary",
					onClick: handleKeySave,
					children: TEXT.save
				})
			),

			createElement("div", { className: "wsd-setRow" },
				createElement("div", { className: "wsd-setLabelBox" },
					createElement("span", { className: "wsd-setLabel" }, TEXT.proxyTitle)
				),
				createElement(Input, {
					value: proxyVal,
					onChange: function(e) { setProxyVal(e.target.value); },
					placeholder: "https://proxy.example.com",
					className: "wsd-input",
					style: { width: "100%" },
					spellCheck: false,
				}),
				createElement("div", { className: "wsd-setHint" }, TEXT.proxyHint),
				createElement(Button, {
					size: "sm",
					variant: "primary",
					onClick: handleProxySave,
					children: TEXT.save
				})
			)
		);
	}

	function ConnectivityTest({ sources, onTestComplete }) {
		var [testing, setTesting] = useState(false);
		var [results, setResults] = useState([]);

		async function testConnectivity() {
			setTesting(true);
			setResults([]);

			var testResults = [];

			for (var source of sources) {
				for (var engine of source.engines) {
					for (var route of engine.routes) {
						var url = route.url || route.base;
						if (!url) continue;

						var startTime = Date.now();
						var isSuccess = false;
						var responseTime = 0;

						try {
							var response = await fetch(url, {
								method: 'HEAD',
								timeout: 5000
							});
							if (response.ok) {
								isSuccess = true;
								responseTime = Date.now() - startTime;
							}
						} catch (error) {
							isSuccess = false;
							responseTime = Date.now() - startTime;
						}

						testResults.push({
							source: source.name,
							engine: engine.label,
							url: url,
							isSuccess: isSuccess,
							responseTime: responseTime,
							enabled: true
						});

						// 更新状态，显示测试进度
						setResults([...testResults]);
						
						// 添加延迟避免请求过于频繁
						await new Promise(resolve => setTimeout(resolve, 500));
					}
				}
			}

			setTesting(false);
			if (onTestComplete) {
				onTestComplete(testResults);
			}
		}

		function renderResult(result) {
			var statusClass = result.isSuccess ? 'success' : 'failed';
			var statusText = result.isSuccess ? TEXT.success : TEXT.failed;
			
			return createElement("tr", { key: `${result.source}-${result.engine}` },
				createElement("td", null, result.source),
				createElement("td", null, result.engine),
				createElement("td", { className: "wsd-entryValue" }, 
					result.url.length > 50 ? result.url.substring(0, 47) + '...' : result.url
				),
				createElement("td", null,
					result.responseTime > 0 ? TEXT.responseTime + result.responseTime + 'ms' : '-'
				),
				createElement("td", null,
					createElement("span", { className: "wsd-badge wsd-badge" + (statusClass === 'success' ? 'Success' : 'Failed') }, statusText)
				)
			);
		}

		return createElement("div", { className: "wsd-setRow" },
			createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
				createElement("div", { 
					style: { 
						fontSize: '16px', 
						fontWeight: '600',
						color: 'var(--dsw-alias-label-primary, #1f2328)'
					}
				}, TEXT.testResults),
				createElement(Button, {
					onClick: testConnectivity,
					disabled: testing,
					children: testing ? TEXT.testing : TEXT.testConnectivity,
					variant: "primary"
				})
			),
			
			createElement("div", { 
				style: { 
					background: 'var(--dsw-alias-bg-layer-2, #f7f8fa)', 
					borderRadius: '8px', 
					padding: '16px',
					maxHeight: '300px',
					overflowY: testing ? 'hidden' : 'auto'
				}
			},
				results.length > 0 ? createElement("table", { className: "wsd-table" },
					createElement("thead", null,
						createElement("tr", null,
							createElement("th", null, "来源"),
							createElement("th", null, "引擎"),
							createElement("th", null, "网址"),
							createElement("th", null, "响应时间"),
							createElement("th", null, "状态")
						)
					),
					createElement("tbody", null,
						results.map(renderResult)
					)
				) : createElement("div", { 
					className: "wsd-emptyText",
					style: { textAlign: 'center', padding: '20px' }
				}, testing ? TEXT.testing : TEXT.testResults)
			)
		);
	}

	function Actions({ dirty, saving, onSave, onReset }) {
		if (!dirty) return null;

		return createElement("div", { className: "wsd-actions" },
			createElement(Button, {
				onClick: onReset,
				children: TEXT.resetAll
			}),
			createElement(Button, {
				onClick: function() { setDirty(false); },
				children: TEXT.discard,
				variant: "secondary"
			}),
			createElement(Button, {
				onClick: onSave,
				disabled: saving,
				children: saving ? TEXT.saving : TEXT.save,
				variant: "primary"
			})
		);
	}

	/* ------------------------------------------------------------ 主要组件 */

	function Card() {
		var [open, setOpen] = useState(false);
		var [activeTab, setActiveTab] = useState('sources');
		var dataState = useData();

		var { data, snapshot, dirty, saving, loadError, load, save, reset } = dataState;

		var tabs = [
			{ id: 'sources', label: TEXT.tabSources, badge: { text: data.sources.length + TEXT.sourcesUnit } },
			{ id: 'basic', label: TEXT.tabBasic },
			{ id: 'connectivity', label: TEXT.testConnectivity }
		];

		function handleRemoveSource(catId, engId) {
			var newSources = data.sources.map(function(cat) {
				if (cat.id === catId) {
					return {
						...cat,
						engines: cat.engines.filter(function(eng) { return eng.id !== engId; })
					};
				}
				return cat;
			});
			dataState.setData({ ...data, sources: newSources });
			dataState.setDirty(true);
		}

		function handleRemoveEntry(catId, engId, url) {
			var newSources = data.sources.map(function(cat) {
				if (cat.id === catId) {
					var newEngines = cat.engines.map(function(eng) {
						if (eng.id === engId) {
							return {
								...eng,
								routes: eng.routes.filter(function(route) { return route.url !== url; })
							};
						}
						return eng;
					});
					return { ...cat, engines: newEngines };
				}
				return cat;
			});
			dataState.setData({ ...data, sources: newSources });
			dataState.setDirty(true);
		}

		function handleAddProxy(proxyUrl) {
			var newProxies = [...data.proxies, proxyUrl];
			dataState.setData({ ...data, proxies: newProxies });
			dataState.setDirty(true);
		}

		function handleSwitch(key, value) {
			var newData = { ...data, [key]: value };
			dataState.setData(newData);
			dataState.setDirty(true);
		}

		function handleAddSource(catId, item, done) {
			var newSources = data.sources.map(function(cat) {
				if (cat.id === 'web') {
					return {
						...cat,
						engines: [
							...cat.engines,
							{
								id: 'custom-' + Date.now(),
								label: item.name,
								base: item.url,
								type: 'direct',
								tier: 0,
								routes: [
									{ label: '直连', url: '', base: item.url }
								]
							}
						]
					};
				}
				return cat;
			});
			dataState.setData({ ...data, sources: newSources });
			dataState.setDirty(true);
			done();
		}

		return createElement("div", { className: "wsd-setCard" + (open ? " wsd-setCardOpen" : "") },
			createElement(CardHeader, {
				open: open,
				onToggle: function() { setOpen(!open); },
				title: TEXT.title,
				desc: TEXT.description,
				badge: dirty ? { text: TEXT.dirty, on: true } : null
			}),

			open && createElement(CardBody, null,
				createElement(Tabs, {
					tabs: tabs,
					active: activeTab,
					onChange: setActiveTab
				}),

				createElement(TabPanel, {
					active: activeTab === 'sources'
				},
					!loadError ? createElement(SourcesList, {
						sources: data.sources,
						data: data,
						setData: dataState.setData,
						onRemoveSource: handleRemoveSource,
						onRemoveEntry: handleRemoveEntry,
						onAddProxy: handleAddProxy,
						onSwitch: handleSwitch,
						onAddSource: handleAddSource
					}) : createElement("div", { className: "wsd-emptyText" }, TEXT.loadFailed + loadError)
				),

				createElement(TabPanel, {
					active: activeTab === 'basic'
				},
					!loadError ? createElement(BasicSettings, {
						data: data,
						setData: dataState.setData,
						snapshot: snapshot
					}) : createElement("div", { className: "wsd-emptyText" }, TEXT.loadFailed + loadError)
				),

				// 连通性测试面板
				createElement(TabPanel, {
					active: activeTab === 'connectivity'
				},
					!loadError ? createElement(ConnectivityTest, {
						sources: data.sources,
						onTestComplete: function(results) {
							console.log('连通性测试结果:', results);
						}
					}) : createElement("div", { className: "wsd-emptyText" }, TEXT.loadFailed + loadError)
				),

				createElement(Actions, {
					dirty: dirty,
					saving: saving,
					onSave: save,
					onReset: reset
				})
			)
		);
	}

	/* ------------------------------------------------------------ 原语守卫 */

	var REQUIRED_PRIMITIVES = ["Input", "Button", "Switch"];
	function missingPrimitives(mod) {
		return REQUIRED_PRIMITIVES.filter(function(name) { 
			return mod[name] === undefined; 
		});
	}

	/* ------------------------------------------------------------ 入口 */

	var name = "dsh-websearch-local";
	var inject = ["slots"];

	function apply(ctx) {
		ensureStyle();
		var gaps = missingPrimitives(ui);
		if (gaps.length > 0) {
			console.warn("[dsh-websearch-local] 宿主 ui-primitives 缺少 " + gaps.join(", ") + " — 设置卡片停用");
			return;
		}

		console.log("[dsh-websearch-local] 插件开始注册到设置页面...");

		ctx.inject(["settingsScope"], function(scoped) {
			// 注册到设置页面的插件标签页
			scoped.slots.inject("settings.plugins.tab", function() {
				console.log("[dsh-websearch-local] 插件注册成功！");
				return scoped.slots.register({
					name: "settings.plugins.tab",
					id: "websearch-local",
					order: 10,
					label: "联网搜索"
				}, function() { 
					console.log("[dsh-websearch-local] 设置卡片组件渲染中...");
					return createElement(Card); 
				});
			});
		});
	}

	exports.name = name;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}});