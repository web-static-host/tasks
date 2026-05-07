window.taskChain = []; 

window.openDynamicModal = function(type, isEdit = false) {
    const container = document.getElementById('dynamic-modal-container');
    let title = '';
    
    // Если открыли новую задачу (не перерисовка цепочки и не редактирование) - сбрасываем цепочку
    if (!isEdit && !event?.target?.closest('#add-to-chain-btn')) {
        window.taskChain = [];
        window.activeChainIndex = 0; // ИСПРАВЛЕНИЕ: Сбрасываем индекс, чтобы скрыть кнопки копирования
    }

    const hasChain = window.taskChain && window.taskChain.length > 0;

    // Шаблон микро-кнопки копирования
    // Шаблон микро-кнопки копирования (ТЕПЕРЬ ОНА ЕСТЬ ВСЕГДА, НО СКРЫВАЕТСЯ ЧЕРЕЗ КЛАСС d-none)
    const copyBtn = (field) => `
        <button type="button" class="btn btn-outline-secondary btn-sm px-2 chain-copy-action d-none" title="Скопировать" tabindex="-1" onclick="copyFromPrevious('${field}')">
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
        </button>`;

    const specCatTaskHtml = (hideCat) => `
        <div class="step mb-2">
            <label class="form-label fw-bold mb-1 small">1. Тип работы и исполнитель</label>
            ${hideCat ? `<input type="hidden" id="category" value="Демонстрация">` : `
            <div class="input-group input-group-sm mb-2">
                <select id="category" class="form-select" required><option value="">Выберите категорию...</option></select>
                ${copyBtn('category')}
            </div>`}
            <div class="input-group input-group-sm mb-2">
                <select id="taskName" class="form-select" required><option value="">Выберите задачу...</option></select>
                ${copyBtn('taskName')}
            </div>
            <select id="specialist" class="form-select form-select-sm" required><option value="">Выберите специалиста...</option></select>
        </div>`;

    const clientHtml = (hidePrice) => `
        <div class="step mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label fw-bold small m-0">2. Клиент и оплата</label>
                <button type="button" class="btn btn-link p-0 text-decoration-none shadow-none chain-copy-action d-none" style="font-size: 0.7rem;" onclick="copyFromPrevious('all')" tabindex="-1">Скопировать всё сверху</button>
            </div>
            <div class="input-group input-group-sm mb-2">
                <input type="text" id="inn" class="form-control" placeholder="ИНН клиента" required>
                ${copyBtn('inn')}
            </div>
            <div class="input-group input-group-sm mb-2">
                <input type="url" id="bitrix" class="form-control" placeholder="Ссылка на Битрикс24" required>
                ${copyBtn('bitrix')}
            </div>
            ${hidePrice ? `<input type="hidden" id="price" value="0">` : `
            <div id="priceBlock" class="input-group input-group-sm">
                <span class="input-group-text">₽</span>
                <input type="number" id="price" class="form-control" placeholder="Стоимость" required>
                ${copyBtn('price')}
            </div>`}
        </div>`;

    const timeCommentHtml = `
        <div id="dateTimeBlock" class="step mb-2">
            <div id="chain-reschedule-mode-block" class="mb-2 d-none">
                <label class="form-label fw-bold mb-1 small text-secondary">Режим переноса связанной задачи:</label>
                <div class="btn-group w-100 shadow-sm" role="group">
                    <input type="radio" class="btn-check" name="chainRescheduleMode" id="modeChain" value="chain" checked onchange="if(typeof updateFreeSlots === 'function') updateFreeSlots()">
                    <label class="btn btn-outline-primary btn-sm fw-bold" for="modeChain" style="font-size: 0.8rem; padding: 6px 0;">Двигать всю цепочку</label>

                    <input type="radio" class="btn-check" name="chainRescheduleMode" id="modeSingle" value="single" onchange="if(typeof updateFreeSlots === 'function') updateFreeSlots()">
                    <label class="btn btn-outline-primary btn-sm fw-bold" for="modeSingle" style="font-size: 0.8rem; padding: 6px 0;">Только эту задачу</label>
                </div>
            </div>
            <div class="row g-2">
                <div class="col-4">
                    <label class="form-label fw-bold mb-1 small">Дата</label>
                    <input type="text" id="date" class="form-control" placeholder="00.00.0000">
                </div>
                <div class="col-4">
                    <label class="form-label fw-bold mb-1 small">Время</label>
                    <select id="time" class="form-select" disabled><option value="">--:--</option></select>
                </div>
                <div class="col-4">
                    <label class="form-label fw-bold mb-1 small">Длительность</label>
                    <input type="time" id="taskDuration" class="form-control" value="00:30" min="00:30" step="1800">
                </div>
            </div>
            <button type="button" class="btn border shadow-sm w-100 text-dark mt-2 mb-3 d-flex justify-content-center align-items-center gap-2" 
                    style="background-color: #ffffff; font-size: 0.8rem; font-weight: 600; transition: all 0.2s; padding: 8px 0;" 
                    onmouseover="this.style.backgroundColor='#f1f3f5';" 
                    onmouseout="this.style.backgroundColor='#ffffff';"
                    onclick="openAvailabilityModal()">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" style="margin-top: -1px;">
                    <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
                    <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/>
                </svg>
                Выбрать вручную (сетка занятости)
            </button>
            <div id="commentBlock" class="mt-2">
                <label class="form-label fw-bold mb-1 small">Примечание</label>
                <textarea class="form-control form-control-sm" id="taskComment" rows="2" maxlength="55" placeholder='Например: "Клиент на месте до 14:00"'></textarea>
            </div>
        </div>
    `;

    let fieldsHtml = '';
    if (type === 'paid') { title = 'Платная задача'; fieldsHtml = `<div class="row g-3"><div class="col-md-6">${specCatTaskHtml(false)} ${clientHtml(false)}</div><div class="col-md-6">${timeCommentHtml}</div></div>`; }
    else if (type === 'free') { title = 'Бесплатная задача'; fieldsHtml = `<div class="row g-3"><div class="col-md-12"><input type="hidden" id="date" value="${new Date().toISOString().split('T')[0]}">${specCatTaskHtml(false)} ${clientHtml(true)}<div id="commentBlock" class="mt-2"><label class="form-label fw-bold mb-1 small">Примечание</label><textarea class="form-control form-control-sm" id="taskComment" rows="2" maxlength="255" placeholder='Например: "Будет услуга по установке"'></textarea></div></div></div>`; }
    else if (type === 'demo') { title = 'Демонстрация'; fieldsHtml = `<div class="row g-3"><div class="col-md-6">${specCatTaskHtml(true)} ${clientHtml(true)}</div><div class="col-md-6">${timeCommentHtml}</div></div>`; }

    container.innerHTML = `
        <div class="modal fade" id="taskModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered ${type === 'free' ? '' : 'modal-lg'}">
                <div class="modal-content border-0 shadow-lg">
                    <div class="modal-header py-2 bg-light border-bottom">
                        <h5 class="modal-title">${isEdit ? 'Редактирование: ' : 'Постановка: '} ${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body pt-3" style="max-height: 85vh; overflow-y: auto;">
                        
                        <div id="chain-summaries-top"></div>

                        <form id="task-form">
                            <input type="hidden" id="hiddenTaskType" value="${type}">
                            ${fieldsHtml}
                            <div id="changeLogBlock" class="mt-2 p-2 bg-warning bg-opacity-10 border rounded d-none">
                                <label class="form-label fw-bold small mb-1 text-danger">Причина изменения</label>
                                <textarea class="form-control form-control-sm" id="historyComment" rows="1"></textarea>
                            </div>
                            
                            <div id="chain-summaries-bottom" class="mt-3 mb-3"></div>

                            <div class="mt-4 d-flex gap-2">
                                <button type="submit" class="btn btn-success flex-grow-1 py-2 fw-bold shadow-sm" id="submit-btn">Сохранить</button>
                               ${!isEdit ? `<button type="button" class="btn btn-outline-primary py-2 fw-bold shadow-sm" onclick="addTaskToChain()" id="add-to-chain-btn">+ Добавить связанную</button>` : ''}
                            </div>
                        </form>

                    </div>
                </div>
            </div>
        </div>`;

    const specSelect = document.getElementById('specialist');
    if (specSelect && CONFIG && CONFIG.USERS) CONFIG.USERS.filter(u => u.role === 'specialist').forEach(s => specSelect.add(new Option(s.name, s.name)));

    document.dispatchEvent(new CustomEvent('dynamicModalReady', { detail: { type, isEdit } }));

    if (!isEdit) {
        new bootstrap.Modal(document.getElementById('taskModal')).show();
        renderChainSummaries(); // Сразу рисуем, если есть что
    } else if (isEdit && window.editChainId && window.taskChain.length > 1) {
        // === НОВОЕ: Редактирование задачи из цепочки ===
        // Модалка уже открывается через task-actions.js (там вызов new bootstrap.Modal...show())
        // Здесь нам нужно только после того как форма заполнится — дорисовать остальные задачи цепочки

        // Ждём пока task-actions заполнит форму текущей задачей (там тройной setTimeout ~150мс)
        setTimeout(() => {
            // Прячем блок "Причина изменения" — он не нужен для задач из цепочки
            const logBlock = document.getElementById('changeLogBlock');
            if (logBlock) logBlock.classList.add('d-none');

            // Показываем переключатель режима переноса
            const modeBlock = document.getElementById('chain-reschedule-mode-block');
            if (modeBlock) modeBlock.classList.remove('d-none');

            // Меняем заголовок кнопки сохранения
            const submitBtn = document.getElementById('submit-btn');
            if (submitBtn) submitBtn.innerText = 'Сохранить изменения';

            // Рисуем все остальные задачи цепочки как свёрнутые карточки
            renderChainSummaries();
        }, 250);
    }
};

