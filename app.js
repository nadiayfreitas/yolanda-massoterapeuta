(() => {
  const $ = s => document.querySelector(s);
  const view = $('#view'), nav = $('#bottomNav'), modeLabel = $('#modeLabel'), badge = $('#syncBadge'), modal = $('#modal');
  const pad2 = n => String(n).padStart(2,'0');
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const today = () => ymd(new Date());
  const parseYMD = value => { const [y,m,d]=String(value||today()).split('-').map(Number); return new Date(y,m-1,d,12,0,0,0); };
  const addDays = (value,days) => { const d=parseYMD(value); d.setDate(d.getDate()+days); return ymd(d); };
  const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtDate = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '';
  const uid = () => crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());

  const DEFAULT = {
    settings:{adminPin:'9186', pinSchema:2, reminderDays:1, driveConnected:false, lastBackup:null, recoveryEmail:'', recoveryKeyHash:''},
    services:[
      {id:'s1',name:'Drenagem Linfática',price:100,duration:60},
      {id:'s2',name:'Massagem Relaxante',price:110,duration:60},
      {id:'s3',name:'Massagem Terapêutica',price:120,duration:60},
      {id:'s4',name:'Pedras Quentes',price:130,duration:60},
      {id:'s5',name:'Reflexologia',price:90,duration:40},
      {id:'s6',name:'Quick Massage',price:70,duration:30},
      {id:'s7',name:'Head Spa',price:120,duration:60}
    ],
    clients:[], appointments:[], logs:[]
  };

  const DB = 'yolanda-pwa-db', STORE='state', KEY='main';
  function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  function normalizeState(data){
    const out=data&&typeof data==='object'?data:structuredClone(DEFAULT);
    out.settings={...structuredClone(DEFAULT.settings),...(out.settings||{})};
    out.services=Array.isArray(out.services)?out.services:structuredClone(DEFAULT.services);
    out.clients=Array.isArray(out.clients)?out.clients:[];
    out.appointments=Array.isArray(out.appointments)?out.appointments:[];
    out.logs=Array.isArray(out.logs)?out.logs:[];
    if((Number(out.settings.pinSchema)||0)<2 && out.settings.adminPin==='2580')out.settings.adminPin='9186';
    out.settings.pinSchema=2;
    return out;
  }
  async function load(){try{const db=await dbOpen();const data=await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result||structuredClone(DEFAULT));r.onerror=()=>rej(r.error)});return normalizeState(data)}catch{const raw=localStorage.getItem(KEY);return normalizeState(raw?JSON.parse(raw):structuredClone(DEFAULT))}}
  async function save(){state.logs=state.logs.slice(-500);try{const db=await dbOpen();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch{localStorage.setItem(KEY,JSON.stringify(state))}updateBadge()}
  function log(action, details, actor=currentMode==='admin'?'Administração':currentMode==='learn'?'Treino (fictício)':'Yolanda'){const target=currentMode==='learn'&&trainingState?trainingState:state;target.logs.push({id:uid(),at:new Date().toISOString(),actor,action,details})}

  const normalizeEmail=v=>String(v||'').trim().toLowerCase();
  const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
  function maskEmail(v){const e=normalizeEmail(v),[name,domain='']=e.split('@');if(!name)return '';const shown=name.length<=2?name[0]||'*':name.slice(0,2);return `${shown}${'*'.repeat(Math.max(2,name.length-shown.length))}@${domain}`}
  async function hashText(text){const value=String(text||'').trim().toUpperCase();if(globalThis.crypto?.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return `fallback-${(h>>>0).toString(16)}`}
  function makeRecoveryKey(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(12);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);const chars=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');return `YOLA-${chars.slice(0,4)}-${chars.slice(4,8)}-${chars.slice(8,12)}`}

  let state, currentMode=null, trainingState=null, learnVisited=new Set();
  let agendaViewMode='month', agendaSelectedDate=today(), agendaCursor=`${today().slice(0,7)}-01`;

  function buildTrainingState(){
    const base=structuredClone(DEFAULT);
    base.settings={...base.settings, reminderDays:3};
    base.clients=[
      {id:'tc1',name:'Maria de Teste',phone:'(16) 99999-1111',birth:'',notes:'Prefere pressão leve.',createdAt:new Date().toISOString()},
      {id:'tc2',name:'Ana de Treino',phone:'(16) 99999-2222',birth:'',notes:'',createdAt:new Date().toISOString()},
      {id:'tc3',name:'Luciana Exemplo',phone:'(16) 99999-3333',birth:'',notes:'',createdAt:new Date().toISOString()}
    ];
    const demo=(id,clientId,serviceId,date,time,confirmed=false,paid=false,price=null)=>{const svc=base.services.find(s=>s.id===serviceId);return {id,clientId,serviceId,serviceName:svc.name,defaultPrice:Number(svc.price),price:price??Number(svc.price),date,time,notes:'',confirmed,paymentStatus:paid?'pago':'pendente',paymentMethod:paid?'PIX':'',status:'agendado',createdAt:new Date().toISOString()}};
    base.appointments=[
      demo('ta1','tc1','s1',today(),'10:00',true,true),
      demo('ta2','tc2','s3',addDays(today(),1),'14:00',false,false,110),
      demo('ta3','tc3','s2',addDays(today(),5),'09:30',false,false),
      demo('ta4','tc1','s5',addDays(today(),12),'16:00',false,false)
    ];
    return base;
  }
  function currentData(){return currentMode==='learn'?trainingState:state}
  async function persistCurrent(){if(currentMode==='learn'){updateBadge();return}await save()}
  function resetAgendaPosition(){agendaViewMode='month';agendaSelectedDate=today();agendaCursor=`${today().slice(0,7)}-01`}

  function updateBadge(){
    if(currentMode==='learn'){badge.textContent='● Treino • dados fictícios';badge.className='sync-badge learn';return}
    if(!navigator.onLine){badge.textContent='● Sem internet';badge.className='sync-badge warn';return}
    badge.textContent=state?.settings?.driveConnected?'● Online • backup preparado':'● Online • local';badge.className='sync-badge ok';
  }
  addEventListener('online',updateBadge);addEventListener('offline',updateBadge);

  function setMode(mode){
    currentMode=mode;
    nav.classList.toggle('hidden',!['daily','learn'].includes(mode));
    modeLabel.textContent=mode==='learn'?'Modo Aprender':mode==='daily'?'Uso Diário':mode==='admin'?'Administração':'Escolha um modo';
    if(mode==='learn'){trainingState=buildTrainingState();learnVisited=new Set();resetAgendaPosition();renderHome()}
    else if(mode==='daily'){resetAgendaPosition();renderHome()}
    else if(mode==='admin')renderAdmin();
    else renderModePicker();
    updateBadge();
  }

  function renderModePicker(){
    currentMode=null;nav.classList.add('hidden');modeLabel.textContent='Escolha um modo';updateBadge();
    view.innerHTML=`<section class="hero"><h1>Olá, Yolanda 🌷</h1><p>Escolha como deseja entrar no aplicativo.</p></section>
      <div class="grid">
        <button class="big-choice" id="learnBtn"><span class="emoji">🎓</span><strong>Modo Aprender</strong><small>Treine sem mexer em clientes, agenda ou valores reais.</small></button>
        <button class="big-choice" id="dailyBtn"><span class="emoji">🌷</span><strong>Uso Diário</strong><small>Agenda, clientes, atendimentos, recebimentos e lembretes.</small></button>
        <button class="big-choice" id="adminBtn"><span class="emoji">⚙️</span><strong>Administração</strong><small>Configurações, serviços, histórico, exportação e backups.</small></button>
      </div>`;
    $('#learnBtn').onclick=()=>setMode('learn'); $('#dailyBtn').onclick=()=>setMode('daily'); $('#adminBtn').onclick=askAdminPin;
  }

  function askAdminPin(){
    modal.innerHTML=`<form class="modal-body" id="pinForm"><h3>Acesso à Administração</h3><div class="field"><label>PIN</label><input id="pin" inputmode="numeric" type="password" maxlength="8" pattern="[0-9]{4,8}" autocomplete="off" required></div><p class="help">PIN inicial desta versão: <strong>9186</strong>. Ele pode ser alterado nas Configurações.</p><div class="actions"><button type="button" class="btn ghost" id="pinCancel">Cancelar</button><button type="button" class="btn ghost" id="forgotPin">Esqueci meu PIN</button><button class="btn primary">Entrar</button></div></form>`;
    modal.showModal();
    $('#pinCancel').onclick=()=>modal.close();
    $('#forgotPin').onclick=renderPinRecovery;
    $('#pinForm').addEventListener('submit',e=>{e.preventDefault();if($('#pin').value===state.settings.adminPin){modal.close();setMode('admin')}else alert('PIN incorreto.')});
  }

  function renderPinRecovery(){
    const email=normalizeEmail(state.settings.recoveryEmail);
    if(!email||!state.settings.recoveryKeyHash){
      modal.innerHTML=`<div class="modal-body"><h3>Recuperação do PIN</h3><div class="notice">A recuperação por e-mail ainda não foi configurada neste aparelho.</div><p class="help">Se este for o primeiro acesso, use o PIN inicial <strong>9186</strong>. Depois entre em Administração → Configurações, cadastre um e-mail e gere a chave de recuperação.</p><div class="actions"><button type="button" class="btn ghost" id="recoveryBack">Voltar</button></div></div>`;
      $('#recoveryBack').onclick=askAdminPin;return;
    }
    modal.innerHTML=`<form class="modal-body" id="recoveryForm"><h3>Recuperar acesso</h3><p class="help">Digite o e-mail de recuperação (${maskEmail(email)}) e a chave que foi enviada e guardada nesse e-mail.</p><div class="field"><label>E-mail de recuperação</label><input id="recoveryEmailInput" type="email" autocomplete="email" required></div><div class="field"><label>Chave de recuperação</label><input id="recoveryKeyInput" type="text" autocomplete="off" placeholder="YOLA-XXXX-XXXX-XXXX" required></div><div class="actions"><button type="button" class="btn ghost" id="recoveryBack">Voltar</button><button class="btn primary">Verificar</button></div></form>`;
    $('#recoveryBack').onclick=askAdminPin;
    $('#recoveryForm').onsubmit=async e=>{e.preventDefault();const typedEmail=normalizeEmail($('#recoveryEmailInput').value);const typedHash=await hashText($('#recoveryKeyInput').value);if(typedEmail!==email||typedHash!==state.settings.recoveryKeyHash){alert('E-mail ou chave de recuperação incorretos.');return}showResetPinForm()};
  }

  function showResetPinForm(){
    modal.innerHTML=`<form class="modal-body" id="resetPinForm"><h3>Criar novo PIN</h3><div class="field"><label>Novo PIN</label><input id="resetPin1" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" required></div><div class="field"><label>Repita o novo PIN</label><input id="resetPin2" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" required></div><div class="actions"><button type="button" class="btn ghost" id="resetCancel">Cancelar</button><button class="btn primary">Salvar novo PIN</button></div></form>`;
    $('#resetCancel').onclick=()=>modal.close();
    $('#resetPinForm').onsubmit=async e=>{e.preventDefault();const p1=$('#resetPin1').value,p2=$('#resetPin2').value;if(!/^\d{4,8}$/.test(p1)){alert('Use um PIN de 4 a 8 números.');return}if(p1!==p2){alert('Os PINs não são iguais.');return}state.settings.adminPin=p1;log('PIN recuperado','PIN redefinido usando e-mail + chave de recuperação','Recuperação');await save();modal.close();alert('PIN alterado com sucesso. Use o novo PIN para entrar.');askAdminPin()};
  }

  const learnHelp={
    home:['1 de 5 • Início','Esta é a mesma tela do Uso Diário. Aqui você vê os atendimentos de hoje, o valor recebido e os lembretes. Os nomes e valores deste treino são fictícios.'],
    agenda:['2 de 5 • Agenda','Veja o mês inteiro. Toque em qualquer dia para ver os horários. Se preferir letras e números maiores, toque em “Semana”. Use + Novo para praticar um agendamento.'],
    new:['3 de 5 • Agendar','Escolha a cliente e o serviço. O preço padrão aparece sozinho, mas você pode mudar o valor somente deste atendimento. Depois escolha dia, horário e salve.'],
    clients:['4 de 5 • Clientes','Aqui você consulta e cadastra clientes. No treino, pode criar nomes fictícios à vontade: nada vai para a lista real.'],
    reminders:['5 de 5 • Lembretes','Quando você já tiver falado com a cliente, toque em “Confirmação realizada”. O aplicativo não envia mensagem; ele apenas lembra você de confirmar.'],
    appointment:['Atendimento de treino','Nesta tela você pode confirmar a cliente, registrar o pagamento ou cancelar o atendimento. Tudo continua sendo apenas uma simulação.']
  };
  function learnGuide(screen){
    if(currentMode!=='learn')return '';
    learnVisited.add(screen);
    const info=learnHelp[screen]||learnHelp.home;
    const done=Math.min(5,[...learnVisited].filter(x=>['home','agenda','new','clients','reminders'].includes(x)).length);
    return `<section class="learn-guide"><div class="learn-guide-head"><div><strong>🎓 ${info[0]}</strong><p>${info[1]}</p></div><span>${done}/5</span></div><div class="progress"><div style="width:${done*20}%"></div></div><div class="actions"><button type="button" class="btn ghost learn-reset">Reiniciar treino</button><button type="button" class="btn ghost learn-exit">Sair do treino</button></div></section>`;
  }
  function bindLearnGuide(){
    if(currentMode!=='learn')return;
    document.querySelectorAll('.learn-reset').forEach(b=>b.onclick=()=>{if(confirm('Reiniciar os dados fictícios do treinamento?')){trainingState=buildTrainingState();learnVisited=new Set();resetAgendaPosition();renderHome()}});
    document.querySelectorAll('.learn-exit').forEach(b=>b.onclick=renderModePicker);
  }

  function renderHome(){
    const d=currentData();
    const todays=d.appointments.filter(a=>a.date===today() && a.status!=='cancelado').sort((a,b)=>a.time.localeCompare(b.time));
    const pending=reminderAppointments(d).length;
    const received=d.appointments.filter(a=>a.date===today()&&a.paymentStatus==='pago').reduce((sum,a)=>sum+Number(a.price||0),0);
    view.innerHTML=`${learnGuide('home')}<section class="hero"><h1>Hoje</h1><p>${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</p></section>${currentMode==='daily'?'<div class="actions mode-switch"><button type="button" class="btn ghost" id="switchMode">Trocar modo</button></div>':''}
    <div class="grid"><div class="card"><div class="muted">Atendimentos</div><div class="kpi">${todays.length}</div></div><div class="card"><div class="muted">Recebido hoje</div><div class="kpi">${money(received)}</div></div></div>
    ${pending?`<div class="notice" style="margin-top:12px">🔔 Há <strong>${pending}</strong> lembrete(s) de confirmação pendente(s).</div>`:''}
    <div class="section-title"><h2>Agenda de hoje</h2><div class="actions"><button class="btn ghost" id="openCalendar">Ver calendário</button><button class="btn secondary" id="quickNew">+ Agendar</button></div></div>
    <div class="list">${todays.length?todays.map(a=>appointmentCard(a,d)).join(''):'<div class="item"><p>Nenhum atendimento agendado para hoje.</p></div>'}</div>`;
    $('#quickNew').onclick=renderNewAppointment;$('#openCalendar').onclick=renderAgenda;if($('#switchMode'))$('#switchMode').onclick=renderModePicker;bindAppointmentActions();bindLearnGuide();
  }

  function appointmentCard(a,d=currentData()){
    const c=d.clients.find(x=>x.id===a.clientId);
    return `<div class="item"><div class="item-row"><div><h3>${a.time} • ${esc(c?.name||'Cliente')}</h3><p>${esc(a.serviceName)}</p><p>${money(a.price)} • ${a.paymentStatus==='pago'?'Pago':'A receber'}</p></div><span class="tag ${a.confirmed?'ok':'warn'}">${a.confirmed?'Confirmado':'Confirmar'}</span></div><div class="actions" style="margin-top:10px"><button class="btn ghost" data-view-appt="${a.id}">Abrir</button>${!a.confirmed?`<button class="btn secondary" data-confirm="${a.id}">Marcar confirmado</button>`:''}</div></div>`
  }
  function bindAppointmentActions(){
    document.querySelectorAll('[data-view-appt]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.viewAppt));
    document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=async()=>{const d=currentData(),a=d.appointments.find(x=>x.id===b.dataset.confirm);if(!a)return;a.confirmed=true;log('Confirmação registrada',`${a.serviceName} em ${fmtDate(a.date)} ${a.time}`);await persistCurrent();renderHome()})
  }

  function monthTitle(value){return parseYMD(value).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
  function appointmentsForDate(d,date){return d.appointments.filter(a=>a.date===date&&a.status!=='cancelado').sort((a,b)=>a.time.localeCompare(b.time))}
  function renderMonthGrid(d){
    const cursor=parseYMD(agendaCursor);const y=cursor.getFullYear(),m=cursor.getMonth();const first=new Date(y,m,1,12);const lastDay=new Date(y,m+1,0,12).getDate();let html='';
    for(let i=0;i<first.getDay();i++)html+='<div class="calendar-empty" aria-hidden="true"></div>';
    for(let day=1;day<=lastDay;day++){
      const key=ymd(new Date(y,m,day,12));const count=appointmentsForDate(d,key).length;const selected=key===agendaSelectedDate;const isToday=key===today();
      html+=`<button type="button" class="calendar-day ${selected?'selected':''} ${isToday?'today':''}" data-cal-date="${key}" aria-label="${day}, ${count} atendimento(s)"><span class="calendar-number">${day}</span>${count?`<span class="calendar-count">${count}</span><span class="calendar-dot"></span>`:'<span class="calendar-space"></span>'}</button>`;
    }
    return html;
  }
  function weekStart(value){const d=parseYMD(value);d.setDate(d.getDate()-d.getDay());return ymd(d)}
  function renderWeekGrid(d){
    const start=weekStart(agendaSelectedDate);const labels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return labels.map((label,i)=>{const key=addDays(start,i),date=parseYMD(key),count=appointmentsForDate(d,key).length;return `<button type="button" class="week-day ${key===agendaSelectedDate?'selected':''} ${key===today()?'today':''}" data-cal-date="${key}"><span>${label}</span><strong>${date.getDate()}</strong>${count?`<small>${count} ag.</small>`:'<small>livre</small>'}</button>`}).join('');
  }
  function shiftAgenda(delta){
    if(agendaViewMode==='month'){
      const c=parseYMD(agendaCursor);c.setMonth(c.getMonth()+delta);c.setDate(1);agendaCursor=ymd(c);agendaSelectedDate=agendaCursor;
    }else agendaSelectedDate=addDays(agendaSelectedDate,delta*7);
    renderAgenda();
  }
  function renderAgenda(){
    const d=currentData();
    if(agendaViewMode==='month'&&!agendaSelectedDate.startsWith(agendaCursor.slice(0,7))) agendaSelectedDate=agendaCursor;
    const selected=appointmentsForDate(d,agendaSelectedDate);
    const title=agendaViewMode==='month'?monthTitle(agendaCursor):`${fmtDate(weekStart(agendaSelectedDate))} – ${fmtDate(addDays(weekStart(agendaSelectedDate),6))}`;
    view.innerHTML=`${learnGuide('agenda')}<div class="section-title"><h2>Agenda</h2><button class="btn primary" id="addA">+ Novo</button></div>
      <section class="calendar card">
        <div class="calendar-toolbar"><button class="calendar-arrow" id="calPrev" aria-label="Anterior">‹</button><strong>${title}</strong><button class="calendar-arrow" id="calNext" aria-label="Próximo">›</button></div>
        <div class="calendar-actions"><div class="view-toggle"><button type="button" class="${agendaViewMode==='month'?'active':''}" id="monthView">Mês</button><button type="button" class="${agendaViewMode==='week'?'active':''}" id="weekView">Semana</button></div><button type="button" class="btn ghost compact" id="goToday">Hoje</button></div>
        ${agendaViewMode==='month'?`<div class="calendar-weekdays"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="calendar-grid">${renderMonthGrid(d)}</div>`:`<div class="week-grid">${renderWeekGrid(d)}</div>`}
      </section>
      <div class="section-title"><h2>${agendaSelectedDate===today()?'Hoje':fmtDate(agendaSelectedDate)}</h2><span class="muted">${selected.length} atendimento(s)</span></div>
      <div class="list">${selected.length?selected.map(a=>appointmentCard(a,d)).join(''):'<div class="item empty-day"><p>Nenhum atendimento neste dia.</p><button class="btn secondary" id="addSelectedDay">+ Agendar neste dia</button></div>'}</div>`;
    $('#addA').onclick=renderNewAppointment;$('#calPrev').onclick=()=>shiftAgenda(-1);$('#calNext').onclick=()=>shiftAgenda(1);
    $('#monthView').onclick=()=>{agendaViewMode='month';agendaCursor=`${agendaSelectedDate.slice(0,7)}-01`;renderAgenda()};
    $('#weekView').onclick=()=>{agendaViewMode='week';renderAgenda()};
    $('#goToday').onclick=()=>{resetAgendaPosition();renderAgenda()};
    document.querySelectorAll('[data-cal-date]').forEach(b=>b.onclick=()=>{agendaSelectedDate=b.dataset.calDate;if(agendaViewMode==='month')agendaCursor=`${agendaSelectedDate.slice(0,7)}-01`;renderAgenda()});
    if($('#addSelectedDay'))$('#addSelectedDay').onclick=()=>renderNewAppointment(agendaSelectedDate);
    bindAppointmentActions();bindLearnGuide();
  }

  function renderNewAppointment(initialDate=agendaSelectedDate||today()){
    const d=currentData();
    if(!d.clients.length){view.innerHTML=`${learnGuide('new')}<div class="card"><h2>Primeiro cadastre um cliente</h2><p class="muted">O agendamento precisa estar ligado a um cliente.</p><button class="btn primary" id="goClient">Cadastrar cliente</button></div>`;$('#goClient').onclick=()=>renderClientForm();bindLearnGuide();return}
    view.innerHTML=`${learnGuide('new')}<div class="section-title"><h2>Novo agendamento</h2></div><form class="form card" id="apptForm">
      <div class="field"><label>Cliente</label><select id="clientId" required>${d.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Serviço</label><select id="serviceId" required>${d.services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Valor deste atendimento</label><input id="price" inputmode="decimal" type="number" step="0.01" min="0" required><div class="help">O valor padrão é preenchido automaticamente, mas pode ser alterado somente para este agendamento.</div></div>
      <div class="field"><label>Data</label><input id="date" type="date" required value="${attr(initialDate)}"></div>
      <div class="field"><label>Horário</label><input id="time" type="time" required value="14:00"></div>
      <div class="field"><label>Observação (opcional)</label><textarea id="notes" placeholder="Ex.: prefere pressão leve"></textarea></div>
      <button class="btn primary block">Salvar agendamento</button></form>`;
    const serviceSel=$('#serviceId'), price=$('#price');const fill=()=>price.value=d.services.find(s=>s.id===serviceSel.value)?.price??0;fill();serviceSel.onchange=fill;
    $('#apptForm').onsubmit=async e=>{e.preventDefault();const s=d.services.find(x=>x.id===serviceSel.value);const entered=Number(price.value);const a={id:uid(),clientId:$('#clientId').value,serviceId:s.id,serviceName:s.name,defaultPrice:Number(s.price),price:entered,date:$('#date').value,time:$('#time').value,notes:$('#notes').value.trim(),confirmed:false,paymentStatus:'pendente',paymentMethod:'',status:'agendado',createdAt:new Date().toISOString()};d.appointments.push(a);log('Agendamento criado',`${s.name} • padrão ${money(s.price)} • cobrado ${money(entered)}`);if(entered!==Number(s.price))log('Valor alterado no agendamento',`${s.name}: ${money(s.price)} → ${money(entered)}`);agendaSelectedDate=a.date;agendaCursor=`${a.date.slice(0,7)}-01`;await persistCurrent();renderAgenda()};
    bindLearnGuide();
  }

  function renderAppointment(id){
    const d=currentData(),a=d.appointments.find(x=>x.id===id);if(!a)return renderAgenda();const c=d.clients.find(x=>x.id===a.clientId);
    view.innerHTML=`${learnGuide('appointment')}<div class="card"><h2>${esc(c?.name||'Cliente')}</h2><p><strong>${esc(a.serviceName)}</strong></p><p>${fmtDate(a.date)} às ${a.time}</p><p>Valor padrão: ${money(a.defaultPrice)}</p><p><strong>Valor combinado: ${money(a.price)}</strong></p>${a.notes?`<p class="muted">${esc(a.notes)}</p>`:''}<div class="actions"><button class="btn secondary" id="toggleConfirm" ${a.confirmed?'disabled':''}>${a.confirmed?'✓ Confirmado':'Marcar confirmado'}</button><button class="btn primary" id="pay">${a.paymentStatus==='pago'?'✓ Pagamento registrado':'Registrar pagamento'}</button><button class="btn danger" id="cancel">Cancelar atendimento</button></div></div><div class="actions" style="margin-top:12px"><button class="btn ghost" id="backAgenda">← Agenda</button></div>`;
    $('#toggleConfirm').onclick=async()=>{a.confirmed=true;log('Confirmação registrada',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();renderAppointment(id)};
    $('#pay').onclick=()=>paymentModal(a,c);
    $('#cancel').onclick=async()=>{if(confirm('Cancelar este atendimento? O registro será preservado no histórico.')){a.status='cancelado';log('Atendimento cancelado',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();renderAgenda()}};
    $('#backAgenda').onclick=renderAgenda;bindLearnGuide();
  }

  function paymentModal(a,c){
    modal.innerHTML=`<form class="modal-body" id="payForm"><h3>Registrar pagamento</h3><p>${esc(c?.name||'Cliente')} • ${money(a.price)}</p><div class="field"><label>Forma</label><select id="payMethod"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></div><div class="actions"><button class="btn ghost" type="button" id="closePay">Cancelar</button><button class="btn primary">Confirmar pagamento</button></div></form>`;modal.showModal();$('#closePay').onclick=()=>modal.close();$('#payForm').onsubmit=async e=>{e.preventDefault();a.paymentStatus='pago';a.paymentMethod=$('#payMethod').value;a.paidAt=new Date().toISOString();log('Pagamento registrado',`${c?.name||''} • ${money(a.price)} • ${a.paymentMethod}`);await persistCurrent();modal.close();renderAppointment(a.id)}
  }

  function renderClients(){
    const d=currentData();
    view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>Clientes</h2><button class="btn primary" id="newClient">+ Cadastrar</button></div><div class="list">${d.clients.length?[...d.clients].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<div class="item"><div class="item-row"><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Sem telefone')}</p></div><button class="btn ghost" data-client="${c.id}">Abrir</button></div></div>`).join(''):'<div class="item"><p>Nenhum cliente cadastrado.</p></div>'}</div>`;
    $('#newClient').onclick=()=>renderClientForm();document.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>renderClient(b.dataset.client));bindLearnGuide();
  }
  function renderClientForm(existing=null){
    const d=currentData();
    view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>${existing?'Editar cliente':'Novo cliente'}</h2></div><form class="form card" id="clientForm"><div class="field"><label>Nome</label><input id="cName" required value="${attr(existing?.name||'')}"></div><div class="field"><label>Telefone</label><input id="cPhone" inputmode="tel" value="${attr(existing?.phone||'')}"></div><div class="field"><label>Aniversário</label><input id="cBirth" type="date" value="${attr(existing?.birth||'')}"></div><div class="field"><label>Preferências / observações</label><textarea id="cNotes">${esc(existing?.notes||'')}</textarea></div><button class="btn primary block">Salvar cliente</button></form>`;
    $('#clientForm').onsubmit=async e=>{e.preventDefault();const obj=existing||{id:uid(),createdAt:new Date().toISOString()};obj.name=$('#cName').value.trim();obj.phone=$('#cPhone').value.trim();obj.birth=$('#cBirth').value;obj.notes=$('#cNotes').value.trim();if(!existing)d.clients.push(obj);log(existing?'Cliente atualizado':'Cliente cadastrado',obj.name);await persistCurrent();renderClients()};bindLearnGuide();
  }
  function renderClient(id){
    const d=currentData(),c=d.clients.find(x=>x.id===id);if(!c)return renderClients();const hist=d.appointments.filter(a=>a.clientId===id).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    view.innerHTML=`${learnGuide('clients')}<div class="card"><div class="item-row"><div><h2>${esc(c.name)}</h2><p>${esc(c.phone||'Sem telefone')}</p></div><button class="btn ghost" id="editClient">Editar</button></div>${c.notes?`<p class="muted">${esc(c.notes)}</p>`:''}</div><div class="section-title"><h2>Histórico</h2></div><div class="list">${hist.length?hist.map(a=>`<div class="item"><h3>${fmtDate(a.date)} • ${esc(a.serviceName)}</h3><p>${money(a.price)} • ${a.paymentStatus==='pago'?'Pago':'A receber'}${a.status==='cancelado'?' • Cancelado':''}</p></div>`).join(''):'<div class="item"><p>Sem atendimentos registrados.</p></div>'}</div>`;$('#editClient').onclick=()=>renderClientForm(c);bindLearnGuide();
  }

  function reminderAppointments(d=currentData()){
    const now=new Date();const limit=new Date();limit.setDate(limit.getDate()+Number(d.settings.reminderDays||1));
    return d.appointments.filter(a=>{if(a.confirmed||a.status==='cancelado')return false;const appt=new Date(`${a.date}T${a.time}:00`);return appt>=now&&appt<=limit}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  }
  function renderReminders(){
    const d=currentData(),list=reminderAppointments(d);
    view.innerHTML=`${learnGuide('reminders')}<div class="section-title"><h2>Lembretes de confirmação</h2></div><div class="notice">O aplicativo apenas lembra. O contato com o cliente é feito fora do sistema.</div><div class="list" style="margin-top:12px">${list.length?list.map(a=>{const c=d.clients.find(x=>x.id===a.clientId);return `<div class="item"><h3>${esc(c?.name||'Cliente')}</h3><p>${fmtDate(a.date)} às ${a.time} • ${esc(a.serviceName)}</p><button class="btn primary" data-remind-confirm="${a.id}">✓ Confirmação realizada</button></div>`}).join(''):'<div class="item"><p>Nenhum lembrete pendente.</p></div>'}</div>`;
    document.querySelectorAll('[data-remind-confirm]').forEach(b=>b.onclick=async()=>{const a=d.appointments.find(x=>x.id===b.dataset.remindConfirm);a.confirmed=true;log('Confirmação registrada',`${a.serviceName} • ${fmtDate(a.date)}`);await persistCurrent();renderReminders()});bindLearnGuide();
  }

  function renderAdmin(){const month=today().slice(0,7);const monthA=state.appointments.filter(a=>a.date.startsWith(month)&&a.status!=='cancelado');const revenue=monthA.filter(a=>a.paymentStatus==='pago').reduce((s,a)=>s+Number(a.price||0),0);view.innerHTML=`<section class="hero"><h1>Administração</h1><p>Configurações, acompanhamento e backups.</p></section><div class="grid"><div class="card"><div class="muted">Clientes</div><div class="kpi">${state.clients.length}</div></div><div class="card"><div class="muted">Recebido no mês</div><div class="kpi">${money(revenue)}</div></div></div><div class="admin-grid" style="margin-top:14px"><button class="admin-tile" id="admServices"><strong>🧴 Serviços e preços</strong><span class="muted">Alterar preços padrão e cadastrar serviços.</span></button><button class="admin-tile" id="admLogs"><strong>📜 Histórico</strong><span class="muted">Ver alterações feitas no sistema.</span></button><button class="admin-tile" id="admBackup"><strong>💾 Backup</strong><span class="muted">Exportar, importar e preparar Google Drive.</span></button><button class="admin-tile" id="admSettings"><strong>🔐 Configurações</strong><span class="muted">PIN e antecedência dos lembretes.</span></button></div><div class="actions" style="margin-top:16px"><button class="btn ghost" id="adminExit">Sair da Administração</button></div>`;$('#admServices').onclick=renderServices;$('#admLogs').onclick=renderLogs;$('#admBackup').onclick=renderBackup;$('#admSettings').onclick=renderSettings;$('#adminExit').onclick=renderModePicker}

  function renderServices(){view.innerHTML=`<div class="section-title"><h2>Serviços e preços padrão</h2><button class="btn primary" id="addService">+ Serviço</button></div><div class="list">${state.services.map(s=>`<div class="item"><div class="item-row"><div><h3>${esc(s.name)}</h3><p>${money(s.price)} • ${s.duration} min</p></div><button class="btn ghost" data-service="${s.id}">Editar</button></div></div>`).join('')}</div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;$('#addService').onclick=()=>serviceModal();$('#backAdmin').onclick=renderAdmin;document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>serviceModal(state.services.find(s=>s.id===b.dataset.service)))}
  function serviceModal(s=null){modal.innerHTML=`<form class="modal-body" id="serviceForm"><h3>${s?'Editar serviço':'Novo serviço'}</h3><div class="field"><label>Nome</label><input id="sName" required value="${attr(s?.name||'')}"></div><div class="field"><label>Preço padrão</label><input id="sPrice" type="number" min="0" step="0.01" required value="${s?.price??''}"></div><div class="field"><label>Duração (minutos)</label><input id="sDuration" type="number" min="5" step="5" required value="${s?.duration??60}"></div><div class="actions"><button class="btn ghost" type="button" id="closeService">Cancelar</button><button class="btn primary">Salvar</button></div></form>`;modal.showModal();$('#closeService').onclick=()=>modal.close();$('#serviceForm').onsubmit=async e=>{e.preventDefault();const obj=s||{id:uid()};obj.name=$('#sName').value.trim();obj.price=Number($('#sPrice').value);obj.duration=Number($('#sDuration').value);if(!s)state.services.push(obj);log(s?'Serviço atualizado':'Serviço cadastrado',`${obj.name} • ${money(obj.price)}`,'Administração');await save();modal.close();renderServices()}}

  function renderLogs(){view.innerHTML=`<div class="section-title"><h2>Histórico de alterações</h2></div><div class="table-wrap card"><table class="table"><thead><tr><th>Data</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${[...state.logs].reverse().map(l=>`<tr><td>${new Date(l.at).toLocaleString('pt-BR')}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.details||'')}</td></tr>`).join('')||'<tr><td colspan="4">Sem registros.</td></tr>'}</tbody></table></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;$('#backAdmin').onclick=renderAdmin}

  function renderBackup(){view.innerHTML=`<div class="section-title"><h2>Backup e sincronização</h2></div><div class="card"><h3>Backup local</h3><p class="muted">Baixe um arquivo de segurança com todos os dados deste aparelho.</p><div class="actions"><button class="btn primary" id="exportBtn">Exportar backup</button><label class="btn ghost" style="display:inline-flex;align-items:center">Importar backup<input id="importFile" type="file" accept="application/json" hidden></label></div></div><div class="card" style="margin-top:12px"><h3>Google Drive</h3><p class="muted">Esta versão está preparada para integração, mas a conexão real exige OAuth/credenciais do projeto Google. Não colocamos chaves fixas no PWA por segurança.</p><p><strong>Status:</strong> ${state.settings.driveConnected?'Preparado/ativado manualmente':'Não configurado'}</p><button class="btn secondary" id="drivePrep">Marcar integração preparada</button></div><div class="card" style="margin-top:12px"><h3>E-mail</h3><p class="muted">O recomendado é enviar apenas um aviso de backup concluído, mantendo o arquivo completo no Drive ou em local seguro.</p><button class="btn ghost" id="emailDraft">Criar aviso por e-mail</button></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#exportBtn').onclick=exportBackup;$('#importFile').onchange=importBackup;$('#drivePrep').onclick=async()=>{state.settings.driveConnected=true;log('Integração com Drive marcada como preparada','Ainda exige configuração OAuth real','Administração');await save();renderBackup()};$('#emailDraft').onclick=()=>{const subject=encodeURIComponent('Backup Yolanda Massoterapeuta concluído');const body=encodeURIComponent(`Backup concluído em ${new Date().toLocaleString('pt-BR')}\nClientes: ${state.clients.length}\nAtendimentos: ${state.appointments.length}\n\nArquivo completo mantido no local de backup configurado.`);location.href=`mailto:?subject=${subject}&body=${body}`};$('#backAdmin').onclick=renderAdmin}
  function exportBackup(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`yolanda-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);state.settings.lastBackup=new Date().toISOString();log('Backup exportado',a.download,'Administração');save()}
  async function importBackup(e){const f=e.target.files?.[0];if(!f)return;if(!confirm('Importar este backup substituirá os dados atuais deste aparelho. Continuar?'))return;try{const obj=JSON.parse(await f.text());if(!obj.data?.settings||!Array.isArray(obj.data.services))throw new Error('Formato inválido');state=obj.data;log('Backup importado',f.name,'Administração');await save();alert('Backup importado com sucesso.');renderBackup()}catch(err){alert('Não foi possível importar este arquivo.')};e.target.value=''}

  function renderSettings(){
    const recoveryReady=Boolean(state.settings.recoveryEmail&&state.settings.recoveryKeyHash);
    view.innerHTML=`<div class="section-title"><h2>Configurações</h2></div><form class="form card" id="settingsForm"><div class="field"><label>PIN da Administração</label><input id="newPin" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" value="${attr(state.settings.adminPin)}" required><div class="help">Use de 4 a 8 números.</div></div><div class="field"><label>E-mail de recuperação</label><input id="recoveryEmailSetting" type="email" value="${attr(state.settings.recoveryEmail||'')}" placeholder="seuemail@exemplo.com"><div class="help">A chave de recuperação poderá ser enviada e guardada nesse e-mail.</div></div><div class="field"><label>Mostrar lembrete de confirmação com antecedência de</label><select id="reminderDays"><option value="1" ${state.settings.reminderDays==1?'selected':''}>1 dia</option><option value="2" ${state.settings.reminderDays==2?'selected':''}>2 dias</option><option value="3" ${state.settings.reminderDays==3?'selected':''}>3 dias</option></select></div><button class="btn primary">Salvar configurações</button></form><div class="card" style="margin-top:12px"><h3>Recuperação por e-mail</h3><p class="muted">Status: <strong>${recoveryReady?'Configurada':'Ainda não configurada'}</strong></p><p class="help">Depois de salvar o e-mail, gere uma chave. O aplicativo abrirá um e-mail com essa chave para você guardar. Se esquecer o PIN, serão exigidos o e-mail e a chave.</p><button class="btn secondary" id="generateRecoveryKey">${recoveryReady?'Renovar chave de recuperação':'Gerar chave de recuperação'}</button></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#settingsForm').onsubmit=async e=>{e.preventDefault();const pin=$('#newPin').value;const nextEmail=normalizeEmail($('#recoveryEmailSetting').value);if(!/^\d{4,8}$/.test(pin)){alert('Use um PIN de 4 a 8 números.');return}if(nextEmail&&!validEmail(nextEmail)){alert('Informe um e-mail válido.');return}const previousEmail=normalizeEmail(state.settings.recoveryEmail);state.settings.adminPin=pin;state.settings.reminderDays=Number($('#reminderDays').value);state.settings.recoveryEmail=nextEmail;if(previousEmail!==nextEmail)state.settings.recoveryKeyHash='';log('Configurações alteradas',previousEmail!==nextEmail?'PIN, lembretes/e-mail atualizados; chave anterior invalidada':'PIN/lembretes atualizados','Administração');await save();alert(nextEmail&&!state.settings.recoveryKeyHash?'Configurações salvas. Agora gere uma chave de recuperação.':'Configurações salvas.');renderSettings()};
    $('#generateRecoveryKey').onclick=generateRecoveryKey;
    $('#backAdmin').onclick=renderAdmin;
  }

  async function generateRecoveryKey(){
    const email=normalizeEmail(state.settings.recoveryEmail);
    if(!email){alert('Primeiro informe e salve o e-mail de recuperação.');return}
    if(!validEmail(email)){alert('O e-mail de recuperação salvo não é válido.');return}
    const key=makeRecoveryKey();state.settings.recoveryKeyHash=await hashText(key);log('Chave de recuperação criada',`Chave associada ao e-mail ${maskEmail(email)}`,'Administração');await save();showRecoveryKeyModal(key,email);
  }

  function showRecoveryKeyModal(key,email){
    modal.innerHTML=`<div class="modal-body"><h3>Guarde sua chave de recuperação</h3><div class="notice"><strong>${esc(key)}</strong></div><p class="help">Esta chave é necessária junto com o e-mail cadastrado caso você esqueça o PIN. Guarde-a no seu e-mail e não compartilhe com outras pessoas.</p><div class="actions"><button type="button" class="btn primary" id="sendRecoveryEmail">Criar e-mail com a chave</button><button type="button" class="btn ghost" id="closeRecoveryKey">Fechar</button></div></div>`;
    modal.showModal();
    $('#sendRecoveryEmail').onclick=()=>{const subject=encodeURIComponent('Chave de recuperação — Yolanda Massoterapeuta');const body=encodeURIComponent(`Chave de recuperação do painel administrativo:

${key}

Guarde este e-mail em local seguro. Se esquecer o PIN, use o e-mail cadastrado e esta chave para criar um novo PIN.

Não compartilhe esta chave.`);location.href=`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`};
    $('#closeRecoveryKey').onclick=()=>{modal.close();renderSettings()};
  }

  nav.addEventListener('click',e=>{const b=e.target.closest('button[data-nav]');if(!b)return;const n=b.dataset.nav;if(n==='home')renderHome();if(n==='agenda')renderAgenda();if(n==='new')renderNewAppointment();if(n==='clients')renderClients();if(n==='reminders')renderReminders()});
  function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))} function attr(v){return esc(v)}

  (async()=>{state=await load();updateBadge();renderModePicker();if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{})})();
})();
