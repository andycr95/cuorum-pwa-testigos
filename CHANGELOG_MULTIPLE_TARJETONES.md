# Changelog: Soporte para Múltiples Tarjetones (Elecciones Colegiadas)

## Cambios Implementados

### 1. Schema IndexedDB (v2)

**Archivo**: `src/db/indexeddb.ts`

- **Versión**: 1 → 2
- **Campos agregados a `resultados`**:
  - `eleccionId`: string (requerido) - ID de la elección/tarjetón
  - `candidatoId`: string (opcional) - FK a candidato real
  - `listaId`: string (opcional) - FK a lista (para elecciones colegiadas)
  - `tipoVoto`: enum - CANDIDATO | LISTA | BLANCO | NULO | NO_MARCADO
- **Índices nuevos**:
  - `by-eleccion`: permite filtrar resultados por elección
- **Compatibilidad**: Los campos legacy `candidato` y `partido` se mantienen

### 2. Componente SelectorEleccion

**Archivo**: `src/components/formulario/SelectorEleccion.tsx`

- Muestra las elecciones disponibles para la mesa
- Si hay 1 sola elección, muestra info en badge (no selector)
- Si hay múltiples, muestra botones de selección
- Indica tipo de elección: Uninominal vs Colegiado

### 3. Componente FormularioMesaMultiple

**Archivo**: `src/components/formulario/FormularioMesaMultiple.tsx`

#### Características:
- **Múltiples tarjetones**: Soporta jornadas con varias elecciones simultáneas
- **Elecciones uninominales**: Igual que antes (lista de candidatos)
- **Elecciones colegiadas**: Nueva funcionalidad
  - Votos a lista (sin preferente)
  - Voto preferente a candidato (si está habilitado)
  - Muestra candidatos por lista expandible
- **Validación de fraude**: Se mantiene (total <= sufragantes)
- **Offline-first**: Guarda en IndexedDB, sincroniza cuando hay conexión

#### Props:
```typescript
interface FormularioMesaMultipleProps {
  mesaId: string;
  testigoId: string;
  mesaNumero: number;
  totalSufragantes: number;
  elecciones: Eleccion[]; // Array de elecciones de la jornada
  deviceId: string;
}
```

#### Tipo Eleccion:
```typescript
interface Eleccion {
  id: string;
  nombre: string;
  tipoEleccion: string; // PRESIDENCIAL, SENADO, CAMARA, etc.
  tipoCargo: 'UNINOMINAL' | 'COLEGIADO';
  votoPreferente: boolean;
  candidatos?: Candidato[]; // Para uninominales
  listas?: Lista[]; // Para colegiados
}

interface Lista {
  id: string;
  nombre: string;
  partido: string;
  tipoLista: 'CERRADA' | 'PREFERENTE';
  candidatos: Candidato[];
}
```

### 4. Backend Actualizado

**Archivo**: `src/modules/testigos/validators.ts`
- Schema `resultadoMesaSchema` extendido con campos opcionales:
  - `eleccionId`
  - `candidatoId`
  - `listaId`
  - `tipoVoto`

**Archivo**: `src/modules/testigos/service.ts`
- Método `registrarResultado` actualizado para guardar nuevos campos en DB

## Migración desde v1

### Datos Existentes
Los datos guardados con la versión anterior (v1) **seguirán funcionando**:
- IndexedDB v2 mantiene compatibilidad hacia atrás
- Los campos nuevos son opcionales
- El backend acepta ambos formatos (con y sin eleccionId)

### Actualización del PWA
1. Desplegar la nueva versión del PWA
2. Los Service Workers actualizarán automáticamente el schema de IndexedDB
3. Los testigos verán el nuevo selector de elecciones en la siguiente carga

## Uso en Producción

### Escenario 1: Mesa con 1 elección (ej. Alcaldía)
- El selector no se muestra (info en badge)
- Funcionamiento idéntico a versión anterior
- Compatible con datos legacy

### Escenario 2: Mesa con múltiples elecciones (ej. Jornada 2027)
Ejemplo: Gobernación + Asamblea + Alcaldía + Concejo + JAL

1. El testigo ve 5 botones de selección
2. Selecciona "Gobernación" (uninominal)
   - Ingresa votos por candidato
   - Guarda
3. Selecciona "Asamblea" (colegiado)
   - Ve listas con sus candidatos
   - Ingresa votos a lista
   - Si hay voto preferente, marca candidatos
   - Guarda
4. Repite para cada tarjetón

### Escenario 3: Elección Colegiada con Voto Preferente (ej. Senado 2026)

**Tarjetón del Senado:**
- Lista Cerrada del Pacto Histórico (15 candidatos)
- Lista Preferente de la Coalición Centro Esperanza (10 candidatos)
- Voto preferente: Habilitado

