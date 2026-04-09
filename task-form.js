let editMode = false;
let editTaskId = null;

// Функция-загрузчик данных из БД
async function loadTaskCatalog() {
    const { data, error } = await supabase
        .from('task_catalog')
        .select('*')
        .eq('is_active', true); // Берем только активные задачи

    if (error) return console.error("Ошибка каталога:", error);
    
    // Сохраняем в глобальную переменную, чтобы не делать запросы при каждом клике
    window.taskCatalog = data; 
    console.log("Каталог задач загружен из БД");
}

document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    const taskBillingType = document.querySelector('input[name="modalTaskType"]:checked').value;
    const targetTable = taskBillingType === 'free' ? 'free_tasks' : 'tasks';

    const categoryValue = document.getElementById('category').value;
    const taskNameValue = document.getElementById('taskName').value;
    const historyCommentValue = document.getElementById('historyComment')?.value || null;
    
    const durationInput = document.getElementById('taskDuration')?.value || "00:30";
    const [h, m] = durationInput.split(':').map(Number);
    let totalMinutes = (h * 60) + m;
    
    if (totalMinutes < 30) totalMinutes = 30;

    // --- ПЕРЕНЕСЕНО ВВЕРХ: СОБИРАЕМ ОСНОВНЫЕ ДАННЫЕ ---
    const taskData = {
        specialist: document.getElementById('specialist').value,
        category: categoryValue,
        task_name: taskNameValue,
        inn: document.getElementById('inn').value,
        bitrix_url: document.getElementById('bitrix').value,
        duration: totalMinutes 
    };

    // --- ПРОВЕРКА НАЛОЖЕНИЯ ---
    if (taskBillingType === 'paid' || taskBillingType === 'demo') {
        const spec = document.getElementById('specialist').value;
        const timeValue = document.getElementById('time').value;
        const dateValue = document.querySelector("#date")._flatpickr.selectedDates[0];
        const formattedDate = document.querySelector("#date")._flatpickr.formatDate(dateValue, "Y-m-d");

        const [h, m] = timeValue.split(':').map(Number);
        const newStart = h * 60 + m;
        const newEnd = newStart + totalMinutes;

        const specConfig = CONFIG.SPECIALISTS[spec];
        if (specConfig && specConfig.lunch) {
            const [lsH, lsM] = specConfig.lunch.start.split(':').map(Number);
            const [leH, leM] = specConfig.lunch.end.split(':').map(Number);
            const lStart = lsH * 60 + lsM;
            const lEnd = leH * 60 + leM;

            if (newStart < lEnd && newEnd > lStart) {
                alert(`❌ Ошибка! Это время задевает обед ${spec} (${specConfig.lunch.start}-${specConfig.lunch.end})`);
                btn.disabled = false;
                return;
            }
        }
        const isFridaySubmit = dateValue.getDay() === 5;
        const endStrSubmit = (isFridaySubmit && specConfig.friday_end) ? specConfig.friday_end : specConfig.end;
        const [weH, weM] = endStrSubmit.split(':').map(Number);
        const workDayEndMinutes = weH * 60 + weM;

        if (newEnd > workDayEndMinutes) {
            alert(`❌ Ошибка! Задача выходит за пределы рабочего времени. В ${isFridaySubmit ? 'пятницу' : 'этот день'} техник работает до ${endStrSubmit}`);
            btn.disabled = false;
            return;
        }

        const { data: others } = await supabase.from('tasks')
            .select('id, time, duration, status')
            .eq('specialist', spec)
            .eq('date', formattedDate);

        const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

        const conflict = others?.find(t => {
            if (editMode && String(t.id) === String(editTaskId)) return false;
            if (freeStatuses.includes(t.status)) return false; 

            const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
            const tStart = th * 60 + tm;
            const tEnd = tStart + (Number(t.duration) || 30);
            return newStart < tEnd && newEnd > tStart;
        });

        if (conflict) {
            alert(`❌ Ошибка! Это время занято другой задачей (с ${conflict.time.substring(0, 5)}). Уменьшите длительность или выберите другое время.`);
            btn.disabled = false;
            return;
        }
    }

    // --- ЛОГИКА ДЛЯ ОТДЕЛА И МЕНЕДЖЕРА ---
    if (!editMode) {
        taskData.manager = currentUser.name;
        taskData.dept = currentUser.dept;
        taskData.status = 'Новая';
    }

    // --- ИЗМЕНЕНО: ЛОГИКА ЗАПИСИ ДАТЫ И ВРЕМЕНИ (ТЕПЕРЬ И ДЛЯ DEMO) ---
    if (taskBillingType === 'paid' || taskBillingType === 'demo') {
        const fp = document.querySelector("#date")._flatpickr;
        taskData.date = fp.formatDate(fp.selectedDates[0], "Y-m-d");
        taskData.time = document.getElementById('time').value;
        taskData.price = taskBillingType === 'demo' ? 0 : (parseInt(document.getElementById('price').value) || 0);
        taskData.comment = document.getElementById('taskComment').value;
    } else {
        // Только для обычных бесплатных
        taskData.date = new Date().toISOString().split('T')[0];
    }

    let result;
    if (editMode) {
        const { data: oldTask } = await supabase.from(targetTable).select('*').eq('id', editTaskId).single();

        if (!result?.error && oldTask) {
            const diff = {};
            if (oldTask.inn !== taskData.inn) diff.inn = { old: oldTask.inn, new: taskData.inn };
            if (oldTask.bitrix_url !== taskData.bitrix_url) diff.bitrix = { old: oldTask.bitrix_url, new: taskData.bitrix_url };
            if (oldTask.price !== taskData.price) diff.price = { old: oldTask.price, new: taskData.price };
            if (oldTask.specialist !== taskData.specialist) diff.specialist = { old: oldTask.specialist, new: taskData.specialist };
            
            if (oldTask.date !== taskData.date) diff.date = { old: oldTask.date, new: taskData.date };
            
            const oldT = oldTask.time?.substring(0, 5);
            if (oldT !== taskData.time) { 
                diff.time = { old: oldT, new: taskData.time };
                taskData.status = 'Перенесен'; 
                if (oldTask.status !== 'Перенесен') {
                    diff.status = { old: oldTask.status, new: 'Перенесен' };
                }
            }

            if (taskData.status === 'Перенесен' && oldTask.status !== 'Перенесен') {
                diff.status = { old: oldTask.status, new: 'Перенесен' };
            }
            
            if (Number(oldTask.duration) !== Number(taskData.duration)) {
                diff.duration = { old: oldTask.duration, new: taskData.duration };
            }

            if (Object.keys(diff).length > 0) {
                await logTaskAction(editTaskId, 'update', diff, historyCommentValue); 
                const hLog = document.getElementById('historyComment');
                if (hLog) hLog.value = '';
            }
        }
        result = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);
    } else {
        result = await supabase.from(targetTable).insert([taskData]).select();
        if (!result.error && result.data) {
            const newId = result.data[0].id;
            let cmt = taskData.comment;
            if (taskNameValue.includes('(Копия)')) cmt = "Создано через копирование";
            await logTaskAction(newId, 'create', null, cmt);
        }
    }

    if (!result.error) {
        document.getElementById('task-form').reset();
        bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
        if (typeof currentTable !== 'undefined') currentTable = targetTable;
    } else {
        alert("Ошибка при сохранении");
    }
    btn.disabled = false;
});

