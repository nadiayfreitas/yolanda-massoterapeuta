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
    settings:{adminPin:'9186', pinSchema:2, reminderDays:1, localHolidayLines:'', notifyAgendaEnabled:true, notifyAgendaMinutes:30, notifyConfirmationEnabled:true, notifyConfirmationHour:'09:00', pushEnabled:false, pushToken:'', pushLastRegisteredAt:null, pushLastError:'', driveConnected:false, driveEndpoint:'', driveBackupKey:'', driveAutoBackup:true, driveBackupPending:false, driveDailyBackup:true, driveDailyTime:'23:59', driveDailyPending:false, driveDailyPendingDate:'', driveLastDailyDate:'', driveLastBackupAt:null, driveLastStatus:'not_configured', driveLastError:'', syncEnabled:true, syncPending:false, syncStatus:'not_configured', syncLastAt:null, syncLastError:'', syncRevision:0, syncJoinedAt:null, syncSettingsUpdatedAt:null, deviceId:'', deviceName:'', lastBackup:null, recoveryEmail:'', recoveryKeyHash:''},
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
    if(!out.settings.deviceId)out.settings.deviceId=uid();
    if(!out.settings.deviceName)out.settings.deviceName='Este aparelho';
    const migrateAt=out.settings.syncMigrationAt||new Date().toISOString();
    out.settings.syncMigrationAt=migrateAt;
    out.settings.syncSettingsUpdatedAt=out.settings.syncSettingsUpdatedAt||migrateAt;
    const ensureMeta=(arr, fallbackField='createdAt')=>arr.forEach(item=>{
      if(!item.id)item.id=uid();
      item.updatedAt=item.updatedAt||item[fallbackField]||migrateAt;
      item.updatedBy=item.updatedBy||out.settings.deviceId;
    });
    ensureMeta(out.services);
    ensureMeta(out.clients);
    ensureMeta(out.appointments);
    out.logs.forEach(item=>{if(!item.id)item.id=uid();item.at=item.at||migrateAt;});
    return out;
  }
  async function load(){try{const db=await dbOpen();const data=await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result||structuredClone(DEFAULT));r.onerror=()=>rej(r.error)});return normalizeState(data)}catch{const raw=localStorage.getItem(KEY);return normalizeState(raw?JSON.parse(raw):structuredClone(DEFAULT))}}
  async function writeLocalState(){state.logs=state.logs.slice(-1000);try{const db=await dbOpen();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch{localStorage.setItem(KEY,JSON.stringify(state))}updateBadge()}
  function touchRecord(obj){if(!obj)return obj;obj.updatedAt=new Date().toISOString();obj.updatedBy=state?.settings?.deviceId||'local';return obj}
  async function save(options={}){
    const realChange=currentMode!=='learn' && !options.internal;
    const queueSync=realChange && !options.skipSync && isSyncConfigured();
    const queueDrive=realChange && !options.skipAutoBackup && isDriveConfigured() && state.settings.driveAutoBackup;
    if(queueSync){state.settings.syncPending=true;state.settings.syncStatus=navigator.onLine?'pending':'offline';localChangeCounter++}
    if(queueDrive)state.settings.driveBackupPending=true;
    await writeLocalState();
    if(queueSync)scheduleSync();
    if(queueDrive)scheduleDriveBackup();
  }
  function log(action, details, actor=currentMode==='admin'?'Administração':currentMode==='learn'?'Treino (fictício)':'Yolanda'){const target=currentMode==='learn'&&trainingState?trainingState:state;target.logs.push({id:uid(),at:new Date().toISOString(),actor,device:currentMode==='learn'?'Treino':state?.settings?.deviceName||'Este aparelho',action,details})}

  const normalizeEmail=v=>String(v||'').trim().toLowerCase();
  const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
  function maskEmail(v){const e=normalizeEmail(v),[name,domain='']=e.split('@');if(!name)return '';const shown=name.length<=2?name[0]||'*':name.slice(0,2);return `${shown}${'*'.repeat(Math.max(2,name.length-shown.length))}@${domain}`}
  async function hashText(text){const value=String(text||'').trim().toUpperCase();if(globalThis.crypto?.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return `fallback-${(h>>>0).toString(16)}`}
  function makeRecoveryKey(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(12);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);const chars=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');return `YOLA-${chars.slice(0,4)}-${chars.slice(4,8)}-${chars.slice(8,12)}`}

  let state, currentMode=null, trainingState=null, learnVisited=new Set(), activeScreen='picker';
  let agendaViewMode='month', agendaSelectedDate=today(), agendaCursor=`${today().slice(0,7)}-01`;
  let driveBackupTimer=null, driveDailyTimer=null, driveBackupInProgress=false;
  let syncTimer=null, syncInProgress=false, localChangeCounter=0, periodicSyncTimer=null;
  const DRIVE_BACKUP_DELAY=12000;
  const SYNC_DELAY=1800, SYNC_POLL_MS=30000;
  const DAILY_BACKUP_HOUR=23, DAILY_BACKUP_MINUTE=59;

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
    const s=state?.settings||{};
    if(!navigator.onLine){
      const pending=s.syncPending||s.driveBackupPending;
      badge.textContent=pending?'● Offline • alterações salvas':'● Offline • salvo no aparelho';
      badge.className='sync-badge warn';return
    }
    if(syncInProgress){badge.textContent='● Sincronizando…';badge.className='sync-badge warn';return}
    if(isSyncConfigured()){
      if(s.syncStatus==='error'){badge.textContent='● Sincronização • verificar';badge.className='sync-badge warn';return}
      if(s.syncPending){badge.textContent='● Alterações pendentes';badge.className='sync-badge warn';return}
      badge.textContent='● Sincronizado';badge.className='sync-badge ok';return
    }
    if(isDriveConfigured()){
      if(driveBackupInProgress){badge.textContent='● Drive • enviando backup';badge.className='sync-badge warn';return}
      if(s.driveBackupPending){badge.textContent='● Drive • backup pendente';badge.className='sync-badge warn';return}
      badge.textContent='● Drive • backup ativo';badge.className='sync-badge ok';return
    }
    badge.textContent='● Online • somente local';badge.className='sync-badge ok';
  }
  addEventListener('online',()=>{updateBadge();if(state?.settings?.syncPending||isSyncConfigured())scheduleSync(500);if(state?.settings?.driveBackupPending)scheduleDriveBackup(1300);scheduleDailyClosingBackup()});
  addEventListener('offline',updateBadge);
  addEventListener('focus',()=>{scheduleDailyClosingBackup();if(isSyncConfigured())scheduleSync(500)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleDailyClosingBackup();if(isSyncConfigured())scheduleSync(500)}});

  function setMode(mode){
    currentMode=mode;
    nav.classList.toggle('hidden',!['daily','learn'].includes(mode));
    modeLabel.textContent=mode==='learn'?'Modo Aprender':mode==='daily'?'Agenda de Atendimentos':mode==='admin'?'Administração':'Escolha um modo';
    if(mode==='learn'){trainingState=buildTrainingState();learnVisited=new Set();resetAgendaPosition();renderHome()}
    else if(mode==='daily'){resetAgendaPosition();renderHome()}
    else if(mode==='admin')renderAdmin();
    else renderModePicker();
    updateBadge();
  }

  function renderModePicker(){
    activeScreen='picker';
    currentMode=null;nav.classList.add('hidden');modeLabel.textContent='Escolha um modo';updateBadge();
    view.innerHTML=`<section class="hero hero-brand"><img src="icons/icon-192.png" alt="Logo Yolanda" class="hero-logo"><h1>Olá, Yolanda 🌷</h1><p>Escolha como deseja entrar no aplicativo.</p></section>
      <div class="grid">
        <button class="big-choice" id="learnBtn"><span class="emoji">🎓</span><strong>Modo Aprender</strong><small>Treine sem mexer em clientes, agenda ou valores reais.</small></button>
        <button class="big-choice" id="dailyBtn"><span class="emoji">🗓️</span><strong>Agenda de Atendimentos</strong><small>Agenda, clientes, atendimentos, recebimentos e lembretes do dia a dia.</small></button>
        <button class="big-choice" id="adminBtn"><span class="emoji">⚙️</span><strong>Administração</strong><small>Configurações, serviços, histórico, sincronização e backups.</small></button>
      </div>`;
    $('#learnBtn').onclick=()=>setMode('learn'); $('#dailyBtn').onclick=()=>setMode('daily'); $('#adminBtn').onclick=askAdminPin;
  }

  function askAdminPin(){
    modal.innerHTML=`<form class="modal-body" id="pinForm"><h3>Acesso à Administração</h3><div class="field"><label>PIN</label><input id="pin" inputmode="numeric" type="password" maxlength="8" pattern="[0-9]{4,8}" autocomplete="off" required></div><p class="help">Por segurança, o aplicativo não exibe o PIN atual nesta tela.</p><div class="actions"><button type="button" class="btn ghost" id="pinCancel">Cancelar</button><button type="button" class="btn ghost" id="forgotPin">Esqueci meu PIN</button><button class="btn primary">Entrar</button></div></form>`;
    modal.showModal();
    $('#pinCancel').onclick=()=>modal.close();
    $('#forgotPin').onclick=renderPinRecovery;
    $('#pinForm').addEventListener('submit',e=>{e.preventDefault();if($('#pin').value===state.settings.adminPin){modal.close();setMode('admin')}else alert('PIN incorreto.')});
  }

  function renderPinRecovery(){
    const email=normalizeEmail(state.settings.recoveryEmail);
    if(!email||!state.settings.recoveryKeyHash){
      modal.innerHTML=`<div class="modal-body"><h3>Recuperação do PIN</h3><div class="notice">A recuperação por e-mail ainda não foi configurada neste aparelho.</div><p class="help">Para manter a segurança, o PIN atual não é exibido. Se necessário, entre na Administração usando o PIN conhecido e depois cadastre um e-mail e gere a chave de recuperação.</p><div class="actions"><button type="button" class="btn ghost" id="recoveryBack">Voltar</button></div></div>`;
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
    home:['1 de 5 • Início','Esta é a mesma tela da Agenda de Atendimentos. Aqui você vê os atendimentos de hoje, o valor recebido e os lembretes. Os nomes e valores deste treino são fictícios.'],
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
    activeScreen='home';
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
    document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=async()=>{const d=currentData(),a=d.appointments.find(x=>x.id===b.dataset.confirm);if(!a)return;a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${a.serviceName} em ${fmtDate(a.date)} ${a.time}`);await persistCurrent();renderHome()})
  }

  function easterDate(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day,12,0,0,0);
  }
  const holidayCache=new Map();
  function parseLocalHolidayLines(lines){
    return String(lines||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
      const parts=line.split('|');
      if(parts.length>=2)return {md:parts[0].trim(),name:parts.slice(1).join('|').trim()};
      const m=line.match(/^(\d{2}-\d{2})\s+(.+)$/);
      return m?{md:m[1],name:m[2].trim()}:null;
    }).filter(x=>x&&/^\d{2}-\d{2}$/.test(x.md)&&x.name);
  }
  function addHoliday(map,date,name,scope){
    if(!map.has(date))map.set(date,[]);
    map.get(date).push({name,scope});
  }
  function holidayMapForYear(year, localLines=''){
    const key=`${year}::${localLines}`;
    if(holidayCache.has(key))return holidayCache.get(key);
    const map=new Map();
    const fixedNational=[['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência do Brasil'],['10-12','Nossa Senhora Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']];
    fixedNational.forEach(([md,name])=>addHoliday(map,`${year}-${md}`,name,'nacional'));
    addHoliday(map,`${year}-07-09`,'Revolução Constitucionalista','estadual • SP');
    const easter=easterDate(year);
    const goodFriday=new Date(easter); goodFriday.setDate(easter.getDate()-2);
    addHoliday(map, ymd(goodFriday), 'Paixão de Cristo', 'nacional');
    parseLocalHolidayLines(localLines).forEach(item=>addHoliday(map,`${year}-${item.md}`,item.name,'local • Dumont/SP'));
    holidayCache.set(key,map);
    return map;
  }
  function holidayInfo(dateValue,d=currentData()){
    const date=parseYMD(dateValue);const map=holidayMapForYear(date.getFullYear(), d?.settings?.localHolidayLines||'');
    return map.get(dateValue)||[];
  }
  function holidaySummary(entries){
    return (entries||[]).map(h=>`${h.name} (${h.scope})`).join(' • ');
  }
  function monthTitle(value){return parseYMD(value).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}

  function appointmentsForDate(d,date){return d.appointments.filter(a=>a.date===date&&a.status!=='cancelado').sort((a,b)=>a.time.localeCompare(b.time))}
  function renderMonthGrid(d){
    const cursor=parseYMD(agendaCursor);const y=cursor.getFullYear(),m=cursor.getMonth();const first=new Date(y,m,1,12);const lastDay=new Date(y,m+1,0,12).getDate();let html='';
    for(let i=0;i<first.getDay();i++)html+='<div class="calendar-empty" aria-hidden="true"></div>';
    for(let day=1;day<=lastDay;day++){
      const key=ymd(new Date(y,m,day,12));const count=appointmentsForDate(d,key).length;const selected=key===agendaSelectedDate;const isToday=key===today();const holidays=holidayInfo(key,d);const holidayText=holidaySummary(holidays);
      html+=`<button type="button" class="calendar-day ${selected?'selected':''} ${isToday?'today':''} ${holidays.length?'holiday':''}" data-cal-date="${key}" aria-label="${day}${holidayText?`, ${holidayText}`:''}, ${count} atendimento(s)"><span class="calendar-number">${day}</span><div class="calendar-meta">${count?`<span class="calendar-count">${count}</span><span class="calendar-dot"></span>`:''}${holidays.length?`<span class="calendar-holiday" title="${esc(holidayText)}">✦</span>`:''}${!count&&!holidays.length?'<span class="calendar-space"></span>':''}</div></button>`;
    }
    return html;
  }
  function weekStart(value){const d=parseYMD(value);d.setDate(d.getDate()-d.getDay());return ymd(d)}
  function renderWeekGrid(d){
    const start=weekStart(agendaSelectedDate);const labels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return labels.map((label,i)=>{const key=addDays(start,i),date=parseYMD(key),count=appointmentsForDate(d,key).length,holidays=holidayInfo(key,d);return `<button type="button" class="week-day ${key===agendaSelectedDate?'selected':''} ${key===today()?'today':''} ${holidays.length?'holiday':''}" data-cal-date="${key}"><span>${label}</span><strong>${date.getDate()}</strong>${holidays.length?`<small class="holiday-mini">feriado</small>`:(count?`<small>${count} ag.</small>`:'<small>livre</small>')}</button>`}).join('');
  }
  function shiftAgenda(delta){
    if(agendaViewMode==='month'){
      const c=parseYMD(agendaCursor);c.setMonth(c.getMonth()+delta);c.setDate(1);agendaCursor=ymd(c);agendaSelectedDate=agendaCursor;
    }else agendaSelectedDate=addDays(agendaSelectedDate,delta*7);
    renderAgenda();
  }
  function renderAgenda(){
    activeScreen='agenda';
    const d=currentData();
    if(agendaViewMode==='month'&&!agendaSelectedDate.startsWith(agendaCursor.slice(0,7))) agendaSelectedDate=agendaCursor;
    const selected=appointmentsForDate(d,agendaSelectedDate);
    const title=agendaViewMode==='month'?monthTitle(agendaCursor):`${fmtDate(weekStart(agendaSelectedDate))} – ${fmtDate(addDays(weekStart(agendaSelectedDate),6))}`;
    const holidayEntries=holidayInfo(agendaSelectedDate,d);
    const holidayNotice=holidayEntries.length?`<div class=\"notice holiday-notice\">🎉 <strong>Feriado:</strong> ${esc(holidaySummary(holidayEntries))}</div>`:'';
    view.innerHTML=`${learnGuide('agenda')}<div class="section-title"><h2>Agenda</h2><button class="btn primary" id="addA">+ Novo</button></div>
      <section class="calendar card">
        <div class="calendar-toolbar"><button class="calendar-arrow" id="calPrev" aria-label="Anterior">‹</button><strong>${title}</strong><button class="calendar-arrow" id="calNext" aria-label="Próximo">›</button></div>
        <div class="calendar-actions"><div class="view-toggle"><button type="button" class="${agendaViewMode==='month'?'active':''}" id="monthView">Mês</button><button type="button" class="${agendaViewMode==='week'?'active':''}" id="weekView">Semana</button></div><button type="button" class="btn ghost compact" id="goToday">Hoje</button></div>
        ${agendaViewMode==='month'?`<div class="calendar-weekdays"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="calendar-grid">${renderMonthGrid(d)}</div>`:`<div class="week-grid">${renderWeekGrid(d)}</div>`}
      </section>
      <div class="help" style="margin-top:8px">Feriados automáticos: nacionais e do Estado de São Paulo. Os feriados locais de Dumont podem ser cadastrados em Administração → Configurações.</div>
      ${holidayNotice}
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
    activeScreen='newAppointment';
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
    $('#apptForm').onsubmit=async e=>{e.preventDefault();const s=d.services.find(x=>x.id===serviceSel.value);const entered=Number(price.value);const a={id:uid(),clientId:$('#clientId').value,serviceId:s.id,serviceName:s.name,defaultPrice:Number(s.price),price:entered,date:$('#date').value,time:$('#time').value,notes:$('#notes').value.trim(),confirmed:false,paymentStatus:'pendente',paymentMethod:'',status:'agendado',createdAt:new Date().toISOString()};touchRecord(a);d.appointments.push(a);log('Agendamento criado',`${s.name} • padrão ${money(s.price)} • cobrado ${money(entered)}`);if(entered!==Number(s.price))log('Valor alterado no agendamento',`${s.name}: ${money(s.price)} → ${money(entered)}`);agendaSelectedDate=a.date;agendaCursor=`${a.date.slice(0,7)}-01`;await persistCurrent();renderAgenda()};
    bindLearnGuide();
  }

  function renderAppointment(id){
    activeScreen='appointment';
    const d=currentData(),a=d.appointments.find(x=>x.id===id);if(!a)return renderAgenda();const c=d.clients.find(x=>x.id===a.clientId);
    view.innerHTML=`${learnGuide('appointment')}<div class="card"><h2>${esc(c?.name||'Cliente')}</h2><p><strong>${esc(a.serviceName)}</strong></p><p>${fmtDate(a.date)} às ${a.time}</p><p>Valor padrão: ${money(a.defaultPrice)}</p><p><strong>Valor combinado: ${money(a.price)}</strong></p>${a.notes?`<p class="muted">${esc(a.notes)}</p>`:''}<div class="actions"><button class="btn secondary" id="toggleConfirm" ${a.confirmed?'disabled':''}>${a.confirmed?'✓ Confirmado':'Marcar confirmado'}</button><button class="btn primary" id="pay">${a.paymentStatus==='pago'?'✓ Pagamento registrado':'Registrar pagamento'}</button><button class="btn danger" id="cancel">Cancelar atendimento</button></div></div><div class="actions" style="margin-top:12px"><button class="btn ghost" id="backAgenda">← Agenda</button></div>`;
    $('#toggleConfirm').onclick=async()=>{a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();renderAppointment(id)};
    $('#pay').onclick=()=>paymentModal(a,c);
    $('#cancel').onclick=async()=>{if(confirm('Cancelar este atendimento? O registro será preservado no histórico.')){a.status='cancelado';touchRecord(a);log('Atendimento cancelado',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();renderAgenda()}};
    $('#backAgenda').onclick=renderAgenda;bindLearnGuide();
  }

  function paymentModal(a,c){
    modal.innerHTML=`<form class="modal-body" id="payForm"><h3>Registrar pagamento</h3><p>${esc(c?.name||'Cliente')} • ${money(a.price)}</p><div class="field"><label>Forma</label><select id="payMethod"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></div><div class="actions"><button class="btn ghost" type="button" id="closePay">Cancelar</button><button class="btn primary">Confirmar pagamento</button></div></form>`;modal.showModal();$('#closePay').onclick=()=>modal.close();$('#payForm').onsubmit=async e=>{e.preventDefault();a.paymentStatus='pago';a.paymentMethod=$('#payMethod').value;a.paidAt=new Date().toISOString();touchRecord(a);log('Pagamento registrado',`${c?.name||''} • ${money(a.price)} • ${a.paymentMethod}`);await persistCurrent();modal.close();renderAppointment(a.id)}
  }

  function renderClients(){
    activeScreen='clients';
    const d=currentData();
    view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>Clientes</h2><button class="btn primary" id="newClient">+ Cadastrar</button></div><div class="list">${d.clients.length?[...d.clients].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<div class="item"><div class="item-row"><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Sem telefone')}</p></div><button class="btn ghost" data-client="${c.id}">Abrir</button></div></div>`).join(''):'<div class="item"><p>Nenhum cliente cadastrado.</p></div>'}</div>`;
    $('#newClient').onclick=()=>renderClientForm();document.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>renderClient(b.dataset.client));bindLearnGuide();
  }
  function renderClientForm(existing=null){
    activeScreen='clientForm';
    const d=currentData();
    view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>${existing?'Editar cliente':'Novo cliente'}</h2></div><form class="form card" id="clientForm"><div class="field"><label>Nome</label><input id="cName" required value="${attr(existing?.name||'')}"></div><div class="field"><label>Telefone</label><input id="cPhone" inputmode="tel" value="${attr(existing?.phone||'')}"></div><div class="field"><label>Aniversário</label><input id="cBirth" type="date" value="${attr(existing?.birth||'')}"></div><div class="field"><label>Preferências / observações</label><textarea id="cNotes">${esc(existing?.notes||'')}</textarea></div><button class="btn primary block">Salvar cliente</button></form>`;
    $('#clientForm').onsubmit=async e=>{e.preventDefault();const obj=existing||{id:uid(),createdAt:new Date().toISOString()};obj.name=$('#cName').value.trim();obj.phone=$('#cPhone').value.trim();obj.birth=$('#cBirth').value;obj.notes=$('#cNotes').value.trim();touchRecord(obj);if(!existing)d.clients.push(obj);log(existing?'Cliente atualizado':'Cliente cadastrado',obj.name);await persistCurrent();renderClients()};bindLearnGuide();
  }
  function renderClient(id){
    activeScreen='client';
    const d=currentData(),c=d.clients.find(x=>x.id===id);if(!c)return renderClients();const hist=d.appointments.filter(a=>a.clientId===id).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
    view.innerHTML=`${learnGuide('clients')}<div class="card"><div class="item-row"><div><h2>${esc(c.name)}</h2><p>${esc(c.phone||'Sem telefone')}</p></div><button class="btn ghost" id="editClient">Editar</button></div>${c.notes?`<p class="muted">${esc(c.notes)}</p>`:''}</div><div class="section-title"><h2>Histórico</h2></div><div class="list">${hist.length?hist.map(a=>`<div class="item"><h3>${fmtDate(a.date)} • ${esc(a.serviceName)}</h3><p>${money(a.price)} • ${a.paymentStatus==='pago'?'Pago':'A receber'}${a.status==='cancelado'?' • Cancelado':''}</p></div>`).join(''):'<div class="item"><p>Sem atendimentos registrados.</p></div>'}</div>`;$('#editClient').onclick=()=>renderClientForm(c);bindLearnGuide();
  }

  function reminderAppointments(d=currentData()){
    const now=new Date();const limit=new Date();limit.setDate(limit.getDate()+Number(d.settings.reminderDays||1));
    return d.appointments.filter(a=>{if(a.confirmed||a.status==='cancelado')return false;const appt=new Date(`${a.date}T${a.time}:00`);return appt>=now&&appt<=limit}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  }
  function renderReminders(){
    activeScreen='reminders';
    const d=currentData(),list=reminderAppointments(d);
    view.innerHTML=`${learnGuide('reminders')}<div class="section-title"><h2>Lembretes de confirmação</h2></div><div class="notice">O aplicativo apenas lembra. O contato com o cliente é feito fora do sistema.</div><div class="list" style="margin-top:12px">${list.length?list.map(a=>{const c=d.clients.find(x=>x.id===a.clientId);return `<div class="item"><h3>${esc(c?.name||'Cliente')}</h3><p>${fmtDate(a.date)} às ${a.time} • ${esc(a.serviceName)}</p><button class="btn primary" data-remind-confirm="${a.id}">✓ Confirmação realizada</button></div>`}).join(''):'<div class="item"><p>Nenhum lembrete pendente.</p></div>'}</div>`;
    document.querySelectorAll('[data-remind-confirm]').forEach(b=>b.onclick=async()=>{const a=d.appointments.find(x=>x.id===b.dataset.remindConfirm);a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${a.serviceName} • ${fmtDate(a.date)}`);await persistCurrent();renderReminders()});bindLearnGuide();
  }

  function renderAdmin(){activeScreen='admin';const month=today().slice(0,7);const monthA=state.appointments.filter(a=>a.date.startsWith(month)&&a.status!=='cancelado');const revenue=monthA.filter(a=>a.paymentStatus==='pago').reduce((s,a)=>s+Number(a.price||0),0);view.innerHTML=`<section class="hero"><h1>Administração</h1><p>Configurações, acompanhamento e backups.</p></section><div class="grid"><div class="card"><div class="muted">Clientes</div><div class="kpi">${state.clients.length}</div></div><div class="card"><div class="muted">Recebido no mês</div><div class="kpi">${money(revenue)}</div></div></div><div class="admin-grid" style="margin-top:14px"><button class="admin-tile" id="admServices"><strong>🧴 Serviços e preços</strong><span class="muted">Alterar preços padrão e cadastrar serviços.</span></button><button class="admin-tile" id="admLogs"><strong>📜 Histórico</strong><span class="muted">Ver alterações feitas no sistema.</span></button><button class="admin-tile" id="admBackup"><strong>🔄 Sincronização e backup</strong><span class="muted">Compartilhar dados entre aparelhos e manter cópias no Google Drive.</span></button><button class="admin-tile" id="admNotifications"><strong>🔔 Notificações</strong><span class="muted">Avisos de agenda e confirmações no celular.</span></button><button class="admin-tile" id="admSettings"><strong>🔐 Configurações</strong><span class="muted">PIN, feriados e antecedência dos lembretes.</span></button></div><div class="actions" style="margin-top:16px"><button class="btn ghost" id="adminExit">Sair da Administração</button></div>`;$('#admServices').onclick=renderServices;$('#admLogs').onclick=renderLogs;$('#admBackup').onclick=renderBackup;$('#admNotifications').onclick=renderNotifications;$('#admSettings').onclick=renderSettings;$('#adminExit').onclick=renderModePicker}

  function renderServices(){activeScreen='services';view.innerHTML=`<div class="section-title"><h2>Serviços e preços padrão</h2><button class="btn primary" id="addService">+ Serviço</button></div><div class="list">${state.services.map(s=>`<div class="item"><div class="item-row"><div><h3>${esc(s.name)}</h3><p>${money(s.price)} • ${s.duration} min</p></div><button class="btn ghost" data-service="${s.id}">Editar</button></div></div>`).join('')}</div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;$('#addService').onclick=()=>serviceModal();$('#backAdmin').onclick=renderAdmin;document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>serviceModal(state.services.find(s=>s.id===b.dataset.service)))}
  function serviceModal(s=null){modal.innerHTML=`<form class="modal-body" id="serviceForm"><h3>${s?'Editar serviço':'Novo serviço'}</h3><div class="field"><label>Nome</label><input id="sName" required value="${attr(s?.name||'')}"></div><div class="field"><label>Preço padrão</label><input id="sPrice" type="number" min="0" step="0.01" required value="${s?.price??''}"></div><div class="field"><label>Duração (minutos)</label><input id="sDuration" type="number" min="5" step="5" required value="${s?.duration??60}"></div><div class="actions"><button class="btn ghost" type="button" id="closeService">Cancelar</button><button class="btn primary">Salvar</button></div></form>`;modal.showModal();$('#closeService').onclick=()=>modal.close();$('#serviceForm').onsubmit=async e=>{e.preventDefault();const obj=s||{id:uid()};obj.name=$('#sName').value.trim();obj.price=Number($('#sPrice').value);obj.duration=Number($('#sDuration').value);touchRecord(obj);if(!s)state.services.push(obj);log(s?'Serviço atualizado':'Serviço cadastrado',`${obj.name} • ${money(obj.price)}`,'Administração');await save();modal.close();renderServices()}}

  function renderLogs(){activeScreen='logs';view.innerHTML=`<div class="section-title"><h2>Histórico de alterações</h2></div><div class="table-wrap card"><table class="table"><thead><tr><th>Data</th><th>Quem</th><th>Aparelho</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${[...state.logs].reverse().map(l=>`<tr><td>${new Date(l.at).toLocaleString('pt-BR')}</td><td>${esc(l.actor)}</td><td>${esc(l.device||'—')}</td><td>${esc(l.action)}</td><td>${esc(l.details||'')}</td></tr>`).join('')||'<tr><td colspan="5">Sem registros.</td></tr>'}</tbody></table></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;$('#backAdmin').onclick=renderAdmin}

  function isDriveConfigured(){
    const s=state?.settings||{};
    return Boolean(s.driveConnected && s.driveEndpoint && s.driveBackupKey);
  }
  function normalizeDriveEndpoint(value){
    const v=String(value||'').trim();
    if(!v)return '';
    try{
      const u=new URL(v);
      if(u.protocol!=='https:' || u.hostname!=='script.google.com' || !u.pathname.includes('/macros/s/') || !u.pathname.endsWith('/exec'))return '';
      return u.toString().replace(/\/$/,'');
    }catch{return ''}
  }
  function isSyncConfigured(){
    const s=state?.settings||{};
    return Boolean(isDriveConfigured() && s.syncEnabled!==false);
  }
  function syncStatusText(){
    const s=state.settings;
    if(!isSyncConfigured())return 'Sincronização entre aparelhos desativada';
    if(!navigator.onLine)return s.syncPending?'Offline • alterações aguardando internet':'Offline • dados deste aparelho preservados';
    if(syncInProgress)return 'Sincronizando agora…';
    if(s.syncStatus==='error')return `Erro: ${s.syncLastError||'não foi possível sincronizar'}`;
    if(s.syncPending)return 'Alterações aguardando sincronização';
    if(s.syncLastAt)return `Sincronizado em ${new Date(s.syncLastAt).toLocaleString('pt-BR')}`;
    return 'Configurado • aguardando primeira sincronização';
  }
  function syncedSettingsPayload(){
    return {
      reminderDays:Number(state.settings.reminderDays||1),
      localHolidayLines:String(state.settings.localHolidayLines||''),
      notifyAgendaEnabled:state.settings.notifyAgendaEnabled!==false,
      notifyAgendaMinutes:[15,30,60].includes(Number(state.settings.notifyAgendaMinutes))?Number(state.settings.notifyAgendaMinutes):30,
      notifyConfirmationEnabled:state.settings.notifyConfirmationEnabled!==false,
      notifyConfirmationHour:/^\d{2}:\d{2}$/.test(String(state.settings.notifyConfirmationHour||''))?String(state.settings.notifyConfirmationHour):'09:00',
      updatedAt:state.settings.syncSettingsUpdatedAt||state.settings.syncMigrationAt||new Date().toISOString(),
      updatedBy:state.settings.deviceId
    };
  }
  function buildSyncPackage(){
    return {
      protocol:1,
      deviceId:state.settings.deviceId,
      deviceName:state.settings.deviceName||'Este aparelho',
      firstJoin:!state.settings.syncJoinedAt,
      baseRevision:Number(state.settings.syncRevision||0),
      sentAt:new Date().toISOString(),
      data:{
        settings:syncedSettingsPayload(),
        services:structuredClone(state.services),
        clients:structuredClone(state.clients),
        appointments:structuredClone(state.appointments),
        logs:structuredClone(state.logs)
      }
    };
  }
  function itemStamp(item, fallback=''){return String(item?.updatedAt||item?.at||item?.createdAt||fallback||'')}
  function mergeEntityArrays(localArr, remoteArr){
    const map=new Map();
    (Array.isArray(remoteArr)?remoteArr:[]).forEach(item=>map.set(item.id,structuredClone(item)));
    (Array.isArray(localArr)?localArr:[]).forEach(item=>{
      const other=map.get(item.id);
      if(!other||itemStamp(item)>itemStamp(other))map.set(item.id,structuredClone(item));
    });
    return [...map.values()];
  }
  function mergeLogArrays(localArr, remoteArr){
    const map=new Map();
    [...(Array.isArray(remoteArr)?remoteArr:[]),...(Array.isArray(localArr)?localArr:[])].forEach(item=>{if(item?.id)map.set(item.id,structuredClone(item))});
    return [...map.values()].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))).slice(-1000);
  }
  function applySyncedData(remote, counterAtStart){
    if(!remote?.data)return;
    const changedDuring=localChangeCounter!==counterAtStart;
    if(changedDuring){
      state.services=mergeEntityArrays(state.services,remote.data.services);
      state.clients=mergeEntityArrays(state.clients,remote.data.clients);
      state.appointments=mergeEntityArrays(state.appointments,remote.data.appointments);
      state.logs=mergeLogArrays(state.logs,remote.data.logs);
      const remoteSettings=remote.data.settings||{};
      if(String(remoteSettings.updatedAt||'')>String(state.settings.syncSettingsUpdatedAt||'')){
        state.settings.reminderDays=Number(remoteSettings.reminderDays||1);
        state.settings.localHolidayLines=String(remoteSettings.localHolidayLines||'');
        state.settings.notifyAgendaEnabled=remoteSettings.notifyAgendaEnabled!==false;
        state.settings.notifyAgendaMinutes=[15,30,60].includes(Number(remoteSettings.notifyAgendaMinutes))?Number(remoteSettings.notifyAgendaMinutes):30;
        state.settings.notifyConfirmationEnabled=remoteSettings.notifyConfirmationEnabled!==false;
        state.settings.notifyConfirmationHour=/^\d{2}:\d{2}$/.test(String(remoteSettings.notifyConfirmationHour||''))?String(remoteSettings.notifyConfirmationHour):'09:00';
        state.settings.syncSettingsUpdatedAt=remoteSettings.updatedAt;
      }
    }else{
      state.services=Array.isArray(remote.data.services)?structuredClone(remote.data.services):state.services;
      state.clients=Array.isArray(remote.data.clients)?structuredClone(remote.data.clients):state.clients;
      state.appointments=Array.isArray(remote.data.appointments)?structuredClone(remote.data.appointments):state.appointments;
      state.logs=Array.isArray(remote.data.logs)?structuredClone(remote.data.logs).slice(-1000):state.logs;
      const remoteSettings=remote.data.settings||{};
      if(remoteSettings.reminderDays!=null)state.settings.reminderDays=Number(remoteSettings.reminderDays||1);
      if(remoteSettings.localHolidayLines!=null)state.settings.localHolidayLines=String(remoteSettings.localHolidayLines||'');
      if(remoteSettings.notifyAgendaEnabled!=null)state.settings.notifyAgendaEnabled=remoteSettings.notifyAgendaEnabled!==false;
      if(remoteSettings.notifyAgendaMinutes!=null)state.settings.notifyAgendaMinutes=[15,30,60].includes(Number(remoteSettings.notifyAgendaMinutes))?Number(remoteSettings.notifyAgendaMinutes):30;
      if(remoteSettings.notifyConfirmationEnabled!=null)state.settings.notifyConfirmationEnabled=remoteSettings.notifyConfirmationEnabled!==false;
      if(remoteSettings.notifyConfirmationHour!=null)state.settings.notifyConfirmationHour=/^\d{2}:\d{2}$/.test(String(remoteSettings.notifyConfirmationHour||''))?String(remoteSettings.notifyConfirmationHour):'09:00';
      if(remoteSettings.updatedAt)state.settings.syncSettingsUpdatedAt=remoteSettings.updatedAt;
    }
    state.settings.syncRevision=Number(remote.revision||state.settings.syncRevision||0);
  }
  function scheduleSync(delay=SYNC_DELAY){
    clearTimeout(syncTimer);
    if(!isSyncConfigured()||!navigator.onLine)return;
    syncTimer=setTimeout(()=>performSync(false),Math.max(250,delay));
  }
  function jsonpSyncResult(requestId, timeout=9000){
    return new Promise((resolve,reject)=>{
      const cb=`yolaSync_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Tempo esgotado ao receber os dados sincronizados.')),timeout);
      function cleanup(){clearTimeout(timer);try{delete globalThis[cb]}catch{};script.remove()}
      function finish(err,data){cleanup();err?reject(err):resolve(data)}
      globalThis[cb]=data=>finish(null,data);
      script.onerror=()=>finish(new Error('Não foi possível receber os dados sincronizados.'));
      const sep=state.settings.driveEndpoint.includes('?')?'&':'?';
      script.src=`${state.settings.driveEndpoint}${sep}action=syncResult&requestId=${encodeURIComponent(requestId)}&callback=${encodeURIComponent(cb)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  async function performSync(refreshView=false){
    if(syncInProgress||!isSyncConfigured())return false;
    if(!navigator.onLine){state.settings.syncPending=true;state.settings.syncStatus='offline';await writeLocalState();return false}
    syncInProgress=true;state.settings.syncStatus='sending';state.settings.syncLastError='';updateBadge();
    const counterAtStart=localChangeCounter;
    const firstJoin=!state.settings.syncJoinedAt;
    const previousRevision=Number(state.settings.syncRevision||0);
    try{
      const status=await sendDriveRequest('sync',{sync:buildSyncPackage()});
      if(status?.status!=='ok')throw new Error(status?.message||'O servidor recusou a sincronização.');
      const remote=await jsonpSyncResult(status.requestId);
      if(remote?.status!=='ok')throw new Error(remote?.message||'Não foi possível receber o estado sincronizado.');
      applySyncedData(remote,counterAtStart);
      state.settings.syncRevision=Number(remote.revision||status.revision||state.settings.syncRevision||0);
      state.settings.syncLastAt=remote.updatedAt||status.at||new Date().toISOString();
      state.settings.syncJoinedAt=state.settings.syncJoinedAt||new Date().toISOString();
      state.settings.syncLastError='';
      state.settings.syncStatus='ok';
      state.settings.syncPending=localChangeCounter!==counterAtStart;
      await writeLocalState();
      if(state.settings.syncPending)scheduleSync(600);
      if(Number(state.settings.syncRevision||0)>previousRevision&&!refreshView)refreshSyncedScreen();
      if(refreshView){alert('Sincronização concluída. Os dados deste aparelho foram combinados com os dados dos outros aparelhos.');renderBackup()}
      return true;
    }catch(err){
      state.settings.syncPending=true;state.settings.syncStatus='error';state.settings.syncLastError=String(err?.message||err||'Erro desconhecido').slice(0,240);await writeLocalState();
      if(refreshView){alert(`Não foi possível sincronizar.\n\n${state.settings.syncLastError}`);renderBackup()}
      return false;
    }finally{syncInProgress=false;updateBadge()}
  }
  function refreshSyncedScreen(){
    if(document.hidden)return;
    if(currentMode==='daily'){
      if(activeScreen==='home')renderHome();
      else if(activeScreen==='agenda')renderAgenda();
      else if(activeScreen==='clients')renderClients();
      else if(activeScreen==='reminders')renderReminders();
      else if(activeScreen==='client'){/* evita mudar a ficha enquanto a pessoa lê */}
    }else if(currentMode==='admin'){
      if(activeScreen==='admin')renderAdmin();
      else if(activeScreen==='logs')renderLogs();
      else if(activeScreen==='services')renderServices();
    }
  }
  function jsonpSyncRevision(timeout=5000){
    return new Promise((resolve,reject)=>{
      const cb=`yolaRev_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Tempo esgotado ao verificar atualizações.')),timeout);
      function cleanup(){clearTimeout(timer);try{delete globalThis[cb]}catch{};script.remove()}
      function finish(err,data){cleanup();err?reject(err):resolve(data)}
      globalThis[cb]=data=>finish(null,data);
      script.onerror=()=>finish(new Error('Não foi possível verificar novas alterações.'));
      const sep=state.settings.driveEndpoint.includes('?')?'&':'?';
      script.src=`${state.settings.driveEndpoint}${sep}action=revision&callback=${encodeURIComponent(cb)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  async function checkRemoteRevision(){
    if(!isSyncConfigured()||!navigator.onLine||document.hidden||syncInProgress)return;
    if(state.settings.syncPending){scheduleSync(250);return}
    try{
      const info=await jsonpSyncRevision();
      if(info?.status==='ok'&&Number(info.revision||0)>Number(state.settings.syncRevision||0))scheduleSync(250);
    }catch{/* A próxima abertura/foco tentará novamente. */}
  }
  function startPeriodicSync(){
    clearInterval(periodicSyncTimer);
    periodicSyncTimer=setInterval(checkRemoteRevision,SYNC_POLL_MS);
  }

  function buildCloudBackupPackage(){
    return {
      version:2,
      exportedAt:new Date().toISOString(),
      source:'Yolanda Massoterapeuta PWA',
      data:{
        settings:syncedSettingsPayload(),
        services:structuredClone(state.services),
        clients:structuredClone(state.clients),
        appointments:structuredClone(state.appointments),
        logs:structuredClone(state.logs)
      }
    };
  }
  function driveStatusText(){
    const s=state.settings;
    if(!isDriveConfigured())return 'Não configurado';
    if(driveBackupInProgress)return 'Enviando agora…';
    if(s.driveBackupPending&&!navigator.onLine)return 'Aguardando internet';
    if(s.driveBackupPending)return 'Backup pendente';
    if(s.driveLastStatus==='error')return `Erro: ${s.driveLastError||'não foi possível confirmar o backup'}`;
    if(s.driveLastBackupAt)return `Último backup confirmado em ${new Date(s.driveLastBackupAt).toLocaleString('pt-BR')}`;
    return 'Configurado • aguardando primeiro backup';
  }
  function scheduleDriveBackup(delay=DRIVE_BACKUP_DELAY){
    clearTimeout(driveBackupTimer);
    if(!isDriveConfigured()||!state.settings.driveAutoBackup||!navigator.onLine)return;
    const dailyDate=state.settings.driveDailyPendingDate||'';
    const reason=state.settings.driveDailyPending?'Fechamento diário 23:59':'Automático';
    driveBackupTimer=setTimeout(()=>performDriveBackup(reason,false,dailyDate),Math.max(300,delay));
  }
  function scheduleDailyClosingBackup(){
    clearTimeout(driveDailyTimer);
    if(!state||!isDriveConfigured()||state.settings.driveDailyBackup===false)return;
    const now=new Date();
    const target=new Date(now);
    target.setHours(DAILY_BACKUP_HOUR,DAILY_BACKUP_MINUTE,0,0);
    const todayKey=ymd(now);
    if(now>=target && state.settings.driveLastDailyDate!==todayKey && !state.settings.driveDailyPending){
      state.settings.driveDailyPending=true;
      state.settings.driveDailyPendingDate=todayKey;
      state.settings.driveBackupPending=true;
      writeLocalState().then(()=>{if(navigator.onLine)scheduleDriveBackup(500)});
    } else if(now<target && state.settings.driveBackupPending && !state.settings.driveDailyPending){
      const yesterday=addDays(todayKey,-1);
      if(state.settings.driveLastDailyDate!==yesterday){
        state.settings.driveDailyPending=true;
        state.settings.driveDailyPendingDate=yesterday;
        writeLocalState().then(()=>{if(navigator.onLine)scheduleDriveBackup(500)});
      }
    }
    if(now>=target)target.setDate(target.getDate()+1);
    const wait=Math.max(1000,target.getTime()-Date.now());
    driveDailyTimer=setTimeout(async()=>{
      const due=ymd(new Date());
      state.settings.driveDailyPending=true;
      state.settings.driveDailyPendingDate=due;
      state.settings.driveBackupPending=true;
      await writeLocalState();
      if(navigator.onLine)scheduleDriveBackup(500);
      scheduleDailyClosingBackup();
    },wait);
  }
  function jsonpDriveStatus(requestId, timeout=6500){
    return new Promise((resolve,reject)=>{
      const cb=`yolaDrive_${Date.now()}_${Math.floor(Math.random()*1e9)}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Tempo esgotado ao confirmar o backup.')),timeout);
      function cleanup(){clearTimeout(timer);try{delete globalThis[cb]}catch{};script.remove()}
      function finish(err,data){cleanup();err?reject(err):resolve(data)}
      globalThis[cb]=data=>finish(null,data);
      script.onerror=()=>finish(new Error('Não foi possível consultar o status do backup.'));
      const sep=state.settings.driveEndpoint.includes('?')?'&':'?';
      script.src=`${state.settings.driveEndpoint}${sep}action=status&requestId=${encodeURIComponent(requestId)}&callback=${encodeURIComponent(cb)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  async function waitDriveStatus(requestId){
    let last=null;
    for(let i=0;i<10;i++){
      try{last=await jsonpDriveStatus(requestId);if(last?.status==='ok'||last?.status==='error')return last}catch(err){last={status:'pending',message:err.message}}
      await new Promise(r=>setTimeout(r,850));
    }
    throw new Error(last?.message||'O servidor não confirmou o backup a tempo.');
  }
  async function sendDriveRequest(action, extra={}){
    if(!navigator.onLine)throw new Error('Sem internet.');
    if(!isDriveConfigured())throw new Error('Configure o Google Drive primeiro.');
    const requestId=uid().replace(/[^a-zA-Z0-9_-]/g,'');
    const payload={action,key:state.settings.driveBackupKey,requestId,sentAt:new Date().toISOString(),...extra};
    await fetch(state.settings.driveEndpoint,{method:'POST',mode:'no-cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)});
    const status=await waitDriveStatus(requestId);
    return {...status,requestId};
  }
  async function performDriveBackup(reason='Manual', refreshView=false, dailyDate=''){
    if(driveBackupInProgress)return false;
    if(!isDriveConfigured()){if(refreshView)alert('Configure a conexão com o Google Drive primeiro.');return false}
    if(!navigator.onLine){state.settings.driveBackupPending=true;state.settings.driveLastStatus='pending';state.settings.driveLastError='';await writeLocalState();if(refreshView)renderBackup();return false}
    if(isSyncConfigured()&&(state.settings.syncPending||!state.settings.syncLastAt))await performSync(false);
    driveBackupInProgress=true;state.settings.driveLastStatus='sending';state.settings.driveLastError='';updateBadge();if(refreshView)renderBackup();
    try{
      const result=await sendDriveRequest('backup',{reason,dailyDate,backup:buildCloudBackupPackage()});
      if(result?.status!=='ok')throw new Error(result?.message||'O servidor recusou o backup.');
      state.settings.driveBackupPending=false;state.settings.driveLastStatus='ok';state.settings.driveLastBackupAt=result.at||new Date().toISOString();state.settings.driveLastError='';if(dailyDate){state.settings.driveLastDailyDate=dailyDate;state.settings.driveDailyPending=false;state.settings.driveDailyPendingDate=''}
      log('Backup automático confirmado',`${reason} • Google Drive`,'Administração');
      await writeLocalState();
      return true;
    }catch(err){
      state.settings.driveBackupPending=true;state.settings.driveLastStatus='error';state.settings.driveLastError=String(err?.message||err||'Erro desconhecido').slice(0,240);
      await writeLocalState();
      return false;
    }finally{driveBackupInProgress=false;updateBadge();if(refreshView)renderBackup()}
  }
  async function testDriveConnection(){
    if(!isDriveConfigured()){alert('Salve primeiro a URL do Web App e a chave de backup.');return}
    if(!navigator.onLine){alert('Conecte o aparelho à internet para testar.');return}
    driveBackupInProgress=true;state.settings.driveLastStatus='sending';state.settings.driveLastError='';updateBadge();renderBackup();
    try{
      const result=await sendDriveRequest('ping');
      if(result?.status!=='ok')throw new Error(result?.message||'A conexão não foi confirmada.');
      state.settings.driveLastStatus='ok';state.settings.driveLastError='';state.settings.driveConnected=true;state.settings.driveBackupPending=true;if(state.settings.syncEnabled!==false){state.settings.syncPending=true;state.settings.syncStatus='pending';}
      log('Google Drive conectado','Teste do backup automático concluído','Administração');
      await writeLocalState();
      alert('Conexão confirmada. O primeiro backup será enviado agora.');
    }catch(err){state.settings.driveLastStatus='error';state.settings.driveLastError=String(err?.message||err).slice(0,240);await writeLocalState();alert(`Não foi possível confirmar a conexão.\n\n${state.settings.driveLastError}`)}
    finally{driveBackupInProgress=false;updateBadge();renderBackup()}
    if(state.settings.driveLastStatus==='ok'){performSync(false).then(()=>performDriveBackup('Primeiro backup',true));}
  }
  function renderBackup(){
    activeScreen='backup';
    const s=state.settings;
    view.innerHTML=`<div class="section-title"><h2>Sincronização e backups</h2></div>
      <div class="card"><h3>🔄 Sincronização entre aparelhos</h3><p class="muted">Celular, tablet e computador podem usar a mesma base. Cada alteração é salva primeiro neste aparelho; quando houver internet, ela é combinada com a base central e aparece nos outros aparelhos conectados.</p>
        <div class="notice backup-status"><strong>${esc(syncStatusText())}</strong><small>${navigator.onLine?'Internet disponível':'Sem internet agora'} • aparelho: ${esc(s.deviceName||'Este aparelho')}</small></div>
        <form class="form" id="driveForm" style="margin-top:12px">
          <div class="field"><label>Nome deste aparelho</label><input id="deviceName" maxlength="40" value="${attr(s.deviceName||'Este aparelho')}" placeholder="Ex.: Celular da Yolanda"><div class="help">Ajuda a identificar de onde veio uma alteração no histórico.</div></div>
          <div class="field"><label>URL do Web App do Google Apps Script</label><input id="driveEndpoint" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${attr(s.driveEndpoint||'')}"><div class="help">Use a mesma URL <strong>/exec</strong> em todos os aparelhos autorizados.</div></div>
          <div class="field"><label>Chave privada</label><input id="driveKey" type="password" autocomplete="off" value="${attr(s.driveBackupKey||'')}" placeholder="Cole a chave gerada pelo script"><div class="help">Use a mesma chave em cada aparelho. Ela fica salva localmente e não deve ser colocada no GitHub.</div></div>
          <label class="switch-line"><input id="syncEnabled" type="checkbox" ${s.syncEnabled!==false?'checked':''}> <span>Sincronizar dados automaticamente entre aparelhos</span></label>
          <label class="switch-line"><input id="driveAuto" type="checkbox" ${s.driveAutoBackup!==false?'checked':''}> <span>Proteger alterações também com backup automático</span></label>
          <label class="switch-line"><input id="driveDaily" type="checkbox" ${s.driveDailyBackup!==false?'checked':''}> <span>Fechamento diário de backup às 23:59</span></label>
          <div class="help">Offline, sua mãe continua trabalhando normalmente. As alterações ficam neste aparelho e são sincronizadas quando a internet voltar e o PWA estiver aberto.</div>
          <button class="btn primary">Salvar conexão</button>
        </form>
        <div class="actions" style="margin-top:12px"><button class="btn secondary" id="driveTest" ${isDriveConfigured()?'':'disabled'}>Testar conexão</button><button class="btn primary" id="syncNow" ${isSyncConfigured()?'':'disabled'}>Sincronizar agora</button><button class="btn ghost" id="driveNow" ${isDriveConfigured()?'':'disabled'}>Fazer backup agora</button><button class="btn ghost" id="driveDisconnect" ${isDriveConfigured()?'':'disabled'}>Desconectar este aparelho</button></div>
        ${s.syncLastAt?`<p class="help" style="margin-top:10px">Última sincronização: ${new Date(s.syncLastAt).toLocaleString('pt-BR')} • revisão ${Number(s.syncRevision||0)}</p>`:''}
        ${s.driveLastBackupAt?`<p class="help">Último backup confirmado: ${new Date(s.driveLastBackupAt).toLocaleString('pt-BR')}</p>`:''}${s.driveLastDailyDate?`<p class="help">Último fechamento diário concluído: ${fmtDate(s.driveLastDailyDate)} às 23:59</p>`:''}
      </div>
      <div class="card" style="margin-top:12px"><h3>☁️ Como os aparelhos trabalham juntos</h3><div class="sync-flow"><span>📱 Celular da Yolanda</span><strong>↕</strong><span>☁️ Base sincronizada</span><strong>↕</strong><span>💻 Administração</span></div><p class="muted">Se dois aparelhos alterarem registros diferentes, ambos são mantidos. Se alterarem o mesmo registro enquanto estavam offline, prevalece a versão com a alteração mais recente registrada pelo aparelho.</p><p class="help">Ao conectar um aparelho novo pela primeira vez, a base central existente é priorizada para registros que já existem, evitando que uma instalação vazia substitua os dados reais.</p></div>
      <div class="card" style="margin-top:12px"><h3>💾 Backup local</h3><p class="muted">Continua disponível como segunda camada de segurança. O arquivo é baixado para a pasta de Downloads do aparelho.</p><div class="actions"><button class="btn ghost" id="exportBtn">Exportar backup local</button><label class="btn ghost" style="display:inline-flex;align-items:center">Importar backup<input id="importFile" type="file" accept="application/json" hidden></label></div></div>
      <div class="card" style="margin-top:12px"><h3>✉️ E-mail</h3><p class="muted">Crie um aviso por e-mail com a data do último backup confirmado no Drive.</p><button class="btn ghost" id="emailDraft">Criar aviso por e-mail</button></div>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#driveForm').onsubmit=async e=>{
      e.preventDefault();
      const endpoint=normalizeDriveEndpoint($('#driveEndpoint').value), key=$('#driveKey').value.trim(), auto=$('#driveAuto').checked, daily=$('#driveDaily').checked, syncEnabled=$('#syncEnabled').checked, deviceName=$('#deviceName').value.trim()||'Este aparelho';
      if(!endpoint){alert('Informe a URL válida do Web App do Google Apps Script, terminada em /exec.');return}
      if(key.length<24){alert('A chave parece curta. Use a chave gerada pelo Google Apps Script.');return}
      const connectionChanged=endpoint!==state.settings.driveEndpoint||key!==state.settings.driveBackupKey;
      state.settings.driveEndpoint=endpoint;state.settings.driveBackupKey=key;state.settings.driveAutoBackup=auto;state.settings.driveDailyBackup=daily;state.settings.driveDailyTime='23:59';state.settings.driveConnected=true;
      state.settings.syncEnabled=syncEnabled;state.settings.deviceName=deviceName;
      if(connectionChanged){state.settings.driveLastStatus='not_configured';state.settings.driveLastError='';state.settings.driveLastBackupAt=null;state.settings.syncStatus='not_configured';state.settings.syncLastError='';state.settings.syncLastAt=null;state.settings.syncRevision=0;state.settings.syncJoinedAt=null}
      state.settings.driveBackupPending=true;state.settings.syncPending=syncEnabled;
      log('Conexão de nuvem atualizada',`${deviceName} • ${syncEnabled?'sincronização ativada':'sincronização desativada'} • ${daily?'backup 23:59 ativado':'backup diário desativado'}`,'Administração');
      await save({skipAutoBackup:true,skipSync:true});
      alert('Conexão salva. Use “Testar conexão” e depois “Sincronizar agora”.');scheduleDailyClosingBackup();if(syncEnabled&&navigator.onLine)scheduleSync(500);renderBackup();
    };
    $('#driveTest').onclick=testDriveConnection;
    $('#syncNow').onclick=()=>performSync(true);
    $('#driveNow').onclick=()=>performDriveBackup('Solicitado manualmente',true);
    $('#driveDisconnect').onclick=async()=>{if(!confirm('Desconectar este aparelho da sincronização e do Google Drive? Os dados que já estão neste aparelho serão mantidos.'))return;clearTimeout(syncTimer);clearTimeout(driveBackupTimer);clearTimeout(driveDailyTimer);state.settings.driveConnected=false;state.settings.driveEndpoint='';state.settings.driveBackupKey='';state.settings.driveBackupPending=false;state.settings.driveDailyPending=false;state.settings.driveDailyPendingDate='';state.settings.driveLastStatus='not_configured';state.settings.driveLastError='';state.settings.syncPending=false;state.settings.syncStatus='not_configured';state.settings.syncLastError='';state.settings.syncLastAt=null;state.settings.syncRevision=0;state.settings.syncJoinedAt=null;log('Nuvem desconectada','Dados locais preservados','Administração');await save({skipAutoBackup:true,skipSync:true});renderBackup()};
    $('#exportBtn').onclick=exportBackup;$('#importFile').onchange=importBackup;
    $('#emailDraft').onclick=()=>{const when=state.settings.driveLastBackupAt?new Date(state.settings.driveLastBackupAt).toLocaleString('pt-BR'):'ainda não confirmado';const subject=encodeURIComponent('Backup Yolanda Massoterapeuta');const body=encodeURIComponent(`Status da nuvem\n\nÚltima sincronização: ${state.settings.syncLastAt?new Date(state.settings.syncLastAt).toLocaleString('pt-BR'):'ainda não realizada'}\nÚltimo backup confirmado: ${when}\nClientes: ${state.clients.length}\nAtendimentos: ${state.appointments.length}\n\nOs backups ficam na pasta Yolanda Massoterapeuta / Backups Automáticos no Google Drive.`);location.href=`mailto:?subject=${subject}&body=${body}`};
    $('#backAdmin').onclick=renderAdmin;
  }

  function exportBackup(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`yolanda-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);state.settings.lastBackup=new Date().toISOString();log('Backup exportado',a.download,'Administração');save()}
  async function importBackup(e){const f=e.target.files?.[0];if(!f)return;if(!confirm('Importar este backup substituirá os dados atuais deste aparelho. Continuar?'))return;try{const obj=JSON.parse(await f.text());if(!obj.data?.settings||!Array.isArray(obj.data.services))throw new Error('Formato inválido');state=normalizeState(obj.data);state.settings.deviceId=uid();state.settings.deviceName=state.settings.deviceName||'Aparelho restaurado';state.settings.syncJoinedAt=null;state.settings.syncRevision=0;state.settings.syncPending=isSyncConfigured();log('Backup importado',f.name,'Administração');await save();alert('Backup importado com sucesso.');renderBackup()}catch(err){alert('Não foi possível importar este arquivo.')};e.target.value=''}

  function notificationPermissionLabel(){
    if(!('Notification' in window))return 'Não suportado neste navegador';
    if(Notification.permission==='granted')return 'Permitidas neste aparelho';
    if(Notification.permission==='denied')return 'Bloqueadas nas configurações do navegador';
    return 'Ainda não autorizadas';
  }
  function firebaseNotificationsConfigured(){return Boolean(window.YolaNotifications?.isConfigured?.())}
  async function waitForNotificationsBridge(timeout=5000){
    if(window.YolaNotifications)return window.YolaNotifications;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(new Error('O módulo de notificações não ficou pronto.'))},timeout);
      const ready=()=>{cleanup();resolve(window.YolaNotifications)};
      const cleanup=()=>{clearTimeout(timer);window.removeEventListener('yola-notifications-ready',ready)};
      window.addEventListener('yola-notifications-ready',ready,{once:true});
    });
  }
  async function registerPushOnServer(token){
    if(!isDriveConfigured())throw new Error('Configure primeiro a sincronização/Google Drive.');
    const result=await sendDriveRequest('registerPush',{device:{deviceId:state.settings.deviceId,deviceName:state.settings.deviceName||'Este aparelho',token:String(token||''),agenda:true,confirmation:true}});
    if(result?.status!=='ok')throw new Error(result?.message||'O servidor não confirmou o cadastro das notificações.');
    return result;
  }
  async function enablePushNotifications(interactive=true){
    if(!isDriveConfigured()){if(interactive)alert('Primeiro configure a sincronização e teste a conexão em Administração → Sincronização e backup.');return false}
    if(!navigator.onLine){if(interactive)alert('Conecte o aparelho à internet para ativar as notificações.');return false}
    try{
      const bridge=await waitForNotificationsBridge();
      if(!bridge?.isConfigured?.())throw new Error('O arquivo firebase-config.js ainda não foi configurado no GitHub.');
      const token=interactive?await bridge.enable():await bridge.refresh();
      await registerPushOnServer(token);
      state.settings.pushEnabled=true;state.settings.pushToken=token;state.settings.pushLastRegisteredAt=new Date().toISOString();state.settings.pushLastError='';
      log('Notificações ativadas',`Aparelho: ${state.settings.deviceName||'Este aparelho'}`,'Administração');
      await writeLocalState();
      if(interactive){alert('Notificações ativadas neste aparelho. Você receberá avisos de agenda e de confirmações.');renderNotifications()}
      return true;
    }catch(err){state.settings.pushLastError=String(err?.message||err).slice(0,240);await writeLocalState();if(interactive){alert(`Não foi possível ativar as notificações.\n\n${state.settings.pushLastError}`);renderNotifications()}return false}
  }
  async function disablePushNotifications(){
    try{if(isDriveConfigured()&&navigator.onLine)await sendDriveRequest('unregisterPush',{deviceId:state.settings.deviceId})}catch{}
    try{const bridge=await waitForNotificationsBridge(1500);await bridge?.disable?.()}catch{}
    state.settings.pushEnabled=false;state.settings.pushToken='';state.settings.pushLastRegisteredAt=null;state.settings.pushLastError='';log('Notificações desativadas',`Aparelho: ${state.settings.deviceName||'Este aparelho'}`,'Administração');await writeLocalState();renderNotifications();
  }
  async function testPushNotification(){
    if(!state.settings.pushEnabled){alert('Ative as notificações neste aparelho primeiro.');return}
    if(!isDriveConfigured()){alert('Configure primeiro a conexão com o Google Apps Script.');return}
    if(!navigator.onLine){alert('Conecte o aparelho à internet para enviar o teste.');return}
    try{const result=await sendDriveRequest('testPush',{deviceId:state.settings.deviceId});if(result?.status!=='ok')throw new Error(result?.message||'O teste não foi aceito.');alert('Notificação de teste enviada. Ela deve aparecer em alguns segundos.')}catch(err){alert(`Não foi possível enviar o teste.\n\n${String(err?.message||err)}`)}
  }
  function renderNotifications(){
    activeScreen='notifications';
    const s=state.settings;
    const firebaseReady=firebaseNotificationsConfigured();
    view.innerHTML=`<div class="section-title"><h2>Notificações</h2></div>
      <div class="card"><h3>🔔 Avisos da agenda</h3><p class="muted">As notificações push podem aparecer no celular mesmo quando o PWA não estiver aberto, depois que o Firebase e o gatilho do Apps Script estiverem configurados.</p>
        <div class="notice backup-status"><strong>${esc(notificationPermissionLabel())}</strong><small>Firebase: ${firebaseReady?'configurado':'ainda não configurado'} • aparelho: ${state.settings.pushEnabled?'cadastrado':'não cadastrado'}</small></div>
        <form class="form" id="notifyForm" style="margin-top:12px">
          <label class="switch-line"><input id="notifyAgenda" type="checkbox" ${s.notifyAgendaEnabled!==false?'checked':''}> <span>Avisar antes de cada atendimento</span></label>
          <div class="field"><label>Antecedência do atendimento</label><select id="notifyMinutes"><option value="15" ${Number(s.notifyAgendaMinutes)===15?'selected':''}>15 minutos</option><option value="30" ${Number(s.notifyAgendaMinutes||30)===30?'selected':''}>30 minutos</option><option value="60" ${Number(s.notifyAgendaMinutes)===60?'selected':''}>1 hora</option></select></div>
          <label class="switch-line"><input id="notifyConfirmation" type="checkbox" ${s.notifyConfirmationEnabled!==false?'checked':''}> <span>Lembrar os clientes que precisam de confirmação para o dia seguinte</span></label>
          <div class="field"><label>Horário do lembrete de confirmação</label><input id="notifyConfirmationHour" type="time" value="${attr(s.notifyConfirmationHour||'09:00')}"><div class="help">Exemplo: às 09:00 o celular avisa quantos clientes de amanhã ainda precisam ser confirmados.</div></div>
          <button class="btn primary">Salvar preferências</button>
        </form>
        <div class="actions" style="margin-top:12px"><button class="btn secondary" id="enablePush">Ativar neste aparelho</button><button class="btn ghost" id="testPush" ${s.pushEnabled?'':'disabled'}>Enviar teste</button><button class="btn ghost" id="disablePush" ${s.pushEnabled?'':'disabled'}>Desativar neste aparelho</button></div>
        ${s.pushLastRegisteredAt?`<p class="help" style="margin-top:10px">Último cadastro deste aparelho: ${new Date(s.pushLastRegisteredAt).toLocaleString('pt-BR')}</p>`:''}${s.pushLastError?`<p class="help" style="color:var(--danger)">Último erro: ${esc(s.pushLastError)}</p>`:''}
      </div>
      <div class="card" style="margin-top:12px"><h3>Como serão os avisos</h3><p class="muted">Exemplos:</p><div class="list"><div class="item"><strong>📅 Próximo atendimento</strong><p>Maria • Drenagem Linfática • 14:00</p></div><div class="item"><strong>🔔 Confirmações de amanhã</strong><p>3 clientes ainda precisam de confirmação.</p></div></div><p class="help">O Modo Aprender nunca gera notificações reais.</p></div>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#notifyForm').onsubmit=async e=>{e.preventDefault();const nextAgenda=$('#notifyAgenda').checked;const nextMinutes=Number($('#notifyMinutes').value);const nextConfirmation=$('#notifyConfirmation').checked;const nextHour=$('#notifyConfirmationHour').value||'09:00';const changed=nextAgenda!==state.settings.notifyAgendaEnabled||nextMinutes!==Number(state.settings.notifyAgendaMinutes||30)||nextConfirmation!==state.settings.notifyConfirmationEnabled||nextHour!==String(state.settings.notifyConfirmationHour||'09:00');state.settings.notifyAgendaEnabled=nextAgenda;state.settings.notifyAgendaMinutes=nextMinutes;state.settings.notifyConfirmationEnabled=nextConfirmation;state.settings.notifyConfirmationHour=nextHour;if(changed)state.settings.syncSettingsUpdatedAt=new Date().toISOString();log('Preferências de notificação atualizadas',`${nextAgenda?`agenda ${nextMinutes} min`:'agenda desativada'} • ${nextConfirmation?`confirmações ${nextHour}`:'confirmações desativadas'}`,'Administração');await save();alert('Preferências salvas e preparadas para sincronizar entre os aparelhos.');renderNotifications()};
    $('#enablePush').onclick=()=>enablePushNotifications(true);$('#testPush').onclick=testPushNotification;$('#disablePush').onclick=()=>{if(confirm('Desativar as notificações neste aparelho?'))disablePushNotifications()};$('#backAdmin').onclick=renderAdmin;
  }
  async function refreshPushRegistration(){
    if(!state?.settings?.pushEnabled||!navigator.onLine||!isDriveConfigured())return;
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    setTimeout(()=>enablePushNotifications(false),1800);
  }

  function renderSettings(){
    activeScreen='settings';
    const recoveryReady=Boolean(state.settings.recoveryEmail&&state.settings.recoveryKeyHash);
    view.innerHTML=`<div class="section-title"><h2>Configurações</h2></div><form class="form card" id="settingsForm"><div class="field"><label>Novo PIN da Administração</label><input id="newPin" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" placeholder="Deixe em branco para manter o PIN atual"><div class="help">Por segurança, o PIN atual não é exibido. Preencha somente se quiser alterá-lo.</div></div><div class="field"><label>Confirmar novo PIN</label><input id="confirmPin" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" placeholder="Repita o novo PIN, se houver alteração"></div><div class="field"><label>E-mail de recuperação</label><input id="recoveryEmailSetting" type="email" value="${attr(state.settings.recoveryEmail||'')}" placeholder="seuemail@exemplo.com"><div class="help">A chave de recuperação poderá ser enviada e guardada nesse e-mail.</div></div><div class="field"><label>Mostrar lembrete de confirmação com antecedência de</label><select id="reminderDays"><option value="1" ${state.settings.reminderDays==1?'selected':''}>1 dia</option><option value="2" ${state.settings.reminderDays==2?'selected':''}>2 dias</option><option value="3" ${state.settings.reminderDays==3?'selected':''}>3 dias</option></select></div><div class="field"><label>Feriados locais de Dumont/SP</label><textarea id="localHolidayLines" placeholder="MM-DD | Nome do feriado&#10;Ex.: 09-16 | Feriado municipal">${esc(state.settings.localHolidayLines||'')}</textarea><div class="help">Os feriados nacionais e o feriado estadual de São Paulo já aparecem automaticamente na agenda. Nesta área você pode cadastrar os feriados locais de Dumont, um por linha, no formato MM-DD | Nome do feriado.</div></div><button class="btn primary">Salvar configurações</button></form><div class="card" style="margin-top:12px"><h3>Recuperação por e-mail</h3><p class="muted">Status: <strong>${recoveryReady?'Configurada':'Ainda não configurada'}</strong></p><p class="help">Depois de salvar o e-mail, gere uma chave. O aplicativo abrirá um e-mail com essa chave para você guardar. Se esquecer o PIN, serão exigidos o e-mail e a chave.</p><button class="btn secondary" id="generateRecoveryKey">${recoveryReady?'Renovar chave de recuperação':'Gerar chave de recuperação'}</button></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#settingsForm').onsubmit=async e=>{e.preventDefault();const pin=$('#newPin').value.trim();const pin2=$('#confirmPin').value.trim();const nextEmail=normalizeEmail($('#recoveryEmailSetting').value);const nextReminderDays=Number($('#reminderDays').value);const nextLocalHolidayLines=$('#localHolidayLines').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).join('\n');if(pin||pin2){if(!/^\d{4,8}$/.test(pin)){alert('Use um PIN de 4 a 8 números.');return}if(pin!==pin2){alert('Os PINs não são iguais.');return}state.settings.adminPin=pin;}if(nextEmail&&!validEmail(nextEmail)){alert('Informe um e-mail válido.');return}for(const line of nextLocalHolidayLines.split(/\n/).filter(Boolean)){if(!/^\d{2}-\d{2}\s*\|\s*.+$/.test(line)){alert('Os feriados locais devem seguir o formato MM-DD | Nome do feriado.');return}}const previousEmail=normalizeEmail(state.settings.recoveryEmail);const settingsChanged=nextReminderDays!==Number(state.settings.reminderDays||1)||nextLocalHolidayLines!==String(state.settings.localHolidayLines||'');if(settingsChanged)state.settings.syncSettingsUpdatedAt=new Date().toISOString();state.settings.reminderDays=nextReminderDays;state.settings.localHolidayLines=nextLocalHolidayLines;state.settings.recoveryEmail=nextEmail;if(previousEmail!==nextEmail)state.settings.recoveryKeyHash='';log('Configurações alteradas',`${pin?'PIN atualizado; ':''}${settingsChanged?'lembretes/feriados atualizados; ':''}${previousEmail!==nextEmail?'e-mail atualizado; chave anterior invalidada':'e-mail mantido'}`,'Administração');await save();alert(nextEmail&&!state.settings.recoveryKeyHash?'Configurações salvas. Agora gere uma chave de recuperação.':'Configurações salvas.');renderSettings()};
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

  (async()=>{state=await load();if(state.settings.driveConnected&&(!state.settings.driveEndpoint||!state.settings.driveBackupKey))state.settings.driveConnected=false;updateBadge();renderModePicker();if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});scheduleDailyClosingBackup();startPeriodicSync();if(isSyncConfigured())scheduleSync(900);if(state.settings.driveBackupPending)scheduleDriveBackup(2200);refreshPushRegistration()})();
})();
