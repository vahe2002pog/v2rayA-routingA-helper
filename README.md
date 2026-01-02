v2rayA RoutingA Helper — minimal browser extension

Features
- Login to v2rayA and save JWT token in extension storage
- Fetch current `routingA` config
- Add a rule `domain(<host>)->proxy` for current tab or manual host
- Remove that rule
- Attempts to call `/api/v2ray` POST to ask server to reload core after update

Install
1. Open your browser's extension page (Chrome: chrome://extensions).
2. Enable Developer mode.
3. "Load unpacked" and select this `browser-extension` folder.

Configuration
- Set `Server URL` to your v2rayA address (default `http://192.168.1.1:2017`).
- Login with account created on server.

Notes
- The extension calls `/api/login`, `/api/routingA`, `/api/v2ray`. CORS is enabled on server by default.
- PUT must send full `routingA` text; the extension fetches-modifies-puts the whole file.
- Use HTTPS or local network safely; token is stored locally in browser storage.
