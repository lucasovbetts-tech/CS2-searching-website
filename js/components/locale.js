// Wires up a custom dropdown element and returns { closeList, getValue }.
// el       — the .custom-select wrapper element
// onChange — callback fired with the selected data-value whenever the user picks an option
function makeSelect(el, onChange) {
    if (!el) return null;

    const triggerBtn = el.querySelector('.custom-select-btn');
    const list       = el.querySelector('.custom-select-list');
    const valEl      = el.querySelector('.custom-select-val');

    // Returns the data-value of the currently active option, or '' if none is active
    const getValue = () => el.querySelector('.custom-select-opt.active')?.dataset.value ?? '';

    function openList() {
        // Close any other open dropdown inside the same popup before opening this one
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

    // Toggle the dropdown open/closed on trigger click; stopPropagation prevents
    // the document click listener from immediately closing it
    triggerBtn.addEventListener('click', e => {
        e.stopPropagation();
        list.classList.contains('open') ? closeList() : openList();
    });

    // Handle option selection: mark the clicked option active, update the visible
    // label text, close the list, and notify the caller via onChange
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

// Initialises the locale popup: wires the language and currency dropdowns,
// keeps the header label in sync, and handles open/close behaviour
export function initLocale() {
    const btn    = document.getElementById('localeBtn');
    const popup  = document.getElementById('localePopup');
    const label  = document.getElementById('localeLabel');
    const langEl = document.getElementById('langSelect');
    const currEl = document.getElementById('currSelect');

    if (!btn) return;

    //turns the language data into uppercase and changes the label to the current selection
    function updateLabel(langVal, currVal) {
        const l = langVal.toUpperCase();
        label.textContent = `${l} / ${currVal}`;
    }

    const langSel = makeSelect(langEl, val => updateLabel(val, currSel.getValue()));
    const currSel = makeSelect(currEl, val => updateLabel(langSel.getValue(), val));

    // Clicking the popup background (outside any dropdown) closes any open dropdown lists
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

    // Closes the popup and collapses any open dropdown lists inside it
    function closePopup() {
        popup.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        langSel.closeList();
        currSel.closeList();
    }

    // Toggle popup on locale button click; stopPropagation prevents the document
    // listener below from closing it in the same event cycle
    btn.addEventListener('click', e => {
        e.stopPropagation();
        popup.classList.contains('open') ? closePopup() : openPopup();
    });

    // Close popup when clicking anywhere outside it, or pressing Escape
    document.addEventListener('click', closePopup);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
}
