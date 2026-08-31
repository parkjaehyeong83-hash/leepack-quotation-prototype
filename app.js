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
const $=id=>document.getElementById(id);const GOOGLE_SCRIPT_URL='https://script.google.com/macros/s/AKfycbxCBTAvrft_2k4_tl-uDsGRYkan2FF-Vxd0RPhU_1-YEAOISy0djltHU5FM-m_aXYzF0g/exec';
let CURRENT_AGENT = null;
let EDITING_REQUEST_ID = null;
let DB_REQUESTS = [];
let ADMIN_FILTER = 'ALL';
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

function getPouchSizes() {
  return Array.from(document.querySelectorAll('.pouch-size-row'))
    .map(row => {
      const width = row.querySelector('.pouchWidth').value.trim();
      const length = row.querySelector('.pouchLength').value.trim();
const fillWeight = row.querySelector('.pouchFillWeight').value.trim();
      return {
        width: width,
       length: length,
fillWeight: fillWeight
      };
    });
} 
function getAgentData(){return {
  source:'Agent PWA',
  agentId:CURRENT_AGENT?.id||'',
 submittedBy:$('submittedBy').value.trim(),
submitterEmail:$('submitterEmail').value.trim(),
  country:$('country').value.trim(),
  company:$('company').value.trim(),
  location:$('location').value.trim(),
  deliveryDate:$('deliveryDate').value,
 
  product:$('product').value.trim(),
  productType:$('productType').value,
  pouchType:$('pouchType').value,
  pouchSizes:getPouchSizes(),

  speed:$('speed').value.trim(),
  currentPacking:$('currentPacking').value,
  existing:$('existing').value.trim(),
  incoterms:$('incoterms').value,
  incotermsOther:$('incotermsOther').value.trim(),
  voltage:$('voltage').value.trim(),
  phase:$('phase').value.trim(),
  frequency:$('frequency').value.trim(),
  remarks:$('remarks').value.trim()
};}
function newId(){const d=new Date();const y=String(d.getFullYear()).slice(-2),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');let seq=Number(localStorage.getItem('leepack_seq')||0)+1;localStorage.setItem('leepack_seq',seq);return `QR-${y}${m}${day}-${String(seq).padStart(3,'0')}`;}
function requests(){return JSON.parse(localStorage.getItem('leepack_requests')||'[]');}
function saveRequests(a){localStorage.setItem('leepack_requests',JSON.stringify(a));}
async function submitData(d){
 const requiredFields = [
  ['country', 'Country'],
  ['company', 'Customer company'],
  ['submittedBy', 'Submitted by'],
['submitterEmail', 'Submitter email'],
  ['product', 'Product'],
  ['productType', 'Product type'],
  ['pouchType', 'Pouch type'],
  
  
  ['speed', 'Required speed']
];
const pouchSizes = getPouchSizes();

if (
  pouchSizes.length === 0 ||
  pouchSizes.some(size => !size.width || !size.length || !size.fillWeight)
) {
  alert('Please enter pouch size and filling weight for each pouch.');
  return;
}
for (const [id, label] of requiredFields) {
  const el = $(id);

  if (!String(el.value || '').trim()) {
    alert(`Please enter or select: ${label}`);
    el.focus();
    return;
  }
}
   // Read attachment files
  const attachmentInput = $('attachments');
  const attachmentFiles = attachmentInput
    ? Array.from(attachmentInput.files || [])
    : [];

  const attachments = [];

  for (const file of attachmentFiles) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.split(',')[1] || '');
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    attachments.push({
      name: file.name,
      type: file.type,
      data: base64
    });
  }
  const a=analyze(d);

  const arr = requests();
const isEditing = !!EDITING_REQUEST_ID;
let r;