// HTML-структура для модалки занятости 
document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="availabilityModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content shadow-lg border-0" style="border-radius: 15px;">
                <div class="modal-header bg-light">
                    <h5 class="modal-title fw-bold">Занятость специалистов</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-0" id="availability-grid-container">
                    </div>
            </div>
        </div>
    </div>
`);

// --- ФУНКЦИИ ЦЕПОЧКИ ЗАДАЧ ---
window.activeChainIndex = 0;

// Чтение текущих полей (даже если они пустые)
window.getCurrentTaskData = function() {
    const durParts = (document.getElementById('taskDuration')?.value || "00:30").split(':').map(Number);
    return {
        category: document.getElementById('category')?.value || 'Демонстрация',
        task_name: document.getElementById('taskName')?.value || '',
        specialist: document.getElementById('specialist')?.value || '',
        inn: document.getElementById('inn')?.value || '',
        bitrix_url: document.getElementById('bitrix')?.value || '',
        price: parseInt(document.getElementById('price')?.value) || 0,
        date: document.getElementById('date')?.value || '',
        time: document.getElementById('time')?.value || '',
        duration: (durParts[0] * 60) + durParts[1],
        comment: document.getElementById('taskComment')?.value || '',
        billing_type: document.getElementById('hiddenTaskType')?.value || 'paid'
    };
};

// Заполнение формы данными из памяти
window.fillTaskForm = function(task) {
    const catEl = document.getElementById('category');
    if (catEl) {
        catEl.value = task.category || ''; 
        // ИСПРАВЛЕНИЕ: Убрали вызов smartUpdateDropdowns, так как он запускает 
        // асинхронный сброс времени и перезаписывает время развернутой задачи!
    }
    
    const taskSelect = document.getElementById('taskName');
    if (taskSelect) {
        if (task.task_name && ![...taskSelect.options].some(o => o.value === task.task_name)) {
            taskSelect.add(new Option(task.task_name, task.task_name));
        }
        taskSelect.value = task.task_name || '';
    }

    if (document.getElementById('specialist')) document.getElementById('specialist').value = task.specialist || '';
    if (document.getElementById('inn')) document.getElementById('inn').value = task.inn || '';
    if (document.getElementById('bitrix')) document.getElementById('bitrix').value = task.bitrix_url || '';
    if (document.getElementById('price')) document.getElementById('price').value = task.price || '';
    if (document.getElementById('taskComment')) document.getElementById('taskComment').value = task.comment || '';
    
    if (document.getElementById('date') && task.date) {
        const dateInput = document.getElementById('date');
        if (dateInput._flatpickr) dateInput._flatpickr.setDate(task.date);
        else dateInput.value = task.date;
    }
    
    if (document.getElementById('time') && task.time) {
        const timeSel = document.getElementById('time');
        if (![...timeSel.options].some(o => o.value === task.time)) {
            timeSel.add(new Option(task.time, task.time));
        }
        timeSel.value = task.time;
    }

    const durationField = document.getElementById('taskDuration');
    if (durationField) {
        const dbDur = task.duration || 30;
        const hh = String(Math.floor(dbDur / 60)).padStart(2, '0');
        const mm = String(dbDur % 60).padStart(2, '0');
        durationField.value = `${hh}:${mm}`;
    }
};

window.renderChainSummaries = function() {
    const topContainer = document.getElementById('chain-summaries-top');
    const bottomContainer = document.getElementById('chain-summaries-bottom');
    if (!topContainer || !bottomContainer) return;
    
    let topHtml = ''; 
    let bottomHtml = '';

    window.taskChain.forEach((t, index) => {
        if (index === window.activeChainIndex) return; // Текущую развернутую задачу не показываем в списке

        // Красная рамка и предупреждение, если свернутая задача не дозаполнена
        const taskType = document.getElementById('hiddenTaskType')?.value;
        const isFreeChain = taskType === 'free';
        const isValid = t.task_name && t.specialist && t.inn && t.date && (isFreeChain || t.time);
        const warningIcon = isValid ? '' : '<span class="text-danger fw-bold me-2" title="Не заполнено">⚠️</span>';

        const cardHtml = `
        <div class="task-chain-summary d-flex align-items-center justify-content-between" style="border-left-color: ${isValid ? '#0d6efd' : '#dc3545'}; opacity: 0; animation: fadeIn 0.3s forwards;">
            <div class="d-flex flex-wrap align-items-center gap-1 flex-grow-1 me-2" style="min-width: 0; row-gap: 2px;">
                <span class="badge bg-primary flex-shrink-0">#${index + 1}</span>
                <span class="fw-bold" style="word-break: break-word;">${t.task_name || 'Новая задача'}</span>
                <span class="text-muted small flex-shrink-0">|</span>
                <span class="small flex-shrink-0" style="white-space: nowrap;">ИНН:&nbsp;${t.inn || '—'}</span>
                ${!isFreeChain ? `<span class="text-muted small flex-shrink-0">|</span><span class="small text-primary fw-bold flex-shrink-0">${t.time || '--:--'}</span>` : ''}
            </div>
            <div class="d-flex align-items-center flex-shrink-0">
                ${warningIcon}
                <button type="button" class="btn btn-sm btn-outline-primary ms-auto me-3 d-flex align-items-center gap-1 shadow-sm" style="border-radius: 12px; font-size: 0.7rem; padding: 2px 10px;" onclick="expandTask(${index})">
                    Развернуть
                    <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>
                </button>
                <button type="button" class="btn-action btn-delete" title="Удалить" onclick="removeFromChain(${index})">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;">
                        <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                </button>
            </div>
        </div>
        <style>@keyframes fadeIn { to { opacity: 1; } }</style>
        `;

        if (index < window.activeChainIndex) topHtml += cardHtml;
        else bottomHtml += cardHtml;
    });

    topContainer.innerHTML = topHtml;
    bottomContainer.innerHTML = bottomHtml;

    // Включаем отображение кнопок копирования, если мы не на первой задаче
    document.querySelectorAll('.chain-copy-action').forEach(el => {
        if (window.activeChainIndex > 0) el.classList.remove('d-none');
        else el.classList.add('d-none');
    });
};

window.expandTask = function(index) {
    // 1. Прячем текущую форму в память
    if (window.taskChain.length === 0) {
        window.taskChain.push(window.getCurrentTaskData());
    } else {
        window.taskChain[window.activeChainIndex || 0] = window.getCurrentTaskData();
    }
    
    // 2. Делаем активной выбранную задачу и заливаем ее в форму
    window.activeChainIndex = index;
    window.fillTaskForm(window.taskChain[index]);
    
    // 3. Перерисовываем список
    window.renderChainSummaries();
};

window.addTaskToChain = function() {
    // 1. Сохраняем текущую форму (разрешаем пустоты)
    if (window.taskChain.length === 0) {
        window.taskChain.push(window.getCurrentTaskData());
        window.activeChainIndex = 0;
    } else {
        window.taskChain[window.activeChainIndex] = window.getCurrentTaskData();
    }

    const currentTask = window.taskChain[window.activeChainIndex];

    // 2. Расчет времени следующей задачи
    const duration = currentTask.duration || 30;
    let nextTime = '00:00';
    if (currentTask.time && currentTask.time.includes(':')) {
        const [h, m] = currentTask.time.split(':').map(Number);
        const end = new Date();
        end.setHours(h, m + duration, 0, 0);
        nextTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    }

    // 3. Создаем "пустышку"
    // 3. Создаем "пустышку"
    const newTask = {
        category: '', // Оставляем пустым
        task_name: '',
        specialist: currentTask.specialist, // Спеца всё же логично оставить
        inn: '', // Оставляем пустым
        bitrix_url: '', // Оставляем пустым
        price: 0, // Оставляем 0
        date: currentTask.date,
        time: nextTime,
        duration: 30,
        comment: '',
        billing_type: currentTask.billing_type
    };

    // 4. Добавляем в конец и переключаемся на неё
    window.taskChain.push(newTask);
    window.activeChainIndex = window.taskChain.length - 1;
    
    window.fillTaskForm(newTask);
    window.renderChainSummaries();

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = 'Сохранить всю цепочку';

    if (typeof updateFreeSlots === 'function') updateFreeSlots(nextTime); 
};

window.copyFromPrevious = function(field) {
    if (window.taskChain.length <= 1) return;
    const prevIndex = window.activeChainIndex > 0 ? window.activeChainIndex - 1 : 0;
    const last = window.taskChain[prevIndex]; 
    
    // ИСПРАВЛЕНИЕ: Запоминаем время, чтобы оно железно не сбилось при копировании
    const currentTime = document.getElementById('time')?.value;

    const copyOneField = (f) => {
        const input = document.getElementById(f);
        if (!input) return;
        
        let val = last[f === 'bitrix' ? 'bitrix_url' : (f === 'taskName' ? 'task_name' : f)] || '';
        
        if (f === 'taskName' && val && input.tagName === 'SELECT') {
            if (![...input.options].some(o => o.value === val)) {
                input.add(new Option(val, val));
            }
        }
        
        input.value = val;
    };

    if (field === 'all') {
        copyOneField('category');
        copyOneField('taskName');
        copyOneField('inn');
        copyOneField('bitrix');
        copyOneField('price');
        
        // Вручную копируем длительность, не дергая базу
        const durInput = document.getElementById('taskDuration');
        if (durInput && last.duration) {
            const hh = String(Math.floor(last.duration / 60)).padStart(2, '0');
            const mm = String(last.duration % 60).padStart(2, '0');
            durInput.value = `${hh}:${mm}`;
        }

        // Жестко возвращаем время на место
        setTimeout(() => {
            const timeSel = document.getElementById('time');
            if (timeSel && currentTime) {
                if (![...timeSel.options].some(o => o.value === currentTime)) {
                    timeSel.add(new Option(currentTime, currentTime));
                }
                timeSel.value = currentTime;
            }
        }, 50);
    } else {
        copyOneField(field);
        if (field === 'category' && typeof window.smartUpdateDropdowns === 'function') window.smartUpdateDropdowns('category');
        if (field === 'taskName' && typeof window.smartUpdateDropdowns === 'function') window.smartUpdateDropdowns('task');
    }
};

window.removeFromChain = function(index) {
    window.taskChain.splice(index, 1);
    
    if (index < window.activeChainIndex) {
        window.activeChainIndex--;
    }
    
    window.renderChainSummaries();
    if (window.taskChain.length <= 1) {
        const btn = document.getElementById('submit-btn');
        if (btn) btn.innerText = 'Сохранить';
    }
};