"use strict";

const CONFIG = Object.freeze({
  brokerUrl: "wss://ac21de9b1ad748ab87f30d88a73d69ca.s1.eu.hivemq.cloud:8884/mqtt",
  username: "hivemq.webclient.1785190100075",
  password: "3Vs0ge1AkpLDrJBEMI$Ol0x$xIrhgh%a",
  commandTopic: "robotics/grippers/gripper001/command",
  statusTopic: "robotics/grippers/gripper001/status",
  heartbeatMs: 250,
  connectTimeoutMs: 10_000,
  reconnectPeriodMs: 2_000
});

const elements = {
  connectButton: document.querySelector("#connectButton"),
  holdButton: document.querySelector("#holdButton"),
  holdButtonText: document.querySelector("#holdButtonText"),
  openButton: document.querySelector("#openButton"),
  connectionBadge: document.querySelector("#connectionBadge"),
  connectionText: document.querySelector("#connectionText"),
  gripperState: document.querySelector("#gripperState"),
  statusReason: document.querySelector("#statusReason"),
  brokerState: document.querySelector("#brokerState"),
  lastUpdate: document.querySelector("#lastUpdate"),
  eventLog: document.querySelector("#eventLog"),
  clearLogButton: document.querySelector("#clearLogButton")
};

let client = null;
let closeHeartbeatTimer = null;
let isHolding = false;
let activePointerId = null;

