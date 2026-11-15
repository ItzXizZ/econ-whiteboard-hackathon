# Econ Coach phone hub

The laptop hosts the app and its local API; a phone on the same Wi-Fi network or laptop hotspot opens the printed LAN URL. No internet connection is needed for the drawing lessons.

1. Start the laptop's local Bonsai-2 4B service if tutor answers and graph checking are needed.
2. From the repository, run `npm run hub`. This builds the app, binds the combined API and static site to `0.0.0.0`, and prints the local and LAN URLs. Set `PORT=3001` to use another port.
3. Open the LAN URL on the phone and sign in. Use the browser's **Add to Home Screen** action to install Econ Coach.

On a secure origin, the service worker caches the app shell and its built assets after the first load. Draw-with-Adam lessons and the board remain available on the loaded page when the hub is unreachable; tutor responses, speech recognition, and graph checking need the laptop hub. Keep the phone connected to the laptop's local network to use those services without internet.

The printed LAN URL uses plain HTTP. Phones do not treat a laptop's LAN IP as a secure origin, so the service worker cannot cache the shell there; offline reloads and PWA installation require serving the hub over HTTPS with a certificate trusted by the phone. `localhost` is a secure-context exception only on the same device, not on the phone when it refers to itself.

Browsers also require HTTPS (or localhost) for microphone access. The microphone is hidden when the phone opens the hub over plain HTTP; typed questions and drawing lessons still work while the page is loaded.
