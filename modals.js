// Генерируем модалку на лету, чтобы избежать дублирования ID в HTML
window.openDynamicModal = function(type, isEdit = false) {
    const container = document.getElementById('dynamic-modal-container');
    let title = '';
    let fieldsHtml = '';

    // БЛОК 1: Категория и Задача (одинаковые для всех)
    const specCatTaskHtml = (hideCat) => `
        <div class="step mb-2">
            <label class="form-label fw-bold mb-1 small">1. Тип работы и исполнитель</label>
            ${hideCat 
                ? `<input type="hidden" id="category" value="Демонстрация">` 
                : `<select id="category" class="form-select form-select-sm mb-2" required><option value="">Выберите категорию...</option></select>`
            }
            <select id="taskName" class="form-select form-select-sm mb-2" required>
                <option value="">Выберите задачу...</option>
            </select>
            <select id="specialist" class="form-select form-select-sm" required>
                <option value="">Выберите специалиста...</option>
            </select>
        </div>
    `;

    // БЛОК 2: ИНН, Битрикс, Оплата
    const clientHtml = (hidePrice) => `
        <div class="step mb-2">
            <label class="form-label fw-bold mb-1 small">2. Клиент и оплата</label>
            <input type="text" id="inn" class="form-control form-control-sm mb-2" placeholder="ИНН клиента" required>
            <input type="url" id="bitrix" class="form-control form-control-sm mb-2" placeholder="Ссылка на Битрикс24" required>
            ${hidePrice 
                ? `<input type="hidden" id="price" value="0">` 
                : `<div id="priceBlock" class="input-group input-group-sm">
                      <span class="input-group-text">₽</span>
                      <input type="number" id="price" class="form-control" placeholder="Стоимость" required>
                   </div>`
            }
        </div>
    `;

    // БЛОК 3: Дата, Время, Комментарий
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
            <div id="commentBlock" class="mt-2">
                <label class="form-label fw-bold mb-1 small">Примечание</label>
                <textarea class="form-control form-control-sm" id="taskComment" rows="2" maxlength="55" placeholder='Например: "Клиент на месте до 14:00"'></textarea>
            </div>
        </div>
    `;

    // СОБИРАЕМ 3 РАЗНЫЕ МОДАЛКИ
    if (type === 'paid') {
        title = 'Платная задача';
        fieldsHtml = `
            <div class="row g-3">
                <div class="col-md-6">${specCatTaskHtml(false)} ${clientHtml(false)}</div>
                <div class="col-md-6">${timeCommentHtml}</div>
            </div>`;
    } else if (type === 'free') {
        title = 'Бесплатная задача';
        fieldsHtml = `
            <div class="row g-3">
                <div class="col-md-12">${specCatTaskHtml(false)} ${clientHtml(true)}</div>
            </div>`;
    } else if (type === 'demo') {
        title = 'Демонстрация';
        fieldsHtml = `
            <div class="row g-3">
                <div class="col-md-6">${specCatTaskHtml(true)} ${clientHtml(true)}</div>
                <div class="col-md-6">${timeCommentHtml}</div>
            </div>`;
    }

    // Обертка модалки
    container.innerHTML = `
        <div class="modal fade" id="taskModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered ${type === 'free' ? '' : 'modal-lg'}">
                <div class="modal-content border-0 shadow-lg">
                    <div class="modal-header py-2">
                        <h5 class="modal-title">${isEdit ? 'Редактирование: ' : 'Постановка: '} ${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body pt-3">
                        <form id="task-form">
                            <input type="hidden" id="hiddenTaskType" value="${type}">
                            
                            ${fieldsHtml}
                            
                            <div id="changeLogBlock" class="mt-2 p-2 bg-warning bg-opacity-10 border rounded d-none">
                                <label class="form-label fw-bold small mb-1 text-danger">Причина изменения (в историю)</label>
                                <textarea class="form-control form-control-sm" id="historyComment" rows="1" placeholder="Например: Перенос"></textarea>
                            </div>
                            
                            <div class="mt-3">
                                <button type="submit" class="btn btn-success w-100 py-2 shadow-sm" id="submit-btn">Сохранить</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;

    // Заполняем исполнителей сразу
    const specSelect = document.getElementById('specialist');
    if (specSelect && CONFIG && CONFIG.USERS) {
        CONFIG.USERS.filter(u => u.role === 'specialist').forEach(s => specSelect.add(new Option(s.name, s.name)));
    }

    // Запускаем кастомное событие для инициализации (в task-form.js)
    document.dispatchEvent(new CustomEvent('dynamicModalReady', { detail: { type, isEdit } }));

    // Показываем, если это создание (при редактировании покажет функция openEditTask)
    if (!isEdit) {
        new bootstrap.Modal(document.getElementById('taskModal')).show();
    }
};