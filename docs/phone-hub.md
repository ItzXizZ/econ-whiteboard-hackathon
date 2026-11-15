# Econ Coach phone hub

The laptop serves the app and its local API to phones on the same Wi-Fi network or laptop hotspot. The drawing lessons run on the phone after the app shell has been cached; tutor answers, graph checking, and speech recognition need the laptop hub.

## Start the hub

1. Start the laptop's local Bonsai-2 4B service if tutor answers and graph checking are needed.
2. From the repository, run `npm run hub:cert`. This creates a private local CA and a server certificate in `~/.econ-hub/`; it does not contact the internet. Keep `ca.key` private and do not copy it to a phone.
3. Run `npm run hub`. The command builds the app, binds HTTP on `0.0.0.0:3000` and HTTPS on `0.0.0.0:3443`, and prints the LAN URLs and CA download link. Set `PORT=3001` or `HTTPS_PORT=3444` to choose other ports.
4. Install and trust the CA on each phone, then open the printed HTTPS URL. Plain HTTP remains available for troubleshooting, but the browser does not register the service worker or expose microphone access on an insecure LAN origin.

## iPhone or iPad

1. On the phone, open `http://<laptop-ip>:3000/hub-ca.crt` and allow the certificate profile to download.
2. Open **Settings → Profile Downloaded → Install**.
3. Then open **Settings → General → About → Certificate Trust Settings** and enable full trust for the Econ Coach local CA.
4. Open `https://<laptop-ip>:3443` in Safari, sign in, then use **Share → Add to Home Screen**.

## Android

1. On the phone, open `http://<laptop-ip>:3000/hub-ca.crt` and download the certificate.
2. In Settings, open **Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate** (wording varies by device), and select the downloaded file.
3. Open `https://<laptop-ip>:3443` in Chrome, sign in, then choose **Install app** or **Add to Home screen**.

After the first HTTPS load, the service worker caches the built app shell and static assets. Draw-with-Adam lessons remain available when the hub is unreachable; Bonsai, speech recognition, and graph checking need the laptop. A phone on a plain `http://<laptop-ip>:3000` origin gets neither service-worker registration nor microphone access.
