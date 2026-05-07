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
        
        if (freeTimeStatuses.includes(newStatus) && targetTable !== 'free_tasks') {
            updateData.duration = 0;
        }

        // Если есть комментарий — пишем его и в поле comment задачи
        if (comment && comment.trim()) {
            updateData.comment = comment.trim();
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
    document.getElementById('reschedule-chain-id').value = '';

    // Грузим задачу — нам нужен category, duration и chain_id
    const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
    const { data: task } = await supabase.from(targetTable).select('category, duration, chain_id').eq('id', id).single();

    const isFullDay = task && task.category === 'Отсутствует' && task.duration >= 480;
    const isFreeTask = targetTable === 'free_tasks';

    // Блок времени
    const timeBlock = document.getElementById('new-time-block');
    const btn = document.getElementById('confirm-reschedule-btn');

    if (isFullDay || isFreeTask) {
        // Для бесплатных задач и "весь день" — время не нужно
        timeBlock.classList.add('d-none');
        btn.disabled = true; // разблокируем после выбора даты
    } else {
        timeBlock.classList.remove('d-none');
        btn.disabled = true;
    }

    // Цепочка
    const chainBlock = document.getElementById('reschedule-chain-block');
    if (task?.chain_id) {
        document.getElementById('reschedule-chain-id').value = task.chain_id;
        chainBlock.classList.remove('d-none');
        // По умолчанию — только эту
        document.getElementById('rmode-chain').checked = true;
    } else {
        chainBlock.classList.add('d-none');
    }

    // Открываем модалку
    const modal = new bootstrap.Modal(document.getElementById('rescheduleModal'));
    modal.show();

    // Инициализируем flatpickr (если ещё не был)
    const dateInput = document.getElementById('new-date');
    const onDateChange = function() {
        if (isFreeTask || isFullDay) {
            // Для бесплатных/весь день — просто разблокируем кнопку после выбора даты
            const btn = document.getElementById('confirm-reschedule-btn');
            if (btn) btn.disabled = !document.getElementById('new-date').value;
        } else {
            updateRescheduleSlots();
        }
    };

    if (!dateInput._flatpickr) {
        flatpickr(dateInput, { ...flatpickrConfig, onChange: onDateChange });
    } else {
        dateInput._flatpickr.config.onChange = [onDateChange];
    }

    // Ставим текущую дату задачи
    dateInput._flatpickr.setDate(date, true);
};

