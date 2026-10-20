/* إشعارات الجوال (Firebase Cloud Messaging) */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyAJgwaMBo5wxM5BEK9nRrrNg04UGdHyAV0',
  authDomain: 'zad1-85d66.firebaseapp.com',
  projectId: 'zad1-85d66',
  storageBucket: 'zad1-85d66.firebasestorage.app',
  messagingSenderId: '130593925562',
  appId: '1:130593925562:web:709293e6c0827103d31583',
});
firebase.messaging();
// الضغط على الإشعار يفتح الرابط تلقائياً (fcm_options.link)
