#!/usr/bin/env bash
# Falla si algún archivo versionado coincide con los patrones prohibidos.
# Los patrones NO viven en el repo (es público): llegan en la variable
# PATRONES_PROHIBIDOS (una expresión regular extendida por línea, o separadas por «|»).
# Uso: PATRONES_PROHIBIDOS="$X" scripts/check-nombres-prohibidos.sh
set -uo pipefail

if [ -z "${PATRONES_PROHIBIDOS:-}" ]; then
  echo "::warning::PATRONES_PROHIBIDOS no está configurada; se omite la regla."
  exit 0
fi

fallo=0
excluir=(':!pnpm-lock.yaml' ':!scripts/check-nombres-prohibidos.sh')
while IFS= read -r patron; do
  [ -z "$patron" ] && continue
  # Solo se imprime archivo:línea, nunca el patrón ni el texto coincidente.
  if git grep -n -I -i -E -e "$patron" -- . "${excluir[@]}" | cut -d: -f1,2 | sed 's/^/Nombre prohibido en /' | grep .; then
    fallo=1
  fi
done <<< "$PATRONES_PROHIBIDOS"

if [ "$fallo" -ne 0 ]; then
  echo "::error::Se encontraron nombres prohibidos (ver archivos arriba)."
  exit 1
fi
echo "Sin nombres prohibidos."
