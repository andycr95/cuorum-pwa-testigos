#!/usr/bin/env bash
# Pruebas de regresión de check-nombres-prohibidos.sh (patrones ficticios).
set -u
script="$(cd "$(dirname "$0")" && pwd)/check-nombres-prohibidos.sh"
fallos=0
esperar() { # descripcion codigo_esperado patron
  PATRONES_PROHIBIDOS="$3" bash "$script" >/dev/null 2>&1
  c=$?
  if [ "$c" -ne "$2" ]; then echo "FALLA: $1 (salida $c, esperada $2)"; fallos=1; else echo "ok: $1"; fi
}
esperar "regex inválida bloquea" 1 "["
esperar "sin coincidencias pasa" 0 "zzz_inexistente_$$_qqq"
esperar "con coincidencia falla" 1 "typescript"
esperar "regex inválida tras patrón válido bloquea" 1 $'zzz_inexistente_qqq\n['
exit $fallos
