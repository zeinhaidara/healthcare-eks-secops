const $ = (id) => document.getElementById(id);
let patients = [];

const getKey = () => sessionStorage.getItem("apiKey") || "";

function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  setTimeout(() => (t.className = ""), 2500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "x-api-key": getKey(), "content-type": "application/json" },
  });
  if (res.status === 403) throw new Error("Invalid or missing API key");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.status === 204 ? null : res.json();
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const shown = patients.filter((p) => `${p.name} ${p.condition}`.toLowerCase().includes(q));
  $("count").textContent = shown.length;
  $("empty").hidden = shown.length > 0;
  const rows = $("rows");
  rows.replaceChildren();
  for (const p of shown) {
    const tr = rows.insertRow();
    for (const v of [p.patient_id, p.name, p.age, p.condition, p.date_of_birth, p.admission_date]) {
      tr.insertCell().textContent = v;
    }
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.textContent = "Delete";
    btn.onclick = () => remove(p.patient_id);
    tr.insertCell().append(btn);
  }
}

async function load() {
  if (!getKey()) return;
  try {
    patients = await api("/patients");
    render();
  } catch (e) {
    toast(e.message, "err");
  }
}

async function remove(id) {
  try {
    await api(`/patients/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("Patient deleted", "ok");
    await load();
  } catch (e) {
    toast(e.message, "err");
  }
}

$("key-form").onsubmit = (e) => {
  e.preventDefault();
  sessionStorage.setItem("apiKey", $("key").value);
  $("key").value = "";
  load();
};

$("add-form").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  body.age = Number(body.age);
  try {
    await api("/patients", { method: "POST", body: JSON.stringify(body) });
    e.target.reset();
    toast("Patient added", "ok");
    await load();
  } catch (err) {
    toast(err.message, "err");
  }
};

$("search").oninput = render;
load();
