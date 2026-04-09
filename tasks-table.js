// ЗАГРУЗКА ДАННЫХ

window.renderTaskRowHTML = function(t) {
    const isPaid = (typeof currentTable !== 'undefined' ? currentTable : 'tasks') === 'tasks';
    const showDept = true;
    const taskDate = t.date || (t.created_at ? t.created_at.split('T')[0] : '');
    const grayStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
    const isGrayStatus = grayStatuses.includes(t.status);
    const displayDate = new Date(taskDate).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'});
    const isLongBlock = (t.category === 'Отсутствует' && t.duration >= 480);
    const displayTime = isLongBlock ? 'ВЕСЬ ДЕНЬ' : (t.time ? t.time.substring(0, 5) : '—');

    let badgeClass = 'bg-secondary';
    const s = (t.status || 'Новая').toLowerCase();
    if (s === 'новая') badgeClass = 'bg-info text-dark';
    else if (s === 'выполнено') badgeClass = 'bg-success';
    else if (s === 'взят в работу') badgeClass = 'bg-primary';
    else if (s === 'возврат') badgeClass = 'bg-danger';
    else if (s.includes('ожидание') || s === 'не отвечает') badgeClass = 'bg-warning text-dark';
    else if (s === 'перенесен') badgeClass = 'bg-primary';

    const canEdit = (t.manager === currentUser.name) || (t.specialist === currentUser.name);

    let statusHTML = `
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

    let html = `
        <tr id="task-row-${t.id}" class="task-row" data-duration="${t.duration || 30}">
            <td><b class="text-primary">#${t.id}</b></td>
            <td><small class="text-muted">${t.dept || '-'}</small></td> 
            <td><small class="text-muted">${t.manager || '-'}</small></td>
            <td><span class="badge border text-dark bg-light" style="font-size: 0.75rem;">${t.category || '-'}</span></td> 
            <td class="cell-task-name">${t.task_name}</td>
            <td><small class="text-muted">${t.inn || '-'}</small></td>
            <td>${t.bitrix_url ? `<a href="${t.bitrix_url}" target="_blank" class="btn btn-sm btn-link p-0" onclick="window.handleBitrixClick(${t.id}, '${t.status}')">Открыть</a>` : '-'}</td>
            <td class="cell-datetime" id="cell-datetime-${t.id}" style="${isGrayStatus ? 'color: #adb5bd; opacity: 0.6;' : ''}">${displayDate} | <strong>${displayTime}</strong></td>
            ${isPaid ? `<td class="cell-comment" style="max-width: 180px;"><small class="text-dark">${t.comment || ''}</small></td>` : ''}
            <td class="cell-price">${t.price ? t.price + ' ₽' : '—'}</td>
            <td class="cell-status">${statusHTML}</td>
            <td>
                <div class="d-flex gap-0 justify-content-center">
                    ${canEdit ? `
                        <button class="btn-action btn-edit" onclick="window.openEditTask(${t.id})" title="Редактировать">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                        ${isPaid ? `
                        <button class="btn-action btn-reschedule" onclick="window.openReschedule(${t.id}, '${t.specialist}', '${t.date}')" title="Перенести">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                        </button>` : ''}
                        <button class="btn-action btn-delete" onclick="window.deleteTask(${t.id})" title="Удалить">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;"><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                        ${currentUser.role === 'manager' ? `
                        <button class="btn-action btn-copy" onclick="window.copyTask(${t.id})" title="Копировать">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;"><rect x="9" y="9" width="12" height="12" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path><line x1="15" y1="12" x2="15" y2="18"></line><line x1="12" y1="15" x2="18" y2="15"></line></svg>
                        </button>` : ''}
                    ` : ''}
                </div>
            </td>
        </tr>`;

    // Фантомы
    let totalDur = Number(t.duration) || 30;
    let spent = 30;
    while (totalDur > spent && isPaid && t.time && t.category !== 'Отсутствует') {
        const [h, m] = t.time.split(':').map(Number);
        const nextDate = new Date();
        nextDate.setHours(h, m + spent, 0, 0);
        const nextTime = `${String(nextDate.getHours()).padStart(2, '0')}:${String(nextDate.getMinutes()).padStart(2, '0')}`;
        html += `
            <tr class="phantom-${t.id}" style="background-color: rgba(0,0,0,0.02); color: #999; border-left: 3px solid #dee2e6;">
                <td></td>${showDept ? '<td></td>' : ''}<td></td><td></td>
                <td colspan="3" class="text-center" style="font-size: 0.8rem; font-style: italic;">↳ Продолжение задачи #${t.id}</td>
                <td class="cell-datetime">${displayDate} | <strong>${nextTime}</strong></td>
                ${isPaid ? '<td></td>' : ''}<td></td>
                <td class="cell-status"><span class="badge bg-light text-muted border">Занято</span></td>
                <td></td>
            </tr>`;
        spent += 30;
    }
    return html;
};

// Функция-обертка для вставки данных без потери позиции скролла
function insertWithScrollPreservation(container, html, position = 'afterbegin') {
    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    container.insertAdjacentHTML(position, html);

    // Если вставляем в начало (прошлое), корректируем скролл
    if (position === 'afterbegin') {
        const heightDiff = container.scrollHeight - oldScrollHeight;
        container.scrollTop = oldScrollTop + heightDiff;
    }
}

// Флаг, чтобы понимать, загружена ли полная история
let isFullHistoryLoaded = false;

async function loadTasks() {
    const list = document.getElementById('task-list');
    if (!list) return;

    const isPaid = currentTable === 'tasks';
    let totalCols = isPaid ? 12 : 11;
    isFullHistoryLoaded = false;

    // Считываем фильтры
    const activeTech = typeof activeTechFilter !== 'undefined' ? activeTechFilter : 'all';
    const dateFilter = localStorage.getItem('dateFilter') || 'all';

    const deptTh = document.getElementById('th-dept');
    if (deptTh) deptTh.hidden = false;
    const commentTh = document.getElementById('th-comment');
    if (commentTh) commentTh.hidden = !isPaid;

    list.innerHTML = `<tr><td colspan="${totalCols}" class="text-center text-muted py-4">Загрузка...</td></tr>`;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const yesterdayStr = yest.toISOString().split('T')[0];
    const tom = new Date(now); tom.setDate(now.getDate() + 1);
    const tomorrowStr = tom.toISOString().split('T')[0];

    try {
        let query = supabase.from(currentTable).select('*');
        
        // ФИЛЬТР ПО ТЕХНИКУ (в запросе)
        if (activeTech !== 'all' && activeTech !== '') {
            query = query.eq('specialist', activeTech);
        }

        if (isPaid && dateFilter === 'all') {
            query = query.gte('date', yesterdayStr).lte('date', tomorrowStr);
        } else if (dateFilter === 'today') {
            query = query.eq('date', todayStr);
        }

        query = query.order('date', { ascending: true });
        if (isPaid) query = query.order('time', { ascending: true });
        else query = query.order('created_at', { ascending: false });

        const { data: quickTasks, error } = await query;
        if (error) throw error;

        renderTaskList(quickTasks, true); 

        if (isPaid && dateFilter === 'all') {
            loadRemainingTasks(yesterdayStr, tomorrowStr);
        }

    } catch (e) { 
        console.error(e); 
        list.innerHTML = `<tr><td colspan="${totalCols}" class="text-center text-danger">Ошибка загрузки</td></tr>`;
    }
}

// Функция для отрисовки (вынесена из loadTasks)
function renderTaskList(tasks, isFirstStep = false) {
    const list = document.getElementById('task-list');
    const container = document.querySelector('.table-responsive');
    const todayStr = new Date().toISOString().split('T')[0];
    const totalCols = currentTable === 'tasks' ? 12 : 11;

    tasks.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.time || '').localeCompare(b.time || '');
    });

    if (isFirstStep) {
        list.innerHTML = '';
        let lastDate = null;
        tasks.forEach(t => {
            const taskDate = t.date || (t.created_at ? t.created_at.split('T')[0] : '');
            if (taskDate !== lastDate) {
                list.insertAdjacentHTML('beforeend', renderDayHeader(taskDate, todayStr, totalCols));
                lastDate = taskDate;
            }
            list.insertAdjacentHTML('beforeend', window.renderTaskRowHTML(t));
        });
        
        // После первой отрисовки (3 дня) скроллим к сегодня, если нужно
        // scrollToToday(); 
    } else {
        const existingHeaders = list.querySelectorAll('.day-header');
        const minDate = existingHeaders.length ? existingHeaders[0].getAttribute('data-date') : todayStr;

        const pastTasks = tasks.filter(t => t.date < minDate);

        if (pastTasks.length > 0) {
            // 1. Находим "якорь" — первый видимый заголовок ДО вставки
            const anchorElement = list.querySelector('.day-header');
            if (!anchorElement) return; // Если таблицы еще нет, просто выходим

            // 2. Запоминаем его точное положение относительно верхней границы контейнера
            const rectBefore = anchorElement.offsetTop;
            const scrollBefore = container.scrollTop;

            // 3. Собираем HTML "прошлого"
            let pastHtml = '';
            let lastDate = null;
            pastTasks.forEach(t => {
                if (t.date !== lastDate) {
                    pastHtml += renderDayHeader(t.date, todayStr, totalCols);
                    lastDate = t.date;
                }
                pastHtml += window.renderTaskRowHTML(t);
            });

            // 4. Вставляем данные
            list.insertAdjacentHTML('afterbegin', pastHtml);

            // 5. Корректируем скролл. 
            // Используем offsetTop нового положения якоря для компенсации разницы.
            const rectAfter = anchorElement.offsetTop;
            const diff = rectAfter - rectBefore;

            // Мгновенная коррекция
            container.style.scrollBehavior = 'auto'; // Отключаем плавность на миг
            container.scrollTop = scrollBefore + diff;
            
            // Дополнительная проверка через один кадр (на случай тяжелого рендеринга)
            requestAnimationFrame(() => {
                container.scrollTop = scrollBefore + diff;
                container.style.scrollBehavior = 'smooth'; // Возвращаем плавность
            });
        }

        // Будущее догружаем просто так
        const maxDate = existingHeaders.length ? existingHeaders[existingHeaders.length - 1].getAttribute('data-date') : todayStr;
        const futureTasks = tasks.filter(t => t.date > maxDate);
        if (futureTasks.length > 0) {
            let futureHtml = '';
            let lastDate = null;
            futureTasks.forEach(t => {
                if (t.date !== lastDate) {
                    futureHtml += renderDayHeader(t.date, todayStr, totalCols);
                    lastDate = t.date;
                }
                futureHtml += window.renderTaskRowHTML(t);
            });
            list.insertAdjacentHTML('beforeend', futureHtml);
        }
    }
}

// Вспомогательная для заголовка
function renderDayHeader(date, todayStr, cols) {
    return `
        <tr class="day-divider day-header" data-date="${date}">
            <td colspan="${cols}" class="bg-light fw-bold py-2 px-3 border-bottom">
                ${new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                ${date === todayStr ? '<span class="badge bg-primary ms-2">Сегодня</span>' : ''}
            </td>
        </tr>`;
}

// Фоновая загрузка остального
async function loadRemainingTasks(exclStart, exclEnd) {
    try {
        const activeTech = typeof activeTechFilter !== 'undefined' ? activeTechFilter : 'all';
        
        let query = supabase.from(currentTable).select('*');

        // Добавляем фильтр по технарю, если он выбран
        if (activeTech !== 'all' && activeTech !== '') {
            query = query.eq('specialist', activeTech);
        }

        // Исключаем уже загруженные 3 дня
        query = query.or(`date.lt.${exclStart},date.gt.${exclEnd}`);

        const { data: allTasks } = await query
            .order('date', { ascending: true })
            .order('time', { ascending: true });

        if (allTasks) {
            renderTaskList(allTasks, false);
            isFullHistoryLoaded = true;
            console.log("✅ Остальные данные догружены в фоне");
        }
    } catch (e) {
        console.error("Ошибка фоновой загрузки:", e);
    }
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

// ПОДПИСКА НА ОБНОВЛЕНИЯ В РЕАЛЬНОМ ВРЕМЕНИ
// ОБНОВЛЕННАЯ ПОДПИСКА (INSERT + UPDATE)
const taskSubscription = supabase
    .channel('public:tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('Realtime change:', payload.eventType, payload.new);

        if (payload.eventType === 'INSERT') {
            insertTaskIntoDOM(payload.new);
        } 
        else if (payload.eventType === 'UPDATE') {
            updateTaskRowUI(payload.new);
        }
        else if (payload.eventType === 'DELETE') {
            const row = document.getElementById(`task-row-${payload.old.id}`);
            if (row) row.remove();
            document.querySelectorAll(`.phantom-${payload.old.id}`).forEach(el => el.remove());
        }
    })
    .subscribe();
// ФУНКЦИЯ ТОЧЕЧНОГО ОБНОВЛЕНИЯ СТРОКИ
function updateTaskRowUI(t) {
    const row = document.getElementById(`task-row-${t.id}`);
    
    if (!row) {
        insertTaskIntoDOM(t);
        return;
    }

    const activeTech = activeTechFilter;
    const dateFilter = localStorage.getItem('dateFilter') || 'all';
    const now = new Date().toISOString().split('T')[0];
    
    if ((activeTech !== 'all' && t.specialist !== activeTech) || 
        (dateFilter === 'today' && t.date !== now)) {
        row.remove();
        document.querySelectorAll(`.phantom-${t.id}`).forEach(el => el.remove());
        return;
    }

    const oldDuration = row.getAttribute('data-duration');
    const newDuration = String(t.duration || 30);
    const newDisplayTime = t.time ? t.time.substring(0, 5) : '—';
    const dateTimeCell = document.getElementById(`cell-datetime-${t.id}`);
    const currentDisplayContent = dateTimeCell ? dateTimeCell.innerText : '';

    // --- ИСПРАВЛЕНИЕ №1: Убираем loadTasks() ---
    if (oldDuration !== newDuration || !currentDisplayContent.includes(newDisplayTime)) {
        row.remove(); 
        document.querySelectorAll(`.phantom-${t.id}`).forEach(el => el.remove());
        insertTaskIntoDOM(t); // Вставляем заново в нужное место без перезагрузки всей таблицы
        return;
    }

    // --- ИСПРАВЛЕНИЕ №2: Обновляем содержимое через renderTaskRowHTML ---
    // Это обновит статус, цену и комментарий одновременно и правильно
    const tempTable = document.createElement('table');
    tempTable.innerHTML = window.renderTaskRowHTML(t);
    const newRowHTML = tempTable.querySelector('tr').innerHTML;
    
    row.innerHTML = newRowHTML;
    row.setAttribute('data-duration', newDuration);
}

function insertTaskIntoDOM(t) {
    if (document.getElementById(`task-row-${t.id}`)) return;

    // 1. Фильтры
    const activeTech = activeTechFilter; 
    const dateFilter = localStorage.getItem('dateFilter') || 'all';
    const nowStr = new Date().toISOString().split('T')[0];

    if (activeTech !== 'all' && t.specialist !== activeTech) return;
    if (dateFilter === 'today' && t.date !== nowStr) return;

    const list = document.getElementById('task-list'); 
    if (!list) return;

    const targetDate = t.date || (t.created_at ? t.created_at.split('T')[0] : '');
    const rowHtml = renderTaskRowHTML(t); 

    // 2. Ищем или создаем заголовок даты
    let dateHeader = list.querySelector(`tr.day-header[data-date="${targetDate}"]`);
    
    if (!dateHeader) {
        // Если даты нет, создаем заголовок и вставляем в нужное место по календарю
        const headerHtml = `
            <tr class="day-divider day-header" data-date="${targetDate}">
                <td colspan="12" class="bg-light fw-bold py-2 px-3 border-bottom">
                    ${new Date(targetDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    ${targetDate === nowStr ? '<span class="badge bg-primary ms-2">Сегодня</span>' : ''}
                </td>
            </tr>`;
        
        // Находим, куда впихнуть новый блок даты (сортировка по дням)
        const allHeaders = Array.from(list.querySelectorAll('tr.day-header'));
        const nextHeader = allHeaders.find(h => h.getAttribute('data-date') > targetDate);
        
        if (nextHeader) {
            nextHeader.insertAdjacentHTML('beforebegin', headerHtml);
        } else {
            list.insertAdjacentHTML('beforeend', headerHtml);
        }
        dateHeader = list.querySelector(`tr.day-header[data-date="${targetDate}"]`);
    }

    // 3. Вставляем задачу ВНУТРИ секции даты по времени
    let sibling = dateHeader.nextElementSibling;
    const newTime = t.time ? t.time.substring(0, 5) : "00:00";

    while (sibling && !sibling.classList.contains('day-header')) {
        if (sibling.classList.contains('task-row')) {
            const rowTimeCell = sibling.querySelector('.cell-datetime strong');
            const rowTime = rowTimeCell ? rowTimeCell.innerText : "00:00";
            if (rowTime > newTime) {
                sibling.insertAdjacentHTML('beforebegin', rowHtml);
                return;
            }
        }
        sibling = sibling.nextElementSibling;
    }

    // Если дошли до следующего заголовка или конца списка
    if (sibling) {
        sibling.insertAdjacentHTML('beforebegin', rowHtml);
    } else {
        list.insertAdjacentHTML('beforeend', rowHtml);
    }
}

// Вспомогательная функция для цветов (чтобы не дублировать в основном коде)
function getBadgeClass(status) {
    const s = (status || 'Новая').toLowerCase();
    if (s === 'новая') return 'bg-info text-dark';
    if (s === 'выполнено') return 'bg-success';
    if (s === 'взят в работу') return 'bg-primary';
    if (s === 'возврат') return 'bg-danger';
    if (s.includes('ожидание') || s === 'не отвечает') return 'bg-warning text-dark';
    if (s === 'перенесен') return 'bg-primary';
    return 'bg-secondary';
}