window.openEditTask = async (id) => {
    try {
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        const { data: task, error } = await supabase.from(targetTable).select('*').eq('id', id).single();
        if (error) throw error;

        editMode = true;
        editTaskId = id;

        if (!window.taskCatalog || window.taskCatalog.length === 0) {
            await loadTaskCatalog(); 
        }
        
        const logBlock = document.getElementById('changeLogBlock');
        if (logBlock) logBlock.classList.remove('d-none');

        // 1. Устанавливаем тип (Радиокнопка)
        const isFree = targetTable === 'free_tasks';
        const typeValue = isFree ? 'free' : (task.task_type || 'paid');
        const typeRadio = document.querySelector(`input[name="modalTaskType"][value="${typeValue}"]`);
        if (typeRadio) typeRadio.checked = true;

        // 2. Управляем видимостью блоков
        const isScheduled = (typeValue === 'paid' || typeValue === 'demo');
        document.getElementById('dateTimeBlock')?.classList.toggle('d-none', !isScheduled);
        document.getElementById('priceBlock')?.classList.toggle('d-none', !isScheduled);
        document.getElementById('commentBlock')?.classList.toggle('d-none', !isScheduled);

        // 3. РУЧНОЕ НАПОЛНЕНИЕ КАТЕГОРИЙ И ЗАДАЧ
        const categorySelect = document.getElementById('category');
        const taskNameSelect = document.getElementById('taskName');
        
        if (window.taskCatalog) {
            const availableCategories = [...new Set(window.taskCatalog
                .filter(item => item.task_type === typeValue)
                .map(item => item.category))];

            categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
            availableCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                if (cat === task.category) opt.selected = true;
                categorySelect.appendChild(opt);
            });

            taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';
            const tasks = window.taskCatalog.filter(item => 
                item.category === task.category && item.task_type === typeValue
            );

            tasks.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.task_name;
                opt.textContent = t.task_name;
                opt.setAttribute('data-duration', t.default_duration);
                opt.setAttribute('data-price', t.default_price || 0);
                if (t.task_name === task.task_name) opt.selected = true;
                taskNameSelect.appendChild(opt);
            });
        }

        // 4. Заполняем текстовые поля
        document.getElementById('specialist').value = task.specialist;
        document.getElementById('inn').value = task.inn || '';
        document.getElementById('bitrix').value = task.bitrix_url || '';
        document.getElementById('taskComment').value = task.comment || ''; 

        // Математика длительности
        const dbDuration = task.duration || 30; 
        const hh = String(Math.floor(dbDuration / 60)).padStart(2, '0');
        const mm = String(dbDuration % 60).padStart(2, '0');
        const durationField = document.getElementById('taskDuration');
        if (durationField) durationField.value = `${hh}:${mm}`;

        // 5. ИСПРАВЛЕНИЕ ДАТЫ И ВРЕМЕНИ (Принудительная инициализация)
        if (!isFree) {
            document.getElementById('price').value = task.price;
            
            const dateInput = document.getElementById('date');
            
            // Если Flatpickr еще не создан на этом элементе (первый запуск), создаем его сразу
            if (dateInput && !dateInput._flatpickr) {
                flatpickr(dateInput, {
                    ...flatpickrConfig,
                    onChange: () => { if (typeof updateFreeSlots === 'function') updateFreeSlots(); }
                });
            }

            // Устанавливаем дату напрямую через API Flatpickr
            if (dateInput && dateInput._flatpickr) {
                dateInput._flatpickr.setDate(task.date, false); // false чтобы не триггерить лишние события
            }

            // Подгружаем слоты времени. 
            // Используем чуть больший таймаут и передаем сохраненное время как дефолт
            if (typeof updateFreeSlots === 'function') {
                const savedTime = task.time ? task.time.substring(0, 5) : null;
                setTimeout(() => {
                    updateFreeSlots(savedTime);
                }, 100);
            }
        }

        // Изменяем кнопки модалки
        document.querySelector('#taskModal .modal-title').innerText = `Редактирование задачи #${id}`;
        document.getElementById('submit-btn').innerText = "Сохранить изменения";
        
        // Показываем модалку
        const modalEl = document.getElementById('taskModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();

    } catch (e) { 
        console.error("Критическая ошибка редактирования:", e);
        alert("Ошибка загрузки данных"); 
    }
};

