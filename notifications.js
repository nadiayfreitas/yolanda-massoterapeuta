(() => {
  let firebaseApp = null;
  let messaging = null;
  let messagingApi = null;
  let foregroundBound = false;

  function config() {
    return window.YOLA_FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    const c = config();
    const f = c.firebaseConfig || {};
    return Boolean(
      c.enabled === true &&
      f.apiKey && !String(f.apiKey).includes('COLE_AQUI') &&
      f.projectId && !String(f.projectId).includes('COLE_AQUI') &&
      f.messagingSenderId && !String(f.messagingSenderId).includes('COLE_AQUI') &&
      f.appId && !String(f.appId).includes('COLE_AQUI') &&
      c.vapidKey && !String(c.vapidKey).includes('COLE_AQUI')
    );
  }

  async function loadFirebase() {
    if (firebaseApp && messaging && messagingApi) return { firebaseApp, messaging, messagingApi };
    if (!isConfigured()) throw new Error('A configuração pública do Firebase ainda não foi preenchida.');
    const [appApi, msgApi] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js')
    ]);
    const c = config();
    firebaseApp = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(c.firebaseConfig);
    const supported = await msgApi.isSupported();
    if (!supported) throw new Error('Este navegador não oferece suporte às notificações push do Firebase.');
    messaging = msgApi.getMessaging(firebaseApp);
    messagingApi = msgApi;
    return { firebaseApp, messaging, messagingApi };
  }

  async function getRegistrationToken({ interactive = true } = {}) {
    if (!('Notification' in window)) throw new Error('Este aparelho/navegador não oferece suporte a notificações.');
    if (!('serviceWorker' in navigator)) throw new Error('Este navegador não oferece suporte ao serviço em segundo plano do PWA.');
    let permission = Notification.permission;
    if (permission !== 'granted' && interactive) permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(permission === 'denied' ? 'As notificações foram bloqueadas neste aparelho.' : 'Permissão de notificações não concedida.');
    const { messaging, messagingApi } = await loadFirebase();
    const registration = await navigator.serviceWorker.ready;
    const token = await messagingApi.getToken(messaging, {
      vapidKey: config().vapidKey,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error('O Firebase não retornou um identificador para este aparelho.');
    bindForegroundMessages(registration);
    return token;
  }

  function bindForegroundMessages(registration) {
    if (foregroundBound || !messaging || !messagingApi) return;
    foregroundBound = true;
    messagingApi.onMessage(messaging, payload => {
      const title = payload?.notification?.title || payload?.data?.title || 'Yolanda Agenda';
      const body = payload?.notification?.body || payload?.data?.body || 'Você tem um novo lembrete.';
      const tag = payload?.data?.tag || 'yolanda-lembrete';
      registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag,
        data: { url: payload?.data?.link || './' }
      }).catch(() => {});
    });
  }

  async function disable() {
    try {
      if (!isConfigured()) return true;
      const { messaging, messagingApi } = await loadFirebase();
      await messagingApi.deleteToken(messaging);
      return true;
    } catch {
      return false;
    }
  }

  window.YolaNotifications = {
    isConfigured,
    permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
    enable: () => getRegistrationToken({ interactive: true }),
    refresh: () => getRegistrationToken({ interactive: false }),
    disable
  };
  window.dispatchEvent(new Event('yola-notifications-ready'));
})();
