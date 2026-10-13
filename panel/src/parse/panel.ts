import { err, hasErrors, type Diagnostic } from '../diagnostics';
import { PANEL_MODELS, isPanelModel, type Loc, type PanelModel } from '../model/types';
import { REF, checkName, hint, stringField, warnUnknownFields } from './fields';
import { splitFrontmatter } from './frontmatter';

export { PANEL_MODELS, type PanelModel };

export interface PanelDoc {
  name: string;
  description: string;
  personas: { ref: string; loc: Loc }[];
  // Persona ref (as listed in `personas`) → the model its panelist runs on.
  models: Record<string, PanelModel>;
  notes: string;
  loc: Loc;
}

export function parsePanel(file: string, raw: string): { panel?: PanelDoc; diagnostics: Diagnostic[] } {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds: Diagnostic[] = [];
  warnUnknownFields(fm, ['name', 'description', 'personas', 'models'], file, ds);
  const name = stringField(fm, 'name', file, ds, true);
  checkName(name, file, fm, ds);
  const description = stringField(fm, 'description', file, ds, true);

  const personas: { ref: string; loc: Loc }[] = [];
  const list = fm.data.personas;
  const at = (i?: number): Loc => ({ file, line: fm.lineOf(i === undefined ? ['personas'] : ['personas', i]) });
  if (list === undefined || list === null) {
    ds.push(err('E_REQUIRED', 'missing required field "personas"', { file, line: 2 }, 'Add "personas: [a, b]" listing 2 to 6 personas'));
  } else if (!Array.isArray(list)) {
    ds.push(err('E_FIELD_TYPE', '"personas" must be a list of persona names', at(), 'Write it as personas: [a, b]'));
  } else {
    list.forEach((r, i) => {
      if (typeof r !== 'string' || !REF.test(r)) {
        ds.push(err('E_FIELD_TYPE', `personas[${i}] is not a valid persona reference`, at(i), 'Use a kebab-case name, or plugin:name'));
      } else if (personas.some((p) => p.ref === r)) {
        ds.push(err('E_PANEL_PERSONA', `${r} is listed twice`, at(i), 'List each persona once'));
      } else {
        personas.push({ ref: r, loc: at(i) });
      }
    });
    if (list.length < 2 || list.length > 6) {
      ds.push(err('E_PANEL_SIZE', `a panel needs 2 to 6 personas, this one lists ${list.length}`, at(), 'List between 2 and 6 personas'));
    }
  }

  const models: Record<string, PanelModel> = {};
  const m = fm.data.models;
  if (m !== undefined && m !== null) {
    if (typeof m !== 'object' || Array.isArray(m)) {
      ds.push(err('E_FIELD_TYPE', '"models" must map persona names to a model', { file, line: fm.lineOf(['models']) }, 'Write it as models: { <persona>: sonnet }'));
    } else {
      for (const [ref, model] of Object.entries(m as Record<string, unknown>)) {
        const loc = { file, line: fm.lineOf(['models', ref]) };
        if (!personas.some((p) => p.ref === ref)) {
          ds.push(err('E_PANEL_MODEL', `models names "${ref}", which is not in personas`, loc, 'Use a persona exactly as personas lists it'));
        } else if (!isPanelModel(model)) {
          const fix = (typeof model === 'string' && hint(model, PANEL_MODELS)) || `Use one of ${PANEL_MODELS.join(', ')}`;
          ds.push(err('E_PANEL_MODEL', `models gives "${ref}" an unknown model ${JSON.stringify(model)}`, loc, fix));
        } else {
          models[ref] = model;
        }
      }
    }
  }

  if (hasErrors(ds) || !name || !description) return { diagnostics: ds };
  return { panel: { name, description, personas, models, notes: fm.body.trim(), loc: { file, line: 1 } }, diagnostics: ds };
}