// Очистка при закрытии модалки переноса
document.getElementById('taskModal')?.addEventListener('hidden.bs.modal', () => {
    editMode = false;
    editTaskId = null;
    const logBlock = document.getElementById('changeLogBlock');
    if (logBlock) {
    logBlock.classList.add('d-none'); // Скрываем блок
    const hLogInput = document.getElementById('historyComment');
    if (hLogInput) hLogInput.value = ''; // Очищаем текст
    }

const durationField = document.getElementById('taskDuration');
    if (durationField) {
        durationField.value = '00:30'; // Возвращаем дефолт
    }
    
    // 1. Сброс стандартных полей формы
    const form = document.getElementById('task-form');
    if (form) form.reset();

    // 2. Очистка календаря Flatpickr (самое важное)
    const dateInput = document.getElementById('date');
    if (dateInput && dateInput._flatpickr) {
        dateInput._flatpickr.clear(); 
    }

    // 3. Сброс и блокировка списка времени
    const timeSelect = document.getElementById('time');
    if (timeSelect) {
        timeSelect.innerHTML = '<option value="">Время...</option>';
        timeSelect.disabled = true;
    }

    // 4. Очистка примечания и текстовых полей
    const commentField = document.getElementById('taskComment');
    if (commentField) commentField.value = '';

    // 5. Возврат заголовков в исходное состояние
    const modalTitle = document.querySelector('#taskModal .modal-title');
    if (modalTitle) modalTitle.innerText = "Постановка новой задачи";
         
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = "Забронировать время";
});

