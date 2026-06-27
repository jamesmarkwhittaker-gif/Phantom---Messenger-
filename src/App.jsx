import { useState, useEffect, useRef } from "react";

async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const publicKeyRaw = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyRaw = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyB64: btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw))),
    privateKeyB64: btoa(String.fromCharCode(...new Uint8Array(privateKeyRaw))),
    fingerprint: await generateFingerprint(publicKeyRaw),
  };
}

async function generateFingerprint(keyBuffer) {
  const hash = await window.crypto.subtle.digest("SHA-256", keyBuffer);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
}

async function deriveSharedKey(privateKey, publicKeyB64) {
  const raw = Uint8Array.from(atob(publicKeyB64), c => c.charCodeAt(0));
  const importedPub = await window.crypto.subtle.importKey(
    "spki", raw, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  return window.crypto.subtle.deriveKey(
    { name: "ECDH", public: importedPub },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(sharedKey, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

async function decryptMessage(sharedKey, iv, ciphertext) {
  const ivArr = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const ctArr = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivArr },
    sharedKey,
    ctArr
  );
  return new TextDecoder().decode(decrypted);
}

function generateUsername() {
  const adjectives = ["Silent","Ghost","Cipher","Shadow","Stealth","Phantom","Covert","Secure"];
  const nouns = ["Fox","Hawk","Wolf","Eagle","Raven","Lynx","Viper","Falcon"];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adjectives[Math.floor(Math.random()*adjectives.length)]}${nouns[Math.floor(Math.random()*nouns.length)]}${num}`;
}

const MESSAGE_BUS = { listeners: {}, messages: [] };
function busSubscribe(sessionId, cb) { MESSAGE_BUS.listeners[sessionId] = cb; }
function busUnsubscribe(sessionId) { delete MESSAGE_BUS.listeners[sessionId]; }
function busPublish(payload) {
  MESSAGE_BUS.messages.push(payload);
  Object.values(MESSAGE_BUS.listeners).forEach(cb => cb(payload));
}

export default function PhantomApp() {
  const [phase, setPhase] = useState("boot");
  const [identity, setIdentity] = useState(null);
  const [peerPublicKey, setPeerPublicKey] = useState("");
  const [sharedKey, setSharedKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => Math.random().toString(36).s
