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
    settings:{adminPin:'9186', pinSchema:2, reminderDays:1, localHolidayLines:'', appointmentGapMinutes:15, quickStartTime:'08:00', quickEndTime:'20:00', notifyAgendaEnabled:true, notifyAgendaMinutes:30, notifyConfirmationEnabled:true, notifyConfirmationHour:'09:00', pushEnabled:false, pushToken:'', pushLastRegisteredAt:null, pushLastError:'', driveConnected:false, driveEndpoint:'', driveBackupKey:'', driveAutoBackup:true, driveBackupPending:false, driveDailyBackup:true, driveDailyTime:'23:59', driveDailyPending:false, driveDailyPendingDate:'', driveLastDailyDate:'', driveLastBackupAt:null, driveLastStatus:'not_configured', driveLastError:'', syncEnabled:true, syncPending:false, syncStatus:'not_configured', syncLastAt:null, syncLastError:'', syncRevision:0, syncJoinedAt:null, syncSettingsUpdatedAt:null, deviceId:'', deviceName:'', lastBackup:null, recoveryEmail:'', recoveryKeyHash:''},
    services:[
      {id:'s1',name:'Drenagem Linfática',price:100,duration:60},
      {id:'s2',name:'Massagem Relaxante',price:110,duration:60},
      {id:'s3',name:'Massagem Terapêutica',price:120,duration:60},
      {id:'s4',name:'Pedras Quentes',price:130,duration:60},
      {id:'s5',name:'Reflexologia',price:90,duration:40},
      {id:'s6',name:'Quick Massage',price:70,duration:30},
      {id:'s7',name:'Head Spa',price:120,duration:60}
    ],
    clients:[], appointments:[], blocks:[], waitlist:[], logs:[]
  };

  const DB = 'yolanda-pwa-db', STORE='state', KEY='main';
  function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  function normalizeState(data){
    const out=data&&typeof data==='object'?data:structuredClone(DEFAULT);
    out.settings={...structuredClone(DEFAULT.settings),...(out.settings||{})};
    out.services=Array.isArray(out.services)?out.services:structuredClone(DEFAULT.services);
    out.clients=Array.isArray(out.clients)?out.clients:[];
    out.appointments=Array.isArray(out.appointments)?out.appointments:[];
    out.blocks=Array.isArray(out.blocks)?out.blocks:[];
    out.waitlist=Array.isArray(out.waitlist)?out.waitlist:[];
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
    ensureMeta(out.blocks);
    ensureMeta(out.waitlist);
    out.appointments.forEach(a=>{
      a.bookingType=a.bookingType||'single';
      a.paymentPlan=a.paymentPlan||'per_session';
      a.totalPrice=Number(a.totalPrice!=null?a.totalPrice:(a.price||0));
      a.price=Number(a.price||0);
      a.amountPaid=Number(a.amountPaid!=null?a.amountPaid:(a.paymentStatus==='pago'?a.price:0));
      a.paymentStatus=a.paymentStatus||'pendente';
      a.packageSessionCount=Number(a.packageSessionCount||1);
      a.packageSessionNumber=Number(a.packageSessionNumber||1);
      const svc=out.services.find(s=>s.id===a.serviceId);
      a.duration=Math.max(5,Number(a.duration||svc?.duration||60));
      a.attendanceStatus=a.attendanceStatus||(a.status==='cancelado'?'cancelled':'scheduled');
      if(a.status==='cancelado')a.attendanceStatus='cancelled';
      if(a.consumesPackageSession==null)a.consumesPackageSession=a.attendanceStatus==='attended';
    });
    out.blocks.forEach(b=>{
      b.startDate=b.startDate||b.date||today();b.endDate=b.endDate||b.startDate;b.allDay=Boolean(b.allDay);b.startTime=b.startTime||'08:00';b.endTime=b.endTime||'18:00';b.reason=b.reason||'Horário bloqueado';b.active=b.active!==false;
    });
    out.waitlist.forEach(w=>{w.status=w.status||'waiting';w.preferredWeekday=w.preferredWeekday==null?'':String(w.preferredWeekday);w.preferredTime=w.preferredTime||'';w.notes=w.notes||'';});
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

  let state, currentMode=null, trainingState=null, learnVisited=new Set(), activeScreen='picker', lastOpenedAppointmentId=null;
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
    const demo=(id,clientId,serviceId,date,time,confirmed=false,paid=false,price=null)=>{const svc=base.services.find(s=>s.id===serviceId);return {id,clientId,serviceId,serviceName:svc.name,defaultPrice:Number(svc.price),duration:Number(svc.duration||60),price:price??Number(svc.price),totalPrice:price??Number(svc.price),bookingType:'single',paymentPlan:'per_session',date,time,notes:'',confirmed,paymentStatus:paid?'pago':'pendente',paymentMethod:paid?'PIX':'',amountPaid:paid?(price??Number(svc.price)):0,status:'agendado',attendanceStatus:'scheduled',createdAt:new Date().toISOString()}};
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
    home:['1 de 5 • Início','Esta é a mesma tela da Agenda de Atendimentos. Aqui você vê o próximo atendimento, o dia de hoje, confirmações e valores a receber. Os nomes e valores deste treino são fictícios.'],
    agenda:['2 de 5 • Agenda','Veja o mês inteiro, pesquise clientes e toque em horários livres na Agenda rápida. Você também pode bloquear períodos e consultar a lista de espera.'],
    new:['3 de 5 • Agendar','Escolha sessão única ou pacote. Em pacote, informe o valor total, a quantidade de sessões e as datas; o sistema calcula o valor por sessão. Também é possível repetir uma sessão toda semana no mesmo dia e horário.'],
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

  function actualReceivedAmount(a){
    if(a?.amountPaid!=null)return Number(a.amountPaid||0);
    return a?.paymentStatus==='pago'?Number(a.price||0):0;
  }
  function paymentDate(a){return a?.paidAt?String(a.paidAt).slice(0,10):(actualReceivedAmount(a)>0?a?.date:'')}
  function paymentLabel(a){
    if(a?.bookingType==='package'){
      if(a.paymentStatus==='incluido_pacote')return 'Incluído no pacote pago';
      if(a.paymentPlan==='total'){
        if(a.paymentStatus==='pago_total')return 'Pacote pago';
        return 'Pacote a receber';
      }
      return a.paymentStatus==='pago'?'Sessão paga':'Pagar por sessão';
    }
    return a?.paymentStatus==='pago'?'Pago':'A receber';
  }
  function bookingBadge(a){
    if(a?.bookingType==='package')return `Pacote ${Number(a.packageSessionNumber||1)}/${Number(a.packageSessionCount||1)}`;
    if(a?.seriesId)return 'Recorrente';
    return '';
  }
  function paymentDisplay(a){return `${paymentLabel(a)}${a?.paymentMethod?` • ${a.paymentMethod}`:''}`}
  function minutesFromTime(value){const m=String(value||'00:00').match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):0}
  function timeFromMinutes(value){const n=Math.max(0,Math.min(1439,Math.round(Number(value)||0)));return `${pad2(Math.floor(n/60))}:${pad2(n%60)}`}
  function dateTimeMs(date,time){return new Date(`${date}T${time||'00:00'}:00`).getTime()}
  function activeAppointment(a){return a&&a.status!=='cancelado'&&a.attendanceStatus!=='cancelled'}
  function appointmentDuration(d,a){const svc=d.services.find(s=>s.id===a?.serviceId);return Math.max(5,Number(a?.duration||svc?.duration||60))}
  function attendanceLabel(a){if(a?.attendanceStatus==='attended')return 'Compareceu';if(a?.attendanceStatus==='no_show')return 'Faltou';if(a?.attendanceStatus==='cancelled'||a?.status==='cancelado')return 'Cancelado';return 'Agendado'}
  function attendanceClass(a){if(a?.attendanceStatus==='attended')return 'ok';if(a?.attendanceStatus==='no_show'||a?.attendanceStatus==='cancelled'||a?.status==='cancelado')return 'danger';return 'warn'}
  function blockCoversDate(b,date){return Boolean(b&&b.active!==false&&String(date)>=String(b.startDate||'')&&String(date)<=String(b.endDate||b.startDate||''))}
  function blocksForDate(d,date){return (d.blocks||[]).filter(b=>blockCoversDate(b,date)).sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')))}
  function rangesOverlap(startA,endA,startB,endB){return startA<endB&&startB<endA}
  function slotRange(d,date,time,duration,includeGap=true){const gap=includeGap?Math.max(0,Number(d.settings.appointmentGapMinutes||0)):0;const start=minutesFromTime(time);return {date,start,end:start+Math.max(5,Number(duration||60))+gap}}
  function appointmentRange(d,a){return slotRange(d,a.date,a.time,appointmentDuration(d,a),true)}
  function blockRangeForDate(b,date){if(!blockCoversDate(b,date))return null;if(b.allDay)return {date,start:0,end:1440};return {date,start:minutesFromTime(b.startTime),end:minutesFromTime(b.endTime)}}
  function findSlotConflicts(d,slot,ignoreIds=[]){
    const ignore=new Set(ignoreIds||[]);const range=slotRange(d,slot.date,slot.time,slot.duration,true);const conflicts=[];
    d.appointments.filter(a=>activeAppointment(a)&&a.date===slot.date&&!ignore.has(a.id)).forEach(a=>{const r=appointmentRange(d,a);if(rangesOverlap(range.start,range.end,r.start,r.end)){const c=d.clients.find(x=>x.id===a.clientId);conflicts.push(`${a.time} • ${c?.name||'Cliente'} • ${a.serviceName}`)}});
    blocksForDate(d,slot.date).forEach(b=>{const r=blockRangeForDate(b,slot.date);if(r&&rangesOverlap(range.start,range.end,r.start,r.end))conflicts.push(`${b.allDay?'Dia inteiro':`${b.startTime}–${b.endTime}`} • ${b.reason||'Horário bloqueado'}`)});
    return conflicts;
  }
  function confirmScheduleConflicts(d,slots,ignoreIds=[]){
    const messages=[];const seen=[];
    slots.forEach((slot,i)=>{findSlotConflicts(d,slot,ignoreIds).forEach(x=>messages.push(`${fmtDate(slot.date)} ${slot.time}: ${x}`));for(let j=0;j<i;j++){const other=slots[j];if(other.date!==slot.date)continue;const a=slotRange(d,slot.date,slot.time,slot.duration,true),b=slotRange(d,other.date,other.time,other.duration,true);if(rangesOverlap(a.start,a.end,b.start,b.end))messages.push(`${fmtDate(slot.date)}: os próprios horários que você está criando se sobrepõem (${other.time} e ${slot.time}).`)}});
    if(!messages.length)return true;const unique=[...new Set(messages)].slice(0,8);return confirm(`⚠️ Conflito de horário encontrado:\n\n${unique.join('\n')}\n${messages.length>8?'\n...':''}\n\nDeseja salvar mesmo assim?`);
  }
  function slotBusyAt(d,date,time){const point=minutesFromTime(time);const appt=d.appointments.find(a=>{if(!activeAppointment(a)||a.date!==date)return false;const r=appointmentRange(d,a);return point>=r.start&&point<r.end});if(appt){const c=d.clients.find(x=>x.id===appt.clientId);return {type:'appointment',label:`${c?.name||'Cliente'} • ${appt.serviceName}`}}const block=blocksForDate(d,date).find(b=>{const r=blockRangeForDate(b,date);return r&&point>=r.start&&point<r.end});return block?{type:'block',label:block.reason||'Bloqueado'}:null}
  function nextUpcomingAppointment(d){const now=Date.now();return d.appointments.filter(a=>activeAppointment(a)&&a.attendanceStatus==='scheduled'&&dateTimeMs(a.date,a.time)>=now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null}
  function tomorrowDate(){return addDays(today(),1)}
  function tomorrowConfirmationCount(d){const t=tomorrowDate();return d.appointments.filter(a=>activeAppointment(a)&&a.date===t&&a.attendanceStatus==='scheduled'&&!a.confirmed).length}
  function packageAllAppointments(d,aOrId){const packageId=typeof aOrId==='string'?aOrId:aOrId?.packageId;return packageId?d.appointments.filter(x=>x.packageId===packageId).sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time)):[]}
  function packageStats(d,aOrId){
    const items=packageAllAppointments(d,aOrId);if(!items.length)return null;const sample=items[0];const total=Math.max(1,Number(sample.packageSessionCount||items.filter(x=>x.status!=='cancelado').length||items.length));const used=items.filter(x=>x.attendanceStatus==='attended'||(x.attendanceStatus==='no_show'&&x.consumesPackageSession)).length;const noShows=items.filter(x=>x.attendanceStatus==='no_show').length;const remaining=Math.max(0,total-used);const next=items.filter(x=>activeAppointment(x)&&x.attendanceStatus==='scheduled'&&dateTimeMs(x.date,x.time)>=Date.now()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;const totalPaid=items.reduce((sum,x)=>sum+actualReceivedAmount(x),0);const totalPrice=Number(sample.totalPrice||0);return {items,total,used,noShows,remaining,next,totalPaid,totalPrice,paid:totalPaid>=totalPrice&&totalPrice>0,packageId:sample.packageId,serviceName:sample.serviceName};
  }
  function uniquePackageStats(d,clientId=null){const ids=new Set();const out=[];d.appointments.forEach(a=>{if(a.bookingType!=='package'||!a.packageId||(clientId&&a.clientId!==clientId)||ids.has(a.packageId))return;ids.add(a.packageId);const stats=packageStats(d,a);if(stats)out.push(stats)});return out}
  function amountDueForAppointment(d,a){
    if(!activeAppointment(a))return 0;if(a.paymentStatus==='pago'||a.paymentStatus==='pago_total'||a.paymentStatus==='incluido_pacote')return 0;
    if(a.bookingType==='package'&&a.paymentPlan==='total'){const items=packageAllAppointments(d,a);if(items.some(x=>x.paymentStatus==='pago_total'))return 0;const owner=items.filter(activeAppointment).sort((x,y)=>Number(x.packageSessionNumber||1)-Number(y.packageSessionNumber||1))[0]||items.sort((x,y)=>Number(x.packageSessionNumber||1)-Number(y.packageSessionNumber||1))[0];return owner?.id===a.id?Number(a.totalPrice||0):0}
    return Number(a.price||0);
  }
  function totalReceivable(d,filter=()=>true){return d.appointments.filter(a=>filter(a)).reduce((sum,a)=>sum+amountDueForAppointment(d,a),0)}
  function waitlistMatchesSlot(d,date,time){const weekday=String(parseYMD(date).getDay());return (d.waitlist||[]).filter(w=>w.status==='waiting'&&(w.preferredWeekday===''||String(w.preferredWeekday)===weekday)&&(!w.preferredTime||w.preferredTime===time))}
  function nextDateForWeekday(weekday){if(weekday===''||weekday==null)return today();const target=Number(weekday);const base=parseYMD(today());let delta=(target-base.getDay()+7)%7;if(delta===0)delta=7;return addDays(today(),delta)}
  function notifyWaitlistSlot(d,date,time){const matches=waitlistMatchesSlot(d,date,time);if(matches.length){const names=matches.slice(0,3).map(w=>d.clients.find(c=>c.id===w.clientId)?.name||'Cliente').join(', ');setTimeout(()=>alert(`🟡 Horário liberado em ${fmtDate(date)} às ${time}.\n\n${matches.length} cliente(s) da lista de espera combinam com esse horário${names?`: ${names}`:''}.`),100)}}
  function rerenderDailyScreen(){if(activeScreen==='agenda')renderAgenda();else if(activeScreen==='appointment'&&lastOpenedAppointmentId)renderAppointment(lastOpenedAppointmentId);else if(activeScreen==='reminders')renderReminders();else renderHome()}
  function renderHome(){
    activeScreen='home';
    const d=currentData();
    const todays=d.appointments.filter(a=>a.date===today()&&activeAppointment(a)).sort((a,b)=>a.time.localeCompare(b.time));
    const next=nextUpcomingAppointment(d);const nextClient=next?d.clients.find(c=>c.id===next.clientId):null;
    const confirmTomorrow=tomorrowConfirmationCount(d);
    const due=totalReceivable(d,a=>activeAppointment(a));
    const nearEnd=uniquePackageStats(d).filter(x=>x.remaining===1);
    view.innerHTML=`${learnGuide('home')}<section class="hero"><h1>Hoje</h1><p>${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</p></section>${currentMode==='daily'?'<div class="actions mode-switch"><button type="button" class="btn ghost" id="switchMode">Trocar modo</button></div>':''}
      <div class="home-dashboard">
        <button class="dashboard-card" id="homeNext"><span>⏰</span><small>Próximo atendimento</small><strong>${next?`${next.time} • ${esc(nextClient?.name||'Cliente')}`:'Nenhum próximo'}</strong>${next?`<em>${fmtDate(next.date)} • ${esc(next.serviceName)}</em>`:''}</button>
        <button class="dashboard-card" id="homeToday"><span>📅</span><small>Hoje</small><strong>${todays.length} atendimento(s)</strong><em>Ver agenda do dia</em></button>
        <button class="dashboard-card" id="homeConfirm"><span>🔔</span><small>Confirmar amanhã</small><strong>${confirmTomorrow}</strong><em>${confirmTomorrow?'cliente(s) aguardando':'Tudo confirmado'}</em></button>
        <button class="dashboard-card" id="homeDue"><span>💰</span><small>A receber</small><strong>${money(due)}</strong><em>Ver valores pendentes</em></button>
      </div>
      ${nearEnd.length?`<div class="notice package-alert" style="margin-top:12px">🎫 <strong>${nearEnd.length} pacote(s) com apenas 1 sessão restante.</strong> <button type="button" class="link-button" id="homePackages">Ver clientes</button></div>`:''}
      ${(d.waitlist||[]).some(w=>w.status==='waiting')?`<div class="notice" style="margin-top:12px">🟡 Lista de espera: <strong>${d.waitlist.filter(w=>w.status==='waiting').length}</strong> cliente(s). <button type="button" class="link-button" id="homeWaitlist">Abrir</button></div>`:''}
      <div class="section-title"><h2>Agenda de hoje</h2><div class="actions"><button class="btn ghost" id="openCalendar">Ver calendário</button><button class="btn secondary" id="quickNew">+ Agendar</button></div></div>
      <div class="list">${todays.length?todays.map(a=>appointmentCard(a,d)).join(''):'<div class="item"><p>Nenhum atendimento agendado para hoje.</p></div>'}</div>`;
    $('#quickNew').onclick=()=>renderNewAppointment();$('#openCalendar').onclick=()=>{agendaSelectedDate=today();agendaCursor=`${today().slice(0,7)}-01`;renderAgenda()};if($('#switchMode'))$('#switchMode').onclick=renderModePicker;
    $('#homeToday').onclick=()=>{agendaSelectedDate=today();agendaCursor=`${today().slice(0,7)}-01`;renderAgenda()};$('#homeConfirm').onclick=renderReminders;$('#homeDue').onclick=renderReceivables;if(next)$('#homeNext').onclick=()=>renderAppointment(next.id);else $('#homeNext').onclick=renderAgenda;
    if($('#homeWaitlist'))$('#homeWaitlist').onclick=renderWaitlist;if($('#homePackages'))$('#homePackages').onclick=renderClients;
    bindAppointmentActions();bindLearnGuide();
  }

  function appointmentCard(a,d=currentData()){
    const c=d.clients.find(x=>x.id===a.clientId);const badgeText=bookingBadge(a);const pay=paymentDisplay(a);const attendance=attendanceLabel(a);const statusTag=a.attendanceStatus&&a.attendanceStatus!=='scheduled'?`<span class="tag ${attendanceClass(a)}">${attendance}</span>`:`<span class="tag ${a.confirmed?'ok':'warn'}">${a.confirmed?'Confirmado':'Confirmar'}</span>`;
    return `<div class="item"><div class="item-row"><div><h3>${a.time} • ${esc(c?.name||'Cliente')}</h3><p>${esc(a.serviceName)}${badgeText?` • <strong>${esc(badgeText)}</strong>`:''} • ${appointmentDuration(d,a)} min</p><p>${money(a.price)} por sessão • ${esc(pay)}</p></div>${statusTag}</div><div class="actions" style="margin-top:10px"><button class="btn ghost" data-view-appt="${a.id}">Abrir</button>${a.attendanceStatus==='scheduled'&&!a.confirmed?`<button class="btn secondary" data-confirm="${a.id}">Marcar confirmado</button>`:''}</div></div>`
  }
  function bindAppointmentActions(){
    document.querySelectorAll('[data-view-appt]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.viewAppt));
    document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=async()=>{const d=currentData(),a=d.appointments.find(x=>x.id===b.dataset.confirm);if(!a)return;a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${a.serviceName} em ${fmtDate(a.date)} ${a.time}`);await persistCurrent();rerenderDailyScreen()})
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

  function appointmentsForDate(d,date){return d.appointments.filter(a=>a.date===date&&activeAppointment(a)).sort((a,b)=>a.time.localeCompare(b.time))}
  function renderMonthGrid(d){
    const cursor=parseYMD(agendaCursor);const y=cursor.getFullYear(),m=cursor.getMonth();const first=new Date(y,m,1,12);const lastDay=new Date(y,m+1,0,12).getDate();let html='';
    for(let i=0;i<first.getDay();i++)html+='<div class="calendar-empty" aria-hidden="true"></div>';
    for(let day=1;day<=lastDay;day++){
      const key=ymd(new Date(y,m,day,12));const count=appointmentsForDate(d,key).length;const blockCount=blocksForDate(d,key).length;const selected=key===agendaSelectedDate;const isToday=key===today();const holidays=holidayInfo(key,d);const holidayText=holidaySummary(holidays);
      html+=`<button type="button" class="calendar-day ${selected?'selected':''} ${isToday?'today':''} ${holidays.length?'holiday':''} ${blockCount?'has-block':''}" data-cal-date="${key}" aria-label="${day}${holidayText?`, ${holidayText}`:''}, ${count} atendimento(s), ${blockCount} bloqueio(s)"><span class="calendar-number">${day}</span><div class="calendar-meta">${count?`<span class="calendar-count">${count}</span><span class="calendar-dot"></span>`:''}${blockCount?`<span class="calendar-lock">🔒</span>`:''}${holidays.length?`<span class="calendar-holiday" title="${esc(holidayText)}">✦</span>`:''}${!count&&!blockCount&&!holidays.length?'<span class="calendar-space"></span>':''}</div></button>`;
    }
    return html;
  }
  function weekStart(value){const d=parseYMD(value);d.setDate(d.getDate()-d.getDay());return ymd(d)}
  function renderWeekGrid(d){
    const start=weekStart(agendaSelectedDate);const labels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return labels.map((label,i)=>{const key=addDays(start,i),date=parseYMD(key),count=appointmentsForDate(d,key).length,blocks=blocksForDate(d,key).length,holidays=holidayInfo(key,d);return `<button type="button" class="week-day ${key===agendaSelectedDate?'selected':''} ${key===today()?'today':''} ${holidays.length?'holiday':''} ${blocks?'has-block':''}" data-cal-date="${key}"><span>${label}</span><strong>${date.getDate()}</strong>${holidays.length?`<small class="holiday-mini">feriado</small>`:(count?`<small>${count} ag.</small>`:(blocks?'<small>🔒 bloqueado</small>':'<small>livre</small>'))}</button>`}).join('');
  }
  function shiftAgenda(delta){
    if(agendaViewMode==='month'){const c=parseYMD(agendaCursor);c.setMonth(c.getMonth()+delta);c.setDate(1);agendaCursor=ymd(c);agendaSelectedDate=agendaCursor}else agendaSelectedDate=addDays(agendaSelectedDate,delta*7);renderAgenda();
  }
  function blockCard(b){return `<div class="item block-item"><div class="item-row"><div><h3>🔒 ${esc(b.reason||'Horário bloqueado')}</h3><p>${b.allDay?'Dia inteiro':`${esc(b.startTime)}–${esc(b.endTime)}`}${b.startDate!==b.endDate?` • ${fmtDate(b.startDate)} a ${fmtDate(b.endDate)}`:''}</p></div><span class="tag warn">Indisponível</span></div><div class="actions" style="margin-top:10px"><button class="btn ghost" data-edit-block="${b.id}">Editar</button><button class="btn secondary" data-release-block="${b.id}">Liberar</button></div></div>`}
  function quickTimeValues(d){const start=minutesFromTime(d.settings.quickStartTime||'08:00'),end=minutesFromTime(d.settings.quickEndTime||'20:00');const out=[];for(let n=start;n<end;n+=30)out.push(timeFromMinutes(n));return out}
  function renderQuickSlots(d,date){return quickTimeValues(d).map(time=>{const busy=slotBusyAt(d,date,time);return `<button type="button" class="quick-slot ${busy?'busy':''}" ${busy?'disabled':''} data-quick-time="${time}" title="${busy?esc(busy.label):'Agendar neste horário'}"><strong>${time}</strong><small>${busy?(busy.type==='block'?'Bloqueado':'Ocupado'):'Livre'}</small></button>`}).join('')}
  function normalizeSearch(v){return String(v||'').trim().toLocaleLowerCase('pt-BR')}
  function renderAgendaSearchResults(d,query){
    const box=$('#agendaSearchResults');if(!box)return;const q=normalizeSearch(query);if(q.length<2){box.innerHTML='';return}const digits=q.replace(/\D/g,'');const clientIds=new Set(d.clients.filter(c=>normalizeSearch(c.name).includes(q)||(digits&&String(c.phone||'').replace(/\D/g,'').includes(digits))).map(c=>c.id));const list=d.appointments.filter(a=>activeAppointment(a)&&clientIds.has(a.clientId)&&dateTimeMs(a.date,a.time)>=Date.now()-86400000).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,30);box.innerHTML=`<div class="card search-results"><strong>Resultados</strong><div class="list" style="margin-top:10px">${list.length?list.map(a=>{const c=d.clients.find(x=>x.id===a.clientId);return `<button type="button" class="search-result" data-search-appt="${a.id}"><span><strong>${esc(c?.name||'Cliente')}</strong><small>${fmtDate(a.date)} • ${a.time} • ${esc(a.serviceName)}</small></span><span>›</span></button>`}).join(''):'<p class="muted">Nenhum agendamento encontrado.</p>'}</div></div>`;box.querySelectorAll('[data-search-appt]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.searchAppt));
  }
  function renderAgenda(){
    activeScreen='agenda';
    const d=currentData();
    if(agendaViewMode==='month'&&!agendaSelectedDate.startsWith(agendaCursor.slice(0,7)))agendaSelectedDate=agendaCursor;
    const selected=appointmentsForDate(d,agendaSelectedDate);const blocks=blocksForDate(d,agendaSelectedDate);
    const title=agendaViewMode==='month'?monthTitle(agendaCursor):`${fmtDate(weekStart(agendaSelectedDate))} – ${fmtDate(addDays(weekStart(agendaSelectedDate),6))}`;
    const holidayEntries=holidayInfo(agendaSelectedDate,d);const holidayNotice=holidayEntries.length?`<div class="notice holiday-notice">🎉 <strong>Feriado:</strong> ${esc(holidaySummary(holidayEntries))}</div>`:'';const waitingToday=(d.waitlist||[]).filter(w=>w.status==='waiting'&&(w.preferredWeekday===''||String(w.preferredWeekday)===String(parseYMD(agendaSelectedDate).getDay()))).length;
    view.innerHTML=`${learnGuide('agenda')}<div class="section-title"><h2>Agenda</h2><div class="actions"><button class="btn ghost" id="agendaWaitlist">🟡 Espera${waitingToday?` (${waitingToday})`:''}</button><button class="btn primary" id="addA">+ Novo</button></div></div>
      <div class="card agenda-search"><div class="field"><label>🔎 Localizar cliente na agenda</label><input id="agendaSearch" type="search" placeholder="Digite nome ou telefone"></div></div><div id="agendaSearchResults"></div>
      <section class="calendar card">
        <div class="calendar-toolbar"><button class="calendar-arrow" id="calPrev" aria-label="Anterior">‹</button><strong>${title}</strong><button class="calendar-arrow" id="calNext" aria-label="Próximo">›</button></div>
        <div class="calendar-actions"><div class="view-toggle"><button type="button" class="${agendaViewMode==='month'?'active':''}" id="monthView">Mês</button><button type="button" class="${agendaViewMode==='week'?'active':''}" id="weekView">Semana</button></div><button type="button" class="btn ghost compact" id="goToday">Hoje</button></div>
        ${agendaViewMode==='month'?`<div class="calendar-weekdays"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="calendar-grid">${renderMonthGrid(d)}</div>`:`<div class="week-grid">${renderWeekGrid(d)}</div>`}
      </section>
      <div class="help" style="margin-top:8px">✦ feriado • 🔒 horário/dia bloqueado. O intervalo entre clientes é considerado automaticamente ao verificar conflitos.</div>${holidayNotice}
      <div class="section-title"><h2>${agendaSelectedDate===today()?'Hoje':fmtDate(agendaSelectedDate)}</h2><div class="actions"><button class="btn ghost" id="blockSelectedDay">🔒 Bloquear</button><span class="muted">${selected.length} atendimento(s)</span></div></div>
      ${blocks.length?`<div class="list block-list">${blocks.map(blockCard).join('')}</div>`:''}
      <div class="list">${selected.length?selected.map(a=>appointmentCard(a,d)).join(''):'<div class="item empty-day"><p>Nenhum atendimento neste dia.</p><button class="btn secondary" id="addSelectedDay">+ Agendar neste dia</button></div>'}</div>
      <details class="card quick-agenda" style="margin-top:14px"><summary><strong>⚡ Agenda rápida — tocar em um horário livre</strong></summary><p class="help">Horários ocupados consideram a duração da massagem e o intervalo configurado entre clientes.</p><div class="quick-slot-grid">${renderQuickSlots(d,agendaSelectedDate)}</div></details>`;
    $('#addA').onclick=()=>renderNewAppointment();$('#agendaWaitlist').onclick=renderWaitlist;$('#calPrev').onclick=()=>shiftAgenda(-1);$('#calNext').onclick=()=>shiftAgenda(1);$('#monthView').onclick=()=>{agendaViewMode='month';agendaCursor=`${agendaSelectedDate.slice(0,7)}-01`;renderAgenda()};$('#weekView').onclick=()=>{agendaViewMode='week';renderAgenda()};$('#goToday').onclick=()=>{resetAgendaPosition();renderAgenda()};$('#blockSelectedDay').onclick=()=>blockModal(agendaSelectedDate);
    document.querySelectorAll('[data-cal-date]').forEach(b=>b.onclick=()=>{agendaSelectedDate=b.dataset.calDate;if(agendaViewMode==='month')agendaCursor=`${agendaSelectedDate.slice(0,7)}-01`;renderAgenda()});if($('#addSelectedDay'))$('#addSelectedDay').onclick=()=>renderNewAppointment(agendaSelectedDate);document.querySelectorAll('[data-quick-time]').forEach(b=>b.onclick=()=>renderNewAppointment(agendaSelectedDate,b.dataset.quickTime));document.querySelectorAll('[data-edit-block]').forEach(b=>b.onclick=()=>blockModal(agendaSelectedDate,d.blocks.find(x=>x.id===b.dataset.editBlock)));document.querySelectorAll('[data-release-block]').forEach(b=>b.onclick=async()=>{const block=d.blocks.find(x=>x.id===b.dataset.releaseBlock);if(!block)return;if(!confirm('Liberar este período? O histórico do bloqueio será preservado.'))return;block.active=false;touchRecord(block);log('Horário liberado',`${block.reason} • ${fmtDate(block.startDate)}${block.allDay?' • dia inteiro':` • ${block.startTime}–${block.endTime}`}`);await persistCurrent();renderAgenda()});$('#agendaSearch').oninput=e=>renderAgendaSearchResults(d,e.target.value);
    bindAppointmentActions();bindLearnGuide();
  }
  function blockModal(date,existing=null){
    const d=currentData();const b=existing||{startDate:date,endDate:date,startTime:'12:00',endTime:'13:00',allDay:false,reason:'Compromisso pessoal'};
    modal.innerHTML=`<form class="modal-body" id="blockForm"><h3>${existing?'Editar bloqueio':'Bloquear horário ou dia'}</h3><div class="field"><label>Motivo</label><select id="blockReason"><option ${b.reason==='Compromisso pessoal'?'selected':''}>Compromisso pessoal</option><option ${b.reason==='Almoço / intervalo'?'selected':''}>Almoço / intervalo</option><option ${b.reason==='Sala indisponível'?'selected':''}>Sala indisponível</option><option ${b.reason==='Férias / folga'?'selected':''}>Férias / folga</option><option ${!['Compromisso pessoal','Almoço / intervalo','Sala indisponível','Férias / folga'].includes(b.reason)?'selected':''}>Outro</option></select></div><div class="field hidden" id="blockOtherWrap"><label>Descrição</label><input id="blockOther" value="${attr(!['Compromisso pessoal','Almoço / intervalo','Sala indisponível','Férias / folga'].includes(b.reason)?b.reason:'')}"></div><div class="grid"><div class="field"><label>De</label><input id="blockStartDate" type="date" value="${attr(b.startDate||date)}" required></div><div class="field"><label>Até</label><input id="blockEndDate" type="date" value="${attr(b.endDate||date)}" required></div></div><label class="switch-line"><input id="blockAllDay" type="checkbox" ${b.allDay?'checked':''}> Bloquear o dia inteiro</label><div class="grid" id="blockTimes"><div class="field"><label>Início</label><input id="blockStartTime" type="time" value="${attr(b.startTime||'12:00')}"></div><div class="field"><label>Fim</label><input id="blockEndTime" type="time" value="${attr(b.endTime||'13:00')}"></div></div><div class="actions"><button type="button" class="btn ghost" id="blockCancel">Cancelar</button><button class="btn primary">Salvar bloqueio</button></div></form>`;modal.showModal();const toggleOther=()=>$('#blockOtherWrap').classList.toggle('hidden',$('#blockReason').value!=='Outro');const toggleDay=()=>$('#blockTimes').classList.toggle('hidden',$('#blockAllDay').checked);toggleOther();toggleDay();$('#blockReason').onchange=toggleOther;$('#blockAllDay').onchange=toggleDay;$('#blockCancel').onclick=()=>modal.close();$('#blockForm').onsubmit=async e=>{e.preventDefault();const startDate=$('#blockStartDate').value,endDate=$('#blockEndDate').value,allDay=$('#blockAllDay').checked,startTime=$('#blockStartTime').value,endTime=$('#blockEndTime').value;if(!startDate||!endDate||endDate<startDate){alert('Confira as datas do bloqueio.');return}if(!allDay&&(!startTime||!endTime||minutesFromTime(endTime)<=minutesFromTime(startTime))){alert('O horário final deve ser depois do horário inicial.');return}let affected=0;d.appointments.filter(a=>activeAppointment(a)&&a.date>=startDate&&a.date<=endDate).forEach(a=>{if(allDay)affected++;else{const ar=appointmentRange(d,a);if(rangesOverlap(minutesFromTime(startTime),minutesFromTime(endTime),ar.start,ar.end))affected++}});if(affected&&!confirm(`Já existem ${affected} atendimento(s) dentro desse período. O bloqueio não cancelará esses atendimentos.\n\nSalvar mesmo assim?`))return;const reason=$('#blockReason').value==='Outro'?($('#blockOther').value.trim()||'Outro compromisso'):$('#blockReason').value;const obj=existing||{id:uid(),createdAt:new Date().toISOString()};Object.assign(obj,{startDate,endDate,allDay,startTime,endTime,reason,active:true});touchRecord(obj);if(!existing)d.blocks.push(obj);log(existing?'Bloqueio alterado':'Horário bloqueado',`${reason} • ${fmtDate(startDate)}${endDate!==startDate?` a ${fmtDate(endDate)}`:''}${allDay?' • dia inteiro':` • ${startTime}–${endTime}`}`);await persistCurrent();modal.close();renderAgenda()};
  }

  function renderNewAppointment(initialDate=agendaSelectedDate||today(),initialTime='14:00',preset={}){
    if(typeof initialDate!=='string')initialDate=agendaSelectedDate||today();if(typeof initialTime!=='string')initialTime='14:00';preset=preset&&typeof preset==='object'?preset:{};
    activeScreen='newAppointment';const d=currentData();
    const clientOptions=d.clients.length?d.clients.map(c=>`<option value="${c.id}" ${preset.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join(''):'<option value="" selected disabled>Nenhuma cliente cadastrada</option>';
    view.innerHTML=`${learnGuide('new')}<div class="section-title"><h2>Novo agendamento</h2></div><form class="form card" id="apptForm">
      <div class="field"><label>Cliente</label><div class="client-inline-picker"><select id="clientId" required>${clientOptions}</select><button type="button" class="btn secondary" id="newClientDuringBooking">+ Nova cliente</button></div><div class="help">Se a cliente ainda não estiver cadastrada, crie o cadastro aqui sem sair do agendamento.</div></div>
      <div class="field"><label>Serviço</label><select id="serviceId" required>${d.services.map(s=>`<option value="${s.id}" ${preset.serviceId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo</label><select id="bookingType"><option value="single">Sessão única</option><option value="package">Pacote de sessões</option></select></div>
      <div class="field"><label id="totalValueLabel">Valor total da sessão</label><input id="totalValue" inputmode="decimal" type="number" step="0.01" min="0" required><div class="help" id="totalValueHelp">Este é o valor total combinado para esta sessão.</div></div>
      <section id="singleBlock" class="booking-block"><div class="field"><label>Data</label><input id="singleDate" type="date" value="${attr(initialDate)}"></div><div class="field"><label>Horário</label><input id="singleTime" type="time" value="${attr(initialTime)}"></div><label class="switch-line"><input id="repeatWeekly" type="checkbox"> Repetir semanalmente no mesmo dia e horário</label><div class="field hidden" id="repeatCountWrap"><label>Quantidade total de agendamentos</label><input id="repeatCount" type="number" min="2" max="52" value="4"><div class="help">Ex.: 4 cria este horário e mais 3 semanas seguidas.</div></div><div class="field"><label>Situação do pagamento</label><select id="singlePaymentStatus"><option value="pending">A receber</option><option value="paid">Já pago</option></select></div><div class="field hidden" id="singlePaymentMethodWrap"><label>Forma de pagamento</label><select id="singlePaymentMethod"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select><div class="help">Se houver repetição semanal, o pagamento informado vale somente para o primeiro atendimento; os próximos ficam a receber.</div></div></section>
      <section id="packageBlock" class="booking-block hidden"><div class="package-summary"><strong>Pacote</strong><span id="packageUnitPreview">Valor por sessão: ${money(0)}</span></div><div class="field"><label>Quantidade de sessões</label><input id="packageCount" type="number" min="2" max="52" value="5"></div><label class="switch-line"><input id="packageWeekly" type="checkbox" checked> Preencher todas as sessões semanalmente no mesmo dia e horário</label><div class="help">Você pode desmarcar e escolher datas/horários diferentes em cada sessão.</div><div id="packageSchedule" class="session-schedule"></div><div class="field"><label>Como será o pagamento?</label><select id="packagePaymentPlan"><option value="total">Valor total do pacote</option><option value="per_session">Pagamento por sessão</option></select></div><div class="field"><label>Situação do pagamento agora</label><select id="packagePaymentStatus"><option value="pending">Ainda não pago</option><option value="paid">Já pago</option></select></div><div class="field hidden" id="packagePaymentMethodWrap"><label>Forma de pagamento</label><select id="packagePaymentMethod"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select><div class="help" id="packagePaymentHelp">O valor total do pacote será registrado como recebido.</div></div></section>
      <div class="field"><label>Observação (opcional)</label><textarea id="notes" placeholder="Ex.: prefere pressão leve">${esc(preset.notes||'')}</textarea></div><div class="notice">⏱️ O sistema verifica automaticamente conflitos usando a duração do serviço + ${Number(d.settings.appointmentGapMinutes||0)} min de intervalo entre clientes.</div><button class="btn primary block">Salvar agendamento</button></form>`;
    const serviceSel=$('#serviceId'),totalValue=$('#totalValue'),bookingType=$('#bookingType');
    $('#newClientDuringBooking').onclick=()=>quickClientDuringAppointmentModal(d,$('#clientId'));
    const fillServicePrice=()=>{const s=d.services.find(x=>x.id===serviceSel.value);if(s&&!totalValue.dataset.edited)totalValue.value=preset.totalValue!=null?preset.totalValue:(s.price??0);updatePackagePreview()};totalValue.addEventListener('input',()=>{totalValue.dataset.edited='1';updatePackagePreview()});serviceSel.onchange=()=>{delete totalValue.dataset.edited;preset.totalValue=null;fillServicePrice()};
    const togglePaymentMethod=(statusSel,wrap)=>wrap.classList.toggle('hidden',statusSel.value!=='paid');$('#singlePaymentStatus').onchange=()=>togglePaymentMethod($('#singlePaymentStatus'),$('#singlePaymentMethodWrap'));$('#packagePaymentStatus').onchange=()=>togglePaymentMethod($('#packagePaymentStatus'),$('#packagePaymentMethodWrap'));$('#packagePaymentPlan').onchange=()=>{const per=$('#packagePaymentPlan').value==='per_session';$('#packagePaymentHelp').textContent=per?'O pagamento informado agora será aplicado à primeira sessão. As demais ficarão a receber.':'O valor total do pacote será registrado como recebido.'};$('#repeatWeekly').onchange=()=>$('#repeatCountWrap').classList.toggle('hidden',!$('#repeatWeekly').checked);
    function currentPackageRows(){return [...document.querySelectorAll('.session-row')].map(r=>({date:r.querySelector('[data-session-date]')?.value||'',time:r.querySelector('[data-session-time]')?.value||''}))}
    function renderPackageSchedule(preserve=true){const count=Math.max(2,Math.min(52,Number($('#packageCount').value||2)));$('#packageCount').value=count;const previous=preserve?currentPackageRows():[];const baseDate=previous[0]?.date||initialDate;const baseTime=previous[0]?.time||initialTime;const weekly=$('#packageWeekly').checked;let html='';for(let i=0;i<count;i++){const date=previous[i]?.date||(weekly?addDays(baseDate,i*7):addDays(baseDate,i));const time=previous[i]?.time||baseTime;html+=`<div class="session-row"><span>Sessão ${i+1}</span><input type="date" data-session-date value="${attr(date)}" required><input type="time" data-session-time value="${attr(time)}" required></div>`}$('#packageSchedule').innerHTML=html;const rows=[...document.querySelectorAll('.session-row')];if(rows[0]){rows[0].querySelector('[data-session-date]').addEventListener('change',()=>{if($('#packageWeekly').checked)fillPackageWeekly()});rows[0].querySelector('[data-session-time]').addEventListener('change',()=>{if($('#packageWeekly').checked)fillPackageWeekly()})}updatePackagePreview()}
    function fillPackageWeekly(){const rows=[...document.querySelectorAll('.session-row')];if(!rows.length)return;const firstDate=rows[0].querySelector('[data-session-date]').value||initialDate;const firstTime=rows[0].querySelector('[data-session-time]').value||initialTime;rows.forEach((r,i)=>{r.querySelector('[data-session-date]').value=addDays(firstDate,i*7);r.querySelector('[data-session-time]').value=firstTime})}
    function updatePackagePreview(){const count=Math.max(1,Number($('#packageCount')?.value||1));const total=Number(totalValue.value||0);if($('#packageUnitPreview'))$('#packageUnitPreview').textContent=`Valor por sessão: ${money(total/count)}`}
    $('#packageCount').onchange=()=>renderPackageSchedule(true);$('#packageCount').oninput=updatePackagePreview;$('#packageWeekly').onchange=()=>{if($('#packageWeekly').checked)fillPackageWeekly()};bookingType.onchange=()=>{const pack=bookingType.value==='package';$('#singleBlock').classList.toggle('hidden',pack);$('#packageBlock').classList.toggle('hidden',!pack);$('#totalValueLabel').textContent=pack?'Valor total do pacote':'Valor total da sessão';$('#totalValueHelp').textContent=pack?'Informe o valor total combinado do pacote. O sistema divide pela quantidade de sessões.':'Este é o valor total combinado para esta sessão.';if(pack)renderPackageSchedule(true)};fillServicePrice();renderPackageSchedule(false);
    $('#apptForm').onsubmit=async e=>{e.preventDefault();const svc=d.services.find(x=>x.id===serviceSel.value);if(!svc){alert('Escolha um serviço.');return}const clientId=$('#clientId').value,notes=$('#notes').value.trim(),total=Number(totalValue.value||0),duration=Math.max(5,Number(svc.duration||60));if(total<0){alert('Informe um valor válido.');return}const createdAt=new Date().toISOString();
      if(bookingType.value==='package'){
        const schedule=currentPackageRows();if(schedule.some(x=>!x.date||!x.time)){alert('Preencha a data e o horário de todas as sessões.');return}const proposed=schedule.map(slot=>({...slot,duration}));if(!confirmScheduleConflicts(d,proposed))return;const count=schedule.length,unit=Number((total/count).toFixed(2)),packageId=uid(),plan=$('#packagePaymentPlan').value,paidNow=$('#packagePaymentStatus').value==='paid',method=paidNow?$('#packagePaymentMethod').value:'';schedule.forEach((slot,i)=>{let paymentStatus='pendente',amountPaid=0;if(paidNow&&plan==='total'){paymentStatus=i===0?'pago_total':'incluido_pacote';amountPaid=i===0?total:0}else if(paidNow&&plan==='per_session'&&i===0){paymentStatus='pago';amountPaid=unit}const a={id:uid(),clientId,serviceId:svc.id,serviceName:svc.name,defaultPrice:Number(svc.price),duration,bookingType:'package',packageId,packageSessionCount:count,packageSessionNumber:i+1,totalPrice:total,price:unit,paymentPlan:plan,paymentStatus,paymentMethod:paymentStatus==='pendente'?'':method,amountPaid,date:slot.date,time:slot.time,notes,confirmed:false,status:'agendado',attendanceStatus:'scheduled',consumesPackageSession:false,createdAt};if(amountPaid>0)a.paidAt=createdAt;touchRecord(a);d.appointments.push(a)});log('Pacote agendado',`${svc.name} • ${count} sessões • total ${money(total)} • ${money(unit)} por sessão • ${plan==='total'?'pagamento total':'pagamento por sessão'}`);agendaSelectedDate=schedule[0].date;agendaCursor=`${schedule[0].date.slice(0,7)}-01`;
      }else{
        const firstDate=$('#singleDate').value,firstTime=$('#singleTime').value;if(!firstDate||!firstTime){alert('Informe data e horário.');return}const repeat=$('#repeatWeekly').checked,count=repeat?Math.max(2,Math.min(52,Number($('#repeatCount').value||2))):1,proposed=Array.from({length:count},(_,i)=>({date:addDays(firstDate,i*7),time:firstTime,duration}));if(!confirmScheduleConflicts(d,proposed))return;const seriesId=count>1?uid():'',paidFirst=$('#singlePaymentStatus').value==='paid',method=paidFirst?$('#singlePaymentMethod').value:'';for(let i=0;i<count;i++){const paid=paidFirst&&i===0;const a={id:uid(),clientId,serviceId:svc.id,serviceName:svc.name,defaultPrice:Number(svc.price),duration,bookingType:'single',seriesId,totalPrice:total,price:total,paymentPlan:'per_session',paymentStatus:paid?'pago':'pendente',paymentMethod:paid?method:'',amountPaid:paid?total:0,date:addDays(firstDate,i*7),time:firstTime,notes,confirmed:false,status:'agendado',attendanceStatus:'scheduled',createdAt};if(paid)a.paidAt=createdAt;touchRecord(a);d.appointments.push(a)}log(count>1?'Agendamento semanal criado':'Agendamento criado',`${svc.name} • ${count} agendamento(s) • ${money(total)} por sessão`);agendaSelectedDate=firstDate;agendaCursor=`${firstDate.slice(0,7)}-01`;
      }
      if(preset.waitlistId){const w=d.waitlist.find(x=>x.id===preset.waitlistId);if(w){w.status='booked';w.bookedAt=new Date().toISOString();touchRecord(w);log('Lista de espera atendida',d.clients.find(c=>c.id===w.clientId)?.name||'Cliente')}}await persistCurrent();renderAgenda();
    };bindLearnGuide();
  }

  function quickClientDuringAppointmentModal(d,selectEl){
    modal.innerHTML=`<form class="modal-body" id="quickClientForm"><h3>+ Cadastrar nova cliente</h3><p class="help">O cadastro será salvo e a nova cliente ficará selecionada neste agendamento.</p><div class="field"><label>Nome</label><input id="qcName" required autocomplete="name"></div><div class="field"><label>Telefone</label><input id="qcPhone" inputmode="tel" autocomplete="tel" placeholder="(16) 99999-9999"></div><div class="field"><label>Aniversário (opcional)</label><input id="qcBirth" type="date"></div><div class="field"><label>Preferências / observações (opcional)</label><textarea id="qcNotes" placeholder="Ex.: prefere pressão leve"></textarea></div><div class="actions"><button type="button" class="btn ghost" id="quickClientCancel">Cancelar</button><button class="btn primary">Salvar e usar no agendamento</button></div></form>`;
    modal.showModal();
    $('#quickClientCancel').onclick=()=>modal.close();
    $('#quickClientForm').onsubmit=async e=>{
      e.preventDefault();
      const name=$('#qcName').value.trim(),phone=$('#qcPhone').value.trim(),birth=$('#qcBirth').value,notes=$('#qcNotes').value.trim();
      if(!name){alert('Informe o nome da cliente.');return}
      const normalizedName=normalizeSearch(name),phoneDigits=phone.replace(/\D/g,'');
      const possible=d.clients.find(c=>normalizeSearch(c.name)===normalizedName||(phoneDigits.length>=8&&String(c.phone||'').replace(/\D/g,'')===phoneDigits));
      if(possible){
        const useExisting=confirm(`Já existe um cadastro parecido: ${possible.name}${possible.phone?` • ${possible.phone}`:''}.\n\nToque em OK para usar esse cadastro existente. Toque em Cancelar somente se realmente quiser criar outro cadastro.`);
        if(useExisting){
          if(![...selectEl.options].some(o=>o.value===possible.id)){const opt=document.createElement('option');opt.value=possible.id;opt.textContent=possible.name;selectEl.appendChild(opt)}
          selectEl.value=possible.id;modal.close();return;
        }
      }
      const obj={id:uid(),name,phone,birth,notes,createdAt:new Date().toISOString()};touchRecord(obj);d.clients.push(obj);log('Cliente cadastrado durante agendamento',obj.name);await persistCurrent();
      const empty=[...selectEl.options].find(o=>!o.value);if(empty)empty.remove();
      const opt=document.createElement('option');opt.value=obj.id;opt.textContent=obj.name;opt.selected=true;selectEl.appendChild(opt);selectEl.value=obj.id;
      modal.close();
    };
  }

  function packageAppointments(d,a){return a?.packageId?d.appointments.filter(x=>x.packageId===a.packageId&&activeAppointment(x)).sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time)):[]}
  function packageProgressHtml(stats){if(!stats)return '';const pct=stats.total?Math.min(100,Math.round(stats.used/stats.total*100)):0;return `<div class="package-progress"><div class="package-progress-head"><strong>${stats.used}/${stats.total} sessões utilizadas</strong><span>${stats.remaining} restante(s)</span></div><div class="progress"><div style="width:${pct}%"></div></div>${stats.noShows?`<small>${stats.noShows} falta(s) registrada(s)</small>`:''}</div>`}
  function renderAppointment(id){
    activeScreen='appointment';lastOpenedAppointmentId=id;const d=currentData(),a=d.appointments.find(x=>x.id===id);if(!a)return renderAgenda();const c=d.clients.find(x=>x.id===a.clientId),pack=a.bookingType==='package',stats=pack?packageStats(d,a):null,packItems=pack?packageAllAppointments(d,a):[],isPaid=['pago','pago_total','incluido_pacote'].includes(a.paymentStatus),attendance=attendanceLabel(a),isActive=activeAppointment(a),nextPack=stats?.next&&stats.next.id!==a.id?stats.next:null;
    const packageInfo=pack?`<div class="package-detail">${packageProgressHtml(stats)}<p><strong>Pacote:</strong> sessão ${a.packageSessionNumber} de ${a.packageSessionCount}${a.packageReplacement?' • reposição':''}</p><p><strong>Valor total:</strong> ${money(a.totalPrice)}</p><p><strong>Valor por sessão:</strong> ${money(a.price)}</p><p><strong>Pagamento:</strong> ${a.paymentPlan==='total'?'valor total do pacote':'por sessão'} • ${esc(paymentDisplay(a))}</p>${stats?.remaining===1?'<div class="notice package-alert">🔔 Este pacote está com apenas <strong>1 sessão restante</strong>.</div>':''}${stats?.remaining===0?'<div class="notice">✓ Pacote concluído.</div>':''}<details><summary>Ver sessões do pacote</summary><div class="package-dates">${packItems.map(x=>`<div class="package-date ${x.id===a.id?'current':''}"><span>${x.packageReplacement?'Rep.':`${x.packageSessionNumber}/${x.packageSessionCount}`}</span><strong>${fmtDate(x.date)} • ${x.time}</strong><small>${esc(attendanceLabel(x))} • ${esc(paymentDisplay(x))}</small></div>`).join('')}</div></details></div>`:`<p><strong>Valor combinado:</strong> ${money(a.price)}</p><p><strong>Pagamento:</strong> ${esc(paymentDisplay(a))}</p>`;
    const attendanceNotice=a.attendanceStatus!=='scheduled'?`<div class="notice attendance-notice"><strong>${attendanceClass(a)==='ok'?'✓':'⚠'} ${esc(attendance)}</strong>${a.attendanceStatus==='no_show'&&pack?` • ${a.consumesPackageSession?'contabilizada como sessão do pacote':'não descontada do pacote'}`:''}</div>`:'';
    const actions=[];
    if(isActive)actions.push('<button class="btn ghost" id="editAppointment">Editar agendamento</button>');
    if(a.attendanceStatus==='scheduled'&&!a.confirmed)actions.push('<button class="btn secondary" id="toggleConfirm">Marcar confirmado</button>');else if(a.confirmed&&a.attendanceStatus==='scheduled')actions.push('<button class="btn secondary" disabled>✓ Confirmado</button>');
    if(isActive)actions.push(`<button class="btn primary" id="pay" ${isPaid?'disabled':''}>${isPaid?'✓ Pagamento registrado':(pack&&a.paymentPlan==='total'?'Registrar pagamento do pacote':'Registrar pagamento')}</button>`);
    if(a.attendanceStatus==='scheduled'){actions.push('<button class="btn secondary" id="markAttended">✓ Compareceu</button>');actions.push('<button class="btn ghost" id="markNoShow">✕ Faltou</button>')}
    if(!pack&&isActive)actions.push('<button class="btn secondary" id="duplicateWeekly">Duplicar semanalmente</button>');
    if(a.attendanceStatus==='attended'){if(pack&&nextPack)actions.push('<button class="btn secondary" id="nextPackage">Abrir próxima sessão</button>');else if(pack&&stats?.remaining>0)actions.push('<button class="btn secondary" id="scheduleReplacement">📆 Agendar sessão restante do pacote</button>');else actions.push('<button class="btn secondary" id="scheduleReturn">📆 Agendar próximo retorno</button>')}
    if((a.attendanceStatus==='no_show'&&!a.consumesPackageSession)||(a.status==='cancelado'&&pack))actions.push('<button class="btn secondary" id="scheduleReplacement">📆 Agendar reposição</button>');
    if(a.status==='cancelado'&&!pack)actions.push('<button class="btn secondary" id="scheduleReturn">📆 Agendar novo horário</button>');
    if(isActive)actions.push('<button class="btn danger" id="cancel">Cancelar atendimento</button>');
    view.innerHTML=`${learnGuide('appointment')}<div class="card"><div class="item-row"><div><h2>${esc(c?.name||'Cliente')}</h2><p><strong>${esc(a.serviceName)}</strong></p><p>${fmtDate(a.date)} às ${a.time} • ${appointmentDuration(d,a)} min</p></div><span class="tag ${attendanceClass(a)}">${esc(attendance)}</span></div>${attendanceNotice}<p>Valor padrão do serviço: ${money(a.defaultPrice)}</p>${packageInfo}${a.notes?`<p class="muted">${esc(a.notes)}</p>`:''}<div class="actions">${actions.join('')}</div></div><div class="actions" style="margin-top:12px"><button class="btn ghost" id="backAgenda">← Agenda</button></div>`;
    if($('#editAppointment'))$('#editAppointment').onclick=()=>renderEditAppointment(id);if($('#toggleConfirm'))$('#toggleConfirm').onclick=async()=>{a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();renderAppointment(id)};if($('#pay'))$('#pay').onclick=()=>paymentModal(a,c);if($('#markAttended'))$('#markAttended').onclick=()=>markAttendance(a,c,'attended');if($('#markNoShow'))$('#markNoShow').onclick=()=>markAttendance(a,c,'no_show');if($('#duplicateWeekly'))$('#duplicateWeekly').onclick=()=>duplicateWeeklyModal(a,c);if($('#nextPackage'))$('#nextPackage').onclick=()=>renderAppointment(nextPack.id);if($('#scheduleReturn'))$('#scheduleReturn').onclick=()=>renderNewAppointment(addDays(a.date,7),a.time,{clientId:a.clientId,serviceId:a.serviceId,totalValue:a.price});if($('#scheduleReplacement'))$('#scheduleReplacement').onclick=()=>a.bookingType==='package'?packageReplacementModal(a,c):renderNewAppointment(addDays(a.date,7),a.time,{clientId:a.clientId,serviceId:a.serviceId,totalValue:a.price,notes:'Reposição de sessão'});if($('#cancel'))$('#cancel').onclick=async()=>{if(!confirm('Cancelar este atendimento? O registro será preservado no histórico.'))return;const oldDate=a.date,oldTime=a.time;a.status='cancelado';a.attendanceStatus='cancelled';a.confirmed=false;touchRecord(a);log('Atendimento cancelado',`${c?.name||''} • ${a.serviceName}`);await persistCurrent();notifyWaitlistSlot(d,oldDate,oldTime);renderAgenda()};$('#backAgenda').onclick=renderAgenda;bindLearnGuide();
  }

  async function markAttendance(a,c,status){const d=currentData();if(status==='no_show'&&a.bookingType==='package'){a.consumesPackageSession=confirm('Esta falta deve contar como uma sessão utilizada do pacote?\n\nOK = descontar do pacote\nCancelar = não descontar')};a.attendanceStatus=status;a.status='agendado';if(status==='attended'){a.attendedAt=new Date().toISOString();a.consumesPackageSession=true}else{a.noShowAt=new Date().toISOString()}touchRecord(a);log(status==='attended'?'Comparecimento registrado':'Falta registrada',`${c?.name||''} • ${a.serviceName}${status==='no_show'&&a.bookingType==='package'?` • ${a.consumesPackageSession?'descontada':'não descontada'} do pacote`:''}`);await persistCurrent();if(a.bookingType==='package'){const stats=packageStats(d,a);if(stats?.remaining===1)alert('🔔 Este pacote ficou com apenas 1 sessão restante.');if(stats?.remaining===0)alert('✓ Pacote concluído.')}renderAppointment(a.id)}

  function packageReplacementModal(a,c){
    const d=currentData(),stats=packageStats(d,a),target=(stats?.items||[]).find(x=>(x.attendanceStatus==='no_show'&&!x.consumesPackageSession)||x.status==='cancelado')||a,defaultDate=addDays(a.date,7);modal.innerHTML=`<form class="modal-body" id="replacementForm"><h3>Agendar reposição do pacote</h3><p><strong>${esc(c?.name||'Cliente')}</strong><br>${esc(a.serviceName)}</p><div class="notice">A reposição continua vinculada ao mesmo pacote e não aumenta o valor total.</div><div class="field"><label>Data</label><input id="replacementDate" type="date" value="${attr(defaultDate)}" required></div><div class="field"><label>Horário</label><input id="replacementTime" type="time" value="${attr(a.time)}" required></div><div class="actions"><button type="button" class="btn ghost" id="replacementCancel">Cancelar</button><button class="btn primary">Criar reposição</button></div></form>`;modal.showModal();$('#replacementCancel').onclick=()=>modal.close();$('#replacementForm').onsubmit=async e=>{e.preventDefault();const date=$('#replacementDate').value,time=$('#replacementTime').value,duration=appointmentDuration(d,a);if(!confirmScheduleConflicts(d,[{date,time,duration}]))return;const paidPackage=stats?.paid||a.paymentStatus==='pago_total'||a.paymentStatus==='incluido_pacote';const originalPaid=a.paymentStatus==='pago';const copy={...structuredClone(a),id:uid(),date,time,confirmed:false,status:'agendado',attendanceStatus:'scheduled',consumesPackageSession:false,packageReplacement:true,replacementForId:target.id,packageSessionNumber:target.packageSessionNumber||a.packageSessionNumber,notes:`${a.notes?`${a.notes} • `:''}Reposição`,paymentStatus:(paidPackage||originalPaid)?'incluido_pacote':'pendente',paymentMethod:(paidPackage||originalPaid)?a.paymentMethod:'',amountPaid:0,paidAt:(paidPackage||originalPaid)?new Date().toISOString():null,createdAt:new Date().toISOString()};touchRecord(copy);d.appointments.push(copy);a.replacementCreated=true;touchRecord(a);log('Reposição de pacote agendada',`${c?.name||''} • ${fmtDate(date)} ${time}`);await persistCurrent();modal.close();renderAppointment(copy.id)};
  }

  function renderEditAppointment(id){
    activeScreen='editAppointment';const d=currentData(),a=d.appointments.find(x=>x.id===id);if(!a)return renderAgenda();const pack=a.bookingType==='package',paid=['pago','pago_total','incluido_pacote'].includes(a.paymentStatus),clientOptions=d.clients.map(c=>`<option value="${c.id}" ${c.id===a.clientId?'selected':''}>${esc(c.name)}</option>`).join(''),serviceOptions=d.services.map(s=>`<option value="${s.id}" ${s.id===a.serviceId?'selected':''}>${esc(s.name)}</option>`).join('');
    view.innerHTML=`${learnGuide('appointment')}<div class="section-title"><h2>Editar agendamento</h2></div><form class="form card" id="editApptForm">${pack?`<div class="notice">Este atendimento pertence a um pacote. Para manter o pacote consistente, aqui você altera somente a data, o horário e as observações desta sessão.</div>`:`<div class="field"><label>Cliente</label><select id="editClientId" required>${clientOptions}</select></div><div class="field"><label>Serviço</label><select id="editServiceId" required>${serviceOptions}</select></div><div class="field"><label>Valor desta sessão</label><input id="editPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${attr(a.price)}" ${paid?'disabled':''} required><div class="help">${paid?'O valor está bloqueado porque o pagamento já foi registrado.':'Você pode alterar o valor combinado desta sessão.'}</div></div>`}<div class="field"><label>Data</label><input id="editDate" type="date" value="${attr(a.date)}" required></div><div class="field"><label>Horário</label><input id="editTime" type="time" value="${attr(a.time)}" required></div><div class="field"><label>Observação</label><textarea id="editNotes">${esc(a.notes||'')}</textarea></div>${a.confirmed?'<div class="notice">✓ Este atendimento está confirmado. Se a data ou o horário mudar, ele voltará automaticamente para <strong>Aguardando confirmação</strong>.</div>':''}<div class="actions"><button type="button" class="btn ghost" id="cancelEditAppt">Cancelar</button><button class="btn primary">Salvar alterações</button></div></form>`;
    $('#cancelEditAppt').onclick=()=>renderAppointment(id);$('#editApptForm').onsubmit=async e=>{e.preventDefault();const oldDate=a.date,oldTime=a.time,wasConfirmed=a.confirmed===true,nextDate=$('#editDate').value,nextTime=$('#editTime').value,nextNotes=$('#editNotes').value.trim(),scheduleChanged=nextDate!==oldDate||nextTime!==oldTime;if(!nextDate||!nextTime){alert('Informe a data e o horário.');return}let nextDuration=appointmentDuration(d,a),nextService=null;if(!pack){nextService=d.services.find(s=>s.id===$('#editServiceId').value);if(nextService)nextDuration=Math.max(5,Number(nextService.duration||60))}if(scheduleChanged||nextDuration!==appointmentDuration(d,a)){if(!confirmScheduleConflicts(d,[{date:nextDate,time:nextTime,duration:nextDuration}],[a.id]))return}if(wasConfirmed&&scheduleChanged&&!confirm('A data ou o horário foi alterado. Este atendimento voltará para “Aguardando confirmação” para que a cliente seja confirmada novamente.\n\nSalvar a alteração?'))return;if(!pack){const nextPrice=Number($('#editPrice').value||0);if(nextPrice<0){alert('Informe um valor válido.');return}a.clientId=$('#editClientId').value;if(nextService){a.serviceId=nextService.id;a.serviceName=nextService.name;a.defaultPrice=Number(nextService.price||0);a.duration=nextDuration}if(!paid){a.price=nextPrice;a.totalPrice=nextPrice}}a.date=nextDate;a.time=nextTime;a.notes=nextNotes;if(scheduleChanged)a.confirmed=false;touchRecord(a);log('Agendamento alterado',`${a.serviceName} • ${fmtDate(oldDate)} ${oldTime} → ${fmtDate(nextDate)} ${nextTime}${wasConfirmed&&scheduleChanged?' • confirmação solicitada novamente':''}`);agendaSelectedDate=nextDate;agendaCursor=`${nextDate.slice(0,7)}-01`;await persistCurrent();if(scheduleChanged)notifyWaitlistSlot(d,oldDate,oldTime);if(wasConfirmed&&scheduleChanged)alert('Agendamento alterado. A confirmação anterior foi removida; confirme novamente com a cliente.');renderAppointment(id)};bindLearnGuide();
  }

  function paymentModal(a,c){const d=currentData(),pack=a.bookingType==='package',totalPackage=pack&&a.paymentPlan==='total',amount=totalPackage?Number(a.totalPrice||0):Number(a.price||0);modal.innerHTML=`<form class="modal-body" id="payForm"><h3>${totalPackage?'Registrar pagamento do pacote':'Registrar pagamento'}</h3><p>${esc(c?.name||'Cliente')} • <strong>${money(amount)}</strong></p>${totalPackage?`<div class="notice">Este pagamento quitará o pacote inteiro de ${a.packageSessionCount} sessões.</div>`:''}<div class="field"><label>Forma</label><select id="payMethod"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select></div><div class="actions"><button class="btn ghost" type="button" id="closePay">Cancelar</button><button class="btn primary">Confirmar pagamento</button></div></form>`;modal.showModal();$('#closePay').onclick=()=>modal.close();$('#payForm').onsubmit=async e=>{e.preventDefault();const method=$('#payMethod').value,now=new Date().toISOString();if(totalPackage){const items=packageAllAppointments(d,a),owner=items.filter(activeAppointment).sort((x,y)=>Number(x.packageSessionNumber||1)-Number(y.packageSessionNumber||1))[0]||items.sort((x,y)=>Number(x.packageSessionNumber||1)-Number(y.packageSessionNumber||1))[0]||a;items.forEach(x=>{x.paymentStatus=x.id===owner.id?'pago_total':'incluido_pacote';x.paymentMethod=method;x.amountPaid=x.id===owner.id?Number(a.totalPrice||0):0;x.paidAt=now;touchRecord(x)});log('Pacote pago',`${c?.name||''} • ${money(a.totalPrice)} • ${method}`)}else{a.paymentStatus='pago';a.paymentMethod=method;a.amountPaid=Number(a.price||0);a.paidAt=now;touchRecord(a);log('Pagamento registrado',`${c?.name||''} • ${money(a.price)} • ${method}`)}await persistCurrent();modal.close();renderAppointment(a.id)}}

  function duplicateWeeklyModal(a,c){modal.innerHTML=`<form class="modal-body" id="dupForm"><h3>Repetir semanalmente</h3><p><strong>${esc(c?.name||'Cliente')}</strong><br>${esc(a.serviceName)} • ${fmtDate(a.date)} às ${a.time}</p><div class="notice">Os novos horários serão criados no mesmo dia da semana e no mesmo horário, começando na próxima semana.</div><div class="field"><label>Quantos novos agendamentos?</label><input id="dupCount" type="number" min="1" max="52" value="4" required></div><div class="actions"><button type="button" class="btn ghost" id="dupCancel">Cancelar</button><button class="btn primary">Criar horários</button></div></form>`;modal.showModal();$('#dupCancel').onclick=()=>modal.close();$('#dupForm').onsubmit=async e=>{e.preventDefault();const count=Math.max(1,Math.min(52,Number($('#dupCount').value||1))),d=currentData(),duration=appointmentDuration(d,a),proposed=Array.from({length:count},(_,i)=>({date:addDays(a.date,(i+1)*7),time:a.time,duration}));if(!confirmScheduleConflicts(d,proposed))return;const seriesId=a.seriesId||uid();a.seriesId=seriesId;touchRecord(a);for(let i=1;i<=count;i++){const copy={...structuredClone(a),id:uid(),seriesId,bookingType:'single',packageId:'',packageSessionCount:1,packageSessionNumber:1,totalPrice:Number(a.price||0),paymentPlan:'per_session',paymentStatus:'pendente',paymentMethod:'',amountPaid:0,paidAt:null,date:addDays(a.date,i*7),confirmed:false,status:'agendado',attendanceStatus:'scheduled',consumesPackageSession:false,createdAt:new Date().toISOString()};touchRecord(copy);d.appointments.push(copy)}log('Agendamento duplicado semanalmente',`${c?.name||''} • ${count} novo(s) horário(s) • ${a.time}`);await persistCurrent();modal.close();renderAppointment(a.id)}}

  function renderClients(){
    activeScreen='clients';const d=currentData();
    view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>Clientes</h2><button class="btn primary" id="newClient">+ Cadastrar</button></div><div class="list">${d.clients.length?[...d.clients].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{const packs=uniquePackageStats(d,c.id).filter(p=>p.remaining>0);return `<div class="item"><div class="item-row"><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||'Sem telefone')}</p>${packs.length?`<p>🎫 ${packs.length} pacote(s) ativo(s)${packs.some(p=>p.remaining===1)?' • <strong>1 perto do fim</strong>':''}</p>`:''}</div><button class="btn ghost" data-client="${c.id}">Abrir</button></div></div>`}).join(''):'<div class="item"><p>Nenhum cliente cadastrado.</p></div>'}</div>`;$('#newClient').onclick=()=>renderClientForm();document.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>renderClient(b.dataset.client));bindLearnGuide();
  }
  function renderClientForm(existing=null){activeScreen='clientForm';const d=currentData();view.innerHTML=`${learnGuide('clients')}<div class="section-title"><h2>${existing?'Editar cliente':'Novo cliente'}</h2></div><form class="form card" id="clientForm"><div class="field"><label>Nome</label><input id="cName" required value="${attr(existing?.name||'')}"></div><div class="field"><label>Telefone</label><input id="cPhone" inputmode="tel" value="${attr(existing?.phone||'')}"></div><div class="field"><label>Aniversário</label><input id="cBirth" type="date" value="${attr(existing?.birth||'')}"></div><div class="field"><label>Preferências / observações</label><textarea id="cNotes">${esc(existing?.notes||'')}</textarea></div><button class="btn primary block">Salvar cliente</button></form>`;$('#clientForm').onsubmit=async e=>{e.preventDefault();const obj=existing||{id:uid(),createdAt:new Date().toISOString()};obj.name=$('#cName').value.trim();obj.phone=$('#cPhone').value.trim();obj.birth=$('#cBirth').value;obj.notes=$('#cNotes').value.trim();touchRecord(obj);if(!existing)d.clients.push(obj);log(existing?'Cliente atualizado':'Cliente cadastrado',obj.name);await persistCurrent();renderClients()};bindLearnGuide()}
  function renderClient(id){
    activeScreen='client';const d=currentData(),c=d.clients.find(x=>x.id===id);if(!c)return renderClients();const hist=d.appointments.filter(a=>a.clientId===id).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)),packs=uniquePackageStats(d,id),next=hist.filter(a=>activeAppointment(a)&&a.attendanceStatus==='scheduled'&&dateTimeMs(a.date,a.time)>=Date.now()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
    const packageHtml=packs.length?`<div class="section-title"><h2>Pacotes</h2></div><div class="list">${packs.map(p=>`<div class="item package-client-card"><div class="item-row"><div><h3>🎫 ${esc(p.serviceName)}</h3><p>${p.used} de ${p.total} utilizadas • ${p.remaining} restante(s)</p><p>${p.paid?'✓ Pago integralmente':`Pago ${money(p.totalPaid)} de ${money(p.totalPrice)}`}</p></div>${p.remaining===1?'<span class="tag warn">Última sessão</span>':p.remaining===0?'<span class="tag ok">Concluído</span>':''}</div>${packageProgressHtml(p)}${p.next?`<button class="btn ghost" data-open-package-next="${p.next.id}">Próxima: ${fmtDate(p.next.date)} • ${p.next.time}</button>`:''}</div>`).join('')}</div>`:'';
    view.innerHTML=`${learnGuide('clients')}<div class="card"><div class="item-row"><div><h2>${esc(c.name)}</h2><p>${esc(c.phone||'Sem telefone')}</p></div><button class="btn ghost" id="editClient">Editar</button></div>${c.notes?`<p class="muted">${esc(c.notes)}</p>`:''}${next?`<div class="notice" style="margin-top:10px">📅 Próximo: ${fmtDate(next.date)} às ${next.time} • ${esc(next.serviceName)}</div>`:''}<div class="actions" style="margin-top:10px"><button class="btn secondary" id="newForClient">+ Agendar para esta cliente</button><button class="btn ghost" id="waitForClient">🟡 Lista de espera</button></div></div>${packageHtml}<div class="section-title"><h2>Histórico</h2></div><div class="list">${hist.length?hist.map(a=>`<button type="button" class="item history-button" data-history-appt="${a.id}"><div><h3>${fmtDate(a.date)} • ${esc(a.serviceName)}</h3><p>${money(a.price)} por sessão • ${esc(paymentDisplay(a))}${a.bookingType==='package'?` • Pacote ${a.packageSessionNumber}/${a.packageSessionCount}`:''}</p></div><span class="tag ${attendanceClass(a)}">${esc(attendanceLabel(a))}</span></button>`).join(''):'<div class="item"><p>Sem atendimentos registrados.</p></div>'}</div>`;$('#editClient').onclick=()=>renderClientForm(c);$('#newForClient').onclick=()=>renderNewAppointment(today(),'14:00',{clientId:c.id});$('#waitForClient').onclick=()=>waitlistModal(c.id);document.querySelectorAll('[data-history-appt]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.historyAppt));document.querySelectorAll('[data-open-package-next]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.openPackageNext));bindLearnGuide();
  }

  function renderWaitlist(){
    activeScreen='waitlist';const d=currentData(),waiting=(d.waitlist||[]).filter(w=>w.status==='waiting').sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))),days=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    view.innerHTML=`<div class="section-title"><h2>🟡 Lista de espera</h2><button class="btn primary" id="addWait">+ Adicionar</button></div><div class="notice">Quando um horário é cancelado ou alterado, o sistema avisa se houver alguém da lista compatível com aquele dia/horário.</div><div class="list" style="margin-top:12px">${waiting.length?waiting.map(w=>{const c=d.clients.find(x=>x.id===w.clientId),svc=d.services.find(x=>x.id===w.serviceId),date=nextDateForWeekday(w.preferredWeekday),time=w.preferredTime||'14:00';return `<div class="item"><div class="item-row"><div><h3>${esc(c?.name||'Cliente')}</h3><p>${esc(svc?.name||'Serviço a combinar')}</p><p>${w.preferredWeekday===''?'Qualquer dia':days[Number(w.preferredWeekday)]}${w.preferredTime?` • ${w.preferredTime}`:' • horário flexível'}</p>${w.notes?`<p class="muted">${esc(w.notes)}</p>`:''}</div><span class="tag warn">Aguardando</span></div><div class="actions" style="margin-top:10px"><button class="btn secondary" data-book-wait="${w.id}" data-date="${date}" data-time="${time}">Agendar</button><button class="btn ghost" data-edit-wait="${w.id}">Editar</button><button class="btn ghost" data-archive-wait="${w.id}">Retirar da lista</button></div></div>`}).join(''):'<div class="item"><p>Ninguém aguardando horário no momento.</p></div>'}</div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="waitBack">← Agenda</button></div>`;$('#addWait').onclick=()=>waitlistModal();$('#waitBack').onclick=()=>currentMode==='admin'?renderAdmin():renderAgenda;document.querySelectorAll('[data-edit-wait]').forEach(b=>b.onclick=()=>waitlistModal(null,d.waitlist.find(w=>w.id===b.dataset.editWait)));document.querySelectorAll('[data-book-wait]').forEach(b=>{b.onclick=()=>{const w=d.waitlist.find(x=>x.id===b.dataset.bookWait);renderNewAppointment(b.dataset.date,b.dataset.time,{clientId:w?.clientId,serviceId:w?.serviceId,waitlistId:w?.id,notes:w?.notes||''})}});document.querySelectorAll('[data-archive-wait]').forEach(b=>b.onclick=async()=>{const w=d.waitlist.find(x=>x.id===b.dataset.archiveWait);if(!w)return;if(!confirm('Retirar esta cliente da lista de espera? O registro será preservado.'))return;w.status='archived';w.archivedAt=new Date().toISOString();touchRecord(w);log('Cliente retirado da lista de espera',d.clients.find(c=>c.id===w.clientId)?.name||'Cliente');await persistCurrent();renderWaitlist()});
  }
  function waitlistModal(clientId=null,existing=null){
    const d=currentData();if(!d.clients.length){alert('Cadastre um cliente primeiro.');return renderClientForm()}const w=existing||{clientId:clientId||d.clients[0].id,serviceId:d.services[0]?.id||'',preferredWeekday:'',preferredTime:'',notes:''};const days=[['','Qualquer dia'],['0','Domingo'],['1','Segunda'],['2','Terça'],['3','Quarta'],['4','Quinta'],['5','Sexta'],['6','Sábado']];modal.innerHTML=`<form class="modal-body" id="waitForm"><h3>${existing?'Editar':'Adicionar à'} lista de espera</h3><div class="field"><label>Cliente</label><select id="waitClient">${d.clients.map(c=>`<option value="${c.id}" ${c.id===w.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Serviço desejado</label><select id="waitService">${d.services.map(x=>`<option value="${x.id}" ${x.id===w.serviceId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Dia preferido</label><select id="waitWeekday">${days.map(([v,l])=>`<option value="${v}" ${String(w.preferredWeekday)===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Horário preferido (opcional)</label><input id="waitTime" type="time" value="${attr(w.preferredTime||'')}"></div><div class="field"><label>Observação</label><textarea id="waitNotes">${esc(w.notes||'')}</textarea></div><div class="actions"><button type="button" class="btn ghost" id="waitCancel">Cancelar</button><button class="btn primary">Salvar</button></div></form>`;modal.showModal();$('#waitCancel').onclick=()=>modal.close();$('#waitForm').onsubmit=async e=>{e.preventDefault();const obj=existing||{id:uid(),createdAt:new Date().toISOString(),status:'waiting'};obj.clientId=$('#waitClient').value;obj.serviceId=$('#waitService').value;obj.preferredWeekday=$('#waitWeekday').value;obj.preferredTime=$('#waitTime').value;obj.notes=$('#waitNotes').value.trim();obj.status='waiting';touchRecord(obj);if(!existing)d.waitlist.push(obj);log(existing?'Lista de espera atualizada':'Cliente adicionado à lista de espera',d.clients.find(c=>c.id===obj.clientId)?.name||'Cliente');await persistCurrent();modal.close();renderWaitlist()};
  }

  function receivableItem(d,a){const c=d.clients.find(x=>x.id===a.clientId),due=amountDueForAppointment(d,a);return `<button type="button" class="item history-button" data-due-appt="${a.id}"><div><h3>${esc(c?.name||'Cliente')}</h3><p>${fmtDate(a.date)} • ${a.time} • ${esc(a.serviceName)}</p></div><strong>${money(due)}</strong></button>`}
  function renderReceivables(){
    activeScreen='receivables';const d=currentData(),weekEnd=addDays(today(),7),todayList=d.appointments.filter(a=>activeAppointment(a)&&a.date===today()&&amountDueForAppointment(d,a)>0),weekList=d.appointments.filter(a=>activeAppointment(a)&&a.date>=today()&&a.date<=weekEnd&&amountDueForAppointment(d,a)>0),packageGroups=uniquePackageStats(d).map(p=>({...p,due:p.items.reduce((sum,a)=>sum+amountDueForAppointment(d,a),0)})).filter(p=>p.due>0);view.innerHTML=`<div class="section-title"><h2>💰 Valores a receber</h2></div><div class="receivable-summary"><div class="card"><small>Hoje</small><strong>${money(todayList.reduce((s,a)=>s+amountDueForAppointment(d,a),0))}</strong></div><div class="card"><small>Próximos 7 dias</small><strong>${money(weekList.reduce((s,a)=>s+amountDueForAppointment(d,a),0))}</strong></div><div class="card"><small>Pacotes</small><strong>${money(packageGroups.reduce((s,p)=>s+p.due,0))}</strong></div></div><div class="section-title"><h2>Hoje</h2></div><div class="list">${todayList.length?todayList.map(a=>receivableItem(d,a)).join(''):'<div class="item"><p>Nenhum valor pendente hoje.</p></div>'}</div><div class="section-title"><h2>Próximos 7 dias</h2></div><div class="list">${weekList.length?weekList.map(a=>receivableItem(d,a)).join(''):'<div class="item"><p>Nenhum valor pendente nos próximos 7 dias.</p></div>'}</div><div class="section-title"><h2>Pacotes com saldo</h2></div><div class="list">${packageGroups.length?packageGroups.map(p=>{const owner=p.items.find(activeAppointment)||p.items[0],c=d.clients.find(x=>x.id===owner?.clientId);return `<button type="button" class="item history-button" data-due-appt="${owner?.id}"><div><h3>🎫 ${esc(c?.name||'Cliente')}</h3><p>${esc(p.serviceName)} • ${p.remaining} sessão(ões) restante(s)</p></div><strong>${money(p.due)}</strong></button>`}).join(''):'<div class="item"><p>Nenhum pacote com saldo pendente.</p></div>'}</div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="dueBack">← Início</button></div>`;document.querySelectorAll('[data-due-appt]').forEach(b=>b.onclick=()=>renderAppointment(b.dataset.dueAppt));$('#dueBack').onclick=()=>currentMode==='admin'?renderAdmin():renderHome;
  }

  function reminderAppointments(d=currentData()){
    const now=new Date();const limit=new Date();limit.setDate(limit.getDate()+Number(d.settings.reminderDays||1));
    return d.appointments.filter(a=>{if(a.confirmed||a.status==='cancelado'||a.attendanceStatus!=='scheduled')return false;const appt=new Date(`${a.date}T${a.time}:00`);return appt>=now&&appt<=limit}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  }
  function renderReminders(){
    activeScreen='reminders';
    const d=currentData(),list=reminderAppointments(d);
    view.innerHTML=`${learnGuide('reminders')}<div class="section-title"><h2>Lembretes de confirmação</h2></div><div class="notice">O aplicativo apenas lembra. O contato com o cliente é feito fora do sistema.</div><div class="list" style="margin-top:12px">${list.length?list.map(a=>{const c=d.clients.find(x=>x.id===a.clientId);return `<div class="item"><h3>${esc(c?.name||'Cliente')}</h3><p>${fmtDate(a.date)} às ${a.time} • ${esc(a.serviceName)}</p><button class="btn primary" data-remind-confirm="${a.id}">✓ Confirmação realizada</button></div>`}).join(''):'<div class="item"><p>Nenhum lembrete pendente.</p></div>'}</div>`;
    document.querySelectorAll('[data-remind-confirm]').forEach(b=>b.onclick=async()=>{const a=d.appointments.find(x=>x.id===b.dataset.remindConfirm);a.confirmed=true;touchRecord(a);log('Confirmação registrada',`${a.serviceName} • ${fmtDate(a.date)}`);await persistCurrent();renderReminders()});bindLearnGuide();
  }

  function renderAdmin(){
    activeScreen='admin';const month=today().slice(0,7),revenue=state.appointments.filter(a=>paymentDate(a).startsWith(month)).reduce((sum,a)=>sum+actualReceivedAmount(a),0),due=totalReceivable(state,a=>activeAppointment(a)),waiting=(state.waitlist||[]).filter(w=>w.status==='waiting').length;
    view.innerHTML=`<section class="hero"><h1>Administração</h1><p>Configurações, acompanhamento e backups.</p></section><div class="grid"><div class="card"><div class="muted">Clientes</div><div class="kpi">${state.clients.length}</div></div><div class="card"><div class="muted">Recebido no mês</div><div class="kpi">${money(revenue)}</div></div><div class="card"><div class="muted">A receber</div><div class="kpi">${money(due)}</div></div><div class="card"><div class="muted">Lista de espera</div><div class="kpi">${waiting}</div></div></div><div class="admin-grid" style="margin-top:14px"><button class="admin-tile" id="admServices"><strong>🧴 Serviços e preços</strong><span class="muted">Alterar preços padrão e duração dos serviços.</span></button><button class="admin-tile" id="admReceivables"><strong>💰 Valores a receber</strong><span class="muted">Hoje, próxima semana e pacotes pendentes.</span></button><button class="admin-tile" id="admWaitlist"><strong>🟡 Lista de espera</strong><span class="muted">Clientes aguardando um horário.</span></button><button class="admin-tile" id="admLogs"><strong>📜 Histórico</strong><span class="muted">Ver alterações feitas no sistema.</span></button><button class="admin-tile" id="admBackup"><strong>🔄 Sincronização e backup</strong><span class="muted">Compartilhar dados entre aparelhos e manter cópias no Google Drive.</span></button><button class="admin-tile" id="admNotifications"><strong>🔔 Notificações</strong><span class="muted">Avisos de agenda e confirmações no celular.</span></button><button class="admin-tile" id="admSettings"><strong>🔐 Configurações</strong><span class="muted">PIN, agenda, intervalos, feriados e lembretes.</span></button></div><div class="actions" style="margin-top:16px"><button class="btn ghost" id="adminExit">Sair da Administração</button></div>`;
    $('#admServices').onclick=renderServices;$('#admReceivables').onclick=renderReceivables;$('#admWaitlist').onclick=renderWaitlist;$('#admLogs').onclick=renderLogs;$('#admBackup').onclick=renderBackup;$('#admNotifications').onclick=renderNotifications;$('#admSettings').onclick=renderSettings;$('#adminExit').onclick=renderModePicker;
  }

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
      appointmentGapMinutes:Math.max(0,Math.min(60,Number(state.settings.appointmentGapMinutes||0))),
      quickStartTime:/^\d{2}:\d{2}$/.test(String(state.settings.quickStartTime||''))?String(state.settings.quickStartTime):'08:00',
      quickEndTime:/^\d{2}:\d{2}$/.test(String(state.settings.quickEndTime||''))?String(state.settings.quickEndTime):'20:00',
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
        blocks:structuredClone(state.blocks||[]),
        waitlist:structuredClone(state.waitlist||[]),
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
      state.blocks=mergeEntityArrays(state.blocks,remote.data.blocks);
      state.waitlist=mergeEntityArrays(state.waitlist,remote.data.waitlist);
      state.logs=mergeLogArrays(state.logs,remote.data.logs);
      const remoteSettings=remote.data.settings||{};
      if(String(remoteSettings.updatedAt||'')>String(state.settings.syncSettingsUpdatedAt||'')){
        state.settings.reminderDays=Number(remoteSettings.reminderDays||1);
        state.settings.localHolidayLines=String(remoteSettings.localHolidayLines||'');
        state.settings.appointmentGapMinutes=Math.max(0,Math.min(60,Number(remoteSettings.appointmentGapMinutes||0)));
        state.settings.quickStartTime=/^\d{2}:\d{2}$/.test(String(remoteSettings.quickStartTime||''))?String(remoteSettings.quickStartTime):'08:00';
        state.settings.quickEndTime=/^\d{2}:\d{2}$/.test(String(remoteSettings.quickEndTime||''))?String(remoteSettings.quickEndTime):'20:00';
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
      state.blocks=Array.isArray(remote.data.blocks)?structuredClone(remote.data.blocks):state.blocks;
      state.waitlist=Array.isArray(remote.data.waitlist)?structuredClone(remote.data.waitlist):state.waitlist;
      state.logs=Array.isArray(remote.data.logs)?structuredClone(remote.data.logs).slice(-1000):state.logs;
      const remoteSettings=remote.data.settings||{};
      if(remoteSettings.reminderDays!=null)state.settings.reminderDays=Number(remoteSettings.reminderDays||1);
      if(remoteSettings.localHolidayLines!=null)state.settings.localHolidayLines=String(remoteSettings.localHolidayLines||'');
      if(remoteSettings.appointmentGapMinutes!=null)state.settings.appointmentGapMinutes=Math.max(0,Math.min(60,Number(remoteSettings.appointmentGapMinutes||0)));
      if(remoteSettings.quickStartTime!=null)state.settings.quickStartTime=/^\d{2}:\d{2}$/.test(String(remoteSettings.quickStartTime||''))?String(remoteSettings.quickStartTime):'08:00';
      if(remoteSettings.quickEndTime!=null)state.settings.quickEndTime=/^\d{2}:\d{2}$/.test(String(remoteSettings.quickEndTime||''))?String(remoteSettings.quickEndTime):'20:00';
      if(remoteSettings.notifyAgendaEnabled!=null)state.settings.notifyAgendaEnabled=remoteSettings.notifyAgendaEnabled!==false;
      if(remoteSettings.notifyAgendaMinutes!=null)state.settings.notifyAgendaMinutes=[15,30,60].includes(Number(remoteSettings.notifyAgendaMinutes))?Number(remoteSettings.notifyAgendaMinutes):30;
      if(remoteSettings.notifyConfirmationEnabled!=null)state.settings.notifyConfirmationEnabled=remoteSettings.notifyConfirmationEnabled!==false;
      if(remoteSettings.notifyConfirmationHour!=null)state.settings.notifyConfirmationHour=/^\d{2}:\d{2}$/.test(String(remoteSettings.notifyConfirmationHour||''))?String(remoteSettings.notifyConfirmationHour):'09:00';
      if(remoteSettings.updatedAt)state.settings.syncSettingsUpdatedAt=remoteSettings.updatedAt;
    }
    state=normalizeState(state);
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
      else if(activeScreen==='waitlist')renderWaitlist();
      else if(activeScreen==='receivables')renderReceivables();
      else if(activeScreen==='client'){/* evita mudar a ficha enquanto a pessoa lê */}
    }else if(currentMode==='admin'){
      if(activeScreen==='admin')renderAdmin();
      else if(activeScreen==='logs')renderLogs();
      else if(activeScreen==='services')renderServices();
      else if(activeScreen==='waitlist')renderWaitlist();
      else if(activeScreen==='receivables')renderReceivables();
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
      version:4,
      exportedAt:new Date().toISOString(),
      source:'Yolanda Massoterapeuta PWA',
      data:{
        settings:syncedSettingsPayload(),
        services:structuredClone(state.services),
        clients:structuredClone(state.clients),
        appointments:structuredClone(state.appointments),
        blocks:structuredClone(state.blocks||[]),
        waitlist:structuredClone(state.waitlist||[]),
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
    try{const result=await sendDriveRequest('testPush',{deviceId:state.settings.deviceId});if(result?.status!=='ok')throw new Error(result?.message||'O teste não foi aceito.');alert('Notificação de teste enviada. Ela deve aparecer em alguns segundos.')}catch(err){const message=String(err?.message||err);if(message.includes('UrlFetchApp.fetch')||message.includes('script.external_request')){alert('O Google Apps Script ainda não recebeu permissão para enviar solicitações ao Firebase.\n\nNo Apps Script, execute a função autorizarNotificacoes, aceite as permissões do Google e depois publique uma Nova versão da implantação. Em seguida tente o teste novamente.');return}alert(`Não foi possível enviar o teste.\n\n${message}`)}
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
    activeScreen='settings';const recoveryReady=Boolean(state.settings.recoveryEmail&&state.settings.recoveryKeyHash);
    view.innerHTML=`<div class="section-title"><h2>Configurações</h2></div><form class="form card" id="settingsForm">
      <div class="field"><label>Novo PIN da Administração</label><input id="newPin" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" placeholder="Deixe em branco para manter o PIN atual"><div class="help">Por segurança, o PIN atual não é exibido. Preencha somente se quiser alterá-lo.</div></div><div class="field"><label>Confirmar novo PIN</label><input id="confirmPin" inputmode="numeric" type="password" minlength="4" maxlength="8" pattern="[0-9]{4,8}" placeholder="Repita o novo PIN, se houver alteração"></div>
      <div class="field"><label>E-mail de recuperação</label><input id="recoveryEmailSetting" type="email" value="${attr(state.settings.recoveryEmail||'')}" placeholder="seuemail@exemplo.com"><div class="help">A chave de recuperação poderá ser enviada e guardada nesse e-mail.</div></div>
      <div class="section-title"><h2>Agenda</h2></div><div class="field"><label>Intervalo mínimo entre clientes</label><select id="appointmentGap"><option value="0" ${Number(state.settings.appointmentGapMinutes||0)===0?'selected':''}>Sem intervalo</option><option value="10" ${Number(state.settings.appointmentGapMinutes)===10?'selected':''}>10 minutos</option><option value="15" ${Number(state.settings.appointmentGapMinutes||15)===15?'selected':''}>15 minutos</option><option value="20" ${Number(state.settings.appointmentGapMinutes)===20?'selected':''}>20 minutos</option><option value="30" ${Number(state.settings.appointmentGapMinutes)===30?'selected':''}>30 minutos</option></select><div class="help">O conflito de horários considera a duração da massagem mais este intervalo para organizar a sala.</div></div><div class="grid"><div class="field"><label>Agenda rápida começa</label><input id="quickStartTime" type="time" value="${attr(state.settings.quickStartTime||'08:00')}"></div><div class="field"><label>Agenda rápida termina</label><input id="quickEndTime" type="time" value="${attr(state.settings.quickEndTime||'20:00')}"></div></div>
      <div class="field"><label>Mostrar lembrete de confirmação com antecedência de</label><select id="reminderDays"><option value="1" ${state.settings.reminderDays==1?'selected':''}>1 dia</option><option value="2" ${state.settings.reminderDays==2?'selected':''}>2 dias</option><option value="3" ${state.settings.reminderDays==3?'selected':''}>3 dias</option></select></div>
      <div class="field"><label>Feriados locais de Dumont/SP</label><textarea id="localHolidayLines" placeholder="MM-DD | Nome do feriado&#10;Ex.: 09-16 | Feriado municipal">${esc(state.settings.localHolidayLines||'')}</textarea><div class="help">Os feriados nacionais e o feriado estadual de São Paulo já aparecem automaticamente na agenda. Nesta área você pode cadastrar os feriados locais de Dumont, um por linha, no formato MM-DD | Nome do feriado.</div></div><button class="btn primary">Salvar configurações</button></form>
      <div class="card" style="margin-top:12px"><h3>Recuperação por e-mail</h3><p class="muted">Status: <strong>${recoveryReady?'Configurada':'Ainda não configurada'}</strong></p><p class="help">Depois de salvar o e-mail, gere uma chave. O aplicativo abrirá um e-mail com essa chave para você guardar. Se esquecer o PIN, serão exigidos o e-mail e a chave.</p><button class="btn secondary" id="generateRecoveryKey">${recoveryReady?'Renovar chave de recuperação':'Gerar chave de recuperação'}</button></div><div class="actions" style="margin-top:14px"><button class="btn ghost" id="backAdmin">← Administração</button></div>`;
    $('#settingsForm').onsubmit=async e=>{e.preventDefault();const pin=$('#newPin').value.trim(),pin2=$('#confirmPin').value.trim(),nextEmail=normalizeEmail($('#recoveryEmailSetting').value),nextReminderDays=Number($('#reminderDays').value),nextGap=Math.max(0,Math.min(60,Number($('#appointmentGap').value||0))),nextStart=$('#quickStartTime').value||'08:00',nextEnd=$('#quickEndTime').value||'20:00',nextLocalHolidayLines=$('#localHolidayLines').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).join('\n');if(pin||pin2){if(!/^\d{4,8}$/.test(pin)){alert('Use um PIN de 4 a 8 números.');return}if(pin!==pin2){alert('Os PINs não são iguais.');return}state.settings.adminPin=pin}if(nextEmail&&!validEmail(nextEmail)){alert('Informe um e-mail válido.');return}if(minutesFromTime(nextEnd)<=minutesFromTime(nextStart)){alert('O fim da Agenda rápida deve ser depois do início.');return}for(const line of nextLocalHolidayLines.split(/\n/).filter(Boolean)){if(!/^\d{2}-\d{2}\s*\|\s*.+$/.test(line)){alert('Os feriados locais devem seguir o formato MM-DD | Nome do feriado.');return}}const previousEmail=normalizeEmail(state.settings.recoveryEmail);const settingsChanged=nextReminderDays!==Number(state.settings.reminderDays||1)||nextLocalHolidayLines!==String(state.settings.localHolidayLines||'')||nextGap!==Number(state.settings.appointmentGapMinutes||0)||nextStart!==String(state.settings.quickStartTime||'08:00')||nextEnd!==String(state.settings.quickEndTime||'20:00');if(settingsChanged)state.settings.syncSettingsUpdatedAt=new Date().toISOString();state.settings.reminderDays=nextReminderDays;state.settings.localHolidayLines=nextLocalHolidayLines;state.settings.appointmentGapMinutes=nextGap;state.settings.quickStartTime=nextStart;state.settings.quickEndTime=nextEnd;state.settings.recoveryEmail=nextEmail;if(previousEmail!==nextEmail)state.settings.recoveryKeyHash='';log('Configurações alteradas',`${pin?'PIN atualizado; ':''}${settingsChanged?'agenda/lembretes/feriados atualizados; ':''}${previousEmail!==nextEmail?'e-mail atualizado; chave anterior invalidada':'e-mail mantido'}`,'Administração');await save();alert(nextEmail&&!state.settings.recoveryKeyHash?'Configurações salvas. Agora gere uma chave de recuperação.':'Configurações salvas.');renderSettings()};$('#generateRecoveryKey').onclick=generateRecoveryKey;$('#backAdmin').onclick=renderAdmin;
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