window.openRescheduleGrid = async function() {
    const spec = document.getElementById('reschedule-spec-name').value;
    const taskId = document.getElementById('reschedule-task-id').value;
    const chainId = document.getElementById('reschedule-chain-id').value;
    const chainMode = document.querySelector('input[name="rescheduleChainMode"]:checked')?.value || 'chain';
    const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';

    // Считаем длительность — как в updateRescheduleSlots
    let movingDuration = 30;
    try {
        const { data: currentTask } = await supabase
            .from(targetTable).select('duration, task_name').eq('id', taskId).single();
        movingDuration = currentTask?.duration || 30;
        if (!movingDuration || movingDuration === 0) {
            const cat = (window.taskCatalog || []).find(c => c.task_name === currentTask?.task_name);
            movingDuration = cat ? cat.default_duration : 30;
        }
        if (chainId && chainMode === 'chain') {
            const { data: chainTasks } = await supabase
                .from(targetTable).select('duration, task_name').eq('chain_id', chainId);
            if (chainTasks) {
                movingDuration = chainTasks.reduce((total, t) => {
                    let d = t.duration;
                    if (!d || d === 0) {
                        const cat = (window.taskCatalog || []).find(c => c.task_name === t.task_name);
                        d = cat ? cat.default_duration : 30;
                    }
                    return total + d;
                }, 0);
            }
        }
    } catch (e) { console.error(e); }

    // Сохраняем длительность в глобальную переменную — сетка её подхватит
    window._rescheduleGridDuration = movingDuration;

    // Подставляем специалиста в select формы
    const specSelect = document.getElementById('specialist');
    const prevValue = specSelect?.value;
    if (specSelect && spec) specSelect.value = spec;

    openAvailabilityModal(false).then(() => {
        if (specSelect && prevValue !== undefined) specSelect.value = prevValue;
    }).catch(() => {
        if (specSelect && prevValue !== undefined) specSelect.value = prevValue;
        window._rescheduleGridDuration = null;
    });
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
        const chainId = document.getElementById('reschedule-chain-id').value;
        const chainMode = document.querySelector('input[name="rescheduleChainMode"]:checked')?.value || 'chain';
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';

        const { data: currentTask } = await supabase
            .from(targetTable).select('duration, task_name, chain_id').eq('id', taskId).single();

        let movingDuration = currentTask?.duration;
        if (!movingDuration || movingDuration === 0) {
            const cat = (window.taskCatalog || []).find(c => c.task_name === currentTask?.task_name);
            movingDuration = cat ? cat.default_duration : 30;
        }

        // Если режим «вся цепочка» — считаем суммарную длительность всей цепочки
        if (chainId && chainMode === 'chain') {
            const { data: chainTasks } = await supabase
                .from(targetTable).select('duration, task_name').eq('chain_id', chainId);
            if (chainTasks) {
                movingDuration = chainTasks.reduce((total, t) => {
                    let d = t.duration;
                    if (!d || d === 0) {
                        const cat = (window.taskCatalog || []).find(c => c.task_name === t.task_name);
                        d = cat ? cat.default_duration : 30;
                    }
                    return total + d;
                }, 0);
            }
        }

        // Загружаем занятые задачи
        const { data: occupied } = await supabase
            .from(targetTable).select('id, time, duration, status, chain_id').eq('specialist', spec).eq('date', date);

        const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

        // Собираем занятые интервалы (исключаем текущую задачу/цепочку)
        const busyIntervals = [];
        occupied?.forEach(item => {
            if (freeStatuses.includes(item.status)) return;
            // Исключаем задачу/цепочку которую переносим
            if (chainId && chainMode === 'chain' && item.chain_id === chainId) return;
            if (String(item.id) === String(taskId)) return;

            const [h, m] = item.time.substring(0, 5).split(':').map(Number);
            const start = h * 60 + m;
            const dur = item.duration || 30;
            busyIntervals.push({ start, end: start + dur });
        });

        // Настройки специалиста
        const specCfg = CONFIG.SPECIALISTS[spec];
        const dateObj = new Date(date);
        const isFriday = dateObj.getDay() === 5;
        const endStr = (isFriday && specCfg?.friday_end) ? specCfg.friday_end : specCfg?.end;
        const [eh, em] = (endStr || '18:00').split(':').map(Number);
        const specEndMins = eh * 60 + em;
        const [lsH, lsM] = (specCfg?.lunch?.start || '13:00').split(':').map(Number);
        const [leH, leM] = (specCfg?.lunch?.end || '14:00').split(':').map(Number);
        const lunchStart = lsH * 60 + lsM;
        const lunchEnd = leH * 60 + leM;

        const personalSlots = generateSlots(spec, date);
        timeSelect.innerHTML = '<option value="" selected disabled>Выберите время</option>';
        let hasFree = false;

        personalSlots.forEach(slot => {
            const [h, m] = slot.split(':').map(Number);
            const slotStart = h * 60 + m;
            const slotEnd = slotStart + movingDuration;

            // Прошедшее время
            if (isToday) {
                const slotTime = new Date(); slotTime.setHours(h, m, 0, 0);
                if (slotTime < new Date(now.getTime() - 15 * 60000)) return;
            }

            // Не выходит за конец рабочего дня
            if (slotEnd > specEndMins) return;

            // Не пересекает обед
            if (slotStart < lunchEnd && slotEnd > lunchStart) return;

            // Не пересекается с занятыми задачами
            const hasConflict = busyIntervals.some(b => slotStart < b.end && slotEnd > b.start);
            if (hasConflict) return;

            timeSelect.add(new Option(slot, slot));
            hasFree = true;
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
    const chainId = document.getElementById('reschedule-chain-id').value;
    const chainMode = document.querySelector('input[name="rescheduleChainMode"]:checked')?.value || 'single';
    const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';

    try {
        const { data: oldTask } = await supabase.from(targetTable).select('*').eq('id', id).single();

        const isBusyTask = ['Внутренняя', 'Отсутствует'].includes(oldTask.category);
        const targetStatus = isBusyTask ? 'Занято' : 'Перенесен';

        let finalDuration = oldTask.duration;
        if (!finalDuration || finalDuration === 0) {
            const catalogItem = (window.taskCatalog || []).find(c => c.task_name === oldTask.task_name);
            finalDuration = catalogItem ? catalogItem.default_duration : 30;
        }

        // Если задача в цепочке и выбрано «всю цепочку» — переносим со смещением
        if (chainId && chainMode === 'chain') {
            const { data: chainTasks } = await supabase
                .from(targetTable)
                .select('*')
                .eq('chain_id', chainId)
                .order('time', { ascending: true });

            const timeDelta = timeToMinutes(newTime) - timeToMinutes(oldTask.time);
            const dateDelta = daysDiff(oldTask.date, newDate);

            for (const t of (chainTasks || [])) {
                const shiftedTime = minutesToTime(timeToMinutes(t.time) + timeDelta);
                const shiftedDate = shiftDate(t.date, dateDelta);
                const isCurrentTask = String(t.id) === String(id);

                let dur = t.duration;
                if (!dur || dur === 0) {
                    const cat = (window.taskCatalog || []).find(c => c.task_name === t.task_name);
                    dur = cat ? cat.default_duration : 30;
                }

                const chainUpdateData = {
                    date: shiftedDate,
                    status: targetStatus,
                    duration: isCurrentTask ? finalDuration : dur
                };
                if (newTime) chainUpdateData.time = shiftedTime;

                const { error } = await supabase.from(targetTable).update(chainUpdateData).eq('id', t.id);

                if (!error) {
                    await logTaskAction(t.id, 'reschedule', {
                        date: { old: t.date, new: shiftedDate },
                        time: { old: t.time?.substring(0,5), new: shiftedTime }
                    }, isCurrentTask ? comment : 'Перенос цепочки');
                }
            }
        } else {
            // Одиночный перенос (или только эта задача из цепочки)
            const updateData = {
                date: newDate,
                status: targetStatus,
                duration: finalDuration
            };
            // Для платных и демо — обновляем время, для бесплатных — не трогаем
            if (newTime) updateData.time = newTime;

            const { error } = await supabase.from(targetTable).update(updateData).eq('id', id);

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
            }
        }

        bootstrap.Modal.getInstance(document.getElementById('rescheduleModal')).hide();
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

        // Проверяем — есть ли строка задачи уже в таблице на экране
        const cachedRow = document.getElementById(`task-row-${id}`);
        const chainIdFromDom = cachedRow?.dataset.chain;
        const isInChain = chainIdFromDom && chainIdFromDom !== 'null' && chainIdFromDom !== '';

        let task;
        let chainTasks = null;

        if (isInChain) {
            // Задача в цепочке — грузим всю цепочку ОДНИМ запросом
            const { data, error: chainErr } = await supabase
                .from(targetTable)
                .select('*')
                .eq('chain_id', chainIdFromDom)
                .order('time', { ascending: true });

            if (chainErr) throw chainErr;
            chainTasks = data || [];
            task = chainTasks.find(t => t.id === id);
            if (!task) throw new Error('Задача не найдена в цепочке');
        } else {
            // Одиночная задача — обычный запрос
            const { data, error } = await supabase.from(targetTable).select('*').eq('id', id).single();
            if (error) throw error;
            task = data;
        }

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

        // Заполняем данные о цепочке (chainTasks мы уже получили выше)
        if (task.chain_id) {
            const finalChain = chainTasks || [task];
            window.taskChain = finalChain;
            window.activeChainIndex = finalChain.findIndex(t => t.id === id);
            if (window.activeChainIndex === -1) window.activeChainIndex = 0;
            window.editChainId = task.chain_id;
            window.editChainTable = targetTable;
        } else {
            window.taskChain = [];
            window.editChainId = null;
            window.editChainTable = null;
        }

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

// ============================================================
// ЛОГИКА ПЕРЕНОСА ЦЕПОЧКИ ЗАДАЧ
// ============================================================

// Вспомогательные функции для работы со временем
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.substring(0, 5).split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(totalMinutes) {
    // Ограничиваем диапазон 00:00 - 23:59
    const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function shiftDate(dateStr, daysDelta) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + daysDelta);
    return d.toISOString().split('T')[0];
}

function daysDiff(dateOld, dateNew) {
    const d1 = new Date(dateOld);
    const d2 = new Date(dateNew);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Показываем модалку выбора — переносить одну задачу или всю цепочку
window.showChainRescheduleChoice = function(newTaskData) {
    // Сохраняем всё что нужно ДО закрытия основной модалки
    // (после закрытия taskChain и activeChainIndex будут сброшены)
    const originalTask = window.taskChain[window.activeChainIndex];
    window.pendingChainEdit = {
        ...newTaskData,
        _originalTask: originalTask,       // оригинал текущей задачи
        _editTaskId: editTaskId,            // id редактируемой задачи
        _chainSnapshot: [...window.taskChain], // копия всей цепочки
        _editChainTable: window.editChainTable
    };

    // Сначала скрываем основную модалку
    const taskModalEl = document.getElementById('taskModal');
    const taskModalInst = bootstrap.Modal.getInstance(taskModalEl);
    if (taskModalInst) {
        // Когда основная закроется — показываем модалку выбора
        taskModalEl.addEventListener('hidden.bs.modal', function showChoice() {
            taskModalEl.removeEventListener('hidden.bs.modal', showChoice);
            const choiceModal = new bootstrap.Modal(document.getElementById('chainRescheduleModal'));
            choiceModal.show();
        }, { once: true });
        taskModalInst.hide();
    } else {
        // Если основной модалки нет — сразу показываем
        const choiceModal = new bootstrap.Modal(document.getElementById('chainRescheduleModal'));
        choiceModal.show();
    }
};

// Вызывается при нажатии кнопки в модалке выбора
window.confirmChainReschedule = async function(mode) {
    const pendingData  = window.pendingChainEdit;
    const newData      = pendingData;
    const targetTable  = pendingData._editChainTable || 'tasks';
    const originalTask = pendingData._originalTask;
    const chainTasks   = pendingData._chainSnapshot;
    const taskId       = pendingData._editTaskId;

    try {
        if (mode === 'single') {
            // Переносим только одну задачу, chain_id НЕ трогаем — связь сохраняется
            const { error } = await supabase.from(targetTable).update({
                date: newData.date,
                time: newData.time,
                specialist: newData.specialist,
                task_name: newData.task_name,
                category: newData.category,
                inn: newData.inn,
                bitrix_url: newData.bitrix_url,
                duration: newData.duration,
                price: newData.price,
                comment: newData.comment,
                status: 'Перенесен'
            }).eq('id', taskId);

            if (!error) {
                await logTaskAction(taskId, 'reschedule', {
                    date: { old: originalTask.date, new: newData.date },
                    time: { old: originalTask.time, new: newData.time }
                }, 'Перенесена отдельная задача из цепочки');
            } else {
                alert('Ошибка сохранения: ' + error.message);
            }

        } else {
            // 1. Берем самую ПЕРВУЮ задачу из цепочки (головную)
            const firstTask = chainTasks[0]; 
            
            // 2. Считаем дельту не от текущей задачи, а от ПЕРВОЙ! 
            // Введенное время в форме теперь = время старта первой задачи
            const timeDelta = timeToMinutes(newData.time) - timeToMinutes(firstTask.time);
            const dateDelta = daysDiff(firstTask.date, newData.date);

            for (const t of chainTasks) {
                const newTime = minutesToTime(timeToMinutes(t.time) + timeDelta);
                const newDate = shiftDate(t.date, dateDelta);
                const isCurrentTask = t.id === taskId;

                const updateData = { date: newDate, time: newTime, status: 'Перенесен' };

                // Для задачи, которую мы открыли в модалке, дополнительно сохраняем 
                // измененного специалиста, комментарий, цену и прочие атрибуты
                if (isCurrentTask) {
                    updateData.specialist = newData.specialist;
                    updateData.task_name  = newData.task_name;
                    updateData.category   = newData.category;
                    updateData.inn        = newData.inn;
                    updateData.bitrix_url = newData.bitrix_url;
                    updateData.duration   = newData.duration;
                    updateData.price      = newData.price;
                    updateData.comment    = newData.comment;
                }

                const { error } = await supabase.from(targetTable).update(updateData).eq('id', t.id);
                if (!error) {
                    await logTaskAction(t.id, 'reschedule', {
                        date: { old: t.date, new: newDate },
                        time: { old: t.time, new: newTime }
                    }, isCurrentTask ? 'Перенос цепочки (изменение параметров)' : 'Перенос цепочки');
                }
            }
        }

    } catch (e) {
        console.error('Ошибка переноса цепочки:', e);
        alert('Произошла ошибка при переносе');
    }

    // Закрываем обе модалки и обновляем таблицу
    const choiceModal = bootstrap.Modal.getInstance(document.getElementById('chainRescheduleModal'));
    if (choiceModal) choiceModal.hide();

    const taskModal = document.getElementById('taskModal');
    if (taskModal) {
        const inst = bootstrap.Modal.getInstance(taskModal);
        if (inst) inst.hide();
    }

    window.taskChain = [];
    window.editChainId = null;
    window.pendingChainEdit = null;
    // loadTasks() не нужен — реалтайм через handleRealtimeChange сам обновит изменённые строки
};