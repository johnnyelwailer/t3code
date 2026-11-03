const q = new URLSearchParams(location.search);
const theme = q.get("theme") || "light",
  narrow = (q.get("w") || "desktop") === "narrow";
const level = q.get("level") || "crit",
  view = q.get("view") || "drill";
document.documentElement.className = theme === "dark" ? "dark" : "";
const crit = level === "crit",
  cls = crit ? "crit" : "warn";

const chip =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="10" height="7" rx="1.2"/><path d="M5.5 4.5v-2M8 4.5v-2M10.5 4.5v-2M5.5 11.5v2M8 11.5v2M10.5 11.5v2"/></svg>';
const dl =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v8M4.8 7.6 8 10.8l3.2-3.2M3 13.2h10"/></svg>';

const head = crit
  ? {
      lvl: "Critical",
      free: "2.9 GiB",
      fact: `<b>0.1 GiB below</b> the 3.0 GiB limit · warning below 6.0 GiB`,
      fill: 4.6,
      tick: 4.7,
    }
  : {
      lvl: "Low",
      free: "5.1 GiB",
      fact: `<b>0.9 GiB below</b> the 6.0 GiB warning · critical below 3.0 GiB`,
      fill: 8.1,
      tick: 9.5,
    };

const drill = `<div class="pop">
  <div class="hd"><b><span class="lvl ${cls}">${head.lvl}</span> memory</b><span class="age">12 s ago</span></div>
  <div class="bar"><i class="${cls}" style="width:${head.fill}%"></i><u style="left:${head.tick}%"></u></div>
  <div class="fact"><b>${head.free}</b> free of 63.3 GiB · ${head.fact}</div>
  <div class="list">
    <div class="it"><span class="n">npm run dev <small>· Fix login flow · idle 2 h</small></span><span class="v">3.4 GiB</span></div>
    <div class="it"><span class="n">dotnet watch <small>· Add invoice export · done 5 h ago</small></span><span class="v">1.9 GiB</span></div>
    <div class="it mut"><span class="n">Nexi Work itself</span><span class="v">7.9 GiB</span></div>
    <div class="it mut"><span class="n">Other applications <small>· not Nexi Work</small></span><span class="v">38.6 GiB</span></div>
  </div>
  <div class="fact">Commit headroom (Windows) 11.4 GiB, fine.</div>
  <div class="acts"><button class="btn pri">Clean up…</button><button class="btn ghost">Hide</button></div>
</div>`;

const chat = `<div class="msg me">Can you check why the dev server keeps eating memory?</div>
  <div class="msg">Looking at the running jobs of this thread…</div>
  <div class="msg sys">[host] npm run dev (pid 4242, thread Fix login flow) holds 3.4 GiB of memory; if it is an idle dev server or watcher, stop it</div>`;

const cleanup = `
  <div class="prompt"><small>Started from the memory badge · editable before it runs</small>
    Free memory on this machine. Memory is critical: 2.9 GiB free of 63.3 GiB.<br>
    Find what is no longer needed: processes of idle or finished threads, dev servers and watchers, old worktrees, build caches. Do not stop or delete anything yet; ask me which to free with the question tool.</div>
  <div class="msg">I looked at 14 threads, 9 worktrees and 6 caches. Nothing was changed. Not touched: 2 running threads, 1 pinned thread, 2 worktrees with unpushed commits.</div>
  <div class="ask">
    <div class="q">Which of these should I free? <span class="why">about 9.8 GiB if all are ticked</span></div>
    <div class="check">
      <div class="grp">Processes</div>
      <label><span class="box on"></span><span>npm run dev · Fix login flow <span class="why">· idle 2 h · 3.4 GiB</span></span></label>
      <label><span class="box on"></span><span>dotnet watch · Add invoice export <span class="why">· thread finished 5 h ago · 1.9 GiB</span></span></label>
      <div class="grp">Worktrees</div>
      <label><span class="box on"></span><span>fix-portal-address-form <span class="why">· PR merged, clean · 1.2 GiB</span></span></label>
      <label><span class="box"></span><span>review-t3code-cloud-prs <span class="why">· no PR, not sure · 1.9 GiB</span></span></label>
      <div class="grp">Caches</div>
      <label><span class="box on"></span><span>pnpm store, vite cache <span class="why">· rebuildable · 1.4 GiB</span></span></label>
    </div>
    <div class="acts"><button class="btn pri">Free 4 selected</button><button class="btn ghost">Not now</button></div>
  </div>`;

const pressureBtn = `<button class="ibtn pressure ${cls}">${chip}<span class="badge ${cls}"></span></button>`;
const updateBtn = `<button class="ibtn">${dl}<span class="badge" style="background:var(--acc)"></span></button>`;
const sideRows = (first) =>
  `<h6>Nexi Work</h6><div class="row sel"><span class="dot run"></span>${first}</div><div class="row"><span class="dot run"></span>Fix login flow</div><div class="row"><span class="dot"></span>Add invoice export</div><div class="row"><span class="dot"></span>Review PR 812</div><h6>Portal</h6><div class="row"><span class="dot"></span>Address form follow-ups</div><div class="row"><span class="dot"></span>Knowledge search (German)</div>`;
const tipText = crit
  ? "Memory critical · 2.9 GiB free (limit 3.0)"
  : "Memory low · 5.1 GiB free (warning 6.0)";

const isCleanup = view === "cleanup",
  isTip = view === "tip";
const title = isCleanup ? "Clean up resources" : "Experimental pressure notes";
const body = isCleanup ? cleanup : chat;
let html;
if (!narrow) {
  html = `<div class="app"><aside class="side">${sideRows(title)}<div class="grow"></div>
      <div class="foot"><span class="who">PJ · NEXPLORE</span>${pressureBtn}${updateBtn}</div></aside>
    <section class="main"><div class="top"><span class="title">${title}</span></div><div class="msgs">${body}</div>
      <div class="composer">Message…</div></section>
    ${view === "drill" ? `<div style="position:absolute;left:34px;bottom:56px;z-index:6">${drill}</div>` : ""}
    ${isTip ? `<div class="tip" style="left:60px;bottom:50px">${tipText}</div>` : ""}</div>`;
} else {
  html = `<div class="app narrow"><section class="main"><div class="top"><span class="title">${title}</span></div>
    <div class="msgs">${body}</div><div class="composer">Message…</div>
    <div class="foot"><span class="who">PJ · NEXPLORE</span>${pressureBtn}${updateBtn}</div></section>
    ${view === "drill" ? `<div class="scrim"></div><div class="sheet"><div class="grab"></div>${drill}</div>` : ""}</div>`;
}
document.getElementById("root").innerHTML = html;