function timestamp() {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function log(message, level = "info") {
  const item = document.createElement("li");
  item.textContent = `${timestamp()} · ${message}`;
  item.dataset.level = level;
  elements.eventLog.prepend(item);

  while (elements.eventLog.children.length > 40) {
    elements.eventLog.lastElementChild?.remove();
  }
}

function setConnectionUi(state, detail = "") {
  const online = state === "online";
  const connecting = state === "connecting";

  elements.connectionBadge.classList.toggle("badge-online", online);
  elements.connectionBadge.classList.toggle("badge-connecting", connecting);
  elements.connectionBadge.classList.toggle("badge-offline", !online && !connecting);

  elements.connectionText.textContent = online
    ? "Conectado"
    : connecting
      ? "Conectando"
      : "Desconectado";

  elements.brokerState.textContent = online
    ? "EN LÍNEA"
    : connecting
      ? "CONECTANDO"
      : "FUERA DE LÍNEA";

  elements.lastUpdate.textContent = detail || (online ? `Actualizado ${timestamp()}` : "Sin conexión");
  elements.holdButton.disabled = !online;
  elements.openButton.disabled = !online;
  elements.connectButton.textContent = online ? "Desconectar" : "Conectar al broker";
}

function isConnected() {
  return Boolean(client?.connected);
}

function publishCommand(command) {
  if (!isConnected()) {
    log(`No se pudo enviar ${command}: MQTT desconectado`, "error");
    return false;
  }

  client.publish(CONFIG.commandTopic, command, {
    qos: 0,
    retain: false
  }, (error) => {
    if (error) {
      log(`Error enviando ${command}: ${error.message}`, "error");
    }
  });

  return true;
}

function sendCloseHeartbeat() {
  if (!isHolding) return;

  if (!publishCommand("CLOSE")) {
    stopHolding("MQTT no disponible", false);
  }
}

function startHolding(event) {
  if (!isConnected() || isHolding) return;

  event.preventDefault();
  isHolding = true;
  activePointerId = event.pointerId;

  try {
    elements.holdButton.setPointerCapture(event.pointerId);
  } catch (_) {
    // Algunos navegadores XR no implementan pointer capture completamente.
  }

  elements.holdButton.classList.add("is-pressed");
  elements.holdButtonText.textContent = "CERRANDO · MANTÉN PRESIONADO";

  publishCommand("CLOSE");
  closeHeartbeatTimer = window.setInterval(sendCloseHeartbeat, CONFIG.heartbeatMs);
  log("CLOSE iniciado; heartbeat activo");
}

function stopHolding(reason = "Botón liberado", sendOpen = true) {
  if (closeHeartbeatTimer !== null) {
    window.clearInterval(closeHeartbeatTimer);
    closeHeartbeatTimer = null;
  }

  const wasHolding = isHolding;
  isHolding = false;
  activePointerId = null;
  elements.holdButton.classList.remove("is-pressed");
  elements.holdButtonText.textContent = "MANTENER PARA CERRAR";

  if (sendOpen && isConnected()) {
    publishCommand("OPEN");
  }

  if (wasHolding) {
    log(`${reason}; OPEN enviado`);
  }
}

function handleStatusMessage(payloadBuffer) {
  const raw = payloadBuffer.toString();

  try {
    const status = JSON.parse(raw);
    const state = String(status.state ?? "UNKNOWN").toUpperCase();
    const online = status.online !== false;

    elements.gripperState.textContent = state === "OPEN"
      ? "ABIERTA"
      : state === "CLOSED"
        ? "CERRADA"
        : state;

    elements.statusReason.textContent = status.reason ?? "Estado recibido";
    elements.lastUpdate.textContent = `${online ? "ESP32 en línea" : "ESP32 fuera de línea"} · ${timestamp()}`;
    log(`Estado ESP32: ${state} (${status.reason ?? "sin motivo"})`);
  } catch (error) {
    elements.statusReason.textContent = raw;
    log(`Estado recibido sin JSON: ${raw}`, "warning");
  }
}

function createMqttClient() {
  const randomId = Math.random().toString(16).slice(2, 10);
  const clientId = `quest-gripper-${randomId}`;

  return mqtt.connect(CONFIG.brokerUrl, {
    protocolVersion: 4,
    clientId,
    username: CONFIG.username,
    password: CONFIG.password,
    clean: true,
    connectTimeout: CONFIG.connectTimeoutMs,
    reconnectPeriod: CONFIG.reconnectPeriodMs,
    keepalive: 20,
    resubscribe: true
  });
}

function connect() {
  if (isConnected()) {
    disconnect();
    return;
  }

  if (typeof mqtt === "undefined") {
    log("No se cargó la librería MQTT.js", "error");
    setConnectionUi("offline", "Error cargando MQTT.js");
    return;
  }

  if (client) {
    client.removeAllListeners();
    client.end(true);
  }

  setConnectionUi("connecting", "Abriendo WebSocket seguro");
  log("Conectando con HiveMQ Cloud...");
  client = createMqttClient();

  client.on("connect", () => {
    setConnectionUi("online", `Conectado ${timestamp()}`);
    log("MQTT conectado");

    client.subscribe(CONFIG.statusTopic, { qos: 1 }, (error) => {
      if (error) {
        log(`No se pudo suscribir al estado: ${error.message}`, "error");
        return;
      }

      log(`Suscrito a ${CONFIG.statusTopic}`);
      publishCommand("STATUS");
      publishCommand("OPEN");
    });
  });

  client.on("message", (topic, payload) => {
    if (topic === CONFIG.statusTopic) {
      handleStatusMessage(payload);
    }
  });

  client.on("reconnect", () => {
    stopHolding("Reconexión MQTT", false);
    setConnectionUi("connecting", "Reconectando automáticamente");
    log("Reconectando MQTT...", "warning");
  });

  client.on("offline", () => {
    stopHolding("Broker fuera de línea", false);
    setConnectionUi("offline", "Broker no disponible");
    log("MQTT fuera de línea", "warning");
  });

  client.on("close", () => {
    stopHolding("Conexión cerrada", false);
    if (!client?.connected) {
      setConnectionUi("offline", "Conexión cerrada");
    }
  });

  client.on("error", (error) => {
    log(`Error MQTT: ${error.message}`, "error");
    setConnectionUi("offline", error.message);
  });
}

function disconnect() {
  stopHolding("Desconexión manual");

  if (!client) {
    setConnectionUi("offline");
    return;
  }

  const currentClient = client;
  client = null;
  currentClient.end(true, {}, () => {
    setConnectionUi("offline", "Desconectado manualmente");
    log("MQTT desconectado manualmente");
  });
}

function forceOpen(reason) {
  stopHolding(reason, true);
  if (isConnected()) {
    publishCommand("OPEN");
    log(`${reason}; OPEN enviado`);
  }
}

elements.connectButton.addEventListener("click", connect);
elements.holdButton.addEventListener("pointerdown", startHolding);
elements.holdButton.addEventListener("pointerup", () => stopHolding("Botón liberado"));
elements.holdButton.addEventListener("pointercancel", () => stopHolding("Interacción cancelada"));
elements.holdButton.addEventListener("lostpointercapture", () => {
  if (isHolding) stopHolding("Control perdido");
});

elements.openButton.addEventListener("click", () => forceOpen("Apertura manual"));
elements.clearLogButton.addEventListener("click", () => {
  elements.eventLog.replaceChildren();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isHolding) {
    stopHolding("Página oculta");
  }
});

window.addEventListener("blur", () => {
  if (isHolding) stopHolding("Ventana sin foco");
});

window.addEventListener("pagehide", () => {
  if (isHolding && isConnected()) {
    publishCommand("OPEN");
  }
});

setConnectionUi("offline");
log("Interfaz lista. Pulsa Conectar al broker.");
