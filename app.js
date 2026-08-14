const RT_MODELS=[
 {model:'RT-006',stations:6,wMin:160,wMax:300,lMin:200,lMax:350,price:100000,zipper:false},
 {model:'RT-008',stations:8,wMin:100,wMax:240,lMin:150,lMax:350,price:106000,zipper:false},
 {model:'RT-009',stations:9,wMin:100,wMax:200,lMin:150,lMax:350,price:110000,zipper:false},
 {model:'RT-108',stations:8,wMin:150,wMax:300,lMin:200,lMax:425,price:115000,zipper:true},
 {model:'RT-110',stations:10,wMin:100,wMax:240,lMin:150,lMax:350,price:121000,zipper:true},
 {model:'RT-208',stations:8,wMin:200,wMax:380,lMin:250,lMax:500,price:132000,zipper:true},
 {model:'RT-210',stations:10,wMin:150,wMax:300,lMin:200,lMax:425,price:138000,zipper:true},
];
const TEST_OPTIONS={zipperOpener:5000,nitrogen:3000,secondFill:8000};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>`USD ${Number(n||0).toLocaleString()}`;

function requiredStations(d){
  // User-defined prototype rule: liquid uses double sealing (7 base processes), non-liquid 6.
  let n=d.productType==='Liquid'?7:6;
  if(Number(d.fillSteps)===2)n+=1;
  if(d.nitrogen)n+=1;
  return n;
}
function analyze(d){
  const req=requiredStations(d); const isZip=d.pouchType.includes('Zipper');
  let sizeMatches=RT_MODELS.filter(m=>d.width>=m.wMin&&d.width<=m.wMax&&d.length>=m.lMin&&d.length<=m.lMax);
  let excluded=[];
  if(isZip){
    sizeMatches.forEach(m=>{if(!m.zipper)excluded.push({model:m.model,reason:'Zipper Stand-up pouch not applicable to RT-00 series'});});
    sizeMatches=sizeMatches.filter(m=>m.zipper);
  }
  let stationExcluded=sizeMatches.filter(m=>m.stations<req).map(m=>({model:m.model,reason:`Insufficient stations (${m.stations} < required ${req})`}));
  let candidates=sizeMatches.filter(m=>m.stations>=req);
  excluded=excluded.concat(stationExcluded);
  candidates.sort((a,b)=>a.stations-b.stations||a.wMax-b.wMax||a.price-b.price);
  const recommended=candidates[0]||null;
  const options=[];
  if(isZip)options.push({name:'Zipper Opener — Station 2',price:TEST_OPTIONS.zipperOpener,required:true});
  if(d.nitrogen)options.push({name:'Nitrogen Flushing (prototype)',price:TEST_OPTIONS.nitrogen,required:true});
  if(Number(d.fillSteps)===2)options.push({name:'Second Filling Process (prototype)',price:TEST_OPTIONS.secondFill,required:true});
  const review=[];
  if(d.speed>60)review.push('Required speed exceeds RT catalogue range (40–60 BPM).');
  if(d.speed<40)review.push('Required speed is below catalogue range; confirm actual operating target.');
  if(!recommended)review.push('No RT model satisfies all current prototype rules.');
  if(candidates.length>1)review.push('Multiple RT models remain. Final model selection by sales engineer is required.');
  if(d.productType==='Paste'||d.productType==='Other')review.push('Product characteristics require additional technical review.');
  const total=recommended?recommended.price+options.reduce((s,o)=>s+o.price,0):0;
  return {requiredStations:req,candidates,recommended,excluded,options,review,total};
}
function getAgentData(){return {
 source:'Agent PWA',country:$('country').value.trim(),company:$('company').value.trim(),location:$('location').value.trim(),product:$('product').value.trim(),productType:$('productType').value,pouchType:$('pouchType').value,width:Number($('width').value),length:Number($('length').value),fillWeight:$('fillWeight').value.trim(),speed:Number($('speed').value),currentPacking:$('currentPacking').value,existing:$('existing').value.trim(),fillSteps:Number($('fillSteps').value),nitrogen:$('nitrogen').checked,remarks:$('remarks').value.trim()
};}
function newId(){const d=new Date();const y=String(d.getFullYear()).slice(-2),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');let seq=Number(localStorage.getItem('leepack_seq')||0)+1;localStorage.setItem('leepack_seq',seq);return `QR-${y}${m}${day}-${String(seq).padStart(3,'0')}`;}
function requests(){return JSON.parse(localStorage.getItem('leepack_requests')||'[]');}
function saveRequests(a){localStorage.setItem('leepack_requests',JSON.stringify(a));}
function submitData(d){
 const a=analyze(d); const r={id:newId(),created:new Date().toLocaleString(),status:'Draft / Sales Review',data:d,analysis:a}; const arr=requests();arr.unshift(r);saveRequests(arr);renderList();openReview(r.id);switchTab('dashboard');
}
$('submitAgent').onclick=()=>submitData(getAgentData());
$('resetDemo').onclick=()=>{localStorage.removeItem('leepack_requests');localStorage.removeItem('leepack_seq');renderList();$('reviewArea').innerHTML='';};

function parseEmailDemo(t){
 const s=t.replace(/\n/g,' '); const country=(s.match(/\b(India|USA|United States|Korea|South Korea|Japan|China|Thailand|Vietnam|Indonesia|Malaysia|Australia|New Zealand|Germany|France|UK|United Kingdom)\b/i)||[])[1]||'Country Review Required';
 const company=(s.match(/(?:are|from)\s+([A-Z][A-Za-z0-9 &.-]{2,40}?)(?:\s+in\s+|\.|,)/)||[])[1]||'Customer Review Required';
 const size=s.match(/(\d{2,3})\s*[x×]\s*(\d{2,3})\s*mm/i); const fill=s.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/i); const speed=s.match(/(\d+)\s*(?:bags?|pouches?)\s*\/\s*min|(?:speed[^0-9]{0,15})(\d+)/i);
 const zipper=/zipper/i.test(s), stand=/stand[- ]?up/i.test(s), liquid=/liquid|sauce|water|juice|oil/i.test(s), powder=/powder|coffee|flour|spice/i.test(s);
 return {source:'Customer Email Demo',country,company,location:'',product:(s.match(/(?:for|pack)\s+(?:\d+\s*(?:g|kg|ml|l)\s+)?([A-Za-z ]{3,30}?)(?:\s+in\s+|,|\.)/i)||[])[1]?.trim()||'Product Review Required',productType:liquid?'Liquid':powder?'Powder':'Other',pouchType:zipper&&stand?'Zipper Stand-up':zipper?'Zipper Stand-up':stand?'Stand-up':'Other',width:size?Number(size[1]):0,length:size?Number(size[2]):0,fillWeight:fill?`${fill[1]} ${fill[2]}`:'Review Required',speed:speed?Number(speed[1]||speed[2]):0,currentPacking:/manual/i.test(s)?'Manual':'Review Required',existing:'Review Required',fillSteps:1,nitrogen:/nitrogen|n2/i.test(s),remarks:'Parsed by offline demo rules — final system will use AI analysis.'};
}
$('analyzeEmail').onclick=()=>{const d=parseEmailDemo($('emailText').value);const a=analyze(d);$('emailResult').innerHTML=`<div class="card" style="margin-top:14px"><h3>Extracted information</h3>${summaryHtml(d,a)}<div class="actions"><button class="primary" id="saveEmailReq">Save to quotation workflow</button></div></div>`;$('saveEmailReq').onclick=()=>submitData(d);};

