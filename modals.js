window.taskChain = []; 

window.openDynamicModal = function(type, isEdit = false) {
    const container = document.getElementById('dynamic-modal-container');
    let title = '';
    
    // Если открыли новую задачу (не перерисовка цепочки и не редактирование) - сбрасываем цепочку
    if (!isEdit && !event?.target?.closest('#add-to-chain-btn') && window.taskChain?.length > 0) {
        window.taskChain = [];
    }

    const hasChain = window.taskChain && window.taskChain.length > 0;

    // Шаблон микро-кнопки копирования
    const copyBtn = (field) => hasChain ? `
        <button type="button" class="btn btn-outline-secondary btn-sm px-2" title="Скопировать" onclick="copyFromPrevious('${field}')">
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
        </button>` : '';

    const specCatTaskHtml = (hideCat) => `
        <div class="step mb-2">
            <label class="form-label fw-bold mb-1 small">1. Тип работы и исполнитель</label>
            ${hideCat ? `<input type="hidden" id="category" value="Демонстрация">` : `<select id="category" class="form-select form-select-sm mb-2" required><option value="">Выберите категорию...</option></select>`}
            <select id="taskName" class="form-select form-select-sm mb-2" required><option value="">Выберите задачу...</option></select>
            <select id="specialist" class="form-select form-select-sm" required><option value="">Выберите специалиста...</option></select>
        </div>`;

    const clientHtml = (hidePrice) => `
        <div class="step mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label fw-bold small m-0">2. Клиент и оплата</label>
                ${hasChain ? `<button type="button" class="btn btn-link p-0 text-decoration-none" style="font-size: 0.7rem;" onclick="copyFromPrevious('all')">Скопировать всё сверху</button>` : ''}
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
    else if (type === 'free') { title = 'Бесплатная задача'; fieldsHtml = `<div class="row g-3"><div class="col-md-12">${specCatTaskHtml(false)} ${clientHtml(true)}</div></div>`; }
    else if (type === 'demo') { title = 'Демонстрация'; fieldsHtml = `<div class="row g-3"><div class="col-md-6">${specCatTaskHtml(true)} ${clientHtml(true)}</div><div class="col-md-6">${timeCommentHtml}</div></div>`; }

    container.innerHTML = `
        <div class="modal fade" id="taskModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered ${type === 'free' ? '' : 'modal-lg'}">
                <div class="modal-content border-0 shadow-lg">
                    <div class="modal-header py-2 bg-light border-bottom">
                        <h5 class="modal-title">${isEdit ? 'Редактирование: ' : 'Постановка: '} ${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body pt-3">
                        <div id="chain-summary-container"></div>

                        <form id="task-form">
                            <input type="hidden" id="hiddenTaskType" value="${type}">
                            ${fieldsHtml}
                            <div id="changeLogBlock" class="mt-2 p-2 bg-warning bg-opacity-10 border rounded d-none">
                                <label class="form-label fw-bold small mb-1 text-danger">Причина изменения</label>
                                <textarea class="form-control form-control-sm" id="historyComment" rows="1"></textarea>
                            </div>
                            
                            <div class="mt-4 d-flex gap-2">
                                <button type="submit" class="btn btn-success flex-grow-1 py-2 fw-bold shadow-sm" id="submit-btn">${hasChain ? 'Сохранить всю цепочку' : 'Сохранить'}</button>
                                ${!isEdit && type !== 'free' ? `<button type="button" class="btn btn-outline-primary py-2 fw-bold shadow-sm" onclick="addTaskToChain()" id="add-to-chain-btn">+ Добавить связанную</button>` : ''}
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
window.renderChainSummaries = function() {
    const container = document.getElementById('chain-summary-container');
    if (!container) return;
    container.innerHTML = window.taskChain.map((t, index) => `
        <div class="task-chain-summary d-flex justify-content-between align-items-center">
            <div>
                <span class="badge bg-primary me-2">#${index + 1}</span>
                <span class="fw-bold">${t.task_name}</span> 
                <span class="text-muted mx-2 small">|</span>
                <span class="small">ИНН: ${t.inn}</span>
                <span class="text-muted mx-2 small">|</span>
                <span class="small text-primary fw-bold">${t.time} (${t.duration} мин)</span>
            </div>
            <div>
                <span class="fw-bold text-success">${t.price > 0 ? t.price + ' ₽' : 'Бесплатно'}</span>
                <button type="button" class="btn btn-link btn-sm text-danger ms-2 p-0 shadow-none" onclick="removeFromChain(${index})">Удалить</button>
            </div>
        </div>
    `).join('');
};

window.addTaskToChain = function() {
    const form = document.getElementById('task-form');
    if (!form.checkValidity()) return form.reportValidity(); // Проверка заполненности

    const taskType = document.getElementById('hiddenTaskType').value;
    const durParts = (document.getElementById('taskDuration')?.value || "00:30").split(':').map(Number);
    const duration = (durParts[0] * 60) + durParts[1];

    // Сохраняем текущую задачу в память
    const currentTask = {
        category: document.getElementById('category')?.value || 'Демонстрация',
        task_name: document.getElementById('taskName').value,
        specialist: document.getElementById('specialist').value,
        inn: document.getElementById('inn').value,
        bitrix_url: document.getElementById('bitrix').value,
        price: parseInt(document.getElementById('price')?.value) || 0,
        date: document.getElementById('date').value,
        time: document.getElementById('time')?.value || '00:00',
        duration: duration,
        comment: document.getElementById('taskComment')?.value || '',
        billing_type: taskType
    };

    window.taskChain.push(currentTask);
    
    // Высчитываем время старта для следующей задачи
    const [h, m] = currentTask.time.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + duration, 0, 0);
    const nextTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    const savedSpec = currentTask.specialist;
    const savedDate = document.querySelector("#date")._flatpickr.selectedDates[0];

    // УНИЧТОЖАЕМ СТАРУЮ МОДАЛКУ И ЕЁ ФОН ПЕРЕД ОТКРЫТИЕМ НОВОЙ
    const oldModal = document.getElementById('taskModal');
    if (oldModal) {
        const inst = bootstrap.Modal.getInstance(oldModal);
        if (inst) inst.dispose();
    }
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // Переоткрываем модалку, чтобы она очистилась
    window.openDynamicModal(taskType, false);

    // Подставляем данные обратно с задержкой
    setTimeout(() => {
        document.getElementById('specialist').value = savedSpec;
        const dateInput = document.getElementById('date');
        if (dateInput._flatpickr) dateInput._flatpickr.setDate(savedDate);
        
        // Вызываем обновление слотов с передачей нужного времени
        if (typeof updateFreeSlots === 'function') updateFreeSlots(nextTime); 
    }, 150);
};

window.copyFromPrevious = function(field) {
    if (window.taskChain.length === 0) return;
    const last = window.taskChain[window.taskChain.length - 1]; // Берем последнюю добавленную
    
    if (field === 'all') {
        document.getElementById('inn').value = last.inn;
        document.getElementById('bitrix').value = last.bitrix_url;
        if (document.getElementById('price')) document.getElementById('price').value = last.price;
    } else {
        const input = document.getElementById(field);
        if (input) input.value = last[field === 'bitrix' ? 'bitrix_url' : field];
    }
};

window.removeFromChain = function(index) {
    window.taskChain.splice(index, 1);
    renderChainSummaries();
    if (window.taskChain.length === 0) {
        document.getElementById('submit-btn').innerText = 'Сохранить';
    }
};