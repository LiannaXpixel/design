self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", event => {
  // Nu interceptăm cererile; doar facem site-ul eligibil ca PWA.
});
