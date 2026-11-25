
/* Phone-specific navigation and Android services. All UI assets ship inside the APK. */
const originalRender=render, originalData=data;
saveFile=(name,content,mime)=>Handset.saveDocument(name,content,mime);
function phoneBack(){
  if($("#modal").open){$("#modal").close();return true;}
  if($("#sidebar").classList.contains("open")){$("#sidebar").classList.remove("open");return true;}
  if(page!=="Overview"){location.hash="Overview";return true;}return false;
}
function receiveAndroidFile(target,content){
  location.hash=encodeURIComponent("Data & backups");render();
  const f=document.getElementById(target);if(!f)return;
  const transfer=new DataTransfer();transfer.items.add(new File([content],target==="file"?"garage.json":"vehicle.csv"));f.files=transfer.files;f.dispatchEvent(new Event("change",{bubbles:true}));
}
document.addEventListener("click",e=>{
    if(e.target.matches("#file,#fuelioFile")){e.preventDefault();Handset.selectDocument(e.target.id);}
},true);
const mobileNav=[["Home","Overview","house"],["Log","Logbook","book-open"],["Trips","Trip planner","route"],["Service","Maintenance","wrench"],["More","","ellipsis"]];
document.body.insertAdjacentHTML("beforeend",'<nav id="phone-tabs" aria-label="Main sections"></nav>');
function tripView(){
  const draft=JSON.parse(Handset.tripState(false)),owner=state.vehicles.find(v=>v.id===draft.vehicle),distance=draft.metres/(owner?.system==="us"?1609.344:1000),unit=owner?.system==="us"?"mi":"km";
  if(!draft.id)return `<h2>GPS trip recorder</h2><p class="helper">Start before you drive. Android keeps recording with the screen locked.</p>${btn("Start GPS trip","gps-start","primary","navigation")}`;
  const recording=draft.status==="recording",minutes=Math.max(0,Math.floor(((recording?Date.now():draft.ended)-draft.started)/60000));
  return `<h2>${recording?"Recording drive":"Review recorded drive"}</h2><p class="sub">${esc(owner?.name||"Vehicle removed")} · ${minutes} min</p><div class="value">${num(distance,2)} <span class="unit">${unit}</span></div><small>${draft.fixes?`${draft.fixes} GPS readings`:"Waiting for a reliable GPS signal"}</small><div class="controls">${recording?btn("Finish drive","gps-stop","primary"):((owner&&distance>0?btn("Save to journal","gps-save","primary"):"")+btn("Discard","gps-discard"))}</div>`;
}
function refreshRecorder(){const box=$("#gps-card");if(box){const s=tripView();if(box.dataset.last!==s){box.innerHTML=s;box.dataset.last=s;drawIcons()}}}
function routeData(t){return Array.isArray(t.gps?.points)?t.gps.points.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&Math.abs(p[1])<=90&&Math.abs(p[2])<=180&&p[0]>=0&&p[0]<8e15):[]}
function routeCard(t){
  const points=routeData(t);if(!points.length)return "";
  const lats=points.map(p=>p[1]),lons=points.map(p=>p[2]),left=Math.min(...lons),bottom=Math.min(...lats),latSpan=Math.max(...lats)-bottom,lonSpan=Math.max(...lons)-left;
  const lonScale=Math.max(.01,Math.cos(bottom*Math.PI/180)),ratio=Math.min(276/Math.max(.00001,lonSpan*lonScale),106/Math.max(.00001,latSpan));
  const coords=points.map(p=>`${12+(p[2]-left)*lonScale*ratio},${118-(p[1]-bottom)*ratio}`).join(" ");
  return `<section class="panel block"><div class="split"><h2>${esc(t.name)}</h2>${btn("GPX","gpx-"+t.id)}</div><small>${t.date} · ${num(t.end-t.start,2)} ${u().d}</small><svg role="img" aria-label="Recorded route trace" viewBox="0 0 300 130" width="100%" height="130"><rect width="300" height="130" fill="#f0f5f0"/><polyline points="${coords}" stroke="#cb5d28" stroke-width="3" fill="none" stroke-linejoin="round"/></svg></section>`;
}
render=function(){
  originalRender();
  $("#phone-tabs").innerHTML=mobileNav.map(([label,dest,i])=>`<button type="button" data-phone="${esc(dest||"more")}" class="${page===dest||(!dest&&!mobileNav.some(n=>n[1]===page))?"chosen":""}">${icon(i)}<span>${label}</span></button>`).join("");
  if(page==="Trip planner"){
    const heading=$("#content .heading");heading.querySelector("h1").textContent="Trips";
    heading.insertAdjacentHTML("afterend",'<section id="gps-card" class="panel block"></section>');refreshRecorder();
    $("#content").insertAdjacentHTML("beforeend",[...(vehicle.trips||[])].reverse().map(routeCard).join(""));
  }
  if(page==="Maintenance")$("#content").insertAdjacentHTML("beforeend",`<section class="panel block"><h2>Calendar reminder</h2><p class="helper">Schedule a service or renewal in your Android calendar and choose its alert time there.</p>${btn("Add to calendar","phone-calendar","","calendar-plus")}</section>`);
  if(page==="Data & backups")$("#content").insertAdjacentHTML("beforeend",`<section class="panel block"><h2>Vehicle summary</h2><p class="helper">Print a mileage and running-cost report, or save it to PDF using Android’s print menu.</p>${btn("Print report","phone-print","","printer")}</section>`);
  drawIcons();
};
function saveDrive(){
  const t=JSON.parse(Handset.tripState(true)),owner=state.vehicles.find(v=>v.id===t.vehicle);
  if(t.status!=="finished"||!owner||!t.metres)return;
  const unit=owner.system==="us"?"mi":"km",dist=t.metres/(owner.system==="us"?1609.344:1000);
  show("Save GPS trip",`<p class="helper">${esc(owner.name)} · ${num(dist,2)} ${unit}</p><div class="fields">${input("name","Journey name","Recorded drive")}${select("purpose","Purpose",["Personal","Business"],"Personal")}${input("start",`Starting odometer (${unit})`,Model.odometer(owner),"number")}${input("rate",`Business rate (${owner.currency}/${unit})`,0,"number")}</div>`,"Save trip",d=>{
    const when=new Date(t.started);const date=[when.getFullYear(),String(when.getMonth()+1).padStart(2,"0"),String(when.getDate()).padStart(2,"0")].join("-");
    modify(s=>{const v=s.vehicles.find(x=>x.id===t.vehicle);if(!v)throw Error("The recorded vehicle is missing.");v.trips??=[];if(v.trips.some(x=>x.id===t.id))return;
      const stride=Math.max(1,Math.ceil(t.points.length/2500)),points=t.points.filter((_,i)=>i%stride===0||i===t.points.length-1);
      v.trips.push({id:t.id,name:d.name.trim(),purpose:d.purpose,rate:d.purpose==="Business"?+d.rate:0,start:+d.start,end:+d.start+dist,date,gps:{started:t.started,ended:t.ended,points}});
    });Handset.clearTrip(t.id);render();
  });
}
document.addEventListener("click",e=>{
  const dest=e.target.closest("[data-phone]")?.dataset.phone;
  if(dest==="more"){show("More",["Garage","Station prices","Data & backups"].map(n=>btn(esc(n),"phone-page-"+n,"choice",pages[n])).join(""));return;}
  if(dest){location.hash=encodeURIComponent(dest);return;}
  const a=e.target.closest("[data-act]")?.dataset.act;if(!a)return;
  if(a.startsWith("phone-page-")){$("#modal").close();location.hash=encodeURIComponent(a.slice(11));}
  if(a==="gps-start")Handset.startTrip(vehicle.id);
  if(a==="gps-stop")Handset.stopTrip();
  if(a==="gps-save")saveDrive();
  if(a==="gps-discard")show("Discard recorded drive?","<p>This removes the unsaved route from this phone.</p>","Discard drive",()=>{Handset.clearTrip(JSON.parse(Handset.tripState(false)).id);render()});
  if(a.startsWith("gpx-")){const t=(vehicle.trips||[]).find(x=>x.id===a.slice(4));if(t)saveFile("drive-"+t.date+".gpx",`<?xml version="1.0"?><gpx version="1.1" creator="Motorledger" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(t.name)}</name><trkseg>${routeData(t).map(p=>`<trkpt lat="${p[1]}" lon="${p[2]}"><time>${new Date(p[0]).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`,"application/gpx+xml");}
  if(a==="phone-calendar")show("Calendar reminder",`<div class="fields">${input("name","Service or renewal")}${input("date","Due date",Model.day(),"date")}</div>`,"Open calendar",d=>Handset.calendar(d.name,d.date));
  if(a==="phone-print"){const arr=sortedLogs(),distance=Model.odometer(vehicle)-vehicle.base;const html=`<html><meta charset="utf-8"><style>body{font:13pt sans-serif;color:#203329;padding:20px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:7px;border-bottom:1px solid #ccc}h1{font-size:22pt}</style><h1>${esc(vehicle.name)}</h1><p>Motorledger vehicle report · ${Model.day()}</p><p>Odometer ${num(Model.odometer(vehicle))} ${u().d} · Total recorded costs ${money(total(arr))}</p><p>Recorded distance ${num(distance,1)} ${u().d} · Average recorded cost per ${u().d}: ${distance?money(total(arr)/distance):"—"}</p><table><thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Cost</th></tr></thead><tbody>${arr.map(x=>`<tr><td>${x.date}</td><td>${esc(x.name)}</td><td>${x.type}</td><td>${money(x.cost)}</td></tr>`).join("")}</tbody></table></html>`;Handset.printReport(html);}
});
render();setInterval(refreshRecorder,1500);