function summaryHtml(d,a){return `<div class="grid3"><div><b>Customer</b><br>${esc(d.company)}</div><div><b>Country</b><br>${esc(d.country)}</div><div><b>Product</b><br>${esc(d.product)}</div><div><b>Pouch</b><br>${esc(d.pouchType)} ${d.width?`${d.width}×${d.length} mm`:''}</div><div><b>Required stations</b><br>${a.requiredStations}</div><div><b>Prototype model</b><br>${a.recommended?esc(a.recommended.model):'Review Required'}</div></div>`;}
function renderList(){const arr=requests();if(!arr.length){$('requestList').innerHTML='<div class="empty">No quotation requests yet.</div>';return;}$('requestList').innerHTML=`<table><thead><tr><th>Request</th><th>Source</th><th>Customer</th><th>Country</th><th>Model</th><th>Status</th></tr></thead><tbody>${arr.map(r=>`<tr style="cursor:pointer" onclick="openReview('${r.id}')"><td><b>${r.id}</b><br><span class="muted">${esc(r.created)}</span></td><td>${esc(r.data.source)}</td><td>${esc(r.data.company)}</td><td>${esc(r.data.country)}</td><td>${r.analysis.recommended?esc(r.analysis.recommended.model):'<span class="pill warn">Review</span>'}</td><td>${esc(r.status)}</td></tr>`).join('')}</tbody></table>`;}
window.openReview=function(id){const arr=requests();const r=arr.find(x=>x.id===id);if(!r)return;const d=r.data,a=r.analysis;
 const candidates=a.candidates.map(x=>`<span class="pill ok">${x.model} / ${x.stations} stations</span>`).join('')||'<span class="pill bad">No candidate</span>';
 const excluded=a.excluded.map(x=>`<li><b>${x.model}</b> — ${esc(x.reason)}</li>`).join('')||'<li>None</li>';
 const opts=a.options.map(o=>`<li>${esc(o.name)} <span class="muted">${money(o.price)} TEST</span></li>`).join('')||'<li>None in current prototype rules</li>';
 const reviews=a.review.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>No additional warning</li>';
 $('reviewArea').innerHTML=`<div class="result-grid">
   <div class="card analysis-card"><h2>AI / Rule Analysis</h2>${summaryHtml(d,a)}<h3>Compatible candidates</h3>${candidates}<h3>Excluded models</h3><ul>${excluded}</ul><h3>Required options</h3><ul>${opts}</ul><h3>Sales review</h3><div class="note"><ul>${reviews}</ul></div><div class="actions no-print"><button class="primary" onclick="approve('${r.id}')">Approve Draft</button><button class="secondary" onclick="window.print()">Print / Save PDF</button><button class="secondary" onclick="downloadRecord('${r.id}')">Download record CSV</button></div></div>
   ${quoteHtml(r)}
 </div>`;};