if (isEditing) {

  // DB에서 불러온 기존 문의 수정
  r = {
    id: EDITING_REQUEST_ID,
    updated: new Date().toLocaleString(),
    status: 'Draft / Sales Review',
    data: d,
    analysis: a
  };

  // localStorage에 같은 문의가 있으면 같이 업데이트
  const idx = arr.findIndex(
    x => x.id === EDITING_REQUEST_ID
  );

  if (idx !== -1) {
    arr[idx] = r;
    saveRequests(arr);
  }

} else {

  // 신규 문의
  r = {
    id: newId(),
    created: new Date().toLocaleString(),
    status: 'Draft / Sales Review',
    data: d,
    analysis: a
  };

  arr.unshift(r);
  saveRequests(arr);
}

  try{
    await fetch(GOOGLE_SCRIPT_URL,{
      method:'POST',
      mode:'no-cors',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:JSON.stringify({requestId:r.id,
action:isEditing ? 'UPDATE' : 'NEW',
       agentId: d.agentId,
                           submittedBy: d.submittedBy,
submitterEmail: d.submitterEmail,
        country:d.country,
        customer:d.company,
        location:d.location,
        deliveryDate:d.deliveryDate,                   
        product:d.product,
        productType:d.productType,
        pouchType:d.pouchType,
        pouchSizes:d.pouchSizes,
       
        requiredSpeed:d.speed,
        currentPacking:d.currentPacking,
       existingEquipment:d.existing,
        incoterms:d.incoterms,
incotermsOther:d.incotermsOther,
voltage:d.voltage,
phase:d.phase,
frequency:d.frequency,                   
 remarks:d.remarks,       
                           attachments: attachments
      })
    });
  }catch(err){
    console.error('Google Sheet save failed:',err);
  }

  renderList();
  openReview(r.id);
  switchTab('review');
 EDITING_REQUEST_ID = null;
 resetRequestForm();
}$('addPouchSizeBtn').onclick = () => {
  const row = document.createElement('div');
  row.className = 'pouch-size-row';

 row.innerHTML = `
  <div class="pouch-size-inputs">
    <input type="number" class="pouchWidth" placeholder="Width">
    <span>×</span>
    <input type="number" class="pouchLength" placeholder="Length">
    <input type="text" class="pouchFillWeight" placeholder="Filling weight">
  </div>
  <button type="button" class="removePouchSize">Remove</button>
`;
  row.querySelector('.removePouchSize').onclick = () => {
    row.remove();
  };

  $('pouchSizeList').appendChild(row);
};
$('incoterms').addEventListener('change', () => {
  const isOther = $('incoterms').value === 'Others';
  $('incotermsOtherBox').style.display = isOther ? 'block' : 'none';

  if (!isOther) {
    $('incotermsOther').value = '';
  }
});
$('submitAgent').onclick=()=>submitData(getAgentData());


