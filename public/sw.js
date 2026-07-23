/* =====================================================================
   Service Worker · Notificaciones push
   Va en public/sw.js para que se sirva desde la raíz del sitio.
   ===================================================================== */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim())
})

self.addEventListener('push', (evento) => {
  let datos = {}

  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { title: 'Condominio', body: evento.data ? evento.data.text() : '' }
  }

  const titulo = datos.title || 'Condominio'

  const opciones = {
    body: datos.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    // El tag evita que varias notificaciones del mismo evento se apilen
    tag: datos.tag || 'condominio',
    data: { url: datos.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  }

  evento.waitUntil(self.registration.showNotification(titulo, opciones))
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const destino = evento.notification.data?.url || '/'

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si la aplicación ya está abierta, se navega en esa pestaña
      for (const v of ventanas) {
        if (v.url.includes(self.location.origin) && 'focus' in v) {
          v.navigate(destino)
          return v.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(destino)
      }
    })
  )
})
