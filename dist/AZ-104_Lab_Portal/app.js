(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  const meta = window.AZ104_META;
  const defaults = window.AZ104_DEFAULT_STATE;
  const labs = window.AZ104_LABS || [];
  const challenges = window.AZ104_CHALLENGES || {};
  const STORAGE_KEY = "az104-lab-portal-state-v5";

  if (!meta || !defaults) {
    document.body.innerHTML = '<main style="padding:30px;font-family:Segoe UI"><h1>데이터를 불러오지 못했습니다.</h1><p>data.js와 index.html이 같은 폴더에 있는지 확인하세요.</p></main>';
    return;
  }

  let state = loadState();
  let modalSubmit = null;
  let shellMode = state.ui.shell || "bash";
  const shellLines = ["Azure Cloud Shell 로컬 시뮬레이션", "help를 입력하면 지원 명령을 볼 수 있습니다."];

  const services = [
    ["리소스 그룹", "구독 리소스의 수명 주기와 범위 관리", "resource-groups", "▣"],
    ["모든 리소스", "현재 환경의 리소스를 한 번에 조회", "all-resources", "◇"],
    ["Microsoft Entra ID", "사용자, 그룹, SSPR 및 ID 관리", "entra", "◎"],
    ["액세스 제어(IAM)", "Azure RBAC 역할과 범위 관리", "rbac", "♙"],
    ["Policy", "정책 할당과 규정 준수", "policy", "◈"],
    ["스토리지 계정", "컨테이너, SAS, 네트워크, 데이터 보호", "storage", "▱"],
    ["가상 네트워크", "주소 공간, 서브넷, 피어링", "vnets", "⌘"],
    ["네트워크 보안 그룹", "NSG 규칙과 서브넷 연결", "nsgs", "▥"],
    ["가상 머신", "VM 배포, 시작, 중지/할당 해제", "vms", "▧"],
    ["Virtual machine scale sets", "VM 집합과 자동 확장", "vmss", "▨"],
    ["App Services", "웹앱, 배포 슬롯, 확장", "app-services", "▰"],
    ["Container Apps", "컨테이너 앱, ingress 및 replicas", "container-apps", "⬡"],
    ["Private endpoints", "PaaS 서비스의 개인 연결", "private-endpoints", "⊙"],
    ["Route tables", "사용자 정의 경로와 서브넷 연결", "route-tables", "⇢"],
    ["Bastion", "VM의 안전한 RDP/SSH 관리 접속", "bastion", "▤"],
    ["Load balancers", "표준 부하 분산과 상태 프로브", "load-balancers", "⇄"],
    ["Monitor", "경고 규칙, Logs 및 작업 그룹", "monitor", "⌁"],
    ["Network Watcher", "연결 진단 및 네트워크 문제 해결", "network-watcher", "⌕"],
    ["Backup center", "Recovery Services Vault와 VM 백업", "backup", "↺"],
    ["사용자 지정 템플릿 배포", "ARM JSON/Bicep 배포 기록", "deployments", "{}"]
  ];

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return prepareState(clone(defaults));
      return prepareState(Object.assign(clone(defaults), saved, { ui: Object.assign({}, defaults.ui, saved.ui || {}) }));
    } catch (_) {
      return prepareState(clone(defaults));
    }
  }

  function prepareState(value) {
    value.ui = Object.assign({ route: "home", selectedLab: labs[0]?.id, labMode: "guide", entraTab: "users" }, value.ui || {});
    value.labProgress = value.labProgress || {};
    value.labChecks = value.labChecks || {};
    value.quizResults = value.quizResults || {};
    value.notifications = value.notifications || [];
    value.activityLog = value.activityLog || [];
    value.resourceGroups = Array.isArray(value.resourceGroups) ? value.resourceGroups : [];
    value.storageAccounts = Array.isArray(value.storageAccounts) ? value.storageAccounts : [];
    value.vnets = Array.isArray(value.vnets) ? value.vnets : [];
    value.nsgs = Array.isArray(value.nsgs) ? value.nsgs : [];
    value.vms = Array.isArray(value.vms) ? value.vms : [];
    value.vmScaleSets = Array.isArray(value.vmScaleSets) ? value.vmScaleSets : [];
    value.containerApps = Array.isArray(value.containerApps) ? value.containerApps : [];
    value.routeTables = Array.isArray(value.routeTables) ? value.routeTables : [];
    value.bastions = Array.isArray(value.bastions) ? value.bastions : [];
    value.loadBalancers = Array.isArray(value.loadBalancers) ? value.loadBalancers : [];
    value.logQueries = Array.isArray(value.logQueries) ? value.logQueries : [];
    value.networkWatcherTests = Array.isArray(value.networkWatcherTests) ? value.networkWatcherTests : [];
    value.actionGroups = Array.isArray(value.actionGroups) ? value.actionGroups : [];
    value.alerts = Array.isArray(value.alerts) ? value.alerts : [];
    value.storageAccounts.forEach((s) => { s.fileShares = Array.isArray(s.fileShares) ? s.fileShares : []; if (s.fileSoftDelete == null) s.fileSoftDelete = 7; if (s.identityBasedFiles == null) s.identityBasedFiles = false; });
    return value;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateBadges();
  }

  function addActivity(operation, target, status = "Succeeded") {
    state.activityLog.unshift({ time: now(), operation, status, caller: "labadmin@contoso.com", target });
    state.activityLog = state.activityLog.slice(0, 100);
  }

  function toast(title, message, kind = "success") {
    const node = document.createElement("div");
    node.className = `toast ${kind}`;
    node.innerHTML = `<strong>${esc(title)}</strong>${esc(message)}`;
    $("#toastRegion").appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function notify(title, message, kind = "success") {
    state.notifications.unshift({ id: uid("note"), title, message, kind, time: now(), read: false });
    state.notifications = state.notifications.slice(0, 30);
    saveState();
    toast(title, message, kind);
  }

  function command(label, action, primary = false, attrs = "") {
    return `<button class="command${primary ? " primary" : ""}" data-action="${action}" ${attrs}>${esc(label)}</button>`;
  }

  function page(title, subtitle, icon, body, commands = "") {
    return `<section class="page">
      <div class="page-title-row"><div class="page-icon">${icon}</div><div><h1 class="page-heading">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div></div>
      ${commands ? `<div class="command-bar">${commands}</div>` : ""}
      <div class="content">${body}</div>
    </section>`;
  }

  function resourcePage(title, subtitle, icon, menu, active, work, commands = "") {
    return `<section class="page">
      <div class="breadcrumb"><button data-route="home">Home</button><span>›</span><button data-route="${esc(state.ui.route)}">${esc(subtitle.split(" · ")[0])}</button><span>›</span><span>${esc(title)}</span></div>
      <div class="page-title-row"><div class="page-icon">${icon}</div><div><h1 class="page-heading">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div></div>
      ${commands ? `<div class="command-bar">${commands}</div>` : ""}
      <div class="detail-layout"><nav class="service-menu"><input class="form-control service-search" placeholder="Search menu items">${menu.map((item) => item.group ? `<div class="service-group">${esc(item.group)}</div>` : `<button class="service-item ${item.id === active ? "active" : ""} ${item.locked ? "locked" : ""}" data-action="${item.action}" data-tab="${item.id}">${esc(item.label)}</button>`).join("")}</nav><div class="resource-workpane">${work}</div></div>
    </section>`;
  }

  function status(value) {
    const lower = String(value).toLowerCase();
    const cls = lower.includes("running") || lower.includes("active") || lower.includes("succeed") || lower.includes("enabled") ? "running" : lower.includes("stop") || lower.includes("fail") ? "stopped" : "";
    return `<span class="status ${cls}">${esc(value)}</span>`;
  }

  function go(route) {
    if (route === "entra" && state.ui.route !== "entra") state.ui.entraTab = "overview";
    state.ui.route = route;
    saveState();
    render();
    $("#globalNav").classList.remove("open");
    $("#workspace").scrollTop = 0;
  }

  function render() {
    const entraMode = state.ui.route === "entra";
    document.body.classList.toggle("entra-mode", entraMode);
    $("#brandLabel").textContent = entraMode ? "Microsoft Entra admin center" : "Microsoft Azure";
    $("#workspace").innerHTML = renderRoute(state.ui.route || "home");
    renderLabPanel();
    renderShell();
    $$('[data-route]', $("#globalNav")).forEach((node) => node.classList.toggle("active", node.dataset.route === state.ui.route));
    updateBadges();
  }

  function renderRoute(route) {
    const routes = {
      home: renderHome,
      dashboard: renderDashboard,
      "all-services": renderAllServices,
      "all-resources": renderAllResources,
      "resource-groups": renderResourceGroups,
      storage: renderStorage,
      vnets: renderVnets,
      nsgs: renderNsgs,
      vms: renderVms,
      vmss: renderVmss,
      "app-services": renderAppServices,
      "container-apps": renderContainerApps,
      entra: renderEntra,
      rbac: renderRbac,
      policy: renderPolicy,
      "private-endpoints": renderPrivateEndpoints,
      "route-tables": renderRouteTables,
      bastion: renderBastion,
      "load-balancers": renderLoadBalancers,
      monitor: renderMonitor,
      logs: renderLogs,
      "network-watcher": renderNetworkWatcher,
      backup: renderBackup,
      deployments: renderDeployments
    };
    try {
      return (routes[route] || renderHome)();
    } catch (error) {
      console.error("AZ-104 Lab route render error", route, error);
      return page("화면을 불러오지 못했습니다", `${route} 화면 렌더링 오류`, "!", `<div class="info-bar warning-bar"><strong>로컬 상태 데이터가 이전 버전과 충돌했을 수 있습니다.</strong><br>${esc(error?.message || error)}<div class="lab-actions" style="margin-top:12px">${command("현재 화면 다시 불러오기", "recover-route", true)}${command("전체 환경 초기화", "reset-environment")}</div></div>`);
    }
  }

  function renderHome() {
    const recent = allResources().slice(0, 5);
    const quick = services.slice(0, 8).map(([name, desc, route, icon]) => `<button class="quick-card" data-route="${route}"><span class="quick-icon">${icon}</span><span><strong>${esc(name)}</strong><small>${esc(desc)}</small></span></button>`).join("");
    return page("Home", `${state.subscription.name} · ${state.tenant.name}`, "⌂", `
      <div class="content-grid">
        <section class="card span-8 hero"><h2>Welcome to Azure</h2><p>Build, manage, and monitor your applications and resources from a single, unified console.</p><div class="lab-actions">${command("＋ Create a resource", "open-create-menu", true)}${command("View all services", "go-all-services")}</div></section>
        <section class="card span-4"><h3>Navigate</h3><button class="service-link" data-route="all-resources">◇ Resources</button><button class="service-link" data-route="resource-groups">▣ Resource groups</button><button class="service-link" data-route="dashboard">▦ Dashboard</button><button class="service-link" data-action="toggle-labs">✓ AZ-104 practice panel</button></section>
        <section class="card span-12"><h2>Azure services</h2><div class="quick-grid">${quick}</div></section>
        <section class="card span-8"><h3>최근 리소스</h3>${recent.length ? `<table class="data-table"><thead><tr><th>이름</th><th>형식</th><th>리소스 그룹</th><th>위치</th></tr></thead><tbody>${recent.map((r) => `<tr><td><button class="link-button" data-route="${r.route}">${esc(r.name)}</button></td><td>${esc(r.type)}</td><td>${esc(r.group)}</td><td>${esc(r.location)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">최근 리소스가 없습니다.</div>'}</section>
        <section class="card span-4"><h3>Subscription</h3><div class="metric">${allResources().length}</div><div class="metric-label">Resources</div><dl class="properties compact"><dt>Status</dt><dd>${esc(state.subscription.status)}</dd><dt>Current cost</dt><dd>₩${Number(state.subscription.currentCost).toLocaleString()}</dd><dt>Alerts</dt><dd>${state.alerts.length}</dd></dl></section>
      </div>`);
  }

  function renderDashboard() {
    const pct = Math.round((completedLabs() / Math.max(1, labs.length)) * 100);
    const bars = [35, 54, 42, 78, 61, 83, 67, 49, 72, 58, 88, 64].map((h) => `<i style="height:${h}%"></i>`).join("");
    return page("대시보드", "AZ-104 Practice Dashboard", "▦", `<div class="content-grid">
      <section class="card span-4"><h3>실습 진행률</h3><div class="metric">${pct}%</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><p class="form-help">${completedLabs()}개 완료 / 전체 ${labs.length}개</p></section>
      <section class="card span-4"><h3>월 예상 비용</h3><div class="metric">₩${Number(state.subscription.currentCost).toLocaleString()}</div><p class="form-help">예산 ₩${Number(state.budgets[0]?.amount || 0).toLocaleString()}</p></section>
      <section class="card span-4"><h3>활성 경고</h3><div class="metric">${state.alerts.length}</div><p class="form-help">구성된 메트릭 경고 규칙</p></section>
      <section class="card span-8"><h3>리소스 활동</h3><div class="chart">${bars}</div></section>
      <section class="card span-4"><h3>빠른 이동</h3>${services.slice(0, 6).map((s) => `<button class="service-link" data-route="${s[2]}">${s[3]} ${esc(s[0])}</button>`).join("")}</section>
    </div>`);
  }

  function renderAllServices() {
    return page("모든 서비스", "AZ-104 핵심 관리 서비스를 선택하세요.", "▤", `<div class="service-grid">${services.map(([name, desc, route, icon]) => `<button class="service-tile" data-route="${route}"><span>${icon}</span><strong>${esc(name)}</strong><small>${esc(desc)}</small></button>`).join("")}</div>`);
  }

  function allResources() {
    const result = [];
    state.resourceGroups.forEach((x) => result.push({ name: x.name, type: "Resource group", group: "—", location: x.location, route: "resource-groups" }));
    state.storageAccounts.forEach((x) => result.push({ name: x.name, type: "Storage account", group: groupName(x.resourceGroup), location: x.location, route: "storage" }));
    state.vnets.forEach((x) => result.push({ name: x.name, type: "Virtual network", group: groupName(x.resourceGroup), location: x.location, route: "vnets" }));
    state.nsgs.forEach((x) => result.push({ name: x.name, type: "Network security group", group: groupName(x.resourceGroup), location: x.location, route: "nsgs" }));
    state.vms.forEach((x) => result.push({ name: x.name, type: "Virtual machine", group: groupName(x.resourceGroup), location: x.location, route: "vms" }));
    state.vmScaleSets.forEach((x) => result.push({ name: x.name, type: "Virtual machine scale set", group: groupName(x.resourceGroup), location: x.location, route: "vmss" }));
    state.appServices.forEach((x) => result.push({ name: x.name, type: "App Service", group: groupName(x.resourceGroup), location: x.location, route: "app-services" }));
    state.containerApps.forEach((x) => result.push({ name: x.name, type: "Container App", group: groupName(x.resourceGroup), location: x.location, route: "container-apps" }));
    state.privateEndpoints.forEach((x) => result.push({ name: x.name, type: "Private endpoint", group: groupName(x.resourceGroup), location: x.location, route: "private-endpoints" }));
    state.routeTables.forEach((x) => result.push({ name: x.name, type: "Route table", group: groupName(x.resourceGroup), location: x.location, route: "route-tables" }));
    state.bastions.forEach((x) => result.push({ name: x.name, type: "Bastion", group: groupName(x.resourceGroup), location: x.location, route: "bastion" }));
    state.loadBalancers.forEach((x) => result.push({ name: x.name, type: "Load balancer", group: groupName(x.resourceGroup), location: x.location, route: "load-balancers" }));
    state.vaults.forEach((x) => result.push({ name: x.name, type: "Recovery Services vault", group: groupName(x.resourceGroup), location: x.location, route: "backup" }));
    return result;
  }

  function groupName(id) {
    return state.resourceGroups.find((x) => x.id === id)?.name || id || "—";
  }

  function groupOptions(selected = "") {
    return state.resourceGroups.map((x) => `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  }

  function renderAllResources() {
    const items = allResources();
    return page("모든 리소스", "구독의 리소스 목록", "◇", items.length ? `<table class="data-table"><thead><tr><th>이름</th><th>형식</th><th>리소스 그룹</th><th>위치</th></tr></thead><tbody>${items.map((r) => `<tr><td><button class="link-button" data-route="${r.route}">${esc(r.name)}</button></td><td>${esc(r.type)}</td><td>${esc(r.group)}</td><td>${esc(r.location)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">리소스가 없습니다.</div>', command("새로 고침", "refresh") + command("리소스 만들기", "open-create-menu", true));
  }

  function renderResourceGroups() {
    const rows = state.resourceGroups.map((x) => `<tr><td><button class="link-button" data-action="edit-rg" data-id="${x.id}">${esc(x.name)}</button></td><td>${esc(x.location)}</td><td>${Object.entries(x.tags || {}).map(([k, v]) => `<span class="pill blue">${esc(k)}=${esc(v)}</span>`).join("") || "—"}</td><td>${x.lock === "None" ? "없음" : `<span class="pill orange">${esc(x.lock)}</span>`}</td></tr>`).join("");
    return page("리소스 그룹", "구독 범위의 리소스 그룹, 태그 및 잠금", "▣", `<div class="info-bar">태그는 리소스 그룹에서 하위 리소스로 자동 상속되지 않습니다. 잠금은 RBAC 권한과 별도로 적용됩니다.</div><table class="data-table"><thead><tr><th>이름</th><th>위치</th><th>태그</th><th>잠금</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 만들기", "create-rg", true) + command("새로 고침", "refresh"));
  }

  function renderStorage() {
    const selected = state.storageAccounts.find((x) => x.id === state.ui.storageId);
    if (selected) return renderStorageDetail(selected);
    const rows = state.storageAccounts.map((x) => `<tr><td><button class="link-button" data-action="open-storage" data-id="${x.id}">${esc(x.name)}</button></td><td>${esc(groupName(x.resourceGroup))}</td><td>${esc(x.location)}</td><td>${esc(x.redundancy)}</td><td>${x.publicNetwork ? "Enabled" : "Disabled"}</td></tr>`).join("");
    return page("스토리지 계정", "StorageV2 계정과 데이터 보호", "▱", `<div class="info-bar">계정 이름을 선택하면 Containers, Shared access signature, Networking 및 Data protection을 구성할 수 있습니다.</div><table class="data-table"><thead><tr><th>이름</th><th>리소스 그룹</th><th>위치</th><th>중복성</th><th>공용 네트워크</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 만들기", "create-storage", true));
  }

  function renderStorageDetail(x) {
    const tab = state.ui.storageTab || "overview";
    const containers = x.containers.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.access)}</td><td>${esc(c.storedPolicy || "—")}</td></tr>`).join("");
    const sas = x.sasTokens.map((s) => `<tr><td>${esc(s.permissions)}</td><td>${esc(s.service || "Blob")}</td><td>${esc(s.expires || "연습 세션")}</td></tr>`).join("");
    const fileShares = x.fileShares.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.protocol || "SMB")}</td><td>${Number(s.quotaGiB).toLocaleString()} GiB</td><td>${esc(s.accessTier || "Transaction optimized")}</td></tr>`).join("");
    const menu = [
      { id: "overview", label: "Overview", action: "storage-tab" },
      { id: "activity", label: "Activity log", action: "storage-tab" },
      { id: "iam", label: "Access control (IAM)", action: "storage-tab" },
      { id: "tags", label: "Tags", action: "storage-tab" },
      { group: "Data storage" },
      { id: "containers", label: "Containers", action: "storage-tab" },
      { id: "files", label: "File shares", action: "storage-tab" },
      { group: "Security + networking" },
      { id: "networking", label: "Networking", action: "storage-tab" },
      { id: "keys", label: "Access keys", action: "storage-tab" },
      { id: "sas", label: "Shared access signature", action: "storage-tab" },
      { group: "Data management" },
      { id: "protection", label: "Data protection", action: "storage-tab" }
    ];
    let work = "";
    if (tab === "overview") work = `<div class="blade-summary"><section><h2>Essentials</h2><dl class="properties"><dt>Resource group</dt><dd>${esc(groupName(x.resourceGroup))}</dd><dt>Location</dt><dd>${esc(x.location)}</dd><dt>Subscription</dt><dd>${esc(state.subscription.name)}</dd><dt>Performance</dt><dd>${esc(x.performance)}</dd><dt>Replication</dt><dd>${esc(x.redundancy)}</dd><dt>Account kind</dt><dd>${esc(x.kind)}</dd></dl></section><section><h2>Security</h2><dl class="properties"><dt>Secure transfer</dt><dd>${x.secureTransfer ? "Enabled" : "Disabled"}</dd><dt>Minimum TLS version</dt><dd>${esc(x.minTls)}</dd><dt>Public network access</dt><dd>${x.publicNetwork ? "Enabled" : "Disabled"}</dd><dt>Blob versioning</dt><dd>${x.versioning ? "Enabled" : "Disabled"}</dd></dl></section></div>`;
    if (tab === "containers") work = `<h2>Containers</h2><p class="page-subtitle">Manage blob containers in this storage account.</p><div class="command-bar inline">${command("＋ Container", "add-container", true)}${command("Refresh", "refresh")}</div><table class="data-table"><thead><tr><th>Name</th><th>Anonymous access level</th><th>Stored access policy</th></tr></thead><tbody>${containers || '<tr><td colspan="3">No containers found.</td></tr>'}</tbody></table>`;
    if (tab === "sas") work = `<h2>Shared access signature</h2><div class="info-bar">A shared access signature grants delegated access. Select only the services and permissions required.</div><div class="command-bar inline">${command("Generate SAS and connection string", "create-sas", true)}</div><table class="data-table"><thead><tr><th>Permissions</th><th>Allowed services</th><th>Expiry</th></tr></thead><tbody>${sas || '<tr><td colspan="3">No practice SAS has been generated.</td></tr>'}</tbody></table>`;
    if (tab === "networking") work = `<h2>Networking</h2>${x.publicNetwork ? '<div class="info-bar warning-bar">Public network access is enabled from all networks.</div>' : '<div class="info-bar">Public network access is disabled. Use a Private Endpoint for private connectivity.</div>'}<dl class="properties"><dt>Public network access</dt><dd>${x.publicNetwork ? "Enabled" : "Disabled"}</dd><dt>Firewall mode</dt><dd>${esc(x.firewallMode)}</dd><dt>Private endpoints</dt><dd>${state.privateEndpoints.filter((p) => p.targetId === x.id).length}</dd></dl><div class="lab-actions">${command("Configure", "configure-storage", true)}${command("Create private endpoint", "create-private-endpoint")}</div>`;
    if (tab === "protection") work = `<h2>Data protection</h2><div class="info-bar">Versioning preserves previous versions after a write. Soft delete retains deleted blobs for the configured number of days.</div><dl class="properties"><dt>Blob versioning</dt><dd>${x.versioning ? "Enabled" : "Disabled"}</dd><dt>Blob soft delete</dt><dd>${x.blobSoftDelete} days</dd><dt>Container soft delete</dt><dd>${x.containerSoftDelete} days</dd></dl>${command("Configure", "configure-storage", true)}`;
    if (tab === "activity") work = `<h2>Activity log</h2><table class="data-table"><thead><tr><th>Time</th><th>Operation</th><th>Status</th><th>Caller</th></tr></thead><tbody>${state.activityLog.filter((a) => a.target === x.name || a.operation.includes("Storage")).map((a) => `<tr><td>${new Date(a.time).toLocaleString("ko-KR")}</td><td>${esc(a.operation)}</td><td>${status(a.status)}</td><td>${esc(a.caller)}</td></tr>`).join("") || '<tr><td colspan="4">No events in the selected time range.</td></tr>'}</tbody></table>`;
    if (tab === "iam") work = `<h2>Access control (IAM)</h2><p>View access to this resource and manage Azure role assignments.</p><button class="command primary" data-action="go-rbac">View role assignments</button>`;
    if (tab === "tags") work = `<h2>Tags</h2><div class="info-bar">Resource group tags aren't automatically inherited by this storage account.</div><table class="data-table"><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td colspan="2">No tags have been added directly to this resource.</td></tr></tbody></table>`;
    if (tab === "files") work = `<h2>File shares</h2><div class="info-bar">Azure Files는 SMB/NFS 파일 공유를 제공합니다. 이 연습에서는 공유 생성, soft delete 및 ID 기반 액세스를 단순화해 구성합니다.</div><div class="command-bar inline">${command("＋ File share", "add-file-share", true)}${command("Azure Files 설정", "configure-files")}</div><table class="data-table"><thead><tr><th>Name</th><th>Protocol</th><th>Quota</th><th>Access tier</th></tr></thead><tbody>${fileShares || '<tr><td colspan="4">No file shares found.</td></tr>'}</tbody></table><h3 class="section-title">Protection & identity</h3><dl class="properties"><dt>File share soft delete</dt><dd>${x.fileSoftDelete} days</dd><dt>Identity-based access</dt><dd>${x.identityBasedFiles ? "Enabled" : "Disabled"}</dd></dl>`;
    if (tab === "keys") work = `<h2>Access keys</h2><div class="info-bar warning-bar">Store account keys securely. Prefer Microsoft Entra authorization where supported.</div><dl class="properties"><dt>key1</dt><dd>••••••••••••••••••••</dd><dt>key2</dt><dd>••••••••••••••••••••</dd><dt>Shared key access</dt><dd>${x.sharedKey ? "Permitted" : "Not permitted"}</dd></dl>`;
    return resourcePage(x.name, `Storage accounts · ${groupName(x.resourceGroup)}`, "▱", menu, tab, work, command("← Storage accounts", "back-storage") + command("Refresh", "refresh") + command("Delete", "noop"));
  }

  function renderVnets() {
    const selected = state.vnets.find((x) => x.id === state.ui.vnetId);
    if (selected) return renderVnetDetail(selected);
    const rows = state.vnets.map((x) => `<tr><td><button class="link-button" data-action="open-vnet" data-id="${x.id}">${esc(x.name)}</button></td><td>${esc(groupName(x.resourceGroup))}</td><td>${esc(x.location)}</td><td>${esc(x.addressSpace)}</td><td>${x.subnets.length}</td><td>${x.peerings.length}</td></tr>`).join("");
    return page("가상 네트워크", "주소 공간, 서브넷 및 피어링", "⌘", `<div class="info-bar">피어링할 VNet의 주소 공간은 서로 겹치면 안 되며, 피어링은 기본적으로 전이되지 않습니다.</div><table class="data-table"><thead><tr><th>이름</th><th>리소스 그룹</th><th>위치</th><th>주소 공간</th><th>서브넷</th><th>피어링</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 만들기", "create-vnet", true));
  }

  function renderVnetDetail(x) {
    const tab = state.ui.vnetTab || "overview";
    const menu = [{ id: "overview", label: "Overview", action: "vnet-tab" }, { id: "activity", label: "Activity log", action: "vnet-tab" }, { id: "iam", label: "Access control (IAM)", action: "vnet-tab" }, { id: "tags", label: "Tags", action: "vnet-tab" }, { group: "Settings" }, { id: "address", label: "Address space", action: "vnet-tab" }, { id: "subnets", label: "Subnets", action: "vnet-tab" }, { id: "peerings", label: "Peerings", action: "vnet-tab" }, { id: "dns", label: "DNS servers", action: "vnet-tab" }];
    let work = "";
    if (tab === "overview") work = `<h2>Essentials</h2><dl class="properties"><dt>Resource group</dt><dd>${esc(groupName(x.resourceGroup))}</dd><dt>Location</dt><dd>${esc(x.location)}</dd><dt>Address space</dt><dd>${esc(x.addressSpace)}</dd><dt>Subnets</dt><dd>${x.subnets.length}</dd><dt>Peerings</dt><dd>${x.peerings.length}</dd><dt>DNS servers</dt><dd>${esc(x.dns)}</dd></dl>`;
    if (tab === "address") work = `<h2>Address space</h2><div class="info-bar">The address space must not overlap with a virtual network that you plan to peer.</div><table class="data-table"><thead><tr><th>Address space</th><th>Subnets</th></tr></thead><tbody><tr><td>${esc(x.addressSpace)}</td><td>${x.subnets.length}</td></tr></tbody></table>`;
    if (tab === "subnets") work = `<h2>Subnets</h2><div class="command-bar inline">${command("＋ Subnet", "add-subnet", true)}</div><table class="data-table"><thead><tr><th>Name</th><th>Address range</th><th>Network security group</th><th>Route table</th></tr></thead><tbody>${x.subnets.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.prefix)}</td><td>${esc(state.nsgs.find((n) => n.id === s.nsgId)?.name || "None")}</td><td>${esc(s.routeTable)}</td></tr>`).join("")}</tbody></table>`;
    if (tab === "peerings") work = `<h2>Peerings</h2><div class="command-bar inline">${command("＋ Add", "add-peering", true)}</div><table class="data-table"><thead><tr><th>Peering name</th><th>Remote virtual network</th><th>Peering status</th></tr></thead><tbody>${x.peerings.map((p, i) => `<tr><td>${esc(`${x.name}-to-${state.vnets.find((v) => v.id === p.remoteVnetId)?.name || i + 1}`)}</td><td>${esc(state.vnets.find((v) => v.id === p.remoteVnetId)?.name || p.remoteVnetId)}</td><td>${status(p.status || "Connected")}</td></tr>`).join("") || '<tr><td colspan="3">No peerings found.</td></tr>'}</tbody></table>`;
    if (tab === "dns") work = `<h2>DNS servers</h2><label class="quiz-option selected"><input type="radio" checked> Default (Azure-provided)</label><label class="quiz-option"><input type="radio"> Custom</label>`;
    if (tab === "activity") work = `<h2>Activity log</h2><div class="empty">No events in the selected time range.</div>`;
    if (tab === "iam") work = `<h2>Access control (IAM)</h2><button class="command primary" data-action="go-rbac">View role assignments</button>`;
    if (tab === "tags") work = `<h2>Tags</h2><div class="empty">No tags have been added directly to this resource.</div>`;
    return resourcePage(x.name, `Virtual networks · ${groupName(x.resourceGroup)}`, "⌘", menu, tab, work, command("← Virtual networks", "back-vnet") + command("Refresh", "refresh"));
  }

  function renderNsgs() {
    const rows = state.nsgs.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(groupName(x.resourceGroup))}</td><td>${esc(x.location)}</td><td>${x.rules.length}</td><td>${state.vnets.flatMap((v) => v.subnets).filter((s) => s.nsgId === x.id).map((s) => s.name).join(", ") || "연결 안 됨"}</td></tr>`).join("");
    return page("네트워크 보안 그룹", "인바운드/아웃바운드 규칙과 서브넷 연결", "▥", `<div class="info-bar">숫자가 작은 우선순위가 먼저 평가되며 첫 번째 일치 규칙에서 평가가 끝납니다.</div><table class="data-table"><thead><tr><th>이름</th><th>리소스 그룹</th><th>위치</th><th>사용자 규칙</th><th>연결</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ NSG 및 규칙 만들기", "create-nsg", true));
  }

  function renderVms() {
    const rows = state.vms.map((x) => `<tr><td>${esc(x.name)}</td><td>${status(x.status)}</td><td>${esc(x.size)}</td><td>${esc(x.zone || "None")}</td><td>${x.encryptionAtHost ? "Enabled" : "Disabled"}</td><td><button class="link-button" data-action="toggle-vm" data-id="${x.id}">${x.status === "Running" ? "할당 해제" : "시작"}</button></td></tr>`).join("");
    return page("가상 머신", "VM 배포 및 운영 상태", "▧", `<div class="info-bar">컴퓨팅 과금을 중지하려면 Azure Portal에서 <strong>Stop</strong>을 수행한 뒤 <strong>Stopped (deallocated)</strong> 상태인지 확인해야 합니다. 게스트 OS 종료만으로는 할당 해제되지 않을 수 있습니다.</div><table class="data-table"><thead><tr><th>이름</th><th>상태</th><th>크기</th><th>영역</th><th>호스트 암호화</th><th>작업</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 만들기", "create-vm", true));
  }

  function renderVmss() {
    const rows = state.vmScaleSets.map((x) => `<tr><td>${esc(x.name)}</td><td>${status(x.status)}</td><td>${esc(x.orchestration)}</td><td>${x.instances}</td><td>${x.minInstances}–${x.maxInstances}</td><td>${esc(x.size)}</td></tr>`).join("");
    return page("Virtual machine scale sets", "VM 집합, orchestration 및 autoscale", "▨", `<div class="info-bar">VM Scale Sets는 여러 VM 인스턴스를 일관되게 관리하고 자동 확장할 수 있습니다. 이 시뮬레이터는 Flexible/Uniform과 autoscale 범위를 연습합니다.</div><table class="data-table"><thead><tr><th>이름</th><th>상태</th><th>Orchestration</th><th>Instances</th><th>Autoscale</th><th>Size</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Scale set이 없습니다.</td></tr>'}</tbody></table>`, command("＋ 만들기", "create-vmss", true));
  }

  function renderContainerApps() {
    const rows = state.containerApps.map((x) => `<tr><td>${esc(x.name)}</td><td>${status(x.status)}</td><td>${esc(x.environment)}</td><td>${esc(x.ingress)}</td><td>${x.targetPort}</td><td>${x.minReplicas}–${x.maxReplicas}</td><td>${esc(x.image)}</td></tr>`).join("");
    return page("Container Apps", "컨테이너 이미지, ingress 및 replica scaling", "⬡", `<div class="info-bar">Azure Container Apps는 컨테이너 기반 앱을 관리하며 ingress와 min/max replicas를 설정할 수 있습니다.</div><table class="data-table"><thead><tr><th>이름</th><th>상태</th><th>환경</th><th>Ingress</th><th>Port</th><th>Replicas</th><th>Image</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Container App이 없습니다.</td></tr>'}</tbody></table>`, command("＋ 만들기", "create-container-app", true));
  }

  function renderRouteTables() {
    const rows = state.routeTables.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(groupName(x.resourceGroup))}</td><td>${x.routes.map((r) => `${esc(r.name)}: ${esc(r.prefix)} → ${esc(r.nextHopType)} ${esc(r.nextHopIp || "")}`).join("<br>") || "—"}</td><td>${x.associatedSubnets.map((s) => esc(s)).join(", ") || "—"}</td></tr>`).join("");
    return page("Route tables", "사용자 정의 경로(UDR)와 서브넷 연결", "⇢", `<div class="info-bar">Virtual appliance 다음 홉은 NVA의 개인 IP를 지정합니다. Route table은 연결된 서브넷의 트래픽 경로에 적용됩니다.</div><table class="data-table"><thead><tr><th>이름</th><th>리소스 그룹</th><th>Routes</th><th>Associated subnets</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Route table이 없습니다.</td></tr>'}</tbody></table>`, command("＋ Route table", "create-route-table", true));
  }

  function renderBastion() {
    const rows = state.bastions.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.sku)}</td><td>${esc(state.vnets.find((v) => v.id === x.vnetId)?.name || x.vnetId)}</td><td>${esc(x.subnetName)}</td><td>${esc(x.publicIpName)}</td><td>${status(x.status)}</td></tr>`).join("");
    return page("Bastion", "Azure VM의 안전한 RDP/SSH 관리 접속", "▤", `<div class="info-bar">Azure Bastion은 전용 AzureBastionSubnet에 배포되며 VM에 관리용 공용 IP를 직접 노출하지 않고 접속할 수 있게 합니다.</div><table class="data-table"><thead><tr><th>이름</th><th>SKU</th><th>VNet</th><th>Subnet</th><th>Public IP</th><th>상태</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Bastion이 없습니다.</td></tr>'}</tbody></table>`, command("＋ 만들기", "create-bastion", true));
  }

  function renderLoadBalancers() {
    const rows = state.loadBalancers.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.sku)}</td><td>${esc(x.type)}</td><td>${esc(state.vms.find((v) => v.id === x.backendVmId)?.name || x.backendVmId)}</td><td>${esc(x.probeProtocol)} ${x.probePort}</td><td>${status(x.status)}</td></tr>`).join("");
    return page("Load balancers", "내부/퍼블릭 부하 분산과 상태 프로브", "⇄", `<div class="info-bar">Standard Load Balancer는 백엔드 풀과 상태 프로브를 사용해 정상 인스턴스로 트래픽을 전달합니다.</div><table class="data-table"><thead><tr><th>이름</th><th>SKU</th><th>Type</th><th>Backend</th><th>Health probe</th><th>상태</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Load Balancer가 없습니다.</td></tr>'}</tbody></table>`, command("＋ 만들기", "create-load-balancer", true));
  }

  function renderAppServices() {
    const rows = state.appServices.map((x) => `<tr><td>${esc(x.name)}</td><td>${status(x.status)}</td><td>${esc(x.sku)}</td><td>${x.slots.map((s) => `<span class="pill blue">${esc(s)}</span>`).join("")}</td><td>${x.minInstances}–${x.maxInstances}</td><td><button class="link-button" data-action="configure-app" data-id="${x.id}">구성</button></td></tr>`).join("");
    return page("App Services", "웹앱, 배포 슬롯 및 확장", "▰", `<div class="info-bar">배포 슬롯은 Standard 이상 계층에서 사용할 수 있습니다.</div><table class="data-table"><thead><tr><th>이름</th><th>상태</th><th>SKU</th><th>슬롯</th><th>인스턴스 범위</th><th>작업</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 만들기", "create-app", true));
  }

  function renderEntra() {
    const tab = state.ui.entraTab || "overview";
    let body = "";
    if (tab === "overview") body = `<div class="entra-overview-grid"><section class="card"><h2>${esc(state.tenant.name)}</h2><dl class="properties"><dt>Tenant ID</dt><dd>${esc(state.tenant.id)}</dd><dt>Primary domain</dt><dd>${esc(state.tenant.domain)}</dd><dt>License</dt><dd>${esc(state.tenant.license)}</dd></dl><div class="entra-stat"><div><a href="#" data-action="entra-tab" data-tab="users">${state.users.length}</a><small>Users</small></div><div><a href="#" data-action="entra-tab" data-tab="groups">${state.groups.length}</a><small>Groups</small></div></div></section><section class="card"><h2>Lab Administrator</h2><p class="form-help">labadmin@contoso.com</p><div class="empty">No Microsoft Entra roles assigned in this simulation.</div></section><section class="card"><h2>Users at high risk</h2><div class="empty">You don't have access to this data.</div></section></div><h2 class="section-title">Shortcuts</h2><div class="lab-actions"><button class="command" data-action="create-user">＋ Add user</button><button class="command" data-action="entra-tab" data-tab="users">Users</button><button class="command" data-action="entra-tab" data-tab="groups">Groups</button><button class="command" data-action="entra-tab" data-tab="licenses">Licenses</button><button class="command" data-action="entra-tab" data-tab="password-reset">Password reset</button></div>`;
    if (tab === "users") body = `<div class="command-bar inline">${command("＋ 새 사용자", "create-user", true)}</div><table class="data-table"><thead><tr><th>표시 이름</th><th>사용자 계정</th><th>유형</th><th>부서</th><th>라이선스</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${esc(u.displayName)}</td><td>${esc(u.upn)}</td><td>${esc(u.type)}</td><td>${esc(u.department || "—")}</td><td>${esc(u.license)}</td></tr>`).join("")}</tbody></table>`;
    if (tab === "groups") body = `<table class="data-table"><thead><tr><th>그룹</th><th>유형</th><th>멤버 자격</th><th>규칙</th><th>구성원</th></tr></thead><tbody>${state.groups.map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(g.type)}</td><td>${esc(g.membership)}</td><td>${esc(g.rule || "—")}</td><td>${g.members.length}</td></tr>`).join("")}</tbody></table>`;
    if (tab === "licenses") body = `<div class="info-bar warning-bar"><strong>현재 UI 안내:</strong> Microsoft Entra의 라이선스 개념은 AZ-104 범위에 포함되지만, 사용자/그룹 제품 라이선스 할당 작업은 현재 Microsoft 365 관리 센터의 <strong>Billing &gt; Licenses</strong>에서 수행합니다.</div><div class="command-bar inline">${command("Microsoft 365 관리 센터 시뮬레이션 열기", "open-m365-licenses", true)}</div><table class="data-table"><thead><tr><th>사용자</th><th>사용 위치</th><th>현재 라이선스</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${esc(u.displayName)}</td><td>Korea</td><td>${esc(u.license)}</td></tr>`).join("")}</tbody></table>`;
    if (tab === "ca") body = `<div class="command-bar inline">${command("＋ 새 정책", "create-ca", true)}</div><table class="data-table"><thead><tr><th>정책</th><th>포함 대상</th><th>Grant</th><th>상태</th></tr></thead><tbody>${state.conditionalAccess.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(state.groups.find((g) => g.id === p.includeGroup)?.name || p.includeGroup)}</td><td>${esc(p.grant)}</td><td>${status(p.enabled ? "Enabled" : "Report-only")}</td></tr>`).join("") || '<tr><td colspan="4">조건부 액세스 정책이 없습니다.</td></tr>'}</tbody></table>`;
    if (tab === "password-reset") body = `<div class="command-bar inline">${command("Properties 구성", "configure-sspr", true)}</div><h2>Password reset</h2><div class="info-bar">AZ-104 공식 범위의 Self-service password reset(SSPR) 구성 연습입니다.</div><dl class="properties"><dt>Self service password reset enabled</dt><dd>${esc(state.tenant.sspr)}</dd><dt>Selected groups</dt><dd>${state.tenant.ssprGroups.length ? state.tenant.ssprGroups.map((id) => esc(state.groups.find((g) => g.id === id)?.name || id)).join(", ") : "—"}</dd></dl>`;
    if (tab === "reviews") body = `<section class="locked-feature"><div class="locked-icon">🔒</div><h2>Access reviews</h2><p>This feature requires Microsoft Entra ID Governance or an eligible license.</p><div class="info-bar warning-bar"><strong>AZ-104 학습 판단:</strong> 현재 AZ-104 핵심 범위가 아니므로 의도적으로 잠가 두었습니다. 사용자·그룹·라이선스·SSPR·Azure RBAC 실습에는 영향을 주지 않습니다.</div><button class="command" disabled>License required</button></section>`;
    const menu = `<nav class="service-menu"><div class="entra-product">⌂ &nbsp; Home</div><button class="service-item ${tab === "overview" ? "active" : ""}" data-action="entra-tab" data-tab="overview">Overview</button><div class="entra-section">◇ &nbsp; Entra ID</div><button class="service-item ${tab === "users" ? "active" : ""}" data-action="entra-tab" data-tab="users">Users</button><button class="service-item ${tab === "groups" ? "active" : ""}" data-action="entra-tab" data-tab="groups">Groups</button><button class="service-item" data-action="go-rbac">Roles &amp; admins</button><button class="service-item ${tab === "licenses" ? "active" : ""}" data-action="entra-tab" data-tab="licenses">Licenses</button><button class="service-item ${tab === "ca" ? "active" : ""}" data-action="entra-tab" data-tab="ca">Conditional Access</button><button class="service-item ${tab === "password-reset" ? "active" : ""}" data-action="entra-tab" data-tab="password-reset">Password reset</button><div class="entra-section">♢ &nbsp; ID Governance</div><button class="service-item locked ${tab === "reviews" ? "active" : ""}" data-action="entra-tab" data-tab="reviews">Access reviews</button><div class="entra-section">Support</div><button class="service-item" data-action="support">Diagnose and solve problems</button><button class="service-item" data-action="support">New support request</button></nav>`;
    return `<section class="page entra-page"><div class="breadcrumb"><button data-route="home">Home</button><span>›</span><span>Microsoft Entra</span><span>›</span><span>${esc(state.tenant.name)}</span></div><div class="page-title-row"><div><h1 class="page-heading">Microsoft Entra</h1><p class="page-subtitle">${esc(state.tenant.name)} · ${esc(state.tenant.domain)}</p></div></div><div class="command-bar">${command("＋ Add", "create-user")}${command("Manage tenants", "account")}${command("What's new", "noop")}${command("Preview features", "noop")}${command("Got feedback?", "noop")}</div><div class="detail-layout">${menu}<main class="resource-workpane">${body}</main></div></section>`;
  }

  function renderRbac() {
    const rows = state.roleAssignments.map((r) => `<tr><td>${esc(r.principalName)}</td><td>${esc(r.role)}</td><td>${esc(r.scopeType)}</td><td>${esc(r.scopeName)}</td></tr>`).join("");
    return page("액세스 제어(IAM)", "Azure RBAC 역할 할당", "♙", `<div class="info-bar">역할은 사용자가 무엇을 할 수 있는지, 범위는 어디에서 할 수 있는지를 결정합니다. 상위 범위 할당은 하위 범위에 상속됩니다.</div><table class="data-table"><thead><tr><th>보안 주체</th><th>역할</th><th>범위 유형</th><th>범위</th></tr></thead><tbody>${rows}</tbody></table>`, command("＋ 역할 할당 추가", "assign-role", true));
  }

  function renderPolicy() {
    return page("Policy", "정책 할당 및 효과", "◈", `<div class="info-bar">Deny는 요청을 차단하고 Audit는 비준수로 기록합니다. 기존 리소스 수정에는 Modify와 수정 작업을 검토합니다.</div><table class="data-table"><thead><tr><th>정책 할당</th><th>효과</th><th>범위</th><th>매개 변수</th><th>상태</th></tr></thead><tbody>${state.policies.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.effect)}</td><td>${esc(p.scope)}</td><td>${esc(p.parameter || "—")}</td><td>${status(p.enabled ? "Enabled" : "Disabled")}</td></tr>`).join("")}</tbody></table>`, command("＋ 정책 할당", "create-policy", true));
  }

  function renderPrivateEndpoints() {
    return page("Private endpoints", "Azure PaaS 서비스의 개인 IP 연결", "⊙", `<div class="info-bar">Private Endpoint는 인증을 제거하지 않습니다. Blob 이름 확인에는 Private DNS 영역과 VNet 링크도 필요합니다.</div><table class="data-table"><thead><tr><th>이름</th><th>대상</th><th>하위 리소스</th><th>VNet / 서브넷</th><th>개인 IP</th></tr></thead><tbody>${state.privateEndpoints.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(state.storageAccounts.find((s) => s.id === p.targetId)?.name || p.targetId)}</td><td>${esc(p.subresource)}</td><td>${esc(p.vnetName)} / ${esc(p.subnetName)}</td><td>${esc(p.privateIp)}</td></tr>`).join("") || '<tr><td colspan="5">Private Endpoint가 없습니다.</td></tr>'}</tbody></table>`, command("＋ 만들기", "create-private-endpoint", true));
  }

  function renderMonitor() {
    const actionGroups = Array.isArray(state.actionGroups) ? state.actionGroups : [];
    const alerts = Array.isArray(state.alerts) ? state.alerts : [];
    const vms = Array.isArray(state.vms) ? state.vms : [];
    const groupRows = actionGroups.map((a) => `<tr><td>${esc(a?.name || "—")}</td><td>${esc(a?.email || "—")}</td></tr>`).join("") || '<tr><td colspan="2">작업 그룹이 없습니다.</td></tr>';
    const alertRows = alerts.map((a) => `<tr><td>${esc(a?.name || "—")}</td><td>${esc(vms.find((v) => v.id === a?.scopeId)?.name || a?.scopeId || "—")}</td><td>${esc(a?.metric || "—")} ${esc(a?.operator || "")} ${esc(a?.threshold ?? "")}</td><td>${esc(actionGroups.find((g) => g.id === a?.actionGroupId)?.name || a?.actionGroupId || "—")}</td></tr>`).join("") || '<tr><td colspan="4">경고 규칙이 없습니다.</td></tr>';
    return page("Monitor", "Alerts, Logs 및 Action groups", "⌁", `<div class="content-grid"><section class="card span-5"><h3>작업 그룹</h3><p class="form-help">알림과 자동화 같은 경고 후속 작업을 정의합니다.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>이름</th><th>전자 메일</th></tr></thead><tbody>${groupRows}</tbody></table></div></section><section class="card span-7"><h3>경고 규칙</h3><div class="lab-actions">${command("＋ 경고 규칙", "create-alert", true)}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>이름</th><th>범위</th><th>조건</th><th>작업 그룹</th></tr></thead><tbody>${alertRows}</tbody></table></div></section><section class="card span-12"><h3>진단 도구</h3><p class="form-help">KQL 로그 분석과 Network Watcher 연결 진단을 연습합니다.</p><div class="lab-actions"><button class="command primary" data-route="logs">Logs 열기</button><button class="command" data-route="network-watcher">Network Watcher 열기</button></div></section></div>`, command("＋ 경고 규칙 만들기", "create-alert", true) + command("Backup center", "go-backup"));
  }

  function renderLogs() {
    const rows = state.logQueries.map((q) => `<tr><td>${new Date(q.time).toLocaleString("ko-KR")}</td><td><code>${esc(q.query)}</code></td><td>${q.rows} rows</td><td>${status(q.status)}</td></tr>`).join("");
    return page("Logs", "Azure Monitor Logs · KQL", "⌁", `<div class="info-bar">Azure Monitor Logs는 KQL(Kusto Query Language)을 사용합니다. 이 로컬 실습은 쿼리 문법과 결과 흐름을 단순화합니다.</div><div class="command-bar inline">${command("새 쿼리", "run-log-query", true)}</div><table class="data-table"><thead><tr><th>실행 시간</th><th>Query</th><th>Results</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="4">실행한 쿼리가 없습니다.</td></tr>'}</tbody></table>`);
  }

  function renderNetworkWatcher() {
    const rows = state.networkWatcherTests.map((t) => `<tr><td>${new Date(t.time).toLocaleString("ko-KR")}</td><td>${esc(state.vms.find((v) => v.id === t.sourceVmId)?.name || t.sourceVmId)}</td><td>${esc(t.destination)}:${t.port}</td><td>${esc(t.protocol)}</td><td>${status(t.result)}</td></tr>`).join("");
    return page("Network Watcher", "Connection troubleshoot", "⌕", `<div class="info-bar">Connection troubleshoot는 소스에서 대상 엔드포인트까지의 연결 가능성과 문제 지점을 진단합니다.</div><div class="command-bar inline">${command("Connection troubleshoot", "connection-troubleshoot", true)}</div><table class="data-table"><thead><tr><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Result</th></tr></thead><tbody>${rows || '<tr><td colspan="5">연결 진단 기록이 없습니다.</td></tr>'}</tbody></table>`);
  }

  function renderBackup() {
    return page("Backup center", "Recovery Services Vault 및 보호 항목", "↺", `<div class="info-bar">Azure VM 백업용 Vault는 보호할 VM과 같은 지역에 있어야 합니다.</div><table class="data-table"><thead><tr><th>Vault</th><th>위치</th><th>정책</th><th>보존</th><th>보호 VM</th></tr></thead><tbody>${state.vaults.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.location)}</td><td>${esc(v.frequency)}</td><td>${esc(v.retention)}일</td><td>${esc(state.vms.find((m) => m.id === v.vmId)?.name || "—")}</td></tr>`).join("") || '<tr><td colspan="5">Vault가 없습니다.</td></tr>'}</tbody></table>`, command("＋ Vault 및 백업 구성", "create-vault", true));
  }

  function renderDeployments() {
    return page("사용자 지정 템플릿 배포", "ARM JSON / Bicep 배포 시뮬레이션", "{}", `<div class="info-bar">ARM 템플릿은 선언형 JSON입니다. mode가 Incremental이면 템플릿에 없는 기존 리소스를 기본적으로 삭제하지 않습니다.</div><div class="lab-actions">${command("ARM 템플릿 배포", "deploy-template", true) + command("Bicep 배포", "deploy-bicep")}</div><table class="data-table"><thead><tr><th>배포 이름</th><th>리소스 그룹</th><th>언어</th><th>모드</th><th>상태</th></tr></thead><tbody>${state.deployments.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(groupName(d.resourceGroup))}</td><td>${esc(d.language || "ARM JSON")}</td><td>${esc(d.mode)}</td><td>${status(d.status)}</td></tr>`).join("") || '<tr><td colspan="5">배포 기록이 없습니다.</td></tr>'}</tbody></table>`);
  }

  function completedLabs() {
    return Object.values(state.labProgress).filter(Boolean).length;
  }

  function currentLab() {
    return labs.find((l) => l.id === state.ui.selectedLab) || labs[0];
  }

  function validateLab(lab) {
    const f = {
      rgLock: () => { const x = state.resourceGroups.find((r) => r.name === "rg-operations"); return [!!x, x?.tags?.Environment === "Production", x?.lock === "CanNotDelete"]; },
      entraGroup: () => { const u = state.users.find((x) => x.displayName === "Finance-Test" || x.upn.startsWith("finance-test@")); const g = state.groups.find((x) => x.id === "grp-fin"); return [!!u && u.department === "Finance", !!u && g?.members.includes(u.id), !!u && u.license === "Microsoft Entra ID P1"]; },
      rbacReader: () => { const r = state.roleAssignments.find((x) => x.principalId === "usr-mina" && x.role === "Reader" && x.scopeId === "rg-app"); return [!!r, !!r, !!r]; },
      policyTag: () => { const p = state.policies.find((x) => x.name.toLowerCase().includes("costcenter")); return [!!p, p?.effect === "Deny", p?.scope === "Subscription"]; },
      storageSecure: () => { const x = state.storageAccounts.find((s) => s.name === "staz104secure"); return [!!x, !!x && !x.publicNetwork, !!x && x.versioning && Number(x.blobSoftDelete) === 14]; },
      storageSas: () => { const x = state.storageAccounts.find((s) => s.containers.some((c) => c.name === "reports")); const c = x?.containers.find((z) => z.name === "reports"); const sas = x?.sasTokens.find((z) => z.permissions === "Read"); return [c?.access === "Private", !!sas, !!sas && !String(sas.permissions).match(/Write|Delete/)]; },
      vnetPeering: () => { const x = state.vnets.find((v) => v.name === "vnet-spoke-korea"); const sub = x?.subnets.find((s) => s.name === "snet-workload" && s.prefix === "10.20.1.0/24"); const peer = x?.peerings.find((p) => p.remoteVnetId === "vnet-hub"); return [!!x && x.addressSpace === "10.20.0.0/16", !!sub, !!peer]; },
      nsgHttps: () => { const n = state.nsgs.find((x) => x.name === "nsg-workload"); const rule = n?.rules.find((r) => r.name === "Allow-HTTPS" && Number(r.priority) === 200 && String(r.destinationPort) === "443" && r.action === "Allow"); const linked = state.vnets.some((v) => v.subnets.some((s) => s.name === "snet-workload" && s.nsgId === n?.id)); return [!!n, !!rule, linked]; },
      vmZone: () => { const x = state.vms.find((v) => v.name === "vm-app02"); return [!!x && x.size === "Standard_B2s", x?.zone === "2", !!x?.encryptionAtHost]; },
      vmDeallocated: () => { const x = state.vms.find((v) => v.id === "vm-web01"); return [!!x, ["Deallocated", "Stopped (deallocated)"].includes(x?.status), ["Deallocated", "Stopped (deallocated)"].includes(x?.status)]; },
      appService: () => { const x = state.appServices.find((a) => a.name === "app-az104-web"); return [!!x && x.sku === "S1", !!x?.slots.includes("staging"), Number(x?.maxInstances) === 5]; },
      privateEndpoint: () => { const x = state.privateEndpoints.find((p) => p.targetId === "st-core"); return [!!x, x?.subnetName === "snet-app", x?.subresource === "blob"]; },
      metricAlert: () => { const x = state.alerts.find((a) => a.scopeId === "vm-web01"); return [!!x, x?.metric === "Percentage CPU" && x?.operator === ">" && Number(x?.threshold) === 80, x?.actionGroupId === "ag-cloud"]; },
      backupVm: () => { const x = state.vaults.find((v) => v.name === "rsv-az104-korea"); return [!!x, x?.frequency === "Daily" && Number(x?.retention) === 30, x?.vmId === "vm-web01"]; },
      cliGroup: () => { const x = state.resourceGroups.find((r) => r.name === "rg-cli-lab"); return [!!state.ui.shellUsed, !!x, x?.location === "Korea South"]; },
      azureFiles: () => { const x = state.storageAccounts.find((s) => s.id === "st-core"); const share = x?.fileShares.find((s) => s.name === "teamshare"); return [!!share && Number(share.quotaGiB) === 100, Number(x?.fileSoftDelete) === 14, x?.identityBasedFiles === true]; },
      vmssAutoscale: () => { const x = state.vmScaleSets.find((s) => s.name === "vmss-web-korea"); return [!!x && x.orchestration === "Flexible", Number(x?.instances) === 2, Number(x?.minInstances) === 2 && Number(x?.maxInstances) === 5]; },
      containerApp: () => { const x = state.containerApps.find((c) => c.name === "ca-az104-web"); return [!!x, x?.ingress === "External" && Number(x?.targetPort) === 80, Number(x?.minReplicas) === 1 && Number(x?.maxReplicas) === 3]; },
      networkServices: () => { const rt = state.routeTables.find((r) => r.name === "rt-web"); const route = rt?.routes.find((r) => r.prefix === "0.0.0.0/0" && r.nextHopType === "Virtual appliance" && r.nextHopIp === "10.10.1.10"); const bastion = state.bastions.find((b) => b.name === "bas-hub" && b.sku === "Standard" && b.vnetId === "vnet-hub" && b.subnetName === "AzureBastionSubnet"); const lb = state.loadBalancers.find((l) => l.name === "lb-web" && l.sku === "Standard" && l.type === "Public" && l.backendVmId === "vm-web01" && l.probeProtocol === "TCP" && Number(l.probePort) === 80); return [!!route && rt.associatedSubnets.includes("snet-app"), !!bastion, !!lb]; },
      monitorDiagnostics: () => { const q = state.logQueries.find((x) => x.query.replace(/\s+/g, " ").trim().toLowerCase() === "azureactivity | where activitystatusvalue == 'success' | take 10"); const t = state.networkWatcherTests.find((x) => x.sourceVmId === "vm-web01" && x.destination === "10.10.1.10" && Number(x.port) === 443 && x.protocol === "TCP"); return [!!q && q.status === "Succeeded", !!t, t?.result === "Reachable"]; },
      bicepDeploy: () => { const x = state.deployments.find((d) => d.name === "bicep-storage" && d.language === "Bicep"); return [!!x, !!x, !!x && x.mode === "Incremental" && x.templateIncludesStorage === true && x.status === "Succeeded"]; },
      ssprFinance: () => [state.tenant.sspr === "Selected", state.tenant.ssprGroups.includes("grp-fin"), state.tenant.ssprGroups.length === 1 && state.tenant.ssprGroups[0] === "grp-fin"]
    };
    const steps = (f[lab.validate] || (() => lab.tasks.map(() => false)))();
    return { steps, all: steps.length === lab.tasks.length && steps.every(Boolean) };
  }

  function renderLabPanel() {
    const mode = state.ui.labMode || "guide";
    const body = mode === "guide" ? renderGuidedLab(currentLab()) : renderQuestionBank(mode === "mistakes");
    $("#labPanelBody").innerHTML = `<div class="lab-mode-tabs"><button class="lab-mode-tab ${mode === "guide" ? "active" : ""}" data-action="lab-mode" data-mode="guide">안내 실습</button><button class="lab-mode-tab ${mode === "questions" ? "active" : ""}" data-action="lab-mode" data-mode="questions">확인문제</button><button class="lab-mode-tab ${mode === "mistakes" ? "active" : ""}" data-action="lab-mode" data-mode="mistakes">오답 복습</button></div>${body}`;
    $("#labDockText").textContent = mode === "guide" ? "문제 보기" : mode === "questions" ? "확인문제" : "오답 복습";
    $("#labDockCount").textContent = `${completedLabs()}/${labs.length}`;
  }

  function renderGuidedLab(lab) {
    const check = validateLab(lab);
    const last = state.labChecks[lab.id];
    return `<select id="labSelect" class="form-control lab-select">${labs.map((l) => `<option value="${l.id}" ${l.id === lab.id ? "selected" : ""}>${esc(l.title)}</option>`).join("")}</select><div class="lab-domain">${esc(lab.domain)}</div><h3 class="lab-title">${esc(lab.title)}</h3><div class="lab-scenario"><strong>상황</strong><br>${esc(lab.scenario)}</div><ul class="task-list">${lab.tasks.map((t, i) => `<li class="${check.steps[i] ? "lab-complete" : ""}"><span class="task-check">${check.steps[i] ? "✓" : i + 1}</span><span>${esc(t)}</span></li>`).join("")}</ul><div class="lab-actions">${command("현재 상태 채점", "check-lab", true)}${command("힌트", "lab-hint")}${command("이 실습 초기화", "reset-lab")}<button class="command danger" data-action="reset-environment">전체 환경 초기화</button></div>${last ? `<div class="lab-result ${last.all ? "ok" : "no"}">${last.all ? "모든 요구사항을 충족했습니다. 이 실습을 완료 처리했습니다." : `${last.count}/${lab.tasks.length}단계를 충족했습니다. 체크되지 않은 단계의 포털 설정을 다시 확인하세요.`}</div>` : ""}<h3 class="section-title">실습 확인문제</h3>${(challenges[lab.id] || []).map((q, i) => renderChallenge(lab.id, q, i)).join("")}`;
  }

  function renderQuestionBank(mistakesOnly) {
    let items = labs.flatMap((lab) => (challenges[lab.id] || []).map((q, index) => ({ lab, q, index, key: `${lab.id}:${index}` })));
    if (mistakesOnly) items = items.filter((x) => state.quizResults[x.key] && !state.quizResults[x.key].correct);
    if (!items.length) return `<div class="empty">${mistakesOnly ? "현재 오답이 없습니다." : "확인문제가 없습니다."}</div>`;
    return `<div class="bank-meta"><span class="pill blue">${mistakesOnly ? "오답" : "전체"} ${items.length}문항</span></div>${items.map((x) => `<div class="question-group"><div class="eyebrow">${esc(x.lab.title)}</div>${renderChallenge(x.lab.id, x.q, x.index)}</div>`).join("")}`;
  }

  function renderChallenge(labId, q, index) {
    const key = `${labId}:${index}`;
    const result = state.quizResults[key];
    return `<section class="quiz-card"><div class="eyebrow">CHECK ${index + 1} · ${esc(q.source || "학습 문제")}</div><p class="quiz-text"><strong>${esc(q.q)}</strong></p><div>${q.options.map((o, i) => `<label class="quiz-option ${result?.selected === i ? "selected" : ""}"><input type="radio" name="quiz-${labId}-${index}" value="${i}" ${result?.selected === i ? "checked" : ""}> <span>${String.fromCharCode(65 + i)}. ${esc(o)}</span></label>`).join("")}</div><button class="command primary" data-action="check-challenge" data-lab-id="${labId}" data-index="${index}">정답 확인</button>${result ? `<div class="bank-explanation ${result.correct ? "" : "wrong"}"><strong>${result.correct ? "정답입니다." : `오답입니다. 정답은 ${String.fromCharCode(65 + q.answer)}입니다.`}</strong><br>${esc(q.explain)}</div>` : ""}</section>`;
  }

  function updateBadges() {
    const unread = state.notifications.filter((n) => !n.read).length;
    $("#notificationBadge").textContent = unread;
    $("#notificationBadge").classList.toggle("hidden", unread === 0);
    $("#labNavProgress").textContent = `${Math.round((completedLabs() / Math.max(1, labs.length)) * 100)}%`;
  }

  function toggleLabs(force) {
    const panel = $("#labPanel");
    const open = typeof force === "boolean" ? force : panel.classList.contains("closed");
    panel.classList.toggle("closed", !open);
    document.body.classList.toggle("lab-open", open);
  }

  function toggleShell(force) {
    const shell = $("#cloudShell");
    const open = typeof force === "boolean" ? force : shell.classList.contains("closed");
    shell.classList.toggle("closed", !open);
    if (open) setTimeout(() => $("#shellInput").focus(), 30);
  }

  function renderShell() {
    $("#shellOutput").innerHTML = shellLines.map((line) => `<div class="shell-line">${esc(line)}</div>`).join("");
    $("#shellPrompt").textContent = shellMode === "bash" ? "labadmin@Azure:~$" : "PS /home/labadmin>";
    $$(".shell-tab").forEach((t) => t.classList.toggle("active", t.dataset.shell === shellMode));
  }

  function executeShell(input) {
    const text = input.trim();
    shellLines.push(`${shellMode === "bash" ? "$" : ">"} ${text}`);
    if (!text) return renderShell();
    if (text.toLowerCase() === "clear" || text.toLowerCase() === "cls") shellLines.splice(0);
    else if (text.toLowerCase() === "help") shellLines.push("지원: az group list, az group create --name <이름> --location <위치>, Get-AzResourceGroup, New-AzResourceGroup -Name <이름> -Location <위치>, clear");
    else if (/^(az group list|get-azresourcegroup)$/i.test(text)) shellLines.push(JSON.stringify(state.resourceGroups.map((r) => ({ name: r.name, location: r.location })), null, 2));
    else {
      const cli = text.match(/^az group create\s+--name\s+([^\s]+)\s+--location\s+([^\s]+)$/i);
      const ps = text.match(/^new-azresourcegroup\s+-name\s+([^\s]+)\s+-location\s+([^\s]+)$/i);
      const match = cli || ps;
      if (match) {
        const name = match[1].replace(/["']/g, "");
        const rawLocation = match[2].replace(/["']/g, "").toLowerCase();
        const location = rawLocation === "koreasouth" ? "Korea South" : rawLocation === "koreacentral" ? "Korea Central" : match[2];
        if (!state.resourceGroups.some((r) => r.name.toLowerCase() === name.toLowerCase())) state.resourceGroups.push({ id: uid("rg"), name, location, tags: {}, lock: "None" });
        state.ui.shellUsed = true;
        addActivity("Microsoft.Resources/resourceGroups/write", name);
        saveState();
        shellLines.push(JSON.stringify({ name, location, provisioningState: "Succeeded" }, null, 2));
        notify("리소스 그룹 생성 완료", `${name}을(를) ${location}에 만들었습니다.`);
      } else shellLines.push("명령을 인식하지 못했습니다. help를 입력하세요.");
    }
    renderShell();
    $("#shellOutput").scrollTop = $("#shellOutput").scrollHeight;
  }

  function openModal(title, body, onSubmit = null, submitLabel = "저장") {
    modalSubmit = onSubmit;
    $("#modalRoot").innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${esc(title)}</h2><button class="icon-button dark" data-action="close-modal">×</button></div><form id="modalForm" class="modal-form"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="command" data-action="close-modal">취소</button>${onSubmit ? `<button type="submit" class="command primary">${esc(submitLabel)}</button>` : ""}</div></form></section></div>`;
    setTimeout(() => $("#modalForm input, #modalForm select, #modalForm button")?.focus(), 20);
  }

  function closeModal() {
    $("#modalRoot").innerHTML = "";
    modalSubmit = null;
  }

  function fields(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function formGroup(label, name, value = "", type = "text", extra = "") {
    return `<div class="form-group"><label>${esc(label)}</label><input class="form-control" type="${type}" name="${name}" value="${esc(value)}" ${extra}></div>`;
  }

  function selectGroup(label, name, options) {
    return `<div class="form-group"><label>${esc(label)}</label><select class="form-control" name="${name}">${options}</select></div>`;
  }

  function openCreateMenu() {
    openModal("리소스 만들기", `<div class="service-grid modal-services">${services.filter((s) => !["all-resources", "rbac", "policy"].includes(s[2])).map((s) => `<button type="button" class="service-tile" data-route="${s[2]}"><span>${s[3]}</span><strong>${esc(s[0])}</strong><small>${esc(s[1])}</small></button>`).join("")}</div>`);
  }

  function createResourceGroup(existing) {
    openModal(existing ? "리소스 그룹 편집" : "리소스 그룹 만들기", `<div class="form-grid">${formGroup("이름", "name", existing?.name, "text", existing ? "readonly" : "required")}${selectGroup("지역", "location", ["Korea Central", "Korea South"].map((v) => `<option ${existing?.location === v ? "selected" : ""}>${v}</option>`).join(""))}${formGroup("Environment 태그", "environment", existing?.tags?.Environment)}${formGroup("CostCenter 태그", "costCenter", existing?.tags?.CostCenter)}${selectGroup("리소스 잠금", "lock", ["None", "CanNotDelete", "ReadOnly"].map((v) => `<option ${existing?.lock === v ? "selected" : ""}>${v}</option>`).join(""))}<div class="form-group full"><div class="info-bar">CanNotDelete는 삭제를 막지만 수정은 허용합니다. ReadOnly는 제어 평면의 수정과 삭제를 막습니다.</div></div></div>`, (form) => {
      const v = fields(form); let x = existing;
      if (!x) { x = { id: uid("rg"), name: v.name.trim(), location: v.location, tags: {}, lock: "None" }; state.resourceGroups.push(x); }
      x.location = v.location; x.tags = {}; if (v.environment) x.tags.Environment = v.environment; if (v.costCenter) x.tags.CostCenter = v.costCenter; x.lock = v.lock;
      addActivity("Microsoft.Resources/resourceGroups/write", x.name); saveState(); closeModal(); render(); notify("저장 완료", `${x.name} 구성을 저장했습니다.`);
    }, existing ? "저장" : "검토 + 만들기");
  }

  function createStorage() {
    openModal("스토리지 계정 만들기", `<div class="form-grid">${formGroup("스토리지 계정 이름", "name", "staz104secure", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("중복성", "redundancy", '<option>LRS</option><option>ZRS</option><option>GRS</option>')}${selectGroup("공용 네트워크 액세스", "public", '<option value="false">사용 안 함</option><option value="true">사용</option>')}${selectGroup("Blob 버전 관리", "versioning", '<option value="true">사용</option><option value="false">사용 안 함</option>')}${formGroup("Blob 소프트 삭제(일)", "softDelete", "14", "number", "min=0")}</div>`, (form) => {
      const v = fields(form); state.storageAccounts.push({ id: uid("st"), name: v.name, resourceGroup: v.group, location: "Korea Central", kind: "StorageV2", performance: "Standard", redundancy: v.redundancy, accessTier: "Hot", publicNetwork: v.public === "true", minTls: "1.2", sharedKey: true, secureTransfer: true, blobSoftDelete: Number(v.softDelete), containerSoftDelete: 7, versioning: v.versioning === "true", infrastructureEncryption: false, firewallMode: v.public === "true" ? "All networks" : "Disabled", allowedVnets: [], containers: [], fileShares: [], sasTokens: [] }); addActivity("Microsoft.Storage/storageAccounts/write", v.name); saveState(); closeModal(); render(); notify("배포 완료", `${v.name} 스토리지 계정을 만들었습니다.`);
    }, "검토 + 만들기");
  }

  function configureStorage(x) {
    openModal("Networking 및 Data protection", `<div class="form-grid">${selectGroup("공용 네트워크 액세스", "public", `<option value="true" ${x.publicNetwork ? "selected" : ""}>사용</option><option value="false" ${!x.publicNetwork ? "selected" : ""}>사용 안 함</option>`)}${selectGroup("Blob 버전 관리", "versioning", `<option value="true" ${x.versioning ? "selected" : ""}>사용</option><option value="false" ${!x.versioning ? "selected" : ""}>사용 안 함</option>`)}${formGroup("Blob 소프트 삭제(일)", "softDelete", x.blobSoftDelete, "number", "min=0")}${selectGroup("공유 키 액세스", "sharedKey", `<option value="true" ${x.sharedKey ? "selected" : ""}>허용</option><option value="false" ${!x.sharedKey ? "selected" : ""}>허용 안 함</option>`)}</div>`, (form) => { const v = fields(form); x.publicNetwork = v.public === "true"; x.versioning = v.versioning === "true"; x.blobSoftDelete = Number(v.softDelete); x.sharedKey = v.sharedKey === "true"; saveState(); closeModal(); render(); notify("설정 저장", `${x.name}의 보안 설정을 변경했습니다.`); });
  }

  function addContainer(x) {
    openModal("Blob 컨테이너 만들기", `<div class="form-grid">${formGroup("이름", "name", "reports", "text", "required")}${selectGroup("익명 액세스 수준", "access", '<option>Private</option><option>Blob</option><option>Container</option>')}${formGroup("저장된 액세스 정책(선택)", "policy", "")}</div>`, (form) => { const v = fields(form); x.containers.push({ name: v.name, access: v.access, storedPolicy: v.policy }); saveState(); closeModal(); render(); notify("컨테이너 생성", `${v.name} 컨테이너를 만들었습니다.`); });
  }

  function createSas(x) {
    openModal("Shared access signature", `<div class="form-grid">${selectGroup("허용된 서비스", "service", '<option>Blob</option><option>File</option><option>Blob,File</option>')}${selectGroup("권한", "permissions", '<option>Read</option><option>Read,List</option><option>Read,Write</option><option>Read,Write,Delete,List</option>')}${formGroup("만료", "expires", "2026-12-31")}</div><div class="info-bar">읽기만 요구되면 Read만 선택하세요. SAS는 네트워크 경로를 만들지 않습니다.</div>`, (form) => { const v = fields(form); x.sasTokens.push({ id: uid("sas"), service: v.service, permissions: v.permissions, expires: v.expires }); saveState(); closeModal(); render(); notify("SAS 생성", `${v.permissions} 권한 SAS를 만들었습니다.`); });
  }

  function addFileShare(x) {
    openModal("File share 만들기", `<div class="form-grid">${formGroup("이름", "name", "teamshare", "text", "required")}${selectGroup("Protocol", "protocol", '<option>SMB</option><option>NFS</option>')}${formGroup("Quota (GiB)", "quota", "100", "number")}${selectGroup("Access tier", "tier", '<option>Transaction optimized</option><option>Hot</option><option>Cool</option>')}</div>`, (form) => { const v = fields(form); x.fileShares.push({ id: uid("share"), name: v.name, protocol: v.protocol, quotaGiB: Number(v.quota), accessTier: v.tier }); saveState(); closeModal(); render(); notify("파일 공유 생성", `${v.name} 공유를 만들었습니다.`); });
  }

  function configureFiles(x) {
    openModal("Azure Files 설정", `<div class="form-grid">${formGroup("File share soft delete (days)", "softDelete", x.fileSoftDelete, "number")}${selectGroup("Identity-based access", "identity", `<option value="true" ${x.identityBasedFiles ? "selected" : ""}>Enabled</option><option value="false" ${!x.identityBasedFiles ? "selected" : ""}>Disabled</option>`)}</div><div class="info-bar">실제 Azure Files의 ID 기반 SMB 인증은 선택한 ID 원본 및 도메인 구성에 따라 추가 설정이 필요합니다. 이 Lab은 시험 범위의 구성 지점을 단순화합니다.</div>`, (form) => { const v = fields(form); x.fileSoftDelete = Number(v.softDelete); x.identityBasedFiles = v.identity === "true"; saveState(); closeModal(); render(); notify("Azure Files 설정 저장", `Soft delete ${x.fileSoftDelete}일 · Identity ${x.identityBasedFiles ? "Enabled" : "Disabled"}`); });
  }

  function createVmss() {
    openModal("Virtual machine scale set 만들기", `<div class="form-grid">${formGroup("Scale set 이름", "name", "vmss-web-korea", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("Orchestration mode", "orchestration", '<option>Flexible</option><option>Uniform</option>')}${selectGroup("VM size", "size", '<option>Standard_B2s</option><option>Standard_D2s_v5</option>')}${formGroup("Initial instance count", "instances", "2", "number")}${formGroup("Autoscale minimum", "min", "2", "number")}${formGroup("Autoscale maximum", "max", "5", "number")}</div>`, (form) => { const v = fields(form); state.vmScaleSets.push({ id: uid("vmss"), name: v.name, resourceGroup: v.group, location: "Korea Central", status: "Running", orchestration: v.orchestration, size: v.size, instances: Number(v.instances), minInstances: Number(v.min), maxInstances: Number(v.max) }); saveState(); closeModal(); render(); notify("Scale set 배포 완료", `${v.name}을 만들었습니다.`); }, "검토 + 만들기");
  }

  function createContainerApp() {
    openModal("Container App 만들기", `<div class="form-grid">${formGroup("Container App 이름", "name", "ca-az104-web", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${formGroup("Container Apps environment", "environment", "cae-az104-korea")}${formGroup("Image", "image", "mcr.microsoft.com/k8se/quickstart:latest")}${selectGroup("Ingress", "ingress", '<option>External</option><option>Internal</option><option>Disabled</option>')}${formGroup("Target port", "port", "80", "number")}${formGroup("Min replicas", "min", "1", "number")}${formGroup("Max replicas", "max", "3", "number")}</div>`, (form) => { const v = fields(form); state.containerApps.push({ id: uid("ca"), name: v.name, resourceGroup: v.group, location: "Korea Central", status: "Running", environment: v.environment, image: v.image, ingress: v.ingress, targetPort: Number(v.port), minReplicas: Number(v.min), maxReplicas: Number(v.max) }); saveState(); closeModal(); render(); notify("Container App 배포 완료", `${v.name}을 만들었습니다.`); }, "검토 + 만들기");
  }

  function createRouteTable() {
    const subnetOptions = state.vnets.flatMap((v) => v.subnets.map((s) => `<option value="${v.id}|${s.id}">${esc(v.name)} / ${esc(s.name)}</option>`)).join("");
    openModal("Route table 및 UDR 만들기", `<div class="form-grid">${formGroup("Route table 이름", "name", "rt-web", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${formGroup("Route 이름", "routeName", "default-to-nva")}${formGroup("Destination prefix", "prefix", "0.0.0.0/0")}${selectGroup("Next hop type", "nextHopType", '<option>Virtual appliance</option><option>Internet</option><option>Virtual network gateway</option><option>None</option>')}${formGroup("Next hop address", "nextHopIp", "10.10.1.10")}${selectGroup("Associate subnet", "subnet", subnetOptions)}</div>`, (form) => { const v = fields(form); const [vid, sid] = v.subnet.split("|"); const net = state.vnets.find((x) => x.id === vid); const sub = net?.subnets.find((x) => x.id === sid); const rt = { id: uid("rt"), name: v.name, resourceGroup: v.group, location: "Korea Central", routes: [{ id: uid("route"), name: v.routeName, prefix: v.prefix, nextHopType: v.nextHopType, nextHopIp: v.nextHopIp }], associatedSubnets: sub ? [sub.name] : [] }; state.routeTables.push(rt); if (sub) sub.routeTable = rt.name; saveState(); closeModal(); render(); notify("Route table 생성", `${v.name}을 ${sub?.name || "서브넷"}에 연결했습니다.`); });
  }

  function createBastion() {
    const vnetOptions = state.vnets.filter((v) => v.subnets.some((s) => s.name === "AzureBastionSubnet")).map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("");
    openModal("Azure Bastion 만들기", `<div class="form-grid">${formGroup("Bastion 이름", "name", "bas-hub", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("SKU", "sku", '<option>Standard</option><option>Basic</option>')}${selectGroup("Virtual network", "vnet", vnetOptions)}${formGroup("Public IP name", "publicIp", "pip-bas-hub")}</div><div class="info-bar">Azure Bastion은 이름이 AzureBastionSubnet인 전용 서브넷을 사용합니다.</div>`, (form) => { const v = fields(form); state.bastions.push({ id: uid("bas"), name: v.name, resourceGroup: v.group, location: "Korea Central", sku: v.sku, vnetId: v.vnet, subnetName: "AzureBastionSubnet", publicIpName: v.publicIp, status: "Succeeded" }); saveState(); closeModal(); render(); notify("Bastion 배포 완료", `${v.name}을 만들었습니다.`); });
  }

  function createLoadBalancer() {
    openModal("Load Balancer 만들기", `<div class="form-grid">${formGroup("Load Balancer 이름", "name", "lb-web", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("SKU", "sku", '<option>Standard</option><option>Basic</option>')}${selectGroup("Type", "type", '<option>Public</option><option>Internal</option>')}${selectGroup("Backend VM", "backend", state.vms.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join(""))}${selectGroup("Health probe protocol", "probeProtocol", '<option>TCP</option><option>HTTP</option>')}${formGroup("Health probe port", "probePort", "80", "number")}</div>`, (form) => { const v = fields(form); state.loadBalancers.push({ id: uid("lb"), name: v.name, resourceGroup: v.group, location: "Korea Central", sku: v.sku, type: v.type, backendVmId: v.backend, probeProtocol: v.probeProtocol, probePort: Number(v.probePort), status: "Succeeded" }); saveState(); closeModal(); render(); notify("Load Balancer 배포 완료", `${v.name}을 만들었습니다.`); });
  }

  function runLogQuery() {
    openModal("Logs · New Query", `<div class="form-group"><label>KQL query</label><textarea class="form-control" name="query" style="min-height:150px">AzureActivity | where ActivityStatusValue == 'Success' | take 10</textarea></div><div class="info-bar">이 로컬 환경은 실제 Log Analytics workspace에 연결되지 않으며, 대표 KQL 흐름을 검증합니다.</div>`, (form) => { const v = fields(form); const normalized = v.query.replace(/\s+/g, " ").trim(); const valid = /^AzureActivity\s*\|\s*where\s+ActivityStatusValue\s*==\s*['\"]Success['\"]\s*\|\s*take\s+10$/i.test(normalized); state.logQueries.push({ id: uid("kql"), query: normalized, time: now(), rows: valid ? 6 : 0, status: valid ? "Succeeded" : "Query error" }); saveState(); closeModal(); render(); notify(valid ? "쿼리 완료" : "쿼리 오류", valid ? "6개 예제 행을 반환했습니다." : "Lab의 목표 KQL 구문을 확인하세요.", valid ? "success" : "error"); });
  }

  function connectionTroubleshoot() {
    openModal("Connection troubleshoot", `<div class="form-grid">${selectGroup("Source type", "sourceType", '<option>Virtual machine</option>')}${selectGroup("Source VM", "source", state.vms.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join(""))}${selectGroup("Destination type", "destinationType", '<option>IP address</option>')}${formGroup("Destination IP", "destination", "10.10.1.10")}${selectGroup("Protocol", "protocol", '<option>TCP</option><option>ICMP</option>')}${formGroup("Destination port", "port", "443", "number")}</div>`, (form) => { const v = fields(form); const reachable = v.source === "vm-web01" && v.destination === "10.10.1.10" && v.protocol === "TCP" && Number(v.port) === 443; state.networkWatcherTests.push({ id: uid("nw"), sourceVmId: v.source, destination: v.destination, protocol: v.protocol, port: Number(v.port), result: reachable ? "Reachable" : "Unreachable", time: now() }); saveState(); closeModal(); render(); notify("연결 진단 완료", reachable ? "Reachable" : "Unreachable", reachable ? "success" : "error"); });
  }

  function createVnet() {
    openModal("가상 네트워크 만들기", `<div class="form-grid">${formGroup("이름", "name", "vnet-spoke-korea", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${formGroup("주소 공간", "address", "10.20.0.0/16", "text", "required")}${formGroup("첫 서브넷 이름", "subnet", "snet-workload")}${formGroup("서브넷 주소 범위", "prefix", "10.20.1.0/24")}</div>`, (form) => { const v = fields(form); state.vnets.push({ id: uid("vnet"), name: v.name, resourceGroup: v.group, location: "Korea Central", addressSpace: v.address, dns: "Azure-provided", subnets: v.subnet ? [{ id: uid("subnet"), name: v.subnet, prefix: v.prefix, nsgId: "", routeTable: "None", serviceEndpoints: [] }] : [], peerings: [] }); saveState(); closeModal(); render(); notify("배포 완료", `${v.name}을 만들었습니다.`); }, "검토 + 만들기");
  }

  function addSubnet(vnet) {
    const nsgOptions = '<option value="">없음</option>' + state.nsgs.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join("");
    openModal("서브넷 추가", `<div class="form-grid">${formGroup("이름", "name", "snet-workload", "text", "required")}${formGroup("주소 범위", "prefix", "10.20.1.0/24", "text", "required")}${selectGroup("네트워크 보안 그룹", "nsg", nsgOptions)}</div>`, (form) => { const v = fields(form); vnet.subnets.push({ id: uid("subnet"), name: v.name, prefix: v.prefix, nsgId: v.nsg, routeTable: "None", serviceEndpoints: [] }); saveState(); closeModal(); render(); notify("서브넷 추가", `${v.name}을 추가했습니다.`); });
  }

  function addPeering(vnet) {
    const targets = state.vnets.filter((v) => v.id !== vnet.id);
    openModal("피어링 추가", `<div class="form-grid">${selectGroup("원격 가상 네트워크", "target", targets.map((v) => `<option value="${v.id}">${esc(v.name)} (${esc(v.addressSpace)})</option>`).join(""))}${selectGroup("양방향 피어링", "both", '<option value="true">예</option><option value="false">아니요</option>')}</div><div class="info-bar warning-bar">이 시뮬레이터는 입력한 CIDR 문자열이 동일하면 겹침으로 판단합니다. 실제 Azure는 모든 겹치는 주소 범위를 검사합니다.</div>`, (form) => { const v = fields(form); const target = state.vnets.find((x) => x.id === v.target); if (!target) return; if (target.addressSpace === vnet.addressSpace) { toast("피어링 실패", "주소 공간이 겹칩니다.", "error"); return; } vnet.peerings.push({ id: uid("peer"), remoteVnetId: target.id, status: "Connected" }); if (v.both === "true") target.peerings.push({ id: uid("peer"), remoteVnetId: vnet.id, status: "Connected" }); saveState(); closeModal(); render(); notify("피어링 연결", `${vnet.name}과 ${target.name}을 연결했습니다.`); });
  }

  function createNsg() {
    const subnetOptions = state.vnets.flatMap((v) => v.subnets.map((s) => `<option value="${v.id}|${s.id}">${esc(v.name)} / ${esc(s.name)}</option>`)).join("");
    openModal("NSG 및 인바운드 규칙 만들기", `<div class="form-grid">${formGroup("NSG 이름", "name", "nsg-workload", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${formGroup("규칙 이름", "ruleName", "Allow-HTTPS")}${formGroup("우선순위", "priority", "200", "number")}${formGroup("대상 포트", "port", "443")}${selectGroup("작업", "action", '<option>Allow</option><option>Deny</option>')}${selectGroup("서브넷 연결", "subnet", `<option value="">연결 안 함</option>${subnetOptions}`)}</div>`, (form) => { const v = fields(form); const n = { id: uid("nsg"), name: v.name, resourceGroup: v.group, location: "Korea Central", rules: [{ id: uid("rule"), name: v.ruleName, priority: Number(v.priority), direction: "Inbound", action: v.action, protocol: "TCP", source: "Internet", sourcePort: "*", destination: "*", destinationPort: v.port }] }; state.nsgs.push(n); if (v.subnet) { const [vid, sid] = v.subnet.split("|"); const sub = state.vnets.find((x) => x.id === vid)?.subnets.find((x) => x.id === sid); if (sub) sub.nsgId = n.id; } saveState(); closeModal(); render(); notify("NSG 생성", `${n.name}과 ${v.ruleName} 규칙을 만들었습니다.`); });
  }

  function createVm() {
    openModal("가상 머신 만들기", `<div class="form-grid">${formGroup("VM 이름", "name", "vm-app02", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("크기", "size", '<option>Standard_B2s</option><option>Standard_D2s_v5</option>')}${selectGroup("가용성 영역", "zone", '<option>없음</option><option>1</option><option selected>2</option><option>3</option>')}${selectGroup("호스트에서 암호화", "encryption", '<option value="true">사용</option><option value="false">사용 안 함</option>')}</div>`, (form) => { const v = fields(form); state.vms.push({ id: uid("vm"), name: v.name, resourceGroup: v.group, location: "Korea Central", status: "Running", size: v.size, os: "Windows Server 2022 Datacenter", vnetId: state.vnets[0]?.id || "", subnetId: state.vnets[0]?.subnets[0]?.id || "", privateIp: "10.10.1.5", publicIp: "None", osDisk: "Premium SSD LRS", dataDisks: [], zone: v.zone === "없음" ? "" : v.zone, availabilitySet: "None", encryptionAtHost: v.encryption === "true", bootDiagnostics: true, backupVaultId: "" }); saveState(); closeModal(); render(); notify("VM 배포 완료", `${v.name}을 만들었습니다.`); }, "검토 + 만들기");
  }

  function createApp() {
    openModal("웹앱 만들기", `<div class="form-grid">${formGroup("앱 이름", "name", "app-az104-web", "text", "required")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("가격 책정 계층", "sku", '<option>S1</option><option>B1</option><option>P1v3</option>')}${formGroup("배포 슬롯", "slot", "staging")}${formGroup("최소 인스턴스", "min", "1", "number")}${formGroup("최대 인스턴스", "max", "5", "number")}</div>`, (form) => { const v = fields(form); state.appServices.push({ id: uid("app"), name: v.name, resourceGroup: v.group, location: "Korea Central", status: "Running", runtime: ".NET 8", plan: `asp-${v.name}`, sku: v.sku, instances: 1, minInstances: Number(v.min), maxInstances: Number(v.max), httpsOnly: true, tls: "1.2", customDomain: "", slots: ["production", ...(v.slot ? [v.slot] : [])], vnetIntegration: "None", backup: false }); saveState(); closeModal(); render(); notify("웹앱 배포 완료", `${v.name}을 만들었습니다.`); });
  }

  function configureApp(app) {
    openModal("App Service 구성", `<div class="form-grid">${selectGroup("가격 책정 계층", "sku", ["B1", "S1", "P1v3"].map((v) => `<option ${app.sku === v ? "selected" : ""}>${v}</option>`).join(""))}${formGroup("추가 배포 슬롯", "slot", app.slots.includes("staging") ? "" : "staging")}${formGroup("최소 인스턴스", "min", app.minInstances, "number")}${formGroup("최대 인스턴스", "max", app.maxInstances, "number")}</div>`, (form) => { const v = fields(form); app.sku = v.sku; if (v.slot && !app.slots.includes(v.slot)) app.slots.push(v.slot); app.minInstances = Number(v.min); app.maxInstances = Number(v.max); saveState(); closeModal(); render(); notify("구성 저장", `${app.name} 설정을 변경했습니다.`); });
  }

  function createUser() {
    openModal("새 사용자", `<div class="form-grid">${formGroup("표시 이름", "displayName", "Finance-Test", "text", "required")}${formGroup("사용자 이름", "userName", "finance-test", "text", "required")}${selectGroup("사용자 유형", "type", '<option>Member</option><option>Guest</option>')}${formGroup("부서", "department", "Finance")}</div>`, (form) => { const v = fields(form); const u = { id: uid("usr"), displayName: v.displayName, upn: `${v.userName}@${state.tenant.domain}`, type: v.type, department: v.department, license: "None", enabled: true }; state.users.push(u); if (u.department === "Finance") state.groups.find((g) => g.id === "grp-fin")?.members.push(u.id); saveState(); closeModal(); render(); notify("사용자 생성", `${u.displayName}을 만들었습니다.`); });
  }

  function assignLicense() {
    openModal("Microsoft 365 관리 센터 · Billing > Licenses", `<div class="info-bar">실제 환경의 현재 라이선스 할당 흐름을 단순화한 시뮬레이션입니다.</div><div class="form-grid">${selectGroup("사용자", "user", state.users.map((u) => `<option value="${u.id}">${esc(u.displayName)}</option>`).join(""))}${selectGroup("라이선스", "license", '<option>Microsoft Entra ID P1</option><option>None</option>')}</div>`, (form) => { const v = fields(form); const u = state.users.find((x) => x.id === v.user); if (u) u.license = v.license; saveState(); closeModal(); render(); notify("라이선스 저장", `${u?.displayName || "사용자"}의 라이선스를 변경했습니다.`); });
  }

  function configureSspr() {
    openModal("Password reset · Properties", `<div class="form-grid">${selectGroup("Self service password reset enabled", "mode", '<option>None</option><option>Selected</option><option>All</option>')}${selectGroup("Selected group", "group", state.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join(""))}</div><div class="info-bar">Selected를 선택한 경우 지정한 그룹의 사용자에게 SSPR이 적용됩니다.</div>`, (form) => {
      const v = fields(form);
      state.tenant.sspr = v.mode;
      state.tenant.ssprGroups = v.mode === "Selected" ? [v.group] : [];
      saveState(); closeModal(); render(); notify("SSPR 설정 저장", `${v.mode}${v.mode === "Selected" ? ` · ${state.groups.find((g) => g.id === v.group)?.name || v.group}` : ""}`);
    });
  }

  function assignRole() {
    openModal("역할 할당 추가", `<div class="form-grid">${selectGroup("보안 주체", "principal", state.users.map((u) => `<option value="${u.id}">${esc(u.displayName)}</option>`).join(""))}${selectGroup("역할", "role", '<option>Reader</option><option>Contributor</option><option>Owner</option><option>User Access Administrator</option>')}${selectGroup("범위", "scope", state.resourceGroups.map((r) => `<option value="${r.id}">리소스 그룹: ${esc(r.name)}</option>`).join(""))}</div>`, (form) => { const v = fields(form); const u = state.users.find((x) => x.id === v.principal); const rg = state.resourceGroups.find((x) => x.id === v.scope); state.roleAssignments.push({ id: uid("ra"), principalType: "User", principalId: u.id, principalName: u.displayName, role: v.role, scopeType: "Resource group", scopeId: rg.id, scopeName: rg.name }); saveState(); closeModal(); render(); notify("역할 할당 완료", `${u.displayName}에게 ${v.role} 역할을 할당했습니다.`); });
  }

  function createPolicy() {
    openModal("정책 할당", `<div class="form-grid">${formGroup("할당 이름", "name", "Require CostCenter tag", "text", "required")}${selectGroup("효과", "effect", '<option>Deny</option><option>Audit</option><option>Modify</option>')}${selectGroup("범위", "scope", '<option>Subscription</option><option>Resource group</option>')}${formGroup("태그 이름 / 매개 변수", "parameter", "CostCenter")}</div>`, (form) => { const v = fields(form); state.policies.push({ id: uid("pol"), name: v.name, effect: v.effect, scope: v.scope, parameter: v.parameter, enabled: true }); saveState(); closeModal(); render(); notify("정책 할당 완료", `${v.name}을 할당했습니다.`); });
  }

  function createCa() {
    openModal("조건부 액세스 정책", `<div class="form-grid">${formGroup("정책 이름", "name", "Require MFA for IT Admins", "text", "required")}${selectGroup("포함 그룹", "group", state.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join(""))}${selectGroup("Grant control", "grant", '<option>Require multifactor authentication</option><option>Block access</option>')}${selectGroup("정책 사용", "enabled", '<option value="true">On</option><option value="false">Report-only</option>')}</div><div class="info-bar warning-bar">실제 테넌트에서는 비상 액세스 계정 제외 여부를 먼저 검토하세요.</div>`, (form) => { const v = fields(form); state.conditionalAccess.push({ id: uid("ca"), name: v.name, includeGroup: v.group, grant: v.grant, enabled: v.enabled === "true", excludedTypes: ["Guest"] }); saveState(); closeModal(); render(); notify("정책 저장", `${v.name}을 만들었습니다.`); });
  }

  function createPrivateEndpoint() {
    const subnetOptions = state.vnets.flatMap((v) => v.subnets.map((s) => `<option value="${v.id}|${s.id}">${esc(v.name)} / ${esc(s.name)}</option>`)).join("");
    openModal("Private Endpoint 만들기", `<div class="form-grid">${formGroup("이름", "name", "pe-storage-blob")}${selectGroup("대상 스토리지", "target", state.storageAccounts.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join(""))}${selectGroup("하위 리소스", "subresource", '<option>blob</option><option>file</option>')}${selectGroup("VNet / 서브넷", "network", subnetOptions)}</div>`, (form) => { const v = fields(form); const [vid, sid] = v.network.split("|"); const net = state.vnets.find((x) => x.id === vid); const sub = net?.subnets.find((x) => x.id === sid); state.privateEndpoints.push({ id: uid("pe"), name: v.name, targetId: v.target, subresource: v.subresource, vnetId: vid, vnetName: net?.name, subnetId: sid, subnetName: sub?.name, privateIp: `10.10.1.${10 + state.privateEndpoints.length}`, resourceGroup: net?.resourceGroup, location: net?.location }); saveState(); closeModal(); render(); notify("Private Endpoint 생성", `${v.name}을 만들었습니다.`); });
  }

  function createAlert() {
    openModal("경고 규칙 만들기", `<div class="form-grid">${formGroup("경고 이름", "name", "High CPU vm-web01")}${selectGroup("범위", "scope", state.vms.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join(""))}${selectGroup("신호", "metric", '<option>Percentage CPU</option><option>Available Memory Bytes</option>')}${selectGroup("연산자", "operator", '<option>&gt;</option><option>&lt;</option>')}${formGroup("임계값", "threshold", "80", "number")}${selectGroup("작업 그룹", "actionGroup", state.actionGroups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join(""))}</div>`, (form) => { const v = fields(form); state.alerts.push({ id: uid("alert"), name: v.name, scopeId: v.scope, metric: v.metric, operator: v.operator, threshold: Number(v.threshold), aggregation: "Average", actionGroupId: v.actionGroup, enabled: true }); saveState(); closeModal(); render(); notify("경고 규칙 생성", `${v.name}을 만들었습니다.`); });
  }

  function createVault() {
    openModal("Vault 및 VM 백업 구성", `<div class="form-grid">${formGroup("Vault 이름", "name", "rsv-az104-korea")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("백업 빈도", "frequency", '<option>Daily</option><option>Weekly</option>')}${formGroup("보존 기간(일)", "retention", "30", "number")}${selectGroup("보호할 VM", "vm", state.vms.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join(""))}</div>`, (form) => { const v = fields(form); const vault = { id: uid("vault"), name: v.name, resourceGroup: v.group, location: "Korea Central", frequency: v.frequency, retention: Number(v.retention), vmId: v.vm }; state.vaults.push(vault); const vm = state.vms.find((x) => x.id === v.vm); if (vm) vm.backupVaultId = vault.id; saveState(); closeModal(); render(); notify("백업 구성 완료", `${vm?.name || "VM"}을 보호하도록 구성했습니다.`); });
  }

  function deployTemplate() {
    openModal("ARM 템플릿 배포", `<div class="form-grid">${formGroup("배포 이름", "name", "azuredeploy-az104")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("배포 모드", "mode", '<option>Incremental</option><option>Complete</option>')}<div class="form-group full"><label>템플릿 JSON</label><textarea class="form-control" name="json">{\n  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",\n  "contentVersion": "1.0.0.0",\n  "resources": []\n}</textarea></div></div>`, (form) => { const v = fields(form); try { JSON.parse(v.json); } catch (_) { toast("JSON 오류", "유효한 JSON 템플릿을 입력하세요.", "error"); return; } state.deployments.push({ id: uid("dep"), name: v.name, resourceGroup: v.group, language: "ARM JSON", mode: v.mode, status: "Succeeded", templateIncludesStorage: false }); saveState(); closeModal(); render(); notify("배포 완료", `${v.name} 배포가 완료되었습니다.`); });
  }

  function deployBicep() {
    const sample = `param location string = resourceGroup().location\n\nresource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {\n  name: 'stbicepaz104'\n  location: location\n  kind: 'StorageV2'\n  sku: {\n    name: 'Standard_LRS'\n  }\n}`;
    openModal("Bicep 파일 배포", `<div class="form-grid">${formGroup("배포 이름", "name", "bicep-storage")}${selectGroup("리소스 그룹", "group", groupOptions())}${selectGroup("배포 모드", "mode", '<option>Incremental</option><option>Complete</option>')}<div class="form-group full"><label>Bicep</label><textarea class="form-control" name="bicep" style="min-height:220px">${esc(sample)}</textarea></div></div>`, (form) => { const v = fields(form); const hasResource = /resource\s+\w+\s+['\"]Microsoft\.Storage\/storageAccounts@/i.test(v.bicep); if (!hasResource) { toast("Bicep 검증 오류", "Microsoft.Storage/storageAccounts resource 선언이 필요합니다.", "error"); return; } state.deployments.push({ id: uid("dep"), name: v.name, resourceGroup: v.group, language: "Bicep", mode: v.mode, status: "Succeeded", templateIncludesStorage: true }); saveState(); closeModal(); render(); notify("Bicep 배포 완료", `${v.name} 배포가 완료되었습니다.`); });
  }

  function resetLab(lab) {
    const d = clone(defaults);
    const removeByName = (list, prop, name) => list.filter((x) => x[prop] !== name);
    if (lab.id === "lab-rg-lock") state.resourceGroups = removeByName(state.resourceGroups, "name", "rg-operations");
    if (lab.id === "lab-entra-group") { state.users = clone(d.users); state.groups = clone(d.groups); }
    if (lab.id === "lab-rbac") state.roleAssignments = clone(d.roleAssignments);
    if (lab.id === "lab-policy") state.policies = clone(d.policies);
    if (lab.id === "lab-storage-secure") state.storageAccounts = removeByName(state.storageAccounts, "name", "staz104secure");
    if (lab.id === "lab-storage-sas") state.storageAccounts = clone(d.storageAccounts);
    if (lab.id === "lab-vnet") state.vnets = clone(d.vnets);
    if (lab.id === "lab-nsg") { state.nsgs = clone(d.nsgs); state.vnets = clone(d.vnets); }
    if (lab.id === "lab-vm") state.vms = removeByName(state.vms, "name", "vm-app02");
    if (lab.id === "lab-vm-ops") state.vms = clone(d.vms);
    if (lab.id === "lab-appservice") state.appServices = clone(d.appServices);
    if (lab.id === "lab-private") state.privateEndpoints = [];
    if (lab.id === "lab-alert") state.alerts = [];
    if (lab.id === "lab-backup") { state.vaults = []; state.vms.forEach((v) => { v.backupVaultId = ""; }); }
    if (lab.id === "lab-cli") { state.resourceGroups = removeByName(state.resourceGroups, "name", "rg-cli-lab"); state.ui.shellUsed = false; }
    if (lab.id === "lab-azure-files") state.storageAccounts = clone(d.storageAccounts);
    if (lab.id === "lab-vmss") state.vmScaleSets = [];
    if (lab.id === "lab-container-app") state.containerApps = [];
    if (lab.id === "lab-network-services") { state.routeTables = []; state.bastions = []; state.loadBalancers = []; state.vnets = clone(d.vnets); }
    if (lab.id === "lab-monitor-diagnostics") { state.logQueries = []; state.networkWatcherTests = []; }
    if (lab.id === "lab-bicep") state.deployments = clone(d.deployments);
    if (lab.id === "lab-sspr") { state.tenant.sspr = d.tenant.sspr; state.tenant.ssprGroups = clone(d.tenant.ssprGroups); }
    delete state.labProgress[lab.id]; delete state.labChecks[lab.id];
    Object.keys(state.quizResults).filter((k) => k.startsWith(`${lab.id}:`)).forEach((k) => delete state.quizResults[k]);
    saveState(); render(); toast("실습 초기화 완료", `${lab.title}의 변경 사항만 기본 상태로 되돌렸습니다.`);
  }

  function resetEnvironment() {
    state = prepareState(clone(defaults));
    state.ui.route = "home";
    saveState(); closeModal(); toggleLabs(false); toggleShell(false); render(); toast("전체 환경 초기화 완료", "모든 리소스, 답안 및 실습 진행률을 최초 상태로 되돌렸습니다.");
  }

  function showNotifications() {
    state.notifications.forEach((n) => { n.read = true; }); saveState();
    openModal("알림", state.notifications.length ? state.notifications.map((n) => `<div class="notification-item"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${new Date(n.time).toLocaleString("ko-KR")}</small></div>`).join("") : '<div class="empty">새 알림이 없습니다.</div>');
  }

  function handleAction(action, el) {
    const storage = () => state.storageAccounts.find((x) => x.id === state.ui.storageId);
    const vnet = () => state.vnets.find((x) => x.id === state.ui.vnetId);
    if (action === "toggle-nav") return $("#globalNav").classList.toggle("open");
    if (action === "toggle-labs") return toggleLabs();
    if (action === "toggle-shell") return toggleShell();
    if (action === "close-modal") return closeModal();
    if (action === "refresh") return render();
    if (action === "noop") return toast("로컬 시뮬레이션", "이 명령은 화면 구조 학습용으로 표시됩니다.");
    if (action === "go-all-services") return go("all-services");
    if (action === "open-create-menu") return openCreateMenu();
    if (action === "create-rg") return createResourceGroup();
    if (action === "edit-rg") return createResourceGroup(state.resourceGroups.find((x) => x.id === el.dataset.id));
    if (action === "create-storage") return createStorage();
    if (action === "open-storage") { state.ui.storageId = el.dataset.id; saveState(); return render(); }
    if (action === "back-storage") { delete state.ui.storageId; saveState(); return render(); }
    if (action === "storage-tab") { state.ui.storageTab = el.dataset.tab; saveState(); return render(); }
    if (action === "configure-storage") return configureStorage(storage());
    if (action === "add-container") return addContainer(storage());
    if (action === "create-sas") return createSas(storage());
    if (action === "add-file-share") return addFileShare(storage());
    if (action === "configure-files") return configureFiles(storage());
    if (action === "create-vnet") return createVnet();
    if (action === "open-vnet") { state.ui.vnetId = el.dataset.id; saveState(); return render(); }
    if (action === "back-vnet") { delete state.ui.vnetId; saveState(); return render(); }
    if (action === "vnet-tab") { state.ui.vnetTab = el.dataset.tab; saveState(); return render(); }
    if (action === "add-subnet") return addSubnet(vnet());
    if (action === "add-peering") return addPeering(vnet());
    if (action === "create-nsg") return createNsg();
    if (action === "create-vm") return createVm();
    if (action === "create-vmss") return createVmss();
    if (action === "create-container-app") return createContainerApp();
    if (action === "create-route-table") return createRouteTable();
    if (action === "create-bastion") return createBastion();
    if (action === "create-load-balancer") return createLoadBalancer();
    if (action === "run-log-query") return runLogQuery();
    if (action === "connection-troubleshoot") return connectionTroubleshoot();
    if (action === "toggle-vm") { const x = state.vms.find((v) => v.id === el.dataset.id); x.status = x.status === "Running" ? "Stopped (deallocated)" : "Running"; addActivity(x.status === "Running" ? "Virtual machine start" : "Virtual machine deallocate", x.name); saveState(); render(); return notify("VM 상태 변경", `${x.name}: ${x.status}`); }
    if (action === "create-app") return createApp();
    if (action === "configure-app") return configureApp(state.appServices.find((x) => x.id === el.dataset.id));
    if (action === "entra-tab") { state.ui.entraTab = el.dataset.tab; saveState(); return render(); }
    if (action === "create-user") return createUser();
    if (action === "assign-license" || action === "open-m365-licenses") return assignLicense();
    if (action === "configure-sspr") return configureSspr();
    if (action === "assign-role") return assignRole();
    if (action === "go-rbac") return go("rbac");
    if (action === "create-policy") return createPolicy();
    if (action === "create-ca") return createCa();
    if (action === "create-private-endpoint") return createPrivateEndpoint();
    if (action === "create-alert") return createAlert();
    if (action === "go-backup") return go("backup");
    if (action === "create-vault") return createVault();
    if (action === "deploy-template") return deployTemplate();
    if (action === "deploy-bicep") return deployBicep();
    if (action === "notifications") return showNotifications();
    if (action === "copilot") return openModal("Microsoft Copilot in Azure", `<div class="info-bar">Ask questions, navigate Azure services, and get help with resource configuration.</div><div class="locked-feature"><div class="locked-icon">◈</div><h2>Copilot is unavailable offline</h2><p>This local lab keeps the current portal entry point for interface familiarity, but it doesn't connect to Microsoft Copilot.</p></div>`);
    if (action === "support") return openModal("Help + support", `<div class="content-grid"><section class="card span-6"><h3>Diagnose and solve problems</h3><p class="form-help">Review common Azure resource configuration issues.</p></section><section class="card span-6"><h3>Create a support request</h3><p class="form-help">Support requests aren't sent from this offline simulation.</p></section></div>`);
    if (action === "account") return openModal("계정", `<dl class="properties"><dt>계정</dt><dd>labadmin@contoso.com</dd><dt>디렉터리</dt><dd>${esc(state.tenant.name)}</dd><dt>구독</dt><dd>${esc(state.subscription.name)}</dd><dt>환경</dt><dd>로컬 시뮬레이션</dd></dl>`);
    if (action === "settings") return openModal("포털 설정", `<div class="info-bar">이 환경은 브라우저의 로컬 저장소에 자동 저장됩니다. 서버나 Azure 구독에는 연결되지 않습니다.</div><button type="button" class="command danger" data-action="reset-environment">전체 환경 초기화</button>`);
    if (action === "recover-route") { state = prepareState(state); saveState(); return render(); }
    if (action === "lab-mode") { state.ui.labMode = el.dataset.mode; saveState(); return renderLabPanel(); }
    if (action === "lab-hint") return openModal("실습 힌트", `<div class="info-bar">${esc(currentLab().hint)}</div><p class="form-help">문제 패널을 닫고 왼쪽 Azure 서비스 메뉴에서 해당 구성을 수행한 뒤 다시 패널을 여세요.</p>`);
    if (action === "check-lab") { const lab = currentLab(); const check = validateLab(lab); state.labChecks[lab.id] = { all: check.all, count: check.steps.filter(Boolean).length, time: now() }; state.labProgress[lab.id] = check.all; saveState(); renderLabPanel(); updateBadges(); return toast(check.all ? "실습 완료" : "아직 미완료", check.all ? "모든 단계가 정확합니다." : `${check.steps.filter(Boolean).length}/${lab.tasks.length}단계를 충족했습니다.`, check.all ? "success" : "error"); }
    if (action === "reset-lab") { const lab = currentLab(); if (confirm(`'${lab.title}' 실습에서 만든 변경 사항과 답안을 초기화할까요?`)) resetLab(lab); return; }
    if (action === "reset-environment") { if (confirm("모든 리소스, 실습 진행률, 확인문제 답안을 최초 상태로 되돌릴까요?")) resetEnvironment(); return; }
    if (action === "check-challenge") { const labId = el.dataset.labId; const index = Number(el.dataset.index); const q = challenges[labId]?.[index]; const selected = $(`input[name="quiz-${labId}-${index}"]:checked`, el.closest(".quiz-card")); if (!selected) return toast("답을 선택하세요", "선택지를 고른 뒤 정답 확인을 누르세요.", "error"); const answer = Number(selected.value); state.quizResults[`${labId}:${index}`] = { selected: answer, correct: answer === q.answer, time: now() }; saveState(); renderLabPanel(); return; }
  }

  document.addEventListener("click", (event) => {
    const route = event.target.closest("[data-route]");
    if (route) { closeModal(); go(route.dataset.route); return; }
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action.dataset.action, action);
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "labSelect") { state.ui.selectedLab = event.target.value; saveState(); renderLabPanel(); }
  });

  $("#modalRoot").addEventListener("submit", (event) => {
    if (event.target.id !== "modalForm") return;
    event.preventDefault();
    if (modalSubmit) modalSubmit(event.target);
  });

  $("#shellForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#shellInput"); executeShell(input.value); input.value = "";
  });

  $$(".shell-tab").forEach((tab) => tab.addEventListener("click", () => { shellMode = tab.dataset.shell; state.ui.shell = shellMode; saveState(); renderShell(); }));

  $("#globalSearch").addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase(); const box = $("#searchResults");
    if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const serviceHits = services.filter((s) => `${s[0]} ${s[1]}`.toLowerCase().includes(q)).slice(0, 6);
    const labHits = labs.filter((l) => `${l.title} ${l.scenario}`.toLowerCase().includes(q)).slice(0, 4);
    box.innerHTML = serviceHits.map((s) => `<button class="search-result" data-route="${s[2]}"><span>${s[3]}</span><strong>${esc(s[0])}</strong><small>서비스</small></button>`).join("") + labHits.map((l) => `<button class="search-result" data-action="open-search-lab" data-id="${l.id}"><span>✓</span><strong>${esc(l.title)}</strong><small>실습</small></button>`).join("");
    box.classList.toggle("hidden", !box.innerHTML);
  });

  document.addEventListener("click", (event) => {
    const hit = event.target.closest('[data-action="open-search-lab"]');
    if (!hit) return;
    state.ui.selectedLab = hit.dataset.id; state.ui.labMode = "guide"; saveState(); renderLabPanel(); toggleLabs(true); $("#searchResults").classList.add("hidden");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeModal(); toggleLabs(false); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "q") { event.preventDefault(); toggleLabs(); }
  });

  function runSelfTestInner() {
    const original = clone(state);
    const checks = [];
    const check = (name, value) => checks.push({ name, pass: !!value });
    check("data", labs.length === 22 && !!defaults.storageAccounts && Array.isArray(defaults.vmScaleSets) && Array.isArray(defaults.containerApps));
    check("navigation", ["home", "all-services", "resource-groups", "storage", "vnets", "nsgs", "vms", "vmss", "app-services", "container-apps", "entra", "rbac", "policy", "private-endpoints", "route-tables", "bastion", "load-balancers", "monitor", "logs", "network-watcher", "backup", "deployments"].every((r) => renderRoute(r).length > 100));
    $('[data-route="storage"]', $("#globalNav")).click();
    check("menu click", $(".page-heading")?.textContent === "스토리지 계정");
    $('[data-action="open-storage"]')?.click();
    check("storage functions", $("#workspace")?.textContent.includes("Containers") && $("#workspace")?.textContent.includes("Shared access signature"));
    $('[data-action="storage-tab"][data-tab="containers"]')?.click();
    $('[data-action="add-container"]')?.click();
    check("create modal", !!$("#modalForm") && !!$('#modalForm input[name="name"]'));
    closeModal();
    toggleLabs(true);
    check("lab panel", !$("#labPanel").classList.contains("closed") && !!$('[data-action="check-lab"]'));
    check("reset buttons", !!$('[data-action="reset-environment"]') && !!$('[data-action="reset-lab"]'));
    toggleLabs(false);
    state = prepareState(clone(defaults));
    state.resourceGroups.push({ id: "selftest-rg", name: "rg-operations", location: "Korea Central", tags: { Environment: "Production" }, lock: "CanNotDelete" });
    resetLab(labs.find((l) => l.id === "lab-rg-lock"));
    check("single lab reset", !state.resourceGroups.some((r) => r.name === "rg-operations"));
    state.resourceGroups.push({ id: "selftest-dirty", name: "rg-selftest", location: "Korea South", tags: {}, lock: "None" });
    resetEnvironment();
    check("full reset", !state.resourceGroups.some((r) => r.name === "rg-selftest") && state.ui.route === "home");
    state = prepareState(original); saveState(); render();
    check("event targets", $$('[data-route], [data-action]').length > 20);
    document.body.dataset.selfTest = checks.every((x) => x.pass) ? "PASS" : "FAIL";
    const node = document.createElement("pre"); node.id = "selfTestResult"; node.textContent = JSON.stringify(checks, null, 2); node.style.cssText = "position:fixed;left:240px;top:60px;z-index:999;background:#fff;padding:20px;border:3px solid #107c10"; document.body.appendChild(node);
  }

  function runSelfTest() {
    try {
      runSelfTestInner();
    } catch (error) {
      document.body.dataset.selfTest = "ERROR";
      const node = document.createElement("pre");
      node.id = "selfTestResult";
      node.textContent = `SELF TEST ERROR\n${error && error.stack ? error.stack : error}`;
      node.style.cssText = "position:fixed;left:240px;top:60px;z-index:999;background:#fff;padding:20px;border:3px solid #d13438;max-width:850px;white-space:pre-wrap";
      document.body.appendChild(node);
    }
  }

  const startupParams = new URLSearchParams(location.search);
  if (startupParams.get("route")) state.ui.route = startupParams.get("route");
  if (startupParams.get("storage")) state.ui.storageId = startupParams.get("storage");
  if (startupParams.get("vnet")) state.ui.vnetId = startupParams.get("vnet");
  if (startupParams.get("tab")) {
    if (state.ui.route === "storage") state.ui.storageTab = startupParams.get("tab");
    if (state.ui.route === "vnets") state.ui.vnetTab = startupParams.get("tab");
    if (state.ui.route === "entra") state.ui.entraTab = startupParams.get("tab");
  }
  render();
  if (startupParams.has("selftest")) setTimeout(runSelfTest, 50);
})();