// Инициализация календаря в главной модалке
document.getElementById('taskModal')?.addEventListener('shown.bs.modal', async () => {
    // 1. Инициализация календаря
    flatpickr("#date", {
        ...flatpickrConfig,
        onChange: function() {
            if (typeof updateFreeSlots === 'function') updateFreeSlots();
        }
    });

    // !!! ВАЖНО: Если мы редактируем, выходим отсюда, чтобы не затереть данные !!!
    if (editMode) return; 

    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = '<option value="">Загрузка...</option>';

    // 2. Загружаем каталог для НОВОЙ задачи
    if (!window.taskCatalog) {
        const { data, error } = await supabase.from('task_catalog').select('*').eq('is_active', true);
        if (error) {
            categorySelect.innerHTML = '<option value="">Ошибка загрузки</option>';
            return;
        }
        window.taskCatalog = data;
    }
    
    const activeRadio = document.querySelector('input[name="modalTaskType"]:checked');
    if (activeRadio) {
        activeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }
});



document.addEventListener('change', (e) => {
    // Если переключили Платная/Бесплатная — перерисовываем категории
    if (e.target.name === 'modalTaskType') {
        
        // Скрываем/показываем блоки (твоя логика)
        const isFree = e.target.value === 'free';
        document.getElementById('dateTimeBlock')?.classList.toggle('d-none', isFree);
        document.getElementById('priceBlock')?.classList.toggle('d-none', isFree);
        document.getElementById('commentBlock')?.classList.toggle('d-none', isFree);
        if (selectedType === 'demo') {
    categorySelect.value = "Демонстрация";
    // Сразу имитируем выбор категории, чтобы подгрузились задачи (демо-услуги)
    categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    const isDemo = (selectedType === 'demo');
    document.getElementById('category')?.closest('.mb-3')?.classList.toggle('d-none', isDemo);
}
    }

    // Если выбрали Категорию — наполняем список задач
    if (e.target.id === 'category') {
        const cat = e.target.value;
        const taskNameSelect = document.getElementById('taskName');
        const isFree = document.querySelector('input[name="modalTaskType"]:checked').value === 'free';

        taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';

        if (window.taskCatalog && cat) {
            const tasks = window.taskCatalog.filter(item => 
                item.category === cat && item.is_paid === !isFree
            );

            tasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.task_name;
                opt.textContent = task.task_name;
                opt.setAttribute('data-duration', task.default_duration);
                opt.setAttribute('data-price', task.default_price);
                taskNameSelect.appendChild(opt);
            });
        }
    }
});

document.getElementById('category')?.addEventListener('change', () => updateFreeSlots());
document.getElementById('taskName')?.addEventListener('change', () => updateFreeSlots());

// Функция для записи истории действий
async function logTaskAction(taskId, actionType, changes = null, comment = null) {
    try {
        const historyData = {
            task_id: taskId,
            user_name: currentUser.name,
            user_role: currentUser.role,
            action_type: actionType,
            changes: changes,
            comment: comment
        };
        const { error } = await supabase.from('task_history').insert([historyData]);
        if (error) throw error;
    } catch (e) {
        console.error("Ошибка записи истории:", e);
    }
}

// Показ и скрытие коммента для истории 
document.getElementById('changeLogBlock').classList.remove('d-none');
document.getElementById('changeLogBlock').classList.add('d-none');

// ЛОГИКА МОДАЛЬНОГО ОКНА (ВОССТАНОВЛЕНО)
document.addEventListener('change', async (e) => {
    // 1. ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ТИПА (paid / free / demo)
    if (e.target.name === 'modalTaskType') {
        const selectedType = e.target.value; 
        
        const dateTimeBlock = document.getElementById('dateTimeBlock');
        const priceBlock = document.getElementById('priceBlock');
        const commentBlock = document.getElementById('commentBlock');
        const categorySelect = document.getElementById('category');
        const taskNameSelect = document.getElementById('taskName');
        
        // Сброс списков при смене типа
        taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';
        categorySelect.innerHTML = '<option value="">Загрузка...</option>';
        
        // УПРАВЛЕНИЕ ВИДИМОСТЬЮ: Demo и Paid требуют расписания
        const isScheduled = (selectedType === 'paid' || selectedType === 'demo');
        
        dateTimeBlock?.classList.toggle('d-none', !isScheduled);
        priceBlock?.classList.toggle('d-none', !isScheduled);
        commentBlock?.classList.toggle('d-none', !isScheduled);
        
        // Цена обязательна ТОЛЬКО для платных (paid)
        const priceInput = document.getElementById('price');
        if (priceInput) {
            priceInput.required = (selectedType === 'paid');
            // Если это демо, можно сразу занулить цену визуально
            if (selectedType === 'demo') priceInput.value = 0;
        }

        // Загрузка каталога, если еще не загружен
        if (!window.taskCatalog) {
            const { data, error } = await supabase.from('task_catalog').select('*').eq('is_active', true);
            if (!error) window.taskCatalog = data;
        }

        if (window.taskCatalog) {
            // Фильтруем категории по task_type (латиница)
            const availableCategories = [...new Set(window.taskCatalog
                .filter(item => item.task_type === selectedType)
                .map(item => item.category))];

            categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
            availableCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                categorySelect.appendChild(opt);
            });
        }
    }
    
    // 2. ВЫБОР КАТЕГОРИИ -> ПОДГРУЗКА ЗАДАЧ
    if (e.target.id === 'category') {
        const cat = e.target.value;
        const taskNameSelect = document.getElementById('taskName');
        const selectedType = document.querySelector('input[name="modalTaskType"]:checked').value;
        const durationInput = document.getElementById('taskDuration');

        if (durationInput) durationInput.value = '00:30'; 
        taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';
        
        if (window.taskCatalog && cat) {
            const tasks = window.taskCatalog.filter(item => 
                item.category === cat && item.task_type === selectedType
            );

            tasks.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.task_name;
                opt.textContent = task.task_name;
                opt.setAttribute('data-duration', task.default_duration);
                opt.setAttribute('data-price', task.default_price || 0);
                taskNameSelect.appendChild(opt);
            });
        }
    }
});