function parseEmailDemo(t){
 const s=t.replace(/\n/g,' '); const country=(s.match(/\b(India|USA|United States|Korea|South Korea|Japan|China|Thailand|Vietnam|Indonesia|Malaysia|Australia|New Zealand|Germany|France|UK|United Kingdom)\b/i)||[])[1]||'Country Review Required';
 const company=(s.match(/(?:are|from)\s+([A-Z][A-Za-z0-9 &.-]{2,40}?)(?:\s+in\s+|\.|,)/)||[])[1]||'Customer Review Required';
 const size=s.match(/(\d{2,3})\s*[x×]\s*(\d{2,3})\s*mm/i); const fill=s.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/i); const speed=s.match(/(\d+)\s*(?:bags?|pouches?)\s*\/\s*min|(?:speed[^0-9]{0,15})(\d+)/i);
 const zipper=/zipper/i.test(s), stand=/stand[- ]?up/i.test(s), liquid=/liquid|sauce|water|juice|oil/i.test(s), powder=/powder|coffee|flour|spice/i.test(s);
 return {source:'Customer Email Demo',country,company,location:'',product:(s.match(/(?:for|pack)\s+(?:\d+\s*(?:g|kg|ml|l)\s+)?([A-Za-z ]{3,30}?)(?:\s+in\s+|,|\.)/i)||[])[1]?.trim()||'Product Review Required',productType:liquid?'Liquid':powder?'Powder':'Other',pouchType:zipper&&stand?'Zipper Stand-up':zipper?'Zipper Stand-up':stand?'Stand-up':'Other',width:size?Number(size[1]):0,length:size?Number(size[2]):0,fillWeight:fill?`${fill[1]} ${fill[2]}`:'Review Required',speed:speed?(speed[1]||speed[2]||'').trim():'',currentPacking:/manual/i.test(s)?'Manual':'Review Required',existing:'Review Required',remarks:'Parsed by offline demo rules — final system will use AI analysis.'};
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
function quoteHtml(r){const d=r.data,a=r.analysis,m=a.recommended;return `<div class="quote"><div class="test">PROTOTYPE / TEST PRICE — NOT FOR CUSTOMER USE</div><h2>QUOTATION — DRAFT</h2><div class="quote-row"><b>To.</b><span>${esc(d.company)} / ${esc(d.country)}</span></div><div class="quote-row"><b>Quotation No.</b><span>${r.id}</span></div><div class="quote-row"><b>Main model</b><span>${m?m.model:'SALES REVIEW REQUIRED'}</span></div><h3>APPLICATION SPECIFICATION</h3><div class="quote-row"><b>Product</b><span>${esc(d.product)}</span></div><div class="quote-row"><b>Product type</b><span>${esc(d.productType)}</span></div><div class="quote-row"><b>Filling weight per pouch</b><span>${esc((d.pouchSizes || []).map(s => s.fillWeight || '').filter(Boolean).join(' / '))}</span></div><div class="quote-row"><b>Pouch type</b><span>${esc(d.pouchType)}</span></div><div class="quote-row"><b>Pouch size</b><span>W ${d.width||'-'} × L ${d.length||'-'} mm</span></div><div class="quote-row"><b>Required speed</b><span>${d.speed||'-'} BPM</span></div><h3>MACHINE CONFIGURATION</h3><div class="quote-row"><b>Basic machine</b><span>${m?`${m.model} — ${money(m.price)} (TEST)`:'TBD'}</span></div>${a.options.map(o=>`<div class="quote-row"><b>Option</b><span>${esc(o.name)} — ${money(o.price)} (TEST)</span></div>`).join('')}<div class="quote-row"><b>Prototype total</b><span><strong>${a.total?money(a.total):'TBD'}</strong></span></div><h3>PRICE TERMS & CONDITION</h3><div class="quote-row"><b>Origin</b><span>South Korea</span></div><div class="quote-row"><b>Delivery Terms</b><span>FOB</span></div><div class="quote-row"><b>Delivery Time</b><span>Sales review required</span></div><div class="quote-row"><b>Validity</b><span>30 days from the date of issue</span></div><p class="muted" style="margin-top:20px">This prototype mirrors the structure of the supplied AI test.xlsx quotation template. Final price, filler selection, technical configuration and delivery terms require sales review.</p></div>`;}
window.approve=function(id){const arr=requests(),r=arr.find(x=>x.id===id);if(!r)return;r.status='Approved (Prototype)';saveRequests(arr);renderList();openReview(id);};
window.downloadRecord=function(id){const r=requests().find(x=>x.id===id);if(!r)return;const d=r.data,a=r.analysis;const rows=[['Request No','Source','Customer','Country','Location','Product','Product Type','Pouch Type','Width mm','Length mm','Filling Weight','Required Speed','Current Packing','Existing Equipment','Required Stations','Recommended Model','Options','Prototype Total','Status'],[r.id,d.source,d.company,d.country,d.location,d.product,d.productType,d.pouchType,d.width,d.length,(d.pouchSizes || []).map(s => s.fillWeight || '').filter(Boolean).join(' / '),d.speed,d.currentPacking,d.existing,a.requiredStations,a.recommended?.model||'',a.options.map(x=>x.name).join(' / '),a.total,r.status]];const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const x=document.createElement('a');x.href=url;x.download=`${r.id}_quotation_record.csv`;x.click();URL.revokeObjectURL(url);};
function switchTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===id));if(id==='dashboard')renderDashboard();}
async function renderDashboard(){
  const box = $('dashboardContent');
  if (!box) return;

  try {
    if (!DB_REQUESTS || !DB_REQUESTS.length) {
      box.innerHTML = '<div class="empty">Loading dashboard data...</div>';

      const url = GOOGLE_SCRIPT_URL + '?admin=1';
      const response = await fetch(url);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load dashboard data.');
      }

      DB_REQUESTS = result.requests || [];
    }

    const data = DB_REQUESTS || [];
    const totalRequests = data.length;

    const now = new Date();

    const thisMonth = data.filter(r => {
      const d = new Date(r.receivedDate);

      return !isNaN(d) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth();
    }).length;

    function topValue(field){
      const counts = {};

      data.forEach(r => {
        const value = String(r[field] || '').trim();
        if (!value) return;

        counts[value] = (counts[value] || 0) + 1;
      });

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1]);

      return sorted.length ? sorted[0][0] : '-';
    }

    
    
const countryCounts = {};