function quoteHtml(r){const d=r.data,a=r.analysis,m=a.recommended;return `<div class="quote"><div class="test">PROTOTYPE / TEST PRICE — NOT FOR CUSTOMER USE</div><h2>QUOTATION — DRAFT</h2><div class="quote-row"><b>To.</b><span>${esc(d.company)} / ${esc(d.country)}</span></div><div class="quote-row"><b>Quotation No.</b><span>${r.id}</span></div><div class="quote-row"><b>Main model</b><span>${m?m.model:'SALES REVIEW REQUIRED'}</span></div><h3>APPLICATION SPECIFICATION</h3><div class="quote-row"><b>Product</b><span>${esc(d.product)}</span></div><div class="quote-row"><b>Product type</b><span>${esc(d.productType)}</span></div><div class="quote-row"><b>Filling weight per pouch</b><span>${esc(d.fillWeight)}</span></div><div class="quote-row"><b>Pouch type</b><span>${esc(d.pouchType)}</span></div><div class="quote-row"><b>Pouch size</b><span>W ${d.width||'-'} × L ${d.length||'-'} mm</span></div><div class="quote-row"><b>Required speed</b><span>${d.speed||'-'} BPM</span></div><h3>MACHINE CONFIGURATION</h3><div class="quote-row"><b>Basic machine</b><span>${m?`${m.model} — ${money(m.price)} (TEST)`:'TBD'}</span></div>${a.options.map(o=>`<div class="quote-row"><b>Option</b><span>${esc(o.name)} — ${money(o.price)} (TEST)</span></div>`).join('')}<div class="quote-row"><b>Prototype total</b><span><strong>${a.total?money(a.total):'TBD'}</strong></span></div><h3>PRICE TERMS & CONDITION</h3><div class="quote-row"><b>Origin</b><span>South Korea</span></div><div class="quote-row"><b>Delivery Terms</b><span>FOB</span></div><div class="quote-row"><b>Delivery Time</b><span>Sales review required</span></div><div class="quote-row"><b>Validity</b><span>30 days from the date of issue</span></div><p class="muted" style="margin-top:20px">This prototype mirrors the structure of the supplied AI test.xlsx quotation template. Final price, filler selection, technical configuration and delivery terms require sales review.</p></div>`;}
window.approve=function(id){const arr=requests(),r=arr.find(x=>x.id===id);if(!r)return;r.status='Approved (Prototype)';saveRequests(arr);renderList();openReview(id);};
window.downloadRecord=function(id){const r=requests().find(x=>x.id===id);if(!r)return;const d=r.data,a=r.analysis;const rows=[['Request No','Source','Customer','Country','Location','Product','Product Type','Pouch Type','Width mm','Length mm','Filling Weight','Required Speed','Current Packing','Existing Equipment','Required Stations','Recommended Model','Options','Prototype Total','Status'],[r.id,d.source,d.company,d.country,d.location,d.product,d.productType,d.pouchType,d.width,d.length,d.fillWeight,d.speed,d.currentPacking,d.existing,a.requiredStations,a.recommended?.model||'',a.options.map(x=>x.name).join(' / '),a.total,r.status]];const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const x=document.createElement('a');x.href=url;x.download=`${r.id}_quotation_record.csv`;x.click();URL.revokeObjectURL(url);};
function switchTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===id));if(id==='dashboard')renderList();}
document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>switchTab(x.dataset.tab));renderList();
