// ЗАГРУЗКА ДАННЫХ
async function loadTasks() {
    const list = document.getElementById('task-list');
    if (!list) return;

    const showDept = true; // Отдел теперь видим всегда
const isPaid = currentTable === 'tasks'; 

// Базовые 11: ID, Отдел, Менеджер, Категория, Задача, ИНН, Битрикс, Дата, Цена, Статус, Действия
let totalCols = 11;
if (isPaid) totalCols++; // +1 для комментария (итого 12)

    // Управляем заголовками
    const deptTh = document.getElementById('th-dept');
if (deptTh) deptTh.hidden = false; 

    const commentTh = document.getElementById('th-comment');
    if (commentTh) commentTh.hidden = !isPaid;

    list.innerHTML = `<tr><td colspan="${totalCols}" class="text-center text-muted py-4">Загрузка данных...</td></tr>`;

    try {
        let query = supabase.from(currentTable).select('*');
        
        query = query.order('date', { ascending: true });
        if (currentTable === 'tasks') {
            query = query.order('time', { ascending: true });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        
        query = query.select('*');

        const { data: tasks, error } = await query;
        if (error) throw error;

        const hideDone = localStorage.getItem('hideDone') === 'true';
        const dateFilter = localStorage.getItem('dateFilter') || 'all';
        const onlyMyTasks = localStorage.getItem('onlyMyTasks') === 'true';
        const customDateVal = document.getElementById('filterCustomDate')?.value;
        const searchQuery = document.getElementById('taskSearch')?.value.toLowerCase() || '';
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const tomDate = new Date(now);
        tomDate.setDate(now.getDate() + 1);
        const tomorrowStr = tomDate.toISOString().split('T')[0];

        let filteredTasks = tasks.filter(t => {
            // 1. Скрывать выполненные
            if (hideDone && t.status === 'Выполнено') return false;

            // 2. Фильтр "Мои задачи" (только для менеджеров)
            if (onlyMyTasks && currentUser.role === 'manager') {
                if (t.manager !== currentUser.name) return false;
            }

            // 3. Фильтр по технарю (теперь работает для всех ролей одинаково)
if (activeTechFilter !== 'all') {
    if (t.specialist !== activeTechFilter) return false;
}

            // 4. Фильтр по датам (только для основной таблицы задач)
            let dateMatch = true;
            if (currentTable === 'tasks') {
                if (dateFilter === 'today') dateMatch = (t.date === todayStr);
                else if (dateFilter === 'tomorrow') dateMatch = (t.date === tomorrowStr);
                else if (dateFilter === 'custom' && customDateVal) dateMatch = (t.date === customDateVal);
            }
            if (!dateMatch) return false;

            // 5. Глобальный поиск (по всем полям)
            if (searchQuery) {
                const searchString = [t.id, t.task_name, t.specialist, t.manager, t.inn, t.status, t.price].join(' ').toLowerCase();
                if (!searchString.includes(searchQuery)) return false;
            }

            return true;
        });

        list.innerHTML = filteredTasks.length ? '' : `<tr><td colspan="${totalCols}" class="text-center py-4">Ничего не найдено</td></tr>`;

        let lastDate = null;

        filteredTasks.forEach(t => {
            const taskDate = t.date || (t.created_at ? t.created_at.split('T')[0] : '');

            if (lastDate && taskDate !== lastDate) {
    // Проверяем: эта дата сегодня или она первая в списке после вчерашних?
    const isToday = taskDate === todayStr;

    list.insertAdjacentHTML('beforeend', `
        <tr class="day-divider day-header" data-date="${taskDate}">
            <td colspan="${totalCols}" class="bg-light fw-bold py-2 px-3 border-bottom">
                ${new Date(taskDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                ${isToday ? '<span class="badge bg-primary ms-2">Сегодня</span>' : ''}
            </td>
        </tr>
    `);
}
            lastDate = taskDate;

            const grayStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
            const isGrayStatus = grayStatuses.includes(t.status);

            const displayDate = new Date(taskDate).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'});
            const isLongBlock = (t.category === 'Отсутствует' && t.duration >= 480);
const displayTime = isLongBlock ? 'ВЕСЬ ДЕНЬ' : (t.time ? t.time.substring(0, 5) : '—');
            const secondCol = currentUser.role === 'manager' ? t.specialist : t.manager;

            let badgeClass = 'bg-secondary';
            const s = (t.status || 'Новая').toLowerCase();
            if (s === 'новая') badgeClass = 'bg-info text-dark';
            if (s === 'выполнено') badgeClass = 'bg-success';
            if (s === 'взят в работу') badgeClass = 'bg-primary';
            if (s === 'возврат') badgeClass = 'bg-danger';
            if (s.includes('ожидание')) badgeClass = 'bg-warning text-dark';
            if (s === 'не отвечает') badgeClass = 'bg-warning text-dark';
            if (s === 'перенесен') badgeClass = 'bg-primary';

            let statusHTML = `<span class="badge ${badgeClass}">${t.status}</span>`;

            
    statusHTML = `
        <div class="dropdown">
            <button class="badge ${badgeClass} dropdown-toggle border-0 status-dropdown" 
                    data-bs-toggle="dropdown" 
                    style="cursor:pointer"
                    onclick="window.loadQuickHistory(${t.id})">
                ${t.status}
            </button>
            <ul class="dropdown-menu shadow-lg p-0" style="min-width: 550px;" onclick="event.stopPropagation()">
    <div class="d-flex" style="position: relative; min-height: 300px;">
        <div class="border-end" style="width: 40%; flex-shrink: 0; position: relative;">
            <div id="status-list-${t.id}">
                <li class="p-2 bg-light border-bottom fw-bold small text-center text-uppercase">Сменить статус</li>
                
                <li><a class="dropdown-item py-2" href="#" onclick="window.prepareStatusChange(${t.id}, 'Взят в работу')">Взят в работу</a></li>
                <li><a class="dropdown-item py-2 text-success fw-bold" href="#" onclick="window.prepareStatusChange(${t.id}, 'Выполнено')">Выполнено</a></li>
                <li class="mb-2"><a class="dropdown-item py-2 text-danger fw-bold" href="#" onclick="window.prepareStatusChange(${t.id}, 'Возврат')">Возврат</a></li>
                
                <li class="p-2 bg-light border-top border-bottom fw-bold small text-center text-uppercase">Поставить на паузу</li>
                
                <li><a class="dropdown-item py-2" href="#" onclick="window.prepareStatusChange(${t.id}, 'Ожидание от клиента')">Ожидание от клиента</a></li>
                <li><a class="dropdown-item py-2" href="#" onclick="window.prepareStatusChange(${t.id}, 'Ожидание от менеджера')">Ожидание от менеджера</a></li>
                <li><a class="dropdown-item py-2" href="#" onclick="window.prepareStatusChange(${t.id}, 'Ожидание от тех.спеца')">Ожидание от тех.спеца</a></li>
                <li class="mb-2"><a class="dropdown-item py-2" href="#" onclick="window.prepareStatusChange(${t.id}, 'Не отвечает')">Не отвечает</a></li>
            </div>

            <div id="comment-area-${t.id}" class="d-none position-absolute top-0 start-0 w-100 h-100 bg-white p-2" style="z-index: 10;">
                <div class="d-flex flex-column h-100">
                    <div class="small fw-bold mb-1 text-primary" id="target-status-name-${t.id}"></div>
                    <textarea id="status-comment-input-${t.id}" class="form-control form-control-sm mb-2 flex-grow-1" placeholder="Комментарий..."></textarea>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-secondary w-50" onclick="window.cancelStatusChange(${t.id})">Отмена</button>
                        <button class="btn btn-sm btn-primary w-50" id="confirm-status-btn-${t.id}">ОК</button>
                    </div>
                </div>
            </div>
        </div>

        <div style="width: 60%; max-height: 400px; overflow-y: auto; background: #fdfdfd;">
            <li class="p-2 bg-light border-bottom fw-bold small text-center text-uppercase" style="position: sticky; top: 0; z-index: 1;">История</li>
            <div id="quick-history-${t.id}" class="p-3 small text-muted">
                <div class="text-center py-3">Загрузка...</div>
            </div>
        </div>
    </div>
</ul>
        </div>`;

            const canEdit = (t.manager === currentUser.name) || (t.specialist === currentUser.name);
            list.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><b class="text-primary">#${t.id}</b></td>
        <td><small class="text-muted">${t.dept || '-'}</small></td> 
        <td><small class="text-muted">${t.manager || '-'}</small></td>
        <td><span class="badge border text-dark bg-light" style="font-size: 0.75rem;">${t.category || '-'}</span></td> 
        <td>${t.task_name}</td>
                    <td><small class="text-muted">${t.inn || '-'}</small></td>
                    <td>
                        ${t.bitrix_url ? 
                            `<a href="${t.bitrix_url}" target="_blank" class="btn btn-sm btn-link p-0" onclick="window.handleBitrixClick(${t.id}, '${t.status}')">Открыть</a>` 
                            : '-'
                        }
                    </td>
                    <td class="cell-datetime" style="${isGrayStatus ? 'color: #adb5bd; opacity: 0.6;' : ''}">
                     ${displayDate} | <strong>${displayTime}</strong>
                    </td>

                    ${isPaid ? `<td style="max-width: 180px;"><small class="text-dark">${t.comment || ''}</small></td>` : ''}

                    <td class="cell-price">${t.price ? t.price + ' ₽' : '—'}</td>
                    <td class="cell-status">${statusHTML}</td>
                    
                    <td>
                        <div class="d-flex gap-0 justify-content-center">
                        ${canEdit ? `
                            <button class="btn-action btn-edit" onclick="window.openEditTask(${t.id})" title="Редактировать">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                            </button>
                            ${currentTable === 'tasks' ? `
                            <button class="btn-action btn-reschedule" onclick="window.openReschedule(${t.id}, '${t.specialist}', '${t.date}')" title="Перенести">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                            </button>` : ''}
                            <button class="btn-action btn-delete" onclick="window.deleteTask(${t.id})" title="Удалить">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                            </button>
                            ${currentUser.role === 'manager' ? `
                            <button class="btn-action btn-copy" onclick="window.copyTask(${t.id})" title="Добавить копированием">
                            <svg xmlns="http://www.w3.org/2000/svg" 
                                viewBox="0 0 24 24" fill="none" 
                                stroke="currentColor" stroke-width="1.5" 
                                stroke-linecap="round" stroke-linejoin="round" 
                                style="margin-top: 2px;"> <rect x="9" y="9" width="12" height="12" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                <line x1="15" y1="12" x2="15" y2="18"></line>
                                <line x1="12" y1="15" x2="18" y2="15"></line>
                            </svg>
                            </button>
                            ` : ''}
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `);
            // ВСТАВЛЯТЬ СТРОГО СЮДА (ПОСЛЕ ОСНОВНОЙ СТРОКИ)
            // --- ГЕНЕРАЦИЯ ФАНТОМНЫХ СТРОК (ТОЛЬКО ДЛЯ ОБЫЧНЫХ ЗАДАЧ) ---
let totalDuration = Number(t.duration) || 30; 
let spentDuration = 30; 

// ДОБАВЛЕНО УСЛОВИЕ: !t.category?.includes('Отсутствует') 
// Это остановит цикл, если задача помечена как "Отсутствует" (Отпуск, Весь денфь)
while (totalDuration > spentDuration && currentTable === 'tasks' && t.time && t.category !== 'Отсутствует') {
    const [h, m] = t.time.split(':').map(Number);
    const nextDate = new Date();
    
    nextDate.setHours(h, m + spentDuration, 0, 0);
    const nextTime = `${String(nextDate.getHours()).padStart(2, '0')}:${String(nextDate.getMinutes()).padStart(2, '0')}`;

    list.insertAdjacentHTML('beforeend', `
        <tr style="background-color: rgba(0,0,0,0.02); color: #999; border-left: 3px solid #dee2e6;">
            <td></td>
            ${showDept ? '<td></td>' : ''} 
            <td></td>
            <td></td>
            <td colspan="3" class="text-center" style="font-size: 0.8rem; font-style: italic;">
                ↳ Продолжение задачи #${t.id}
            </td>
            <td class="cell-datetime">${new Date(t.date).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'})} | <strong>${nextTime}</strong></td>
            ${isPaid ? '<td></td>' : ''}
            <td></td>
            <td class="cell-status"><span class="badge bg-light text-muted border" style="font-weight: normal;">Занято</span></td>
            <td></td>
        </tr>
    `);

    spentDuration += 30;
}
        });
        setTimeout(scrollToToday, 100);
    } catch (e) { console.error(e); }
}

function scrollToToday() {
    const container = document.querySelector('.table-responsive');
    const dayHeaders = document.querySelectorAll('.day-header');
    const tableHeader = document.querySelector('thead'); // Находим саму шапку
    const todayStr = new Date().toISOString().split('T')[0];
    
    let targetRow = null;

    // Ищем сегодня или ближайший будущий день
    for (let header of dayHeaders) {
        const headerDate = header.getAttribute('data-date');
        if (headerDate >= todayStr) {
            targetRow = header;
            break; 
        }
    }

    if (targetRow && container) {
        // Вычисляем высоту липкой шапки (обычно ~40-50px)
        const headerHeight = tableHeader ? tableHeader.offsetHeight : 0;
        
        // Позиция строки МИНУС высота шапки
        const rowPos = targetRow.offsetTop - headerHeight;
        
        container.scrollTo({
            top: rowPos,
            behavior: 'smooth'
        });
    }
}

window.loadQuickHistory = async (taskId) => {
    const container = document.getElementById(`quick-history-${taskId}`);
    if (!container) return;

    try {
        const { data, error } = await supabase
            .from('task_history')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });

        if (error || !data?.length) {
            container.innerHTML = '<div class="text-center py-2 text-muted">История пуста</div>';
            return;
        }

        container.innerHTML = data.map(item => {
            // ЧЕЛОВЕЧЕСКАЯ ДАТА: 12.03.2026 10:05
            const fullDate = new Date(item.created_at).toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            let details = [];
            if (item.action_type === 'create') {
                details.push(`<span class="text-success fw-bold">Создана задача</span>`);
            } else if (item.changes) {
                const labels = {
                    status: 'Статус', price: 'Цена', date: 'Дата', time: 'Время',
                    duration: 'Длительность', comment: 'Коммент', inn: 'ИНН', bitrix_url: 'Битрикс'
                };

                Object.entries(item.changes).forEach(([key, val]) => {
                    const label = labels[key] || key;
                    let n = val.new !== undefined ? val.new : val;
                    let o = val.old;

                    // Форматирование значений
                    if (key === 'price') { n += ' ₽'; if(o !== undefined) o += ' ₽'; }

if (key === 'duration') {
    const toText = (m) => {
        const hrs = Math.floor(m / 60);
        const mins = m % 60;
        return `${hrs > 0 ? hrs + ' ч. ' : ''}${mins > 0 ? mins + ' мин.' : (hrs > 0 ? '' : '0 мин.')}`.trim();
    };
    n = toText(n);
    if(o !== undefined) o = toText(o);
}
                    
                    // Дату внутри изменений (если перенесено) тоже делаем понятной
                    if (key === 'date') {
                        n = new Date(n).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
                        if(o) o = new Date(o).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
                    }

                    if (o !== undefined && o !== null) {
                        details.push(`${label}: <b>${n}</b> <span class="text-muted" style="font-size: 0.65rem;">(было ${o})</span>`);
                    } else {
                        details.push(`${label}: <b>${n}</b>`);
                    }
                });
            }
            if (item.comment) {
                details.push(`<div class="mt-1 text-dark" style="font-style: italic; font-size: 0.75rem; border-top: 1px dashed #eee; padding-top: 2px;">
                    💬 ${item.comment}
                </div>`);
            }

            return `
                <div class="mb-2 pb-2 border-bottom">
                    <div class="fw-bold text-dark mb-1" style="font-size: 0.7rem;">
                        <span class="text-primary">[${fullDate}]</span> ${item.user_name}
                    </div>
                    <div class="ps-1 text-secondary" style="border-left: 1.5px solid #ddd;">
                        ${details.join('<br>')}
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        container.innerHTML = '<div class="text-danger small">Ошибка данных</div>';
    }
};