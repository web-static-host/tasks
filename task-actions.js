// 3. УПРАВЛЕНИЕ СТАТУСОМ (Сделал глобальными)
// 1. Показываем поле комментария
window.prepareStatusChange = (id, status) => {
    // Останавливаем закрытие дропдауна Bootstrap
    event.preventDefault();
    event.stopPropagation();

    const area = document.getElementById(`comment-area-${id}`);
    const nameLabel = document.getElementById(`target-status-name-${id}`);
    const btn = document.getElementById(`confirm-status-btn-${id}`);
    const input = document.getElementById(`status-comment-input-${id}`);

    if (!area) return;

    nameLabel.innerText = status;
    area.classList.remove('d-none'); // Показываем блок
    input.value = '';
    input.focus();

    btn.onclick = async () => {
        const comment = input.value.trim();
        await window.updateTaskStatus(id, status, comment);
        // После сохранения закрываем все меню
        const dropdown = btn.closest('.dropdown-menu');
        if (dropdown) dropdown.classList.remove('show');
    };
};

// 2. Отмена (просто скрываем блок комментария)
window.cancelStatusChange = (id) => {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`comment-area-${id}`).classList.add('d-none');
};

// 3. Сохранение в базу
window.updateTaskStatus = async (id, newStatus, comment = null) => {
    try {
        // 1. Определяем таблицу (если currentTable вдруг не определена)
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';

        // 2. Получаем текущий статус для проверки изменений
        const { data: oldTask, error: fetchError } = await supabase
            .from(targetTable)
            .select('status')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 3. Готовим данные для обновления
        const updateData = { status: newStatus };

        // Если статус "завершающий", обнуляем длительность (ТОЛЬКО ДЛЯ ПЛАТНЫХ)
        const freeTimeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
        
        // ДОБАВИЛИ ПРОВЕРКУ: && targetTable !== 'free_tasks'
        if (freeTimeStatuses.includes(newStatus) && targetTable !== 'free_tasks') {
            updateData.duration = 0;
        }

        // 4. ОБНОВЛЯЕМ БАЗУ (Самый важный этап)
        const { error: updateError } = await supabase
            .from(targetTable)
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            alert("Ошибка при обновлении статуса в базе");
            throw updateError;
        }

        // 5. ЗАПИСЫВАЕМ В ИСТОРИЮ (только если статус реально изменился)
        if (oldTask && oldTask.status !== newStatus) {
            await logTaskAction(id, 'status_change', { 
                status: { old: oldTask.status, new: newStatus } 
            }, comment);
        }

        // 6. ФИНАЛ: Закрываем меню и обновляем интерфейс
        // Находим открытое меню и принудительно его гасим
        const openDropdown = document.querySelector('.dropdown-menu.show');
        if (openDropdown) {
            openDropdown.classList.remove('show');
            // Если используешь Bootstrap 5, лучше так:
            const parent = openDropdown.closest('.dropdown');
            if (parent) {
                const toggle = parent.querySelector('[data-bs-toggle="dropdown"]');
                if (toggle) bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
            }
        }



    } catch (e) { 
        console.error('Критическая ошибка обновления:', e);
        alert("Не удалось обновить статус. Проверь консоль.");
    }
};

window.openReschedule = async (id, spec, date) => {
    document.getElementById('reschedule-id-label').innerText = id;
    document.getElementById('reschedule-task-id').value = id;
    document.getElementById('reschedule-spec-name').value = spec;
    
    // Проверяем, это весь день?
    const { data: task } = await supabase.from('tasks').select('category, duration').eq('id', id).single();
    const isFullDay = task && task.category === 'Отсутствует' && task.duration >= 480;

    const timeBlock = document.getElementById('new-time').parentElement;
    const btn = document.getElementById('confirm-reschedule-btn');

    if (isFullDay) {
        timeBlock.classList.add('d-none'); // Прячем время
        btn.disabled = false; // Сразу разрешаем перенос
    } else {
        timeBlock.classList.remove('d-none');
        btn.disabled = true; 
    }

    const modal = new bootstrap.Modal(document.getElementById('rescheduleModal'));
    modal.show();

    const dateInput = document.getElementById('new-date');
    if (dateInput._flatpickr) dateInput._flatpickr.setDate(date);
    
    if (!isFullDay) updateRescheduleSlots();
};

