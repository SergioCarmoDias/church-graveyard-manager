const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let currentPlotId = null;
let previouslySelectedElement = null;

const VALID_GRAVE_PREFIXES = [
  'top_left_grave_',
  'top_right_grave_',
  'middle_right_grave_',
  'bottom_left_grave_',
  'bottom_right_grave_',
  'small_grave_'
];

function isValidGraveId(id) {
  if (!id) return false;
  return VALID_GRAVE_PREFIXES.some(prefix => id.startsWith(prefix));
}

window.addEventListener('DOMContentLoaded', () => {
  const svgPath = path.join(__dirname, 'cemetery-map.svg');
  if (fs.existsSync(svgPath)) {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const svgWrapper = document.getElementById('svg-wrapper');
    if (svgWrapper) {
      svgWrapper.innerHTML = svgContent;

      const svgElement = svgWrapper.querySelector('svg');
      if (svgElement) {
        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');

        const allCells = svgElement.querySelectorAll('[data-cell-id]');
        allCells.forEach(el => {
          const cellId = el.getAttribute('data-cell-id');
          if (isValidGraveId(cellId)) {
            el.style.cursor = 'pointer';
            ipcRenderer.send('check-initial-grave-name', cellId);
          }
        });

        svgElement.addEventListener('click', (event) => {
          let target = event.target;
          
          while (target && target !== svgElement && !target.getAttribute('data-cell-id')) {
            target = target.parentNode;
          }
          
          if (target && target.getAttribute) {
            const cellId = target.getAttribute('data-cell-id');
            
            if (isValidGraveId(cellId)) {
              if (currentPlotId === cellId) return;
              
              currentPlotId = cellId;

              if (previouslySelectedElement) {
                resetPlotHighlight(previouslySelectedElement);
              }
              highlightPlot(target);
              previouslySelectedElement = target;

              openGraveForm(currentPlotId);
              return;
            }
          }
        });
      }
    }
  }
});

function highlightPlot(element) {
  const rects = element.querySelectorAll('rect, path');
  rects.forEach(r => {
    r.dataset.originalFill = r.getAttribute('fill') || '#ffffff';
    r.setAttribute('fill', '#d1fae5'); 
    r.setAttribute('stroke', '#059669'); 
    r.setAttribute('stroke-width', '2');
  });
}

function resetPlotHighlight(element) {
  const rects = element.querySelectorAll('rect, path');
  rects.forEach(r => {
    if (r.dataset.originalFill) {
      r.setAttribute('fill', r.dataset.originalFill);
    } else {
      r.removeAttribute('fill');
    }
    r.removeAttribute('stroke-width');
    r.removeAttribute('stroke');
  });
}

function setPlotNameOnMap(plotId, firstName) {
  const svgElement = document.querySelector('#svg-wrapper svg');
  if (!svgElement) return;

  const cellGroup = svgElement.querySelector(`[data-cell-id="${plotId}"]`);
  if (!cellGroup) return;

  let textEl = cellGroup.querySelector('.plot-name-text');
  
  if (!firstName || firstName.trim() === '') {
    if (textEl) textEl.remove();
    return;
  }

  const bboxRect = cellGroup.querySelector('rect');
  let cx = 0, cy = 0;
  if (bboxRect) {
    const x = parseFloat(bboxRect.getAttribute('x') || 0);
    const y = parseFloat(bboxRect.getAttribute('y') || 0);
    const width = parseFloat(bboxRect.getAttribute('width') || 0);
    const height = parseFloat(bboxRect.getAttribute('height') || 0);
    cx = x + width / 2;
    cy = y + height / 2;
  }

  if (!textEl) {
    textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('class', 'plot-name-text');
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'central');
    textEl.setAttribute('font-size', '14px');
    textEl.setAttribute('fill', '#1f2937');
    textEl.setAttribute('font-weight', 'bold');
    cellGroup.appendChild(textEl);
  }

  textEl.setAttribute('x', cx);
  textEl.setAttribute('y', cy);
  textEl.textContent = firstName;
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function getFieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setSaveButtonState(isUpdate) {
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.innerText = isUpdate ? 'Update Record' : 'Save Record';
  }
}

function openGraveForm(plotId) {
  const displayEl = document.getElementById('display-plot-id');
  if (displayEl) {
    displayEl.innerText = plotId;
    displayEl.style.color = '#10b981';
    displayEl.style.fontWeight = 'bold';
  }

  ['first-name', 'middle-name', 'surname', 'birth_date', 'dod-input', 'notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
    }
  });

  const clearBtn = document.getElementById('clear-grave-btn');
  if (clearBtn) clearBtn.style.display = 'none';

  setSaveButtonState(false);

  // Force DOM focus and layout release so inputs never lock up
  const firstNameInput = document.getElementById('first-name');
  if (firstNameInput) {
    firstNameInput.focus();
  }

  ipcRenderer.send('fetch-grave-record', plotId);
}

