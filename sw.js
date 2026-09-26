const CACHE='yolanda-pwa-v2.1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./firebase-config.js','./notifications.js','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './';
  event.waitUntil((async()=>{
    const list = await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      if('focus' in client){
        try{ if('navigate' in client) await client.navigate(target); }catch{}
        return client.focus();
      }
    }
    if(clients.openWindow) return clients.openWindow(target);
  })());
});

// Recebe notificações FCM/Web Push mesmo quando o PWA não está aberto.
self.addEventListener('push', event => {
  let payload = {};
  try{ payload = event.data ? event.data.json() : {}; }catch{
    try{ payload = {data:{body:event.data ? event.data.text() : ''}}; }catch{}
  }
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Yolanda Agenda';
  const body = notification.body || data.body || 'Você tem um lembrete da agenda.';
  const tag = data.tag || 'yolanda-lembrete';
  const url = data.link || payload?.fcmOptions?.link || './';
  event.waitUntil(self.registration.showNotification(title,{
    body,
    icon:'./icons/icon-192.png',
    badge:'./icons/icon-192.png',
    tag,
    data:{url},
    renotify:false
  }));
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin) return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match('./index.html'))));
});
