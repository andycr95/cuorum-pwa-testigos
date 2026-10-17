import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('CUO-208: Pantalla de conteo táctil, legible y estructurada', () => {
  const voteInputPath = path.join(rootDir, 'src', 'components', 'formulario', 'VoteInput.tsx');
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const selectorEleccionPath = path.join(rootDir, 'src', 'components', 'formulario', 'SelectorEleccion.tsx');

  const voteInputCode = fs.readFileSync(voteInputPath, 'utf8');
  const formularioCode = fs.readFileSync(formularioPath, 'utf8');
  const selectorEleccionCode = fs.readFileSync(selectorEleccionPath, 'utf8');

  it('VoteInput: botones táctiles − y + de 56×56 px (≥ 48 px) para candidatos y votos especiales', () => {
    // Debe incluir w-14 h-14 o min-w-[56px] min-h-[56px]
    assert.match(voteInputCode, /w-14 h-14/, 'Los botones deben tener w-14 h-14 (56px)');
    assert.match(voteInputCode, /min-w-\[56px\]/, 'Los botones deben tener min-w-[56px]');
    assert.match(voteInputCode, /min-h-\[56px\]/, 'Los botones deben tener min-h-[56px]');

    // No debe tener botones de 40 px ni 48 px pequeños
    assert.doesNotMatch(voteInputCode, /w-10 h-10/, 'No debe usar botones de 40px (w-10 h-10)');
    assert.doesNotMatch(voteInputCode, /w-12 h-12/, 'No debe usar botones de 48px antiguos (w-12 h-12)');
  });

  it('VoteInput: valor central grande (≥ 28 px font-size)', () => {
    // text-3xl en Tailwind equivale a 30px (1.875rem), que cumple >= 28 px
    assert.match(voteInputCode, /text-3xl/, 'El input central debe tener font-size >= 28px (text-3xl)');
    assert.match(voteInputCode, /h-14/, 'El input central debe tener altura de 56px (h-14) igual a los botones');
  });

  it('VoteInput: nombre de candidato sin truncate para mostrar nombres completos en dos líneas', () => {
    // Verificar que en el párrafo del nombre no se use truncate
    assert.doesNotMatch(voteInputCode, /label.*?truncate/, 'El nombre de candidato no debe tener la clase truncate');
    assert.match(voteInputCode, /break-words/, 'El nombre de candidato debe permitir envolver con break-words');
    assert.match(voteInputCode, /candidato-numero/, 'Debe soportar renderizar el número de tarjetón');
  });

  it('VoteInput: accesibilidad y contraste AA en botones e inputs', () => {
    assert.match(voteInputCode, /aria-label=\{`Disminuir votos para \$\{label\}`\}/, 'Botón decremento debe tener aria-label');
    assert.match(voteInputCode, /aria-label=\{`Aumentar votos para \$\{label\}`\}/, 'Botón incremento debe tener aria-label');
    assert.match(voteInputCode, /aria-label=\{`Votos para \$\{label\}`\}/, 'Input numérico debe tener aria-label');

    // No debe usar degradados de gris sobre gris con bajo contraste
    assert.doesNotMatch(voteInputCode, /bg-gradient-to-br from-gray-50 to-gray-100.*?text-gray-700/, 'No debe tener degradado gris sobre gris');
  });

  it('FormularioMesaMultiple: barra inferior fija con total contado vs sufragantes y botón Guardar', () => {
    assert.match(formularioCode, /data-testid="barra-fija-conteo"/, 'Debe existir el contenedor de la barra fija');
    assert.match(formularioCode, /fixed bottom-0/, 'La barra debe estar fija al fondo de la pantalla');
    assert.match(formularioCode, /data-testid="total-votos-barra"/, 'La barra debe mostrar el total de votos');
    assert.match(formularioCode, /data-testid="btn-guardar-barra"/, 'La barra debe contener el botón de guardar');
    assert.match(formularioCode, /pb-32|pb-28/, 'El contenedor debe tener padding inferior para no solapar la barra');
  });

  it('FormularioMesaMultiple: flujo organizado en pasos («Contar» → «Foto E-14» → «Cerrar»)', () => {
    assert.match(formularioCode, /pasoActivo === 'contar'/, 'Debe tener paso de conteo');
    assert.match(formularioCode, /pasoActivo === 'foto'/, 'Debe tener paso de fotos');
    assert.match(formularioCode, /pasoActivo === 'cierre'/, 'Debe tener paso de cierre y observaciones');
    assert.match(formularioCode, /role="tablist"/, 'Debe proveer selector accesible de pasos');
  });

  it('Tipografía y contraste: ningún texto menor a 12/14 px ni ayudas en 10 px', () => {
    // Comprobar que no hay clases text-[10px] ni text-[11px] en los componentes de conteo
    assert.doesNotMatch(voteInputCode, /text-\[10px\]|text-\[11px\]/, 'VoteInput no debe tener texto menor de 12px');
    assert.doesNotMatch(formularioCode, /text-\[10px\]|text-\[11px\]/, 'FormularioMesaMultiple no debe tener texto de 10px o 11px');
    assert.doesNotMatch(selectorEleccionCode, /text-\[10px\]|text-\[11px\]/, 'SelectorEleccion no debe tener texto de 10px o 11px');
  });
});