function normalizeCountryName(value){
  const raw = String(value || '').trim();
  if (!raw) return '';

  const key = raw.toLowerCase();

  const aliases = {
    india: 'India',
    uk: 'UK',
    'united kingdom': 'UK',
    usa: 'USA',
    'united states': 'USA',
    taiwan: 'Taiwan',
    peru: 'Peru',
    russia: 'Russia',
    spain: 'Spain',
    denmark: 'Denmark',
    ghana: 'Ghana',
    france: 'France',
    pakistan: 'Pakistan',
    paraguay: 'Paraguay',
    bolivia: 'Bolivia'
  };

  return aliases[key] ||
    raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

data.forEach(r => {
  const country = normalizeCountryName(r.country);
  if (!country) return;

  countryCounts[country] = (countryCounts[country] || 0) + 1;
});

const countryData = Object.entries(countryCounts)
  .sort((a, b) => b[1] - a[1]);
const topCountry = countryData.length ? countryData[0][0] : '-';
const maxCountryCount = countryData.length
  ? countryData[0][1]
  : 1;
   
const productCounts = {};

function normalizeProductName(value){
  const raw = String(value || '').trim();
  if (!raw) return '';

 return raw
  .toLowerCase()
  .replace(/\b\w/g, c => c.toUpperCase())
  .replace(/\bIqf\b/g, 'IQF');
}
   data.forEach(r => {
  const product = normalizeProductName(r.product);
  if (!product) return;

  productCounts[product] = (productCounts[product] || 0) + 1;
});
   const productData = Object.entries(productCounts)
  .sort((a, b) => b[1] - a[1]);
   const normalizedTopProduct = productData.length ? productData[0][0] : '-';
   const maxProductCount = productData.length
  ? productData[0][1]
  : 1;
   const productTypeCounts = {};
   data.forEach(r => {
  const type = String(r.productType || '').trim();
  if (!type) return;

  productTypeCounts[type] = (productTypeCounts[type] || 0) + 1;
});
   const productTypeData = Object.entries(productTypeCounts)
  .sort((a, b) => b[1] - a[1]);
   const totalProductTypeCount = productTypeData.reduce((sum, [, count]) => sum + count, 0);
   let productTypeOffset = 0;
   const monthlyCounts = {};
   data.forEach(r => {
  const d = new Date(r.receivedDate);
  if (isNaN(d)) return;

  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
});
   const monthlyData = Object.entries(monthlyCounts)
  .sort((a, b) => a[0].localeCompare(b[0]));
   const maxMonthlyCount = monthlyData.length
  ? Math.max(...monthlyData.map(([, count]) => count))
  : 1;
   const chartWidth = 520;
   const chartHeight = 140;
   const monthlyPoints = [];
   monthlyData.forEach(([month, count], index) => {
    const x = 50 + (monthlyData.length === 1 ? chartWidth / 2 : (index / (monthlyData.length - 1)) * chartWidth);
    const y = 180 - (count / maxMonthlyCount) * chartHeight;
    monthlyPoints.push({ month, count, x, y });
});
   const monthlyPolyline = monthlyPoints.map(p => `${p.x},${p.y}`).join(' ');
    box.innerHTML = `
      <div class="dashboard-summary">

        <div class="dashboard-card">
          <div class="dashboard-label">TOTAL REQUESTS</div>
          <div class="dashboard-value">${totalRequests}</div>
          <div class="muted">All time</div>
        </div>

        <div class="dashboard-card">
          <div class="dashboard-label">THIS MONTH</div>
          <div class="dashboard-value">${thisMonth}</div>
          <div class="muted">Current month</div>
        </div>

        <div class="dashboard-card">
          <div class="dashboard-label">TOP COUNTRY</div>
          <div class="dashboard-value dashboard-text">${topCountry}</div>
        </div>

        <div class="dashboard-card">
          <div class="dashboard-label">TOP PRODUCT</div>
          <div class="dashboard-value dashboard-text">${normalizedTopProduct}</div>
        </div>

      </div>
      <div class="dashboard-charts-grid">
           <div class="dashboard-chart-card" style="order:3;">
        <h3>Requests by Country</h3>

        <div class="dashboard-bars">
          ${
            countryData.length
              ? countryData.map(([country, count]) => `
                  <div class="dashboard-bar-row">
                    <div class="dashboard-bar-label">${esc(country)}</div>

                    <div class="dashboard-bar-track">
                      <div
                        class="dashboard-bar-fill"
                        style="width:${(count / maxCountryCount) * 100}%"
                      ></div>
                    </div>

                    <div class="dashboard-bar-count">${count}</div>
                  </div>
                `).join('')
              : '<div class="empty">No country data.</div>'
          }
        </div>
      </div>
          <div class="dashboard-chart-card" style="order:4;">
        <h3>Requests by Product</h3>

        <div class="dashboard-bars">
          ${
            productData.length
              ? productData.map(([product, count]) => `
                  <div class="dashboard-bar-row">
                    <div class="dashboard-bar-label">${esc(product)}</div>

                    <div class="dashboard-bar-track">
                      <div
                        class="dashboard-bar-fill"
                        style="width:${(count / maxProductCount) * 100}%"
                      ></div>
                    </div>

                    <div class="dashboard-bar-count">${count}</div>
                  </div>
                `).join('')
              : '<div class="empty">No product data.</div>'
          }
        </div>
      </div>
     
      <div class="dashboard-chart-card dashboard-product-type-card" style="order:2;">
  <h3>Requests by Product Type</h3>
  <div class="dashboard-donut-wrap">
  <div class="dashboard-donut">
  <svg viewBox="0 0 120 120" class="dashboard-donut-svg">
  <circle
    cx="60"
    cy="60"
    r="45"
    fill="none"
    stroke="#edf2f6"
    stroke-width="18"
  ></circle>
 ${
  productTypeData.map(([type, count], index) => {
    const circumference = 2 * Math.PI * 45;
    const percent = totalProductTypeCount
      ? count / totalProductTypeCount
      : 0;

    const dash = percent * circumference;
    const gap = circumference - dash;
    const offset = -productTypeOffset * circumference;

    productTypeOffset += percent;

    return `
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        stroke="hsl(${index * 65}, 65%, 50%)"
        stroke-width="18"
        stroke-dasharray="${dash} ${gap}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 60 60)"
      ></circle>
    `;
  }).join('')
}
</svg>
<div class="dashboard-donut-center">
  <strong>${totalProductTypeCount}</strong>
  <span>Total</span>
</div>
  </div>
  <div class="dashboard-donut-legend">
  ${
  productTypeData.map(([type, count], index) => `
    <div class="dashboard-donut-legend-item">
      <span
        class="dashboard-donut-dot"
        style="background:hsl(${index * 65}, 65%, 50%)"
      ></span>
      <span>${esc(type)}</span>
      <strong>${count}</strong>
    </div>
  `).join('')
}
</div>
  </div>
</div>
            <div class="dashboard-chart-card dashboard-monthly-card" style="order:1;">      
        <h3>Monthly Trend</h3>        
        <div class="dashboard-line-chart">
  <svg viewBox="0 0 600 220" class="dashboard-line-svg">
  <line x1="50" y1="40" x2="570" y2="40" class="dashboard-grid-line"></line>
<line x1="50" y1="110" x2="570" y2="110" class="dashboard-grid-line"></line>
<line x1="50" y1="180" x2="570" y2="180" class="dashboard-grid-line"></line>
${
  monthlyPoints.length > 1
    ? `<polyline
        points="${monthlyPolyline}"
        class="dashboard-trend-line"
        fill="none"
      ></polyline>`
    : ''
}
${
  monthlyPoints.map(p => `
    <circle
      cx="${p.x}"
      cy="${p.y}"
      r="5"
      class="dashboard-trend-point"
    ></circle>
  `).join('')
}
  
  ${
  monthlyPoints.map(p => `
    <text
      x="${p.x}"
      y="${p.y - 12}"
      class="dashboard-trend-value"
      text-anchor="middle"
    >${p.count}</text>
  `).join('')
}
${
  monthlyPoints.map(p => `
    <text
      x="${p.x}"
      y="205"
      class="dashboard-trend-label"
      text-anchor="middle"
    >${esc(p.month)}</text>
  `).join('')
}
</svg>
</div>
</div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    box.innerHTML =
      '<div class="empty">Failed to load dashboard data.</div>';
  }
}
  

document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>switchTab(x.dataset.tab));renderList();
// ===== DEALER LOGIN - DEMO =====
const DEMO_AGENTS = [
  {
    id: 'INDIA01',
    password: '1234',
    name: 'India Dealer'
  },
  {
    id: 'PERU01',
    password: '5678',
    name: 'Peru Dealer'
  },
  {
    id: 'TAIWAN01',
    password: '9012',
    name: 'Taiwan Dealer'
  },  {
    id: 'ADMIN01',
    password: '2580',
    name: 'LEEPACK Admin',
    role: 'admin'
  }
];

function dealerLogin() {
  const id = $('agentId').value.trim();
  const password = $('agentPassword').value;

  
    $('loginMessage').textContent = '';
 const agent = DEMO_AGENTS.find(
  a => a.id === id && a.password === password
);

if (agent) {
  CURRENT_AGENT = {
  id: agent.id,
  name: agent.name,
  role: agent.role || 'dealer'
};
    $('currentAgentLabel').textContent = CURRENT_AGENT.id;
$('loginScreen').style.display = 'none';
$('appScreen').style.display = 'block';

const newRequestTab = document.querySelector('[data-tab="agent"]');
const requestsTab = document.querySelector('[data-tab="myRequests"]');
const dashboardTab = document.querySelector('[data-tab="dashboard"]');
if (CURRENT_AGENT.role === 'admin') {
  // Admin: New Request 숨김, 전체 문의만 표시
  newRequestTab.style.display = 'none';
  requestsTab.textContent = 'All Requests';
 document.getElementById('requestsTitle').textContent = 'All Requests';
document.getElementById('requestsDescription').textContent = 'All quotation requests submitted by agents are shown here.';
dashboardTab.style.display = '';
  switchTab('myRequests');
  renderMyRequests();

} else {
  // Dealer: 기존 화면 유지
  newRequestTab.style.display = '';
  requestsTab.textContent = 'My Requests';
 document.getElementById('requestsTitle').textContent = 'My Requests';
document.getElementById('requestsDescription').textContent = 'Only quotation requests submitted using your Agent ID are shown here.';
dashboardTab.style.display = 'none';
  resetRequestForm();
  switchTab('agent');
}
  } else {
    $('loginMessage').textContent = 'Invalid Agent ID or Password.';
  }
}
function resetRequestForm() {
  EDITING_REQUEST_ID = null;
$('cancelEdit').style.display = 'none';
 $('submittedBy').value = '';
$('submitterEmail').value = '';
  $('country').value = '';
  $('company').value = '';
  $('location').value = '';
  $('product').value = '';
  $('productType').value = '';
  $('pouchType').value = '';
  const pouchSizeList = $('pouchSizeList');
pouchSizeList.innerHTML = `
  <div class="pouch-size-row">
    <div class="pouch-size-inputs">
      <input type="number" class="pouchWidth" placeholder="Width">
      <span>×</span>
      <input type="number" class="pouchLength" placeholder="Length">
      <input type="text" class="pouchFillWeight" placeholder="Filling weight">
   
  </div>
`;
 
  $('speed').value = '';
  $('currentPacking').value = '';
  $('existing').value = '';
  $('deliveryDate').value = '';
$('incoterms').value = '';
$('incotermsOther').value = '';
$('incotermsOtherBox').style.display = 'none';
$('voltage').value = '';
$('phase').value = '';
$('frequency').value = '';
  $('remarks').value = '';
 $('attachments').value = '';
}
function dealerLogout() {
  CURRENT_AGENT = null;

  $('agentId').value = '';
  $('agentPassword').value = '';
  $('appScreen').style.display = 'none';
  $('loginScreen').style.display = 'flex';
}

window.setAdminFilter = function(agentId) {
  ADMIN_FILTER = agentId;
  renderMyRequests();
};
async function renderMyRequests() {
  const box = $('myRequestsList');

  if (!CURRENT_AGENT) {
    box.innerHTML = '<div class="empty">Please login first.</div>';
    return;
  }

  box.innerHTML = '<div class="empty">Loading...</div>';

  try {
    const url =
  CURRENT_AGENT.role === 'admin'
    ? GOOGLE_SCRIPT_URL + '?admin=1'
    : GOOGLE_SCRIPT_URL +
      '?agentId=' +
      encodeURIComponent(CURRENT_AGENT.id);

    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to load requests.');
    }

    const mine = result.requests || [];
   DB_REQUESTS = mine;

    if (!mine.length) {
      box.innerHTML =
        '<div class="empty">No requests submitted by this Agent ID yet.</div>';
      return;
    }
const visibleRows =
  CURRENT_AGENT.role === 'admin' && ADMIN_FILTER !== 'ALL'
    ? mine.filter(r => String(r.agentId || '') === ADMIN_FILTER)
    : mine;

const adminFilterHtml =
  CURRENT_AGENT.role === 'admin'
    ? `
      <div style="margin-bottom:12px;">
        <button type="button" onclick="setAdminFilter('ALL')">All</button>
        <button type="button" onclick="setAdminFilter('INDIA01')">India</button>
        <button type="button" onclick="setAdminFilter('PERU01')">Peru</button>
        <button type="button" onclick="setAdminFilter('TAIWAN01')">Taiwan</button>
      </div>
    `
    : '';
    box.innerHTML = `
    ${adminFilterHtml}
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Date</th>
            <th>Agent ID</th>
            <th>Country</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Model</th>
            <th>Attachment</th>
            <th>Status</th>
      ${CURRENT_AGENT.role === 'admin' ? '' : '<th>View / Edit</th>'}
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map(r => `
            <tr>
              <td>${esc(r.requestId || '')}</td>
              <td>${esc(r.receivedDate || '')}</td>
              <td>${esc(r.agentId || '')}</td>
<td>${esc(r.country || '')}</td>
              <td>${esc(r.customer || '')}</td>
              <td>${esc(r.product || '')}</td>
                <td>${esc(r.model || '-')}</td>
              <td>
  ${
    r.attachments
      ? r.attachments.split('\n').map((item, i) => {
          const pos = item.indexOf(': ');
          const url = pos >= 0 ? item.slice(pos + 2) : '';
          return url
            ? `<a href="${esc(url)}" target="_blank" rel="noopener">View${r.attachments.includes('\n') ? ' ' + (i + 1) : ''}</a>`
            : '-';
        }).join('<br>')
      : '-'
  }
</td>
            
              <td>${esc(r.status || '')}</td>
           ${CURRENT_AGENT.role === 'admin' ? '' : `
  <td>
    <button type="button" onclick="viewDbRequest('${r.requestId}')">View</button>
    <button type="button" onclick="editDbRequest('${r.requestId}')">Edit</button>
  </td>
`}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  } catch (err) {
    console.error(err);
    box.innerHTML =
      '<div class="empty">Failed to load requests from database.</div>';
  }
}
function viewDbRequest(id) {
  const r = DB_REQUESTS.find(
    x => x.requestId === id
  );

  if (!r) {
    alert('Request data not found.');
    return;
  }

  if (
    !CURRENT_AGENT ||
    (
      CURRENT_AGENT.role !== 'admin' &&
      r.agentId !== CURRENT_AGENT.id
    )
  ) {
    alert('You can only view your own requests.');
    return;
  }

  const box = $('myRequestsList');

  const pouchSizes =
    Array.isArray(r.pouchSizes) && r.pouchSizes.length
      ? r.pouchSizes
      : [];

  const pouchSizeHtml = pouchSizes.length
    ? pouchSizes.map((p, i) => `
        <div style="margin-bottom:6px;">
          ${i + 1}.
          ${esc(p.width || '')}
          ×
          ${esc(p.length || '')} mm
          ${p.fillWeight ? ` / Filling weight: ${esc(p.fillWeight)}` : ''}
        </div>
      `).join('')
    : '-';

  const attachmentHtml = r.attachments
    ? r.attachments.split('\n').map((item, i) => {
        const pos = item.indexOf(': ');
        const url = pos >= 0 ? item.slice(pos + 2) : '';

        return url
          ? `<a href="${esc(url)}"
                target="_blank"
                rel="noopener">
               View${r.attachments.includes('\n') ? ' ' + (i + 1) : ''}
             </a>`
          : esc(item);
      }).join('<br>')
    : '-';

  box.innerHTML = `
    <div style="margin-bottom:16px;">
      <button
        type="button"
        onclick="renderMyRequests()">
        ← Back to My Requests
      </button>
    </div>

    <h3>Quotation Request Details</h3>

    <table>
      <tbody>
        <tr>
          <th>Request ID</th>
          <td>${esc(r.requestId || '')}</td>
        </tr>

        <tr>
          <th>Date</th>
          <td>${esc(r.receivedDate || '')}</td>
        </tr>

        <tr>
          <th>Agent ID</th>
          <td>${esc(r.agentId || '')}</td>
        </tr>
        <tr>
  <th>Submitted by</th>
  <td>${esc(r.submittedBy || '')}</td>
</tr>

<tr>
  <th>Submitter email</th>
  <td>${esc(r.submitterEmail || '')}</td>
</tr>

        <tr>
          <th>Status</th>
          <td>${esc(r.status || '')}</td>
        </tr>

        <tr>
          <th>Country</th>
          <td>${esc(r.country || '')}</td>
        </tr>

        <tr>
          <th>Customer company</th>
          <td>${esc(r.customer || '')}</td>
        </tr>

        <tr>
          <th>Location</th>
          <td>${esc(r.location || '')}</td>
        </tr>

        <tr>
          <th>Requested delivery date</th>
          <td>${esc(
            r.deliveryDate
              ? String(r.deliveryDate).slice(0, 10)
              : ''
          )}</td>
        </tr>

        <tr>
          <th>Product</th>
          <td>${esc(r.product || '')}</td>
        </tr>

        <tr>
          <th>Product type</th>
          <td>${esc(r.productType || '')}</td>
        </tr>

        <tr>
          <th>Pouch type</th>
          <td>${esc(r.pouchType || '')}</td>
        </tr>

        <tr>
          <th>Pouch size / Filling weight</th>
          <td>${pouchSizeHtml}</td>
        </tr>

        <tr>
          <th>Required speed</th>
          <td>${esc(r.requiredSpeed || '')}</td>
        </tr>

        <tr>
          <th>Current packing method</th>
          <td>${esc(r.currentPacking || '')}</td>
        </tr>

        <tr>
          <th>Existing automation equipment</th>
          <td>${esc(r.existingEquipment || '')}</td>
        </tr>

        <tr>
          <th>Incoterms</th>
          <td>
            ${esc(r.incoterms || '')}
            ${
              r.incoterms === 'Others' && r.incotermsOther
                ? ` - ${esc(r.incotermsOther)}`
                : ''
            }
          </td>
        </tr>

        <tr>
          <th>Factory power supply</th>
          <td>
            ${esc(r.voltage || '')}
            ${r.voltage ? ' V' : ''}
            ${
              r.phase
                ? ` / ${esc(r.phase)} Ph`
                : ''
            }
            ${
              r.frequency
                ? ` / ${esc(r.frequency)} Hz`
                : ''
            }
          </td>
        </tr>

        <tr>
          <th>Remarks</th>
          <td>${esc(r.remarks || '')}</td>
        </tr>

        <tr>
          <th>Attachment</th>
          <td>${attachmentHtml}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:16px;">
      <button
        type="button"
        onclick="renderMyRequests()">
        ← Back to My Requests
      </button>
    </div>
  `;

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
function editDbRequest(id) {
  const r = DB_REQUESTS.find(
    x => x.requestId === id
  );

  if (!r) {
    alert('Request data not found.');
    return;
  }

  if (
    !CURRENT_AGENT ||
    r.agentId !== CURRENT_AGENT.id
  ) {
    alert('You can only edit your own requests.');
    return;
  }

  EDITING_REQUEST_ID = id;
$('cancelEdit').style.display = 'inline-block';
 $('submittedBy').value = r.submittedBy || '';
$('submitterEmail').value = r.submitterEmail || '';
  $('country').value = r.country || '';
  $('company').value = r.customer || '';
  $('location').value = r.location || '';
  $('product').value = r.product || '';
  $('productType').value = r.productType || '';
 $('pouchType').value = r.pouchType || '';
 const pouchSizeList = $('pouchSizeList');
pouchSizeList.innerHTML = '';

const editPouchSizes =
  Array.isArray(r.pouchSizes) && r.pouchSizes.length
    ? r.pouchSizes
    : [{ width: '', length: '' }];

editPouchSizes.forEach((size, index) => {
  const row = document.createElement('div');
  row.className = 'pouch-size-row';

  row.innerHTML = `
  <div class="pouch-size-inputs">
    <input
      type="number"
      class="pouchWidth"
      placeholder="Width"
      value="${size.width || ''}"
    >
    <span>×</span>
    <input
      type="number"
      class="pouchLength"
      placeholder="Length"
      value="${size.length || ''}"
    >
    <input
      type="text"
      class="pouchFillWeight"
      placeholder="Filling weight"
      value="${size.fillWeight || ''}"
    >
  </div>
  ${index > 0
    ? '<button type="button" class="removePouchSize">Remove</button>'
    : ''}
`;

  const removeBtn = row.querySelector('.removePouchSize');

  if (removeBtn) {
    removeBtn.onclick = () => row.remove();
  }

  pouchSizeList.appendChild(row);
});
  
  

  $('speed').value = r.requiredSpeed || '';
  $('currentPacking').value = r.currentPacking || '';
  $('existing').value = r.existingEquipment || '';
 $('deliveryDate').value =
  r.deliveryDate ? String(r.deliveryDate).slice(0, 10) : '';

$('incoterms').value = r.incoterms || '';
$('incotermsOther').value = r.incotermsOther || '';

$('incotermsOtherBox').style.display =
  r.incoterms === 'Others' ? 'block' : 'none';

$('voltage').value = r.voltage || '';
$('phase').value = r.phase || '';
$('frequency').value = r.frequency || '';
  $('remarks').value = r.remarks || '';

  switchTab('agent');
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
function editRequest(id) {
  const r = requests().find(x => x.id === id);

  if (!r || !r.data) {
    alert('Request data not found.');
    return;
  }

  if (!CURRENT_AGENT || r.data.agentId !== CURRENT_AGENT.id) {
    alert('You can only edit your own requests.');
    return;
  }

  EDITING_REQUEST_ID = id;
  const d = r.data;

  $('country').value = d.country || '';
  $('company').value = d.company || '';
  $('location').value = d.location || '';
  $('product').value = d.product || '';
  $('productType').value = d.productType || '';
  $('pouchType').value = d.pouchType || '';
  
  
  $('speed').value = d.speed || '';
  $('currentPacking').value = d.currentPacking || '';
  $('existing').value = d.existing || '';
 
  $('remarks').value = d.remarks || '';

  switchTab('agent');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('loginBtn').onclick = dealerLogin;
$('logoutBtn').onclick = dealerLogout;
$('cancelEdit').onclick = () => {
  EDITING_REQUEST_ID = null;
  resetRequestForm();
  $('cancelEdit').style.display = 'none';
  switchTab('myRequests');
  renderMyRequests();
};
document
  .querySelector('[data-tab="agent"]')
  .addEventListener('click', () => {
    resetRequestForm();
  });
document
  .querySelector('[data-tab="myRequests"]')
  .addEventListener('click', renderMyRequests);

$('agentPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') dealerLogin();
});