async function updateRescheduleSlots() {
    const spec = document.getElementById('reschedule-spec-name').value;
    const date = document.getElementById('new-date').value;
    const timeSelect = document.getElementById('new-time');
    const btn = document.getElementById('confirm-reschedule-btn');
    if (!spec || !date || !timeSelect) return;
    
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';
    const now = new Date();
    const isToday = date === now.toISOString().split('T')[0];

    try {
        const taskId = document.getElementById('reschedule-task-id').value;
        
        // Мы просим базу данных дать нам не только длительность (duration), но и ИМЯ задачи (task_name)
        const { data: currentTask } = await supabase.from('tasks').select('duration, task_name').eq('id', taskId).single();
        
        let movingDuration = currentTask?.duration;
        
        // Если длительность равна 0 (потому что задача на паузе), мы ищем её в справочнике по имени
        if (!movingDuration || movingDuration === 0) {
            const catalogItem = (window.taskCatalog || []).find(c => c.task_name === currentTask?.task_name);
            movingDuration = catalogItem ? catalogItem.default_duration : 30;
        }
const { data: occupied } = await supabase.from('tasks').select('id, time, duration, status').eq('specialist', spec).eq('date', date);

const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
const busyTimes = [];

occupied?.forEach(item => {
    // Условие: Не текущая задача И статус НЕ в списке "свободных"
    if (String(item.id) !== String(taskId) && !freeStatuses.includes(item.status)) {
        const time = item.time.substring(0, 5);
        busyTimes.push(time);
        
        // Если задача длинная (например, Сервер 60 мин), занимаем доп. слоты
        if (item.duration > 30) {
            const [h, m] = time.split(':').map(Number);
            const next = new Date();
            next.setHours(h, m + 30, 0, 0);
            busyTimes.push(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
        }
    }
});
        const personalSlots = generateSlots(spec);

        timeSelect.innerHTML = '<option value="" selected disabled>Время</option>';
        let hasFree = false;
        personalSlots.forEach(slot => {
            let isPast = false;
            if (isToday) {
                const [h, m] = slot.split(':').map(Number);
                const slotTime = new Date();
                slotTime.setHours(h, m, 0, 0);
                
                // Если сейчас 11:00, то 10:45 еще можно выбрать (11:00 - 15 мин)
                if (slotTime < new Date(now.getTime() - 15 * 60000)) {
                    isPast = true;
                }
            }

            if (!busyTimes.includes(slot) && !isPast) {
    // Если задача, которую мы двигаем — это Сервер (60 мин)
    if (movingDuration > 30) {
        const [h, m] = slot.split(':').map(Number);
        const n = new Date(); n.setHours(h, m + 30, 0, 0);
        const ns = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
        
        // Показываем время, только если и этот, и следующий слот свободны
        if (personalSlots.includes(ns) && !busyTimes.includes(ns)) {
            timeSelect.add(new Option(slot, slot));
            hasFree = true;
        }
    } else {
        timeSelect.add(new Option(slot, slot));
        hasFree = true;
    }
}
        });
        timeSelect.disabled = !hasFree;
        if (btn) btn.disabled = !hasFree; 
        if (!hasFree) timeSelect.innerHTML = '<option>Мест нет</option>';
    } catch (e) { console.error(e); }
}

window.confirmReschedule = async () => {
    const id = document.getElementById('reschedule-task-id').value;
    const newDate = document.getElementById('new-date').value;
    const newTime = document.getElementById('new-time').value;
    const comment = document.getElementById('reschedule-comment')?.value || null;

    try {
        const { data: oldTask } = await supabase.from('tasks').select('*').eq('id', id).single();
        
        // ОПРЕДЕЛЯЕМ СТАТУС
        const isBusyTask = ['Внутренняя', 'Отсутствует'].includes(oldTask.category);
        const targetStatus = isBusyTask ? 'Занято' : 'Перенесен';

        // ВОССТАНАВЛИВАЕМ ДЛИТЕЛЬНОСТЬ
        let finalDuration = oldTask.duration;
        if (!finalDuration || finalDuration === 0) {
            const catalogItem = (window.taskCatalog || []).find(c => c.task_name === oldTask.task_name);
            finalDuration = catalogItem ? catalogItem.default_duration : 30;
        }

        const { error } = await supabase.from('tasks').update({
            date: newDate,
            time: newTime,
            status: targetStatus,
            duration: finalDuration // Возвращаем длительность из справочника
        }).eq('id', id);

        if (!error) {
            const changes = {};
            if (oldTask.date !== newDate) changes.date = { old: oldTask.date, new: newDate };
            const oldT = oldTask.time?.substring(0, 5);
            if (oldT !== newTime) changes.time = { old: oldT, new: newTime };
            if (oldTask.status !== targetStatus) changes.status = { old: oldTask.status, new: targetStatus };
            if (oldTask.duration !== finalDuration) changes.duration = { old: oldTask.duration, new: finalDuration };

            if (Object.keys(changes).length > 0) {
                await logTaskAction(id, 'reschedule', changes, comment);
            }
            bootstrap.Modal.getInstance(document.getElementById('rescheduleModal')).hide();
        }
    } catch (e) { console.error('Ошибка в confirmReschedule:', e); }
};

window.deleteTask = async (id) => {
    if (confirm("Удалить задачу #" + id + "?")) {
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        await supabase.from(targetTable).delete().eq('id', id);
    }
};

window.copyTask = async (id) => {
    try {
        if (!window.taskCatalog && typeof loadTaskCatalog === 'function') {
            await loadTaskCatalog();
        }

        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        const { data: task, error } = await supabase.from(targetTable).select('*').eq('id', id).single();
        
        if (error) throw error;

        // === ПЕРЕХВАТ ТЕХНИЧЕСКИХ ЗАДАЧ ПРИ КОПИРОВАНИИ ===
        const isBusyTask = ['Внутренняя', 'Отсутствует'].includes(task.category);
        
        if (isBusyTask) {
            window.editBusyTaskId = null; // Критично: при копировании это НОВАЯ задача, а не правка старой
            const isFullDay = task.category === 'Отсутствует' && task.duration >= 480;
            
            // Открываем модалку занять время
            const modalElement = document.getElementById('busyModal');
            bootstrap.Modal.getOrCreateInstance(modalElement).show();

            setTimeout(async () => {
                const typeSelect = document.getElementById('busy-type-select');
                const timeFields = document.getElementById('busy-time-fields');
                
                if (typeSelect) {
                    typeSelect.value = isFullDay ? 'full-day' : 'slot';
                    // При копировании НЕ блокируем опции, пусть менеджер может поменять тип
                    for(let opt of typeSelect.options) opt.disabled = false;
                }
                
                if (timeFields) {
                    if (isFullDay) timeFields.classList.add('d-none');
                    else timeFields.classList.remove('d-none');
                }

                const dateInput = document.getElementById('busy-date');
                if (dateInput && !dateInput._flatpickr) {
                    flatpickr(dateInput, { ...flatpickrConfig });
                }
                if (dateInput && dateInput._flatpickr) {
                    dateInput._flatpickr.setDate(task.date);
                }

                // Загружаем слоты и подставляем время
                if (!isFullDay && typeof updateBusySlots === 'function') {
                    await updateBusySlots(task.date);
                    const timeSelect = document.getElementById('busy-time');
                    if (timeSelect) timeSelect.value = task.time.substring(0,5);
                }

                const durationInput = document.getElementById('busy-duration');
                if (durationInput && !isFullDay) {
                    const h = Math.floor(task.duration / 60);
                    const m = task.duration % 60;
                    durationInput.value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                }

                const commentInput = document.getElementById('busy-comment');
                if (commentInput) commentInput.value = task.comment || '';

                const btn = document.getElementById('busy-submit-btn');
                if (btn) btn.innerText = "Создать копию"; // Меняем текст кнопки

            }, 150);
            
            return; // Выходим из функции
        }
        editMode = false;
        editTaskId = null;

        const isFree = targetTable === 'free_tasks';
        
        // 1. ТОЧЕЧНАЯ ПРАВКА: Жестко проверяем на Демонстрацию
        const typeValue = isFree ? 'free' : (task.category === 'Демонстрация' ? 'demo' : 'paid');
        
        openDynamicModal(typeValue, false);

        setTimeout(() => {
            const catEl = document.getElementById('category');
            if (catEl) {
                catEl.value = task.category || '';
                if (catEl.tagName === 'SELECT') catEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            setTimeout(() => {
                const taskSelect = document.getElementById('taskName');
                if (taskSelect) {
                    if (![...taskSelect.options].some(o => o.value === task.task_name)) {
                        taskSelect.add(new Option(task.task_name, task.task_name));
                    }
                    taskSelect.value = task.task_name;
                    taskSelect.dispatchEvent(new Event('change', { bubbles: true })); 
                }
                
                setTimeout(async () => {
                    const specSelect = document.getElementById('specialist');
                    if (specSelect) specSelect.value = task.specialist || '';
                    
                    if (!isFree) {
                        const dateField = document.getElementById('date');
                        if (dateField._flatpickr) dateField._flatpickr.setDate(task.date);
                        else dateField.value = task.date;
                        if (typeof updateFreeSlots === 'function') await updateFreeSlots(); 
                    }
                }, 50);
            }, 50);

            document.getElementById('inn').value = task.inn;
            document.getElementById('price').value = task.price || 0;
            document.getElementById('taskComment').value = task.comment || '';
            document.getElementById('bitrix').value = '';

            const durationField = document.getElementById('taskDuration');
            if (durationField) {
                const dbDuration = task.duration || 30;
                const hours = Math.floor(dbDuration / 60);
                const minutes = dbDuration % 60;
                durationField.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }

            document.querySelector('#taskModal .modal-title').innerText = `Копирование задачи (Новая)`;
            document.getElementById('submit-btn').innerText = "Создать копию";
            
        }, 100);

    } catch (e) { 
        console.error(e);
        alert("Ошибка при копировании"); 
    }
};

window.openEditTask = async (id) => {
    try {
        // Страховка: если каталог задач не загрузился, грузим его принудительно
        if (!window.taskCatalog && typeof loadTaskCatalog === 'function') {
            await loadTaskCatalog();
        }

        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        const { data: task, error } = await supabase.from(targetTable).select('*').eq('id', id).single();
        
        if (error) throw error;

        // === ПЕРЕХВАТ ТЕХНИЧЕСКИХ ЗАДАЧ ("ЗАНЯТО") ===
        if (['Внутренняя', 'Отсутствует'].includes(task.category)) {
            window.editBusyTaskId = id; // Флаг редактирования
            const isFullDay = task.category === 'Отсутствует' && task.duration >= 480;
            
            // 1. СНАЧАЛА открываем модалку, чтобы HTML-элементы появились на экране
            const modalElement = document.getElementById('busyModal');
            // getOrCreateInstance предотвращает баг с темным фоном
            bootstrap.Modal.getOrCreateInstance(modalElement).show();

            // 2. Даем браузеру микро-паузу (150мс), чтобы он успел отрисовать окно
            setTimeout(async () => {
                const typeSelect = document.getElementById('busy-type-select');
                const timeFields = document.getElementById('busy-time-fields');
                
                if (typeSelect) {
                    typeSelect.value = isFullDay ? 'full-day' : 'slot';
                    for(let opt of typeSelect.options) opt.disabled = (opt.value === 'range');
                }
                if (timeFields) {
                    if (isFullDay) timeFields.classList.add('d-none');
                    else timeFields.classList.remove('d-none');
                }

                const dateInput = document.getElementById('busy-date');
                
                // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ: ПРИНУДИТЕЛЬНЫЙ ЗАПУСК КАЛЕНДАРЯ ---
                // Если после перезагрузки страницы календаря еще нет, создаем его
                if (dateInput && !dateInput._flatpickr) {
                    flatpickr(dateInput, { ...flatpickrConfig });
                }

                // Теперь безопасно ставим дату
                if (dateInput && dateInput._flatpickr) {
                    dateInput._flatpickr.setDate(task.date);
                }

                // Запускаем полную загрузку доступного времени
                if (!isFullDay && typeof updateBusySlots === 'function') {
                    await updateBusySlots(task.date);
                }

                const durationInput = document.getElementById('busy-duration');
                if (durationInput && !isFullDay) {
                    const h = Math.floor(task.duration / 60);
                    const m = task.duration % 60;
                    durationInput.value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                }

                const commentInput = document.getElementById('busy-comment');
                if (commentInput) commentInput.value = task.comment || '';

                const btn = document.getElementById('busy-submit-btn');
                if (btn) btn.innerText = "Сохранить изменения";

            }, 150); // Конец паузы
            
            return; // Выходим, обычную форму не открываем
        }

        // === СТАНДАРТНАЯ ЛОГИКА ДЛЯ ОБЫЧНЫХ ЗАДАЧ ===
        editMode = true;
        editTaskId = id;

        // 1. Определяем тип модалки: Платная, Бесплатная или Демо
        let modalType = 'paid';
        if (targetTable === 'free_tasks') {
            modalType = 'free';
        } else if (task.category === 'Демонстрация') {
            modalType = 'demo';
        }

        // 2. Открываем нужную модалку в режиме редактирования (isEdit = true)
        openDynamicModal(modalType, true);

        // 3. Ждем, пока DOM модалки отрисуется
        // 3. Ждем, пока DOM модалки отрисуется
        setTimeout(() => {
            const catSelect = document.getElementById('category');
            if (catSelect && catSelect.tagName === 'SELECT' && task.category) {
                if (![...catSelect.options].some(o => o.value === task.category)) {
                    catSelect.add(new Option(task.category, task.category));
                }
                catSelect.value = task.category;
                catSelect.dispatchEvent(new Event('change', { bubbles: true })); 
            }

            setTimeout(() => {
                const taskSelect = document.getElementById('taskName');
                if (taskSelect) {
                    if (![...taskSelect.options].some(o => o.value === task.task_name)) {
                        taskSelect.add(new Option(task.task_name, task.task_name));
                    }
                    taskSelect.value = task.task_name;
                    taskSelect.dispatchEvent(new Event('change', { bubbles: true })); 
                }

                setTimeout(async () => {
                    const specSelect = document.getElementById('specialist');
                    if (specSelect) specSelect.value = task.specialist || '';

                    const innInput = document.getElementById('inn');
                    if (innInput) innInput.value = task.inn || '';

                    const bitrixInput = document.getElementById('bitrix');
                    if (bitrixInput) bitrixInput.value = task.bitrix_url || '';

                    const priceInput = document.getElementById('price');
                    if (priceInput) priceInput.value = task.price || 0;

                    const commentInput = document.getElementById('taskComment');
                    if (commentInput) commentInput.value = task.comment || '';

                    const durationField = document.getElementById('taskDuration');
                    if (durationField) {
                        let dbDuration = task.duration;
                        if (!dbDuration || dbDuration === 0) {
                            const catalogItem = (window.taskCatalog || []).find(c => c.task_name === task.task_name);
                            dbDuration = catalogItem ? catalogItem.default_duration : 30;
                        }
                        const hours = Math.floor(dbDuration / 60);
                        const minutes = dbDuration % 60;
                        durationField.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    }

                    if (modalType !== 'free') {
                        const dateField = document.getElementById('date');
                        if (dateField && dateField._flatpickr) {
                            dateField._flatpickr.setDate(task.date);
                        }
                        if (typeof updateFreeSlots === 'function') await updateFreeSlots(task.time);
                    }

                    const logBlock = document.getElementById('changeLogBlock');
                    if (logBlock) logBlock.classList.remove('d-none');

                    const submitBtn = document.getElementById('submit-btn');
                    if (submitBtn) submitBtn.innerText = "Сохранить изменения";

                    new bootstrap.Modal(document.getElementById('taskModal')).show();
                }, 50); 
            }, 50); 
        }, 50); 

    } catch (e) {
        console.error('Ошибка при открытии редактирования:', e);
        alert("Ошибка при загрузке данных задачи");
    }
};

window.handleBitrixClick = async (id, currentStatus) => {
    if (!currentUser) return;

    // 1. Проверяем строковую роль (для обычных технарей и 1С)
    const role = currentUser.role || '';
    const isTechRole = role === 'specialist' || role === 'specialist_1c';
    
    // 2. Проверяем наличие в графике работы (спасает, если человек Админ, но работает руками)
    const isInTechConfig = CONFIG.SPECIALISTS && CONFIG.SPECIALISTS[currentUser.name] !== undefined;

    // Если совпало хотя бы одно условие — человек имеет права технаря
    const isTech = isTechRole || isInTechConfig;

    // Строго старая рабочая логика переключения
    if (isTech && (currentStatus === 'Новая' || currentStatus === 'Перенесен')) {
        await window.updateTaskStatus(id, 'Взят в работу');
    }
};

window.copyBitrixLink = async (id, url, currentStatus) => {
    try {
        await navigator.clipboard.writeText(url);
        // После успешного копирования запускаем ту же логику смены статуса
        await window.handleBitrixClick(id, currentStatus);
    } catch (err) {
        console.error('Ошибка копирования:', err);
    }
};

document.getElementById('new-time')?.addEventListener('change', () => {
    document.getElementById('confirm-reschedule-btn').disabled = !document.getElementById('new-time').value;
});

// Инициализация календаря в модалке переноса
document.getElementById('rescheduleModal')?.addEventListener('shown.bs.modal', function () {
    flatpickr("#new-date", {
        ...flatpickrConfig,
        onChange: function() {
            updateRescheduleSlots(); // Запуск поиска времени для переноса
        }
    });
});