const $ = (id) => document.getElementById(id);
let patients = [];

const getKey = () => sessionStorage.getItem("apiKey") || "";

function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  setTimeout(() => (t.className = ""), 2500);
}

async function api(path) {
  const res = await fetch(path, {
    headers: { "x-api-key": getKey() },
  });
  if (res.status === 403) throw new Error("Invalid or missing API key");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
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

$("key-form").onsubmit = (e) => {
  e.preventDefault();
  sessionStorage.setItem("apiKey", $("key").value);
  $("key").value = "";
  load();
};

$("search").oninput = render;
load();
