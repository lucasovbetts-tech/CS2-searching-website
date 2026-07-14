// Wires up a custom dropdown element; onChange fires with the selected data-value on pick
function makeSelect(el, onChange) {
    if (!el) return null;

    const triggerBtn = el.querySelector('.custom-select-btn');
    const list       = el.querySelector('.custom-select-list');
    const valEl      = el.querySelector('.custom-select-val');

    const getValue = () => el.querySelector('.custom-select-opt.active')?.dataset.value ?? '';

    function openList() {
        //closes any other open dropdown inside the same popup before opening this one
        el.closest('.locale-popup')?.querySelectorAll('.custom-select-list.open').forEach(l => {
            if (l !== list) l.classList.remove('open');
        });
        el.closest('.locale-popup')?.querySelectorAll('.custom-select-btn.open').forEach(b => {
            if (b !== triggerBtn) b.classList.remove('open');
        });
        list.classList.add('open');
        triggerBtn.classList.add('open');
    }

    function closeList() {
        list.classList.remove('open');
        triggerBtn.classList.remove('open');
    }

    // stopPropagation prevents the document click listener from immediately closing this
    triggerBtn.addEventListener('click', e => {
        e.stopPropagation();
        list.classList.contains('open') ? closeList() : openList();
    });

    list.addEventListener('click', e => {
        e.stopPropagation();
        const opt = e.target.closest('.custom-select-opt');
        if (!opt) return;
        el.querySelectorAll('.custom-select-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        valEl.textContent = opt.textContent;
        closeList();
        onChange(opt.dataset.value);
    });

    return { closeList, getValue };
}

export function initLocale() {
    const btn    = document.getElementById('localeBtn');
    const popup  = document.getElementById('localePopup');
    const label  = document.getElementById('localeLabel');
    const langEl = document.getElementById('langSelect');
    const currEl = document.getElementById('currSelect');

    if (!btn) return;

    function updateLabel(langVal, currVal) {
        const l = langVal.toUpperCase();
        label.textContent = `${l} / ${currVal}`;
    }

    const langSel = makeSelect(langEl, val => updateLabel(val, currSel.getValue()));
    const currSel = makeSelect(currEl, val => updateLabel(langSel.getValue(), val));

    popup.addEventListener('click', e => {
        e.stopPropagation();
        if (!e.target.closest('.custom-select')) {
            langSel.closeList();
            currSel.closeList();
        }
    });

    function openPopup() {
        popup.classList.add('open');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }

    function closePopup() {
        popup.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        langSel.closeList();
        currSel.closeList();
    }

    // stopPropagation prevents the document listener below from closing this in the same event cycle
    btn.addEventListener('click', e => {
        e.stopPropagation();
        popup.classList.contains('open') ? closePopup() : openPopup();
    });

    document.addEventListener('click', closePopup);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
}