// Авто-подстановка времени при выборе конкретной задачи
document.getElementById('taskName')?.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const duration = selectedOption.getAttribute('data-duration') || 30; // Берем время из тега
    const durationInput = document.getElementById('taskDuration');

    if (durationInput) {
        // Конвертируем минуты в ЧЧ:ММ
        const hh = String(Math.floor(duration / 60)).padStart(2, '0');
        const mm = String(duration % 60).padStart(2, '0');
        durationInput.value = `${hh}:${mm}`;
        
        // Сразу вызываем обновление слотов, так как время изменилось
        if (typeof updateFreeSlots === 'function') {
            updateFreeSlots();
        }
    }
});





async function getFreeSlots(dateStr, specialistName) {
    if (!dateStr || !specialistName) return [];

    // 1. Достаем конфиг конкретного спеца по его имени
    const specConfig = CONFIG.SPECIALISTS[specialistName];
    if (!specConfig) return []; 

    // 2. Получаем задачи из базы
    const { data: others } = await supabase.from('tasks')
        .select('id, time, duration, status')
        .eq('specialist', specialistName)
        .eq('date', dateStr);

    const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

    // 3. Генерируем сетку на основе ТВОЕГО конфига (start и end)
    const allSlots = [];
    const [workStartH, workStartM] = specConfig.start.split(':').map(Number);
    const isFriday = new Date(dateStr).getDay() === 5;
    const endStr = (isFriday && specConfig.friday_end) ? specConfig.friday_end : specConfig.end;
    const [workEndH, workEndM] = endStr.split(':').map(Number);
    
    const interval = specConfig.interval || 30;

    for (let h = workStartH; h <= workEndH; h++) {
        for (let m = 0; m < 60; m += interval) {
            const currentTotal = h * 60 + m;
            const startTotal = workStartH * 60 + workStartM;
            const endTotal = workEndH * 60 + workEndM;

            // Не добавляем время раньше начала или позже/равно концу рабочего дня
            if (currentTotal < startTotal || currentTotal >= endTotal) continue;

            allSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }

    // 4. Фильтруем слоты (Обед + Другие задачи)
    return allSlots.filter(slot => {
        const [sh, sm] = slot.split(':').map(Number);
        const sStart = sh * 60 + sm;
        const sEnd = sStart + interval;

        // --- ПРОВЕРКА ОБЕДА (lunch.start и lunch.end) ---
        if (specConfig.lunch) {
            const [lsH, lsM] = specConfig.lunch.start.split(':').map(Number);
            const [leH, leM] = specConfig.lunch.end.split(':').map(Number);
            const lStart = lsH * 60 + lsM;
            const lEnd = leH * 60 + leM;

            if (sStart < lEnd && sEnd > lStart) return false;
        }

        // --- ПРОВЕРКА КОНФЛИКТОВ С ЗАДАЧАМИ ---
        const conflict = others?.find(t => {
            if (editMode && String(t.id) === String(editTaskId)) return false;
            if (freeStatuses.includes(t.status)) return false;

            const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
            const tStart = th * 60 + tm;
            const tEnd = tStart + (Number(t.duration) || 30);
            return sStart < tEnd && sEnd > tStart;
        });

        return !conflict;
    });
}