**Flujo del testigo:**
1. Selecciona "Senado 2026"
2. Ve las listas expandidas
3. Para "Pacto Histórico":
   - Votos a lista: 150
   - (No hay voto preferente, es cerrada)
4. Para "Centro Esperanza":
   - Votos a lista: 80
   - Voto preferente:
     - Candidato 1: 20 votos
     - Candidato 5: 35 votos
     - Candidato 7: 15 votos
5. Votos especiales:
   - Blanco: 5
   - Nulos: 3
   - No marcados: 2
6. Total: 150 + 80 + 20 + 35 + 15 + 5 + 3 + 2 = 310
7. Guarda

## Datos Guardados en IndexedDB

### Ejemplo Uninominal (Alcaldía)
```json
{
  "id": "mesa123_eleccion456_cand789_1234567890",
  "mesaId": "mesa123",
  "testigoId": "testigo456",
  "eleccionId": "eleccion-alcaldia-2027",
  "candidato": "Carlos Ramírez",
  "partido": "Partido Verde",
  "candidatoId": "cand789",
  "tipoVoto": "CANDIDATO",
  "votos": 120,
  "votosBlanco": 5,
  "votosNulos": 3,
  "votosNoMarcados": 2,
  "totalVotosMesa": 250,
  "capturedAt": "2027-10-29T14:30:00Z",
  "deviceId": "device-abc123",
  "synced": false,
  "syncAttempts": 0
}
```

### Ejemplo Colegiado - Voto a Lista
```json
{
  "id": "mesa123_eleccion456_lista_lista789_1234567891",
  "mesaId": "mesa123",
  "testigoId": "testigo456",
  "eleccionId": "eleccion-senado-2026",
  "candidato": "Pacto Histórico",
  "partido": "Coalición",
  "listaId": "lista789",
  "tipoVoto": "LISTA",
  "votos": 150,
  "votosBlanco": 5,
  "votosNulos": 3,
  "votosNoMarcados": 2,
  "totalVotosMesa": 310,
  "capturedAt": "2026-03-08T15:00:00Z",
  "deviceId": "device-abc123",
  "synced": false,
  "syncAttempts": 0
}
```

### Ejemplo Colegiado - Voto Preferente
```json
{
  "id": "mesa123_eleccion456_preferente_cand999_1234567892",
  "mesaId": "mesa123",
  "testigoId": "testigo456",
  "eleccionId": "eleccion-senado-2026",
  "candidato": "Gustavo Bolívar",
  "partido": "Coalición",
  "candidatoId": "cand999",
  "listaId": "lista789",
  "tipoVoto": "CANDIDATO",
  "votos": 20,
  "votosBlanco": 5,
  "votosNulos": 3,
  "votosNoMarcados": 2,
  "totalVotosMesa": 310,
  "capturedAt": "2026-03-08T15:00:00Z",
  "deviceId": "device-abc123",
  "synced": false,
  "syncAttempts": 0
}
```

## Testing

### Casos de Prueba

1. **Mesa con 1 elección uninominal**
   - ✅ No muestra selector
   - ✅ Funciona igual que antes
   - ✅ Guarda con eleccionId

2. **Mesa con 5 elecciones**
   - ✅ Muestra 5 botones
   - ✅ Cambia entre elecciones sin perder datos
   - ✅ Cada elección guarda por separado

3. **Elección colegiada sin voto preferente**
   - ✅ Muestra listas
   - ✅ Solo permite votos a lista
   - ✅ No muestra candidatos

4. **Elección colegiada con voto preferente**
   - ✅ Muestra listas + candidatos
   - ✅ Permite votos a lista
   - ✅ Permite votos preferentes a candidatos
   - ✅ Guarda ambos tipos por separado

5. **Validación de fraude**
   - ✅ Alerta si total > sufragantes
   - ✅ Permite guardar con alerta
   - ✅ Marca alerta en DB

6. **Sincronización offline**
   - ✅ Guarda sin conexión
   - ✅ Sincroniza al recuperar conexión
   - ✅ No duplica datos
   - ✅ Marca como synced

## Notas de Implementación

- **Performance**: IndexedDB v2 con índice por elección permite queries eficientes
- **UX**: El formulario se resetea al cambiar de elección (evita confusión)
- **Validación**: Cada elección valida por separado (total <= sufragantes)
- **Redes 2G/EDGE**: Sigue funcionando igual (batch sync, compresión de fotos)
- **Compatibilidad**: Funciona con elecciones legacy sin eleccionId

## Próximos Pasos (Futuro)

- [ ] Eliminar campos legacy (`candidato`, `partido`) cuando todo el sistema use IDs
- [ ] Agregar soporte para segunda vuelta presidencial (campo `vuelta`)
- [ ] Agregar validaciones específicas por tipo de elección
- [ ] UI para ver histórico de sincronizaciones por elección