ipcRenderer.on('grave-record-data', (event, record) => {
  if (!currentPlotId || !record || record.plot_id !== currentPlotId) return;

  const clearBtn = document.getElementById('clear-grave-btn');

  const hasData = (
    record.first_name || 
    record.middle_name || 
    record.surname || 
    record.birth_date || 
    record.dod || 
    record.notes
  );

  if (hasData) {
    setFieldValue('first-name', record.first_name);
    setFieldValue('middle-name', record.middle_name);
    setFieldValue('surname', record.surname);
    setFieldValue('birth_date', record.birth_date);
    setFieldValue('dod-input', record.dod);
    setFieldValue('notes', record.notes);

    if (clearBtn) clearBtn.style.display = 'block';
    if (record.first_name) {
      setPlotNameOnMap(currentPlotId, record.first_name);
    }
    setSaveButtonState(true);
  } else {
    if (clearBtn) clearBtn.style.display = 'none';
    setSaveButtonState(false);
  }
});

const clearGraveBtn = document.getElementById('clear-grave-btn');
if (clearGraveBtn) {
  clearGraveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentPlotId) return;

    showCustomModal('Are you sure you want to clear the record for this grave plot?', 'confirm', () => {
      ipcRenderer.send('clear-grave-record', currentPlotId);
    });
  });
}

ipcRenderer.on('clear-grave-response', (event, response) => {
  if (response && response.success) {
    setPlotNameOnMap(currentPlotId, '');
    
    ['first-name', 'middle-name', 'surname', 'birth_date', 'dod-input', 'notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
      }
    });

    const clearBtn = document.getElementById('clear-grave-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    setSaveButtonState(false);

    // Force DOM focus statement right here to instantly unlock typing without needing a minimize/resize hack
    const firstNameInput = document.getElementById('first-name');
    if (firstNameInput) {
      firstNameInput.focus();
    }

    showToast('Grave record cleared successfully!');
  }
});

ipcRenderer.on('initial-grave-name', (event, data) => {
  if (data && data.plotId && data.first_name) {
    setPlotNameOnMap(data.plotId, data.first_name);
  }
});

function showToast(message = 'Record saved successfully!') {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;

  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

const saveBtn = document.getElementById('save-btn');
if (saveBtn) {
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentPlotId) {
      showCustomModal('Please select a grave plot first!', 'alert');
      return;
    }

    const fName = getFieldValue('first-name');
    const mName = getFieldValue('middle-name');
    const sName = getFieldValue('surname');
    const dob = getFieldValue('birth_date');
    const dod = getFieldValue('dod-input');

    // Check that required fields are not null/empty
    if (!fName || !sName || !dob || !dod) {
      showCustomModal('First name, surname, Date of Birth, and Date of Death are required fields.', 'alert');
      return;
    }

    // Check that Date of Birth is less than or equal to Date of Death
    if (new Date(dob) > new Date(dod)) {
      showCustomModal('Date of Birth cannot be later than Date of Death.', 'alert');
      return;
    }

    const recordData = {
      plot_id: currentPlotId,
      first_name: fName,
      middle_name: mName,
      surname: sName,
      birth_date: dob,
      dod: dod,
      notes: getFieldValue('notes') || null
    };

    const isAnUpdate = saveBtn.innerText === 'Update Record';

    const executeSave = () => {
      setPlotNameOnMap(currentPlotId, fName);
      ipcRenderer.send('save-grave-record', recordData);
    };

    if (isAnUpdate) {
      showCustomModal('Are you sure you want to update the record for this grave plot?', 'confirm', executeSave);
    } else {
      executeSave();
    }
  });
}

ipcRenderer.on('save-grave-response', (event, response) => {
  if (response && response.success) {
    const clearBtn = document.getElementById('clear-grave-btn');
    if (clearBtn && getFieldValue('first-name')) {
      clearBtn.style.display = 'block';
    }
    setSaveButtonState(true);
    showToast('Grave record saved successfully!');
  }
});

function showCustomModal(message, type = 'alert', onConfirm = null) {
  const modal = document.getElementById('custom-modal');
  const msgEl = document.getElementById('modal-message');
  const btnContainer = document.getElementById('modal-buttons');
  
  if (!modal || !msgEl || !btnContainer) return;

  msgEl.innerText = message;
  btnContainer.innerHTML = '';

  if (type === 'alert') {
    const okBtn = document.createElement('button');
    okBtn.innerText = 'OK';
    okBtn.style.cssText = 'background: #059669; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;';
    okBtn.onclick = () => {
      modal.style.display = 'none';
      const firstInput = document.getElementById('first-name');
      if (firstInput) firstInput.focus();
    };
    btnContainer.appendChild(okBtn);
  } else if (type === 'confirm') {
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.style.cssText = 'background: #e5e7eb; color: #374151; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;';
    cancelBtn.onclick = () => {
      modal.style.display = 'none';
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = 'Confirm';
    confirmBtn.style.cssText = 'background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;';
    confirmBtn.onclick = () => {
      modal.style.display = 'none';
      if (onConfirm) onConfirm();
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
  }

  modal.style.display = 'flex';
}

// Backup button handler
document.getElementById('export-btn').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('export-backup');
  if (result.success) {
    alert('Backup created successfully!');
  } else if (result.message !== 'Cancelled') {
    alert('Backup failed: ' + result.message);
  }
});

// Restore button handler
document.getElementById('import-btn').addEventListener('click', async () => {
  if (confirm('Restoring a backup will overwrite current unsaved changes. Do you want to proceed?')) {
    const result = await ipcRenderer.invoke('import-backup');
    if (result.success) {
      alert('Database restored successfully! The app will now reload.');
      window.location.reload(); // Refresh screen to load the restored data
    } else if (result.message !== 'Cancelled') {
      alert('Restore failed: ' + result.message);
    }
  }
});