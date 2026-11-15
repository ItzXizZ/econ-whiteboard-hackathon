#!/bin/sh
set -eu

command -v openssl >/dev/null 2>&1 || {
  printf '%s\n' 'OpenSSL is required to create the local hub certificate.' >&2
  exit 1
}

cert_dir="${HOME}/.econ-hub"
mkdir -p "$cert_dir"
chmod 700 "$cert_dir"
ca_key="$cert_dir/ca.key"
ca_cert="$cert_dir/ca.crt"
server_key="$cert_dir/server.key"
server_cert="$cert_dir/server.crt"

if [ -s "$ca_key" ] && [ -s "$ca_cert" ]; then
  printf '%s\n' 'Reusing local Econ Coach CA.'
elif [ -e "$ca_key" ] || [ -e "$ca_cert" ]; then
  printf '%s\n' "Both CA files must exist together: $ca_key and $ca_cert" >&2
  exit 1
else
  printf '%s\n' 'Creating local Econ Coach CA.'
  umask 077
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/econ-hub.XXXXXX")"
  trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
  cat > "$temp_dir/ca.cnf" <<'EOF'
[req]
prompt = no
distinguished_name = dn
x509_extensions = v3_ca
[dn]
CN = Econ Coach Local Hub CA
[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
EOF
  openssl req -x509 -newkey rsa:3072 -nodes \
    -keyout "$ca_key" -out "$ca_cert" -days 3650 -sha256 \
    -config "$temp_dir/ca.cnf"
  chmod 600 "$ca_key"
  chmod 644 "$ca_cert"
  rm -rf "$temp_dir"
  trap - EXIT HUP INT TERM
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/econ-hub.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
cat > "$temp_dir/server.cnf" <<'EOF'
[v3_server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF

ip_index=2
if command -v ip >/dev/null 2>&1; then
  ipv4_addresses="$(ip -o -4 addr show 2>/dev/null | awk '{split($4, a, "/"); print a[1]}')"
elif command -v ifconfig >/dev/null 2>&1; then
  ipv4_addresses="$(ifconfig 2>/dev/null | awk '$1 == "inet" {print $2}')"
else
  ipv4_addresses=''
fi

for address in $ipv4_addresses; do
  case "$address" in
    ''|127.*) continue ;;
  esac
  printf 'IP.%s = %s\n' "$ip_index" "$address" >> "$temp_dir/server.cnf"
  ip_index=$((ip_index + 1))
done

if command -v scutil >/dev/null 2>&1; then
  local_host="$(scutil --get LocalHostName 2>/dev/null || true)"
  if [ -n "$local_host" ] && [ "$local_host" != 'localhost' ]; then
    printf 'DNS.%s = %s.local\n' "$ip_index" "$local_host" >> "$temp_dir/server.cnf"
  fi
fi

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$temp_dir/server.key" -out "$temp_dir/server.csr" \
  -subj '/CN=Econ Coach Local Hub'
openssl x509 -req -in "$temp_dir/server.csr" \
  -CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
  -out "$temp_dir/server.crt" -days 825 -sha256 \
  -extfile "$temp_dir/server.cnf" -extensions v3_server

chmod 600 "$temp_dir/server.key"
chmod 644 "$temp_dir/server.crt"
mv "$temp_dir/server.key" "$server_key"
mv "$temp_dir/server.crt" "$server_cert"

printf '\n%s\n' "Hub certificate: $server_cert" "CA certificate:  $ca_cert"
printf '%s\n' 'The CA key is private; install only ca.crt on phones.'
