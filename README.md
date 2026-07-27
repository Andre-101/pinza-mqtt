# Pinza MQTT

Interfaz web para controlar una pinza accionada por una ESP32 mediante HiveMQ Cloud.

## Funcionamiento

- La página se conecta al broker mediante MQTT sobre WebSocket seguro (`WSS`).
- Al mantener presionado el botón principal publica `CLOSE` cada 250 ms.
- Al soltar publica `OPEN`.
- La ESP32 publica su estado en un topic separado.
- La ESP32 debe implementar un watchdog local y abrir la pinza si deja de recibir `CLOSE`.

## Topics

```text
robotics/grippers/gripper001/command
robotics/grippers/gripper001/status
```

## Publicación en GitHub Pages

En el repositorio abre:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

Después de que termine el workflow, la página quedará disponible en:

```text
https://andre-101.github.io/pinza-mqtt/
```

## Seguridad

Esta primera versión es un prototipo y conecta directamente desde el navegador al broker. Las credenciales incluidas en una aplicación web pública pueden ser inspeccionadas por cualquier visitante. Antes de usar el proyecto fuera de una prueba controlada se deben rotar las credenciales, separar los usuarios de la ESP32 y la web, y limitar sus permisos por topic.
