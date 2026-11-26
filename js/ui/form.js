// Config-driven forms. A field config looks like:
//   { name, label, type, required, options, placeholder, hint, rows, min, max, step }
// type: text | number | date | time | tel | email | textarea | select | checkbox | chips
// Put several configs in an array to lay them out side by side on wider screens.

import { h } from '../utils/dom.js';
import { openModal, confirmDialog } from './modal.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const asOptions = (options = []) => options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));

function control(f, value) {
  const id = `f-${f.name}-${Math.random().toString(36).slice(2, 7)}`;
  const common = { id, name: f.name, required: f.required || null, placeholder: f.placeholder || null };

  switch (f.type) {
    case 'textarea':
      return { id, el: h('textarea', { ...common, class: 'textarea', rows: f.rows || 3 }, value ?? '') };
    case 'select': {
      const opts = asOptions(f.options);
      return {
        id,
        el: h('select', { ...common, class: 'select' },
          f.placeholderOption !== false ? h('option', { value: '' }, f.placeholderOption || 'Select…') : null,
          opts.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label))),
      };
    }
    case 'checkbox':
      return { id, el: h('input', { ...common, type: 'checkbox', checked: Boolean(value) }) };
    case 'chips': {
      const selected = new Set(value || []);
      const wrap = h('div', { class: 'chips', style: { flexWrap: 'wrap' }, dataset: { chips: f.name }, role: 'group' },
        asOptions(f.options).map((o) => {
          const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(selected.has(o.value)), dataset: { value: o.value } }, o.label);
          b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
          return b;
        }));
      return { id, el: wrap };
    }
    default: {
      const listId = f.suggestions ? `${id}-list` : null;
      const input = h('input', {
        ...common,
        list: listId,
        class: 'input',
        type: f.type || 'text',
        value: value ?? '',
        min: f.min ?? null,
        max: f.max ?? null,
        step: f.step ?? null,
        inputmode: f.inputmode || (f.type === 'number' ? 'decimal' : null),
        autocomplete: f.autocomplete || 'off',
      });
      const datalist = listId
        ? h('datalist', { id: listId }, f.suggestions.map((s) => h('option', { value: s })))
        : null;
      return { id, el: [input, datalist] };
    }
  }
}

function fieldEl(f, values) {
  const { id, el } = control(f, values[f.name]);
  if (f.type === 'checkbox') {
    return h('div', { class: 'field', dataset: { field: f.name } },
      h('label', { class: 'switch', for: id }, el, f.label),
      f.hint ? h('span', { class: 'hint' }, f.hint) : null,
      h('span', { class: 'error', hidden: true }));
  }
  return h('div', { class: 'field', dataset: { field: f.name } },
    f.type === 'chips' ? h('span', { class: 'label' }, f.label) : h('label', { for: id }, f.label, f.required ? ' *' : ''),
    el,
    f.hint ? h('span', { class: 'hint' }, f.hint) : null,
    h('span', { class: 'error', hidden: true }));
}

/** @returns {{ form: HTMLFormElement, read: () => object, showErrors: (errors) => boolean }} */
export function buildForm(fields, values = {}) {
  const form = h('form', { class: 'form', novalidate: true },
    fields.map((f) => (Array.isArray(f)
      ? h('div', { class: ['form-row', `cols-${Math.min(f.length, 3)}`] }, f.map((x) => fieldEl(x, values)))
      : fieldEl(f, values))));

  const flat = fields.flat();

  function read() {
    const out = {};
    for (const f of flat) {
      if (f.type === 'chips') {
        out[f.name] = [...form.querySelectorAll(`[data-chips="${f.name}"] .chip[aria-pressed="true"]`)].map((b) => b.dataset.value);
        continue;
      }
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
      else out[f.name] = el.value;
    }
    return out;
  }

  /** Show messages; returns true when there were errors. */
  function showErrors(errors = {}) {
    let firstBad = null;
    for (const fieldWrap of form.querySelectorAll('[data-field]')) {
      const msg = errors[fieldWrap.dataset.field];
      const errEl = fieldWrap.querySelector('.error');
      fieldWrap.classList.toggle('invalid', Boolean(msg));
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
      if (msg && !firstBad) firstBad = fieldWrap;
    }
    if (firstBad) {
      firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      firstBad.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
    }
    return Boolean(firstBad);
  }

  return { form, read, showErrors };
}

/**
 * Standard add/edit sheet.
 * onSave(record) is called with the normalised record once validation passes;
 * return false from it (e.g. store write failed) to keep the sheet open.
 * onDelete (optional) shows a delete button; return false from it to keep the sheet open.
 */
export function openFormModal({
  title, fields, values = {}, normalize = (x) => x, validate = () => ({}),
  onSave, onDelete, saveLabel = 'Save', savedMessage = 'Saved', before, after,
}) {
  const { form, read, showErrors } = buildForm(fields, values);
  const submitId = `submit-${Date.now()}`;
  form.id = submitId;

  const actions = h('div', { class: 'form-actions' },
    onDelete ? h('button', { type: 'button', class: 'btn btn-ghost left', style: { color: 'var(--c-bad)' }, onclick: async () => {
      const result = await onDelete();
      if (result !== false) m.close();
    } }, icon('trash'), 'Delete') : null,
    h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Cancel'),
    h('button', { type: 'submit', class: 'btn btn-primary', form: submitId }, icon('check'), saveLabel),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const record = normalize({ ...values, ...read() });
    if (showErrors(validate(record))) return;
    try {
      // onSave returns false when the store could not save (the store's
      // save-error handler has already told the user): keep the sheet open.
      if (onSave(record) === false) return;
      m.close();
      if (savedMessage) toast(savedMessage);
    } catch (err) {
      toast(err.message || 'Could not save', { type: 'error' });
    }
  });

  const m = openModal({ title, body: [before, form, after].filter(Boolean), footer: actions });
  return m;
}

export { confirmDialog };
