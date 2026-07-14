/* =========================================================
   VOLTAIC — app.js (EC2 edition)
   Aplikasi manajemen AWS EC2 bertema armada server cabang
   toko elektronik. Setiap instance EC2 diperlakukan sebagai
   "server cabang" yang bisa dibuka (launch), dinyalakan
   (start), dipadamkan (stop), di-reboot, atau ditutup
   permanen (terminate). Seluruh panggilan API dilakukan
   langsung dari browser ke AWS EC2 memakai AWS SDK v2.
   ========================================================= */

(function () {
  "use strict";

  // ---------------------------------------------------------
  // STATE
  // ---------------------------------------------------------
  const state = {
    ec2: null,
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    region: "",
    instances: [],       // flattened list of instance objects
    statusFilter: "all",  // all | running | stopped | pending | terminated
    searchTerm: "",
    autoTimer: null,
  };

  const STATUS_LABELS = {
    all: "Semua Cabang",
    running: "Berjalan",
    stopped: "Berhenti",
    pending: "Transisi",
    terminated: "Ditutup",
  };

  // ---------------------------------------------------------
  // DOM SHORTCUTS
  // ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const loginScreen = $("loginScreen");
  const appScreen = $("appScreen");
  const loginForm = $("loginForm");
  const loginError = $("loginError");
  const regionSelect = $("region");
  const customRegionWrap = $("customRegionWrap");
  const customRegionInput = $("customRegion");
  const showSessionToken = $("showSessionToken");
  const sessionTokenWrap = $("sessionTokenWrap");

  const regionSwitcher = $("regionSwitcher");
  const regionSwitcherCustom = $("regionSwitcherCustom");
  const statusFilterList = $("statusFilterList");
  const userKeyLabel = $("userKeyLabel");
  const userRegionLabel = $("userRegionLabel");
  const breadcrumbEl = $("breadcrumb");
  const statsStrip = $("statsStrip");
  const contentGrid = $("contentGrid");
  const emptyState = $("emptyState");
  const loadingState = $("loadingState");
  const searchInput = $("searchInput");
  const autoRefresh = $("autoRefresh");

  const modalBackdrop = $("modalBackdrop");
  const modalPrompt = $("modalPrompt");
  const modalConfirm = $("modalConfirm");
  const modalLaunch = $("modalLaunch");
  const modalDetail = $("modalDetail");

  // ---------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------
  function toast(msg, isError) {
    const wrap = $("toastWrap");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function humanDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  function nameOf(instance) {
    const tag = (instance.Tags || []).find((t) => t.Key === "Name");
    return tag ? tag.Value : "(tanpa nama)";
  }

  function skuFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) { h = (h * 31 + id.charCodeAt(i)) >>> 0; }
    return "RT-" + h.toString(36).toUpperCase().slice(0, 6);
  }

  function closeModals() {
    modalBackdrop.classList.add("hidden");
    [modalPrompt, modalConfirm, modalLaunch, modalDetail].forEach((m) => m.classList.add("hidden"));
  }

  document.querySelectorAll("[data-close]").forEach((btn) =>
    btn.addEventListener("click", closeModals)
  );
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModals();
  });

  function openPrompt({ tag, title, placeholder = "", value = "", onConfirm }) {
    closeModals();
    modalBackdrop.classList.remove("hidden");
    modalPrompt.classList.remove("hidden");
    $("modalPromptTag").textContent = tag;
    $("modalPromptTitle").textContent = title;
    const input = $("modalPromptInput");
    input.placeholder = placeholder;
    input.value = value;
    $("modalPromptError").classList.add("hidden");
    setTimeout(() => input.focus(), 50);

    const confirmBtn = $("modalPromptConfirm");
    const handler = async () => {
      const val = input.value.trim();
      if (!val) {
        $("modalPromptError").textContent = "Nama tidak boleh kosong.";
        $("modalPromptError").classList.remove("hidden");
        return;
      }
      try {
        confirmBtn.disabled = true;
        await onConfirm(val);
        closeModals();
      } catch (err) {
        $("modalPromptError").textContent = err.message || String(err);
        $("modalPromptError").classList.remove("hidden");
      } finally {
        confirmBtn.disabled = false;
      }
    };
    confirmBtn.onclick = handler;
    input.onkeydown = (e) => { if (e.key === "Enter") handler(); };
  }

  function openConfirm({ title, body, danger = true, onConfirm }) {
    closeModals();
    modalBackdrop.classList.remove("hidden");
    modalConfirm.classList.remove("hidden");
    $("modalConfirmTitle").textContent = title;
    $("modalConfirmBody").textContent = body;
    const okBtn = $("modalConfirmOk");
    okBtn.className = "btn " + (danger ? "btn-danger" : "btn-primary");
    okBtn.onclick = async () => {
      okBtn.disabled = true;
      try {
        await onConfirm();
        closeModals();
      } catch (err) {
        toast(err.message || String(err), true);
      } finally {
        okBtn.disabled = false;
      }
    };
  }

  // ---------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------
  regionSelect.addEventListener("change", () => {
    customRegionWrap.classList.toggle("hidden", regionSelect.value !== "__custom");
  });
  showSessionToken.addEventListener("change", () => {
    sessionTokenWrap.classList.toggle("hidden", !showSessionToken.checked);
  });
  regionSwitcher.addEventListener("change", () => {
    regionSwitcherCustom.classList.toggle("hidden", regionSwitcher.value !== "__custom");
    if (regionSwitcher.value !== "__custom") switchRegion(regionSwitcher.value);
  });
  regionSwitcherCustom.addEventListener("change", () => {
    if (regionSwitcherCustom.value.trim()) switchRegion(regionSwitcherCustom.value.trim());
  });

  function restoreRemembered() {
    try {
      const saved = JSON.parse(localStorage.getItem("voltaic_ec2_remember") || "null");
      if (saved) {
        $("accessKeyId").value = saved.accessKeyId || "";
        if (saved.region && [...regionSelect.options].some((o) => o.value === saved.region)) {
          regionSelect.value = saved.region;
        } else if (saved.region) {
          regionSelect.value = "__custom";
          customRegionWrap.classList.remove("hidden");
          customRegionInput.value = saved.region;
        }
        $("rememberMe").checked = true;
      }
    } catch (e) { /* ignore */ }
  }
  restoreRemembered();

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");
    const btn = $("loginBtn");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Menghubungkan…";

    const accessKeyId = $("accessKeyId").value.trim();
    const secretAccessKey = $("secretAccessKey").value.trim();
    const region = regionSelect.value === "__custom" ? customRegionInput.value.trim() : regionSelect.value;
    const sessionToken = showSessionToken.checked ? $("sessionToken").value.trim() : undefined;

    try {
      const config = { accessKeyId, secretAccessKey, region, signatureVersion: "v4" };
      if (sessionToken) config.sessionToken = sessionToken;
      AWS.config.update(config);
      const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });

      // verify credentials by attempting a real call
      await ec2.describeRegions({ RegionNames: [region] }).promise();

      state.ec2 = ec2;
      state.accessKeyId = accessKeyId;
      state.secretAccessKey = secretAccessKey;
      state.sessionToken = sessionToken;
      state.region = region;

      if ($("rememberMe").checked) {
        localStorage.setItem("voltaic_ec2_remember", JSON.stringify({ accessKeyId, region }));
      } else {
        localStorage.removeItem("voltaic_ec2_remember");
      }

      enterApp();
    } catch (err) {
      loginError.textContent = "Gagal terhubung: " + (err.message || err);
      loginError.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.querySelector("span").textContent = "Masuk ke Voltaic";
    }
  });

  $("logoutBtn").addEventListener("click", () => {
    stopAutoRefresh();
    state.ec2 = null;
    appScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    $("secretAccessKey").value = "";
  });

  function enterApp() {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userKeyLabel.textContent = maskKey(state.accessKeyId);
    userRegionLabel.textContent = state.region;

    if ([...regionSwitcher.options].some((o) => o.value === state.region)) {
      regionSwitcher.value = state.region;
      regionSwitcherCustom.classList.add("hidden");
    } else {
      regionSwitcher.value = "__custom";
      regionSwitcherCustom.value = state.region;
      regionSwitcherCustom.classList.remove("hidden");
    }

    renderStatusFilter();
    loadInstances();
  }

  function maskKey(key) {
    if (key.length <= 8) return key;
    return key.slice(0, 4) + "••••" + key.slice(-4);
  }

  function switchRegion(region) {
    if (!region || region === state.region) return;
    const config = { accessKeyId: state.accessKeyId, secretAccessKey: state.secretAccessKey, region, signatureVersion: "v4" };
    if (state.sessionToken) config.sessionToken = state.sessionToken;
    AWS.config.update(config);
    state.ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
    state.region = region;
    userRegionLabel.textContent = region;
    toast(`Berpindah ke region ${region}.`);
    loadInstances();
  }

  // ---------------------------------------------------------
  // STATUS FILTER SIDEBAR
  // ---------------------------------------------------------
  function renderStatusFilter() {
    statusFilterList.innerHTML = "";
    Object.keys(STATUS_LABELS).forEach((key) => {
      const el = document.createElement("div");
      el.className = "bucket-item" + (state.statusFilter === key ? " active" : "");
      const count = countForFilter(key);
      el.innerHTML = `<span class="dot"></span><span class="name">${STATUS_LABELS[key]}</span><span style="margin-left:auto;color:var(--text-faint);font-family:var(--font-mono);font-size:11px;">${count}</span>`;
      el.addEventListener("click", () => { state.statusFilter = key; renderStatusFilter(); renderGrid(); renderStats(); });
      statusFilterList.appendChild(el);
    });
  }

  function countForFilter(key) {
    if (key === "all") return state.instances.length;
    if (key === "pending") return state.instances.filter((i) => ["pending", "stopping", "shutting-down"].includes(i.State.Name)).length;
    return state.instances.filter((i) => i.State.Name === key).length;
  }

  function matchesFilter(instance) {
    if (state.statusFilter === "all") return true;
    if (state.statusFilter === "pending") return ["pending", "stopping", "shutting-down"].includes(instance.State.Name);
    return instance.State.Name === state.statusFilter;
  }

  // ---------------------------------------------------------
  // LOADING INSTANCES
  // ---------------------------------------------------------
  async function loadInstances() {
    loadingState.classList.remove("hidden");
    emptyState.classList.add("hidden");
    contentGrid.innerHTML = "";
    renderBreadcrumb();

    try {
      let reservations = [];
      let nextToken;
      do {
        const data = await state.ec2.describeInstances({ NextToken: nextToken }).promise();
        reservations = reservations.concat(data.Reservations || []);
        nextToken = data.NextToken;
      } while (nextToken);

      state.instances = reservations.flatMap((r) => r.Instances || []);
      renderStatusFilter();
      renderGrid();
      renderStats();
    } catch (err) {
      toast("Gagal memuat data EC2: " + (err.message || err), true);
    } finally {
      loadingState.classList.add("hidden");
    }
  }

  function renderBreadcrumb() {
    breadcrumbEl.innerHTML = `<span class="crumb current">🏬 ${STATUS_LABELS[state.statusFilter]} · ${state.region}</span>`;
  }

  function renderStats() {
    const running = state.instances.filter((i) => i.State.Name === "running").length;
    const stopped = state.instances.filter((i) => i.State.Name === "stopped").length;
    const total = state.instances.length;
    statsStrip.innerHTML = `
      <div class="stat-pill"><span class="swatch" style="background:var(--teal)"></span>${running} cabang berjalan</div>
      <div class="stat-pill"><span class="swatch" style="background:var(--text-faint)"></span>${stopped} cabang berhenti</div>
      <div class="stat-pill">Total cabang: <b>${total}</b></div>
    `;
  }

  function renderGrid() {
    contentGrid.innerHTML = "";
    renderBreadcrumb();
    const term = state.searchTerm.trim().toLowerCase();

    const filtered = state.instances.filter((i) => {
      if (!matchesFilter(i)) return false;
      if (!term) return true;
      return nameOf(i).toLowerCase().includes(term) || i.InstanceId.toLowerCase().includes(term);
    });

    emptyState.classList.toggle("hidden", filtered.length !== 0);

    filtered
      .sort((a, b) => new Date(b.LaunchTime) - new Date(a.LaunchTime))
      .forEach((instance) => contentGrid.appendChild(buildInstanceCard(instance)));
  }

  // ---------------------------------------------------------
  // CARDS
  // ---------------------------------------------------------
  function stateBadge(instance) {
    const s = instance.State.Name;
    const label = {
      running: "Berjalan", stopped: "Berhenti", pending: "Memulai…",
      stopping: "Memadamkan…", "shutting-down": "Menutup…", terminated: "Ditutup",
    }[s] || s;
    return `<span class="state-badge state-${s}"><span class="state-dot"></span>${label}</span>`;
  }

  function iconFor(instance) {
    const s = instance.State.Name;
    if (s === "running") return "🏬";
    if (s === "stopped") return "⏸️";
    if (s === "terminated") return "🚫";
    return "🔄";
  }

  function buildInstanceCard(instance) {
    const name = nameOf(instance);
    const s = instance.State.Name;
    const isRunning = s === "running";
    const isStopped = s === "stopped";
    const isTerminated = s === "terminated";
    const isTransient = !isRunning && !isStopped && !isTerminated;

    const card = document.createElement("div");
    card.className = "card instance" + (isStopped ? " is-stopped" : "") + (isTerminated ? " is-terminated" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon">${iconFor(instance)}</div>
        <div class="card-menu">
          <button class="card-menu-btn">⋯</button>
          <div class="card-menu-list hidden">
            <button data-act="detail">Lihat detail</button>
            ${!isTerminated ? '<button data-act="rename">Ganti nama</button>' : ""}
            ${isStopped ? '<button data-act="start">Nyalakan</button>' : ""}
            ${isRunning ? '<button data-act="reboot">Reboot</button>' : ""}
            ${isRunning ? '<button data-act="stop">Padamkan</button>' : ""}
            ${!isTerminated ? '<button data-act="terminate" class="danger">Tutup permanen</button>' : ""}
          </div>
        </div>
      </div>
      <div class="card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="card-sub">${instance.InstanceType} · ${instance.Placement ? instance.Placement.AvailabilityZone : "—"}</div>
      ${stateBadge(instance)}
      <div class="ip-row">
        <span><b>Publik:</b> ${instance.PublicIpAddress || "—"}</span>
        <span><b>Privat:</b> ${instance.PrivateIpAddress || "—"}</span>
      </div>
      <div class="card-tag-row">
        <span class="sku">${skuFor(instance.InstanceId)}</span>
      </div>
      <div class="barcode"></div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-menu")) return;
      showDetail(instance);
    });

    wireCardMenu(card, {
      detail: () => showDetail(instance),
      rename: () => renameInstance(instance),
      start: () => startInstance(instance),
      stop: () => stopInstanceAction(instance),
      reboot: () => rebootInstance(instance),
      terminate: () => terminateInstance(instance),
    });

    if (isTransient) {
      card.querySelectorAll(".card-menu-list button:not([data-act='detail'])").forEach((b) => b.disabled = true);
    }
    return card;
  }

  function wireCardMenu(card, actions) {
    const btn = card.querySelector(".card-menu-btn");
    const list = card.querySelector(".card-menu-list");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".card-menu-list").forEach((l) => { if (l !== list) l.classList.add("hidden"); });
      list.classList.toggle("hidden");
    });
    Object.entries(actions).forEach(([act, fn]) => {
      const b = list.querySelector(`[data-act="${act}"]`);
      if (b) b.addEventListener("click", (e) => { e.stopPropagation(); list.classList.add("hidden"); fn(); });
    });
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".card-menu-list").forEach((l) => l.classList.add("hidden"));
  });

  // ---------------------------------------------------------
  // DETAIL MODAL
  // ---------------------------------------------------------
  function showDetail(instance) {
    closeModals();
    modalBackdrop.classList.remove("hidden");
    modalDetail.classList.remove("hidden");
    $("modalDetailTitle").textContent = nameOf(instance);

    const sgNames = (instance.SecurityGroups || []).map((g) => g.GroupName || g.GroupId).join(", ") || "—";
    const tags = (instance.Tags || []).map((t) => `${t.Key}=${t.Value}`).join(", ") || "—";

    const rows = [
      ["Instance ID", instance.InstanceId],
      ["Status", instance.State.Name],
      ["Tipe Instance", instance.InstanceType],
      ["AMI ID", instance.ImageId],
      ["Availability Zone", instance.Placement ? instance.Placement.AvailabilityZone : "—"],
      ["VPC ID", instance.VpcId || "—"],
      ["Subnet ID", instance.SubnetId || "—"],
      ["IP Publik", instance.PublicIpAddress || "—"],
      ["IP Privat", instance.PrivateIpAddress || "—"],
      ["DNS Publik", instance.PublicDnsName || "—"],
      ["Key Pair", instance.KeyName || "—"],
      ["Security Group", sgNames],
      ["Waktu Diluncurkan", humanDate(instance.LaunchTime)],
      ["Root Device", instance.RootDeviceType || "—"],
      ["Monitoring", instance.Monitoring ? instance.Monitoring.State : "—"],
      ["Tags", tags],
    ];

    $("modalDetailBody").innerHTML = rows.map(([k, v], i) => `
      <div class="detail-item${i === rows.length - 1 ? " span-2" : ""}">
        <div class="k">${k}</div>
        <div class="v">${escapeHtml(String(v))}</div>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------
  $("launchBtn").addEventListener("click", () => {
    closeModals();
    modalBackdrop.classList.remove("hidden");
    modalLaunch.classList.remove("hidden");
    $("launchName").value = "";
    $("launchAmi").value = "";
    $("launchType").value = "t2.micro";
    $("launchCount").value = 1;
    $("launchKeyPair").value = "";
    $("launchSg").value = "";
    $("launchSubnet").value = "";
    $("launchStorage").value = 8;
    $("modalLaunchError").classList.add("hidden");

    $("modalLaunchConfirm").onclick = async () => {
      const name = $("launchName").value.trim();
      const ami = $("launchAmi").value.trim();
      const type = $("launchType").value;
      const count = Math.max(1, Math.min(10, parseInt($("launchCount").value, 10) || 1));
      const keyPair = $("launchKeyPair").value.trim();
      const sg = $("launchSg").value.trim();
      const subnet = $("launchSubnet").value.trim();
      const storage = Math.max(1, parseInt($("launchStorage").value, 10) || 8);

      if (!/^ami-[a-f0-9]{8,17}$/.test(ami)) {
        $("modalLaunchError").textContent = "AMI ID tidak valid. Format: ami-xxxxxxxxxxxxxxxxx.";
        $("modalLaunchError").classList.remove("hidden");
        return;
      }
      try {
        const params = {
          ImageId: ami,
          InstanceType: type,
          MinCount: count,
          MaxCount: count,
          BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeSize: storage } }],
        };
        if (keyPair) params.KeyName = keyPair;
        if (sg) params.SecurityGroupIds = [sg];
        if (subnet) params.SubnetId = subnet;
        if (name) {
          params.TagSpecifications = [{
            ResourceType: "instance",
            Tags: [{ Key: "Name", Value: name }],
          }];
        }
        const result = await state.ec2.runInstances(params).promise();
        toast(`${result.Instances.length} cabang sedang dibuka…`);
        closeModals();
        setTimeout(loadInstances, 1200);
      } catch (err) {
        $("modalLaunchError").textContent = err.message || String(err);
        $("modalLaunchError").classList.remove("hidden");
      }
    };
  });

  function startInstance(instance) {
    openConfirm({
      title: "Nyalakan cabang ini?",
      body: `"${nameOf(instance)}" (${instance.InstanceId}) akan dinyalakan.`,
      danger: false,
      onConfirm: async () => {
        await state.ec2.startInstances({ InstanceIds: [instance.InstanceId] }).promise();
        toast(`Menyalakan "${nameOf(instance)}"…`);
        setTimeout(loadInstances, 1000);
      },
    });
  }

  function stopInstanceAction(instance) {
    openConfirm({
      title: "Padamkan cabang ini?",
      body: `"${nameOf(instance)}" (${instance.InstanceId}) akan dipadamkan sementara. Data pada disk tetap tersimpan.`,
      onConfirm: async () => {
        await state.ec2.stopInstances({ InstanceIds: [instance.InstanceId] }).promise();
        toast(`Memadamkan "${nameOf(instance)}"…`);
        setTimeout(loadInstances, 1000);
      },
    });
  }

  function rebootInstance(instance) {
    openConfirm({
      title: "Reboot cabang ini?",
      body: `"${nameOf(instance)}" (${instance.InstanceId}) akan dinyalakan ulang.`,
      danger: false,
      onConfirm: async () => {
        await state.ec2.rebootInstances({ InstanceIds: [instance.InstanceId] }).promise();
        toast(`Me-reboot "${nameOf(instance)}"…`);
        setTimeout(loadInstances, 1000);
      },
    });
  }

  function terminateInstance(instance) {
    openConfirm({
      title: "Tutup permanen cabang ini?",
      body: `"${nameOf(instance)}" (${instance.InstanceId}) akan dihentikan secara permanen dan tidak dapat dipulihkan. Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        await state.ec2.terminateInstances({ InstanceIds: [instance.InstanceId] }).promise();
        toast(`Menutup "${nameOf(instance)}" secara permanen…`);
        setTimeout(loadInstances, 1000);
      },
    });
  }

  function renameInstance(instance) {
    openPrompt({
      tag: "GANTI NAMA",
      title: "Ganti nama cabang",
      value: nameOf(instance) === "(tanpa nama)" ? "" : nameOf(instance),
      placeholder: "mis. Cabang Bandung",
      onConfirm: async (newName) => {
        await state.ec2.createTags({
          Resources: [instance.InstanceId],
          Tags: [{ Key: "Name", Value: newName }],
        }).promise();
        toast(`Nama diganti menjadi "${newName}".`);
        loadInstances();
      },
    });
  }

  // ---------------------------------------------------------
  // SEARCH / REFRESH / AUTO-REFRESH
  // ---------------------------------------------------------
  searchInput.addEventListener("input", () => {
    state.searchTerm = searchInput.value;
    renderGrid();
  });
  $("refreshBtn").addEventListener("click", loadInstances);

  autoRefresh.addEventListener("change", () => {
    if (autoRefresh.checked) startAutoRefresh(); else stopAutoRefresh();
  });
  function startAutoRefresh() {
    stopAutoRefresh();
    state.autoTimer = setInterval(loadInstances, 10000);
  }
  function stopAutoRefresh() {
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  }

  // ---------------------------------------------------------
  // MISC
  // ---------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
