// ПЕРЕМЕННЫЕ СОСТОЯНИЯ
let editMode = false;
let editTaskId = null;

// 2. СЛОТЫ И ВРЕМЯ
function generateSlots(specName) {
    const settings = CONFIG.SPECIALISTS[specName];
    if (!settings) return [];
    let slots = [];
    let current = new Date(`2026-01-01T${settings.start}:00`);
    const end = new Date(`2026-01-01T${settings.end}:00`);
    
    // Данные обеда из конфига
    const lunchStart = new Date(`2026-01-01T${settings.lunch.start}:00`);
    const lunchEnd = new Date(`2026-01-01T${settings.lunch.end}:00`);

    while (current < end) {
        // Условие: добавляем слот ТОЛЬКО если он НЕ попадает в интервал обеда
        if (current < lunchStart || current >= lunchEnd) {
            let hh = String(current.getHours()).padStart(2, '0');
            let mm = String(current.getMinutes()).padStart(2, '0');
            slots.push(`${hh}:${mm}`);
        }
        current.setMinutes(current.getMinutes() + settings.interval);
    }
    return slots;
}
const flatpickrConfig = {
    "locale": "ru",
    dateFormat: "Y-m-d",      // Формат для системной обработки
    altInput: true,           // Включаем отображение "красивой" даты
    altFormat: "d.m.Y",       // Формат, который увидит пользователь (05.03.2026)
    altInputClass: "form-control", // Чтобы не поехал дизайн Bootstrap
    
    minDate: "today",
    disable: [
        function(date) {
            return (date.getDay() === 0 || date.getDay() === 6);
        }
    ]
};

async function updateFreeSlots(targetTime = null) {
    const specSelect = document.getElementById('specialist');
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');
    const taskType = document.querySelector('input[name="modalTaskType"]:checked')?.value;

    if (!specSelect || !dateInput || !timeSelect) return;
    if (taskType === 'free') return;

    const spec = specSelect.value;
    const date = dateInput.value;
    if (!spec || !date) return;

    const specConfig = CONFIG.SPECIALISTS[spec]; // Берем конфиг спеца

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';

    try {
        const { data: occupied } = await supabase.from('tasks').select('time, id, duration, status').eq('specialist', spec).eq('date', date);

        // Список статусов, которые НЕ занимают время
        const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

        const busyTimes = [];
        // Фильтруем: оставляем только те задачи, которые НЕ входят в список свободных
        const items = occupied ? occupied.filter(item => {
            if (editMode && item.id === editTaskId) return false;
            if (freeStatuses.includes(item.status)) return false; 
            return true;
        }) : [];

        items.forEach(item => {
            const time = item.time.substring(0, 5);
            busyTimes.push(time);
            let d = Number(item.duration) || 30;
            let offset = 30;
            while (d > 30) {
                const [h, m] = time.split(':').map(Number);
                const next = new Date();
                next.setHours(h, m + offset, 0, 0);
                busyTimes.push(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
                d -= 30;
                offset += 30;
            }
        });

        const personalSlots = generateSlots(spec);
        timeSelect.innerHTML = '<option value="" selected disabled>Выберите время</option>';
        let hasFree = false;
        const now = new Date();
        const isToday = date === now.toISOString().split('T')[0];

        const durationRaw = document.getElementById('taskDuration')?.value || "00:30";
        const [neededH, neededM] = durationRaw.split(':').map(Number);
        const currentNeeded = (neededH * 60) + neededM;

        personalSlots.forEach(slot => {
            const [h, m] = slot.split(':').map(Number);
            const slotMins = h * 60 + m;
            const slotEndMins = slotMins + currentNeeded;

            // --- ПРОВЕРКА НА ОБЕД ---
            if (specConfig && specConfig.lunch) {
                const [lsH, lsM] = specConfig.lunch.start.split(':').map(Number);
                const [leH, leM] = specConfig.lunch.end.split(':').map(Number);
                const lStart = lsH * 60 + lsM;
                const lEnd = leH * 60 + leM;

                // Если задача заканчивается позже начала обеда И начинается раньше конца обеда
                if (slotMins < lEnd && slotEndMins > lStart) return; 
            }

            let isPast = false;
            if (isToday) {
                const slotTime = new Date();
                slotTime.setHours(h, m, 0, 0);
                if (slotTime < new Date(now.getTime() - 15 * 60000)) isPast = true;
            }

            if (!busyTimes.includes(slot) && !isPast) {
                // Проверка наложений на другие задачи (уже была у тебя)
                let isOverlap = false;
                let checkOffset = 30;
                while (checkOffset < currentNeeded) {
                    const dCheck = new Date(); dCheck.setHours(h, m + checkOffset, 0, 0);
                    const ts = `${String(dCheck.getHours()).padStart(2, '0')}:${String(dCheck.getMinutes()).padStart(2, '0')}`;
                    if (busyTimes.includes(ts) || !personalSlots.includes(ts)) {
                        isOverlap = true;
                        break;
                    }
                    checkOffset += 30;
                }

                if (!isOverlap) {
                    timeSelect.add(new Option(slot, slot));
                    hasFree = true;
                }
            }
        });
        
        timeSelect.disabled = !hasFree;
        if (targetTime) timeSelect.value = targetTime.substring(0, 5);
        if (!hasFree && !targetTime) timeSelect.innerHTML = '<option>Мест нет</option>';
    } catch (e) { console.error(e); timeSelect.innerHTML = '<option>Ошибка</option>'; }
}

document.getElementById('specialist')?.addEventListener('change', () => updateFreeSlots());


// 3. УПРАВЛЕНИЕ СТАТУСОМ (Сделал глобальными)
window.updateTaskStatus = async (id, newStatus, comment = null) => {
    try {
        // 1. Сначала узнаем старый статус для истории
        const { data: oldTask } = await supabase.from(currentTable).select('status').eq('id', id).single();
        
        const updateData = { status: newStatus };

        // --- ИЗМЕНЕНИЯ ТУТ ---
        // Список статусов, при которых время должно освобождаться
        const freeTimeStatuses = [
            'Выполнено', 
            'Возврат', 
            'Ожидание от клиента', 
            'Ожидание от менеджера', 
            'Ожидание от тех.спеца', 
            'Не отвечает'
        ];

        if (freeTimeStatuses.includes(newStatus)) {
            updateData.duration = 0;
        }
        // ----------------------

        const { error } = await supabase.from(currentTable).update(updateData).eq('id', id);
        if (error) throw error;

        // 2. Записываем в историю (только если статус реально изменился)
        if (oldTask && oldTask.status !== newStatus) {
            await logTaskAction(id, 'status_change', { 
                status: { old: oldTask.status, new: newStatus } 
            }, comment);
        }

        loadTasks();
    } catch (e) { console.error(e); }
};

window.handleBitrixClick = async (id, currentStatus) => {
    if (currentUser.role === 'specialist' && (currentStatus === 'Новая' || currentStatus === 'Перенесен')) {
        await window.updateTaskStatus(id, 'Взят в работу');
    }
};

// 4. ПЕРЕНОС ЗАДАЧИ
window.openReschedule = (id, spec, date) => {
    document.getElementById('reschedule-id-label').innerText = id;
    document.getElementById('reschedule-task-id').value = id;
    document.getElementById('reschedule-spec-name').value = spec;
    
    // Сначала показываем модалку
    const modal = new bootstrap.Modal(document.getElementById('rescheduleModal'));
    modal.show();

    // Инициализируем или обновляем дату через Flatpickr после того, как поле появилось
    const dateInput = document.getElementById('new-date');
    if (dateInput._flatpickr) {
        dateInput._flatpickr.setDate(date);
    }
    
    updateRescheduleSlots();
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

    // 1. Узнаем длительность задачи, которую ПЕРЕНОСИМ
    const { data: currentTask } = await supabase.from('tasks').select('duration').eq('id', taskId).single();
    const movingDuration = currentTask?.duration || 30;

    // 2. Получаем занятые слоты (добавили duration в select)
    // Снова добавляем 'status' в select
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


document.getElementById('new-time')?.addEventListener('change', () => {
    document.getElementById('confirm-reschedule-btn').disabled = !document.getElementById('new-time').value;
});

window.confirmReschedule = async () => {
    const id = document.getElementById('reschedule-task-id').value;
    const newDate = document.getElementById('new-date').value;
    const newTime = document.getElementById('new-time').value;
    const comment = document.getElementById('reschedule-comment')?.value || null;

    try {
        // 1. Сначала получаем старые данные
        const { data: oldTask } = await supabase.from('tasks').select('date, time, status').eq('id', id).single();

        // 2. Обновляем задачу
        const { error } = await supabase.from('tasks').update({
            date: newDate,
            time: newTime,
            status: 'Перенесен' 
        }).eq('id', id);

        if (!error) {
            // 3. Собираем изменения для истории
            const changes = {};
            
            // Сравниваем дату
            if (oldTask.date !== newDate) {
                changes.date = { old: oldTask.date, new: newDate };
            }
            
            // Сравниваем время (обрезаем до 5 символов: 10:00)
            const oldTimeShort = oldTask.time?.substring(0, 5);
            if (oldTimeShort !== newTime) {
                changes.time = { old: oldTimeShort, new: newTime };
            }

            // Добавляем инфу о смене статуса
            if (oldTask.status !== 'Перенесен') {
                changes.status = { old: oldTask.status, new: 'Перенесен' };
            }

            // Записываем историю, если изменения есть
            if (Object.keys(changes).length > 0) {
                // Если у тебя есть функция logTaskAction — используй её:
                await logTaskAction(id, 'reschedule', changes, comment);
            }

            // Закрываем модалку и обновляем список
            bootstrap.Modal.getInstance(document.getElementById('rescheduleModal')).hide();
            loadTasks();
        }
    } catch (e) { 
        console.error('Ошибка в confirmReschedule:', e); 
    }
};

// 6. СОЗДАНИЕ, РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ
document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    const taskBillingType = document.querySelector('input[name="modalTaskType"]:checked').value;
    const targetTable = taskBillingType === 'free' ? 'free_tasks' : 'tasks';

    const categoryValue = document.getElementById('category').value;
    const taskNameValue = document.getElementById('taskName').value;
    const historyCommentValue = document.getElementById('historyComment')?.value || null;
    // Получаем значение из нового поля ЧЧ:ММ
    const durationInput = document.getElementById('taskDuration')?.value || "00:30";
    const [h, m] = durationInput.split(':').map(Number);
    let totalMinutes = (h * 60) + m;
    
    // Защита от 0
    if (totalMinutes < 30) totalMinutes = 30;

    // --- ПРОВЕРКА НАЛОЖЕНИЯ (ВСТАВИТЬ СЮДА) ---
if (taskBillingType === 'paid') {
        const spec = document.getElementById('specialist').value;
        const timeValue = document.getElementById('time').value;
        const dateValue = document.querySelector("#date")._flatpickr.selectedDates[0];
        const formattedDate = document.querySelector("#date")._flatpickr.formatDate(dateValue, "Y-m-d");

        const [h, m] = timeValue.split(':').map(Number);
        const newStart = h * 60 + m;
        const newEnd = newStart + totalMinutes;

        // 1. ПРОВЕРКА ОБЕДА
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

        // 2. ПРОВЕРКА НА ДРУГИЕ ЗАДАЧИ
        // 1. Добавляем 'status' в выборку
const { data: others } = await supabase.from('tasks')
    .select('id, time, duration, status')
    .eq('specialist', spec)
    .eq('date', formattedDate);

// 2. Список "свободных" статусов (те же, что в фильтрах слотов)
const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

const conflict = others?.find(t => {
    // Если это та же самая задача, которую мы редактируем — игнорим
    if (editMode && String(t.id) === String(editTaskId)) return false;
    
    // --- ДОБАВЬ ЭТУ СТРОКУ ---
    // Если статус задачи позволяет занять её время — игнорим как конфликт
    if (freeStatuses.includes(t.status)) return false; 
    // -------------------------

    const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
    const tStart = th * 60 + tm;
    const tEnd = tStart + (Number(t.duration) || 30);
    return newStart < tEnd && newEnd > tStart;
});

    if (conflict) {
        alert(`❌ Ошибка! Это время занято другой задачей (с ${conflict.time.substring(0, 5)}). Уменьшите длительность или выберите другое время.`);
        btn.disabled = false;
        return; // ВЫХОДИМ, ничего не сохраняем
    }
}

    const taskData = {
        specialist: document.getElementById('specialist').value,
        category: categoryValue,
        task_name: taskNameValue,
        inn: document.getElementById('inn').value,
        bitrix_url: document.getElementById('bitrix').value,
        duration: totalMinutes // Теперь пишем реальные минуты из инпута
    };

    // 2. Добавляем имя менеджера ТОЛЬКО если это создание новой задачи
    if (!editMode) {
        taskData.manager = currentUser.name;
    }

    if (taskBillingType === 'paid') {
        taskData.date = document.querySelector("#date")._flatpickr.formatDate(
    document.querySelector("#date")._flatpickr.selectedDates[0], 
    "Y-m-d"
);
        taskData.time = document.getElementById('time').value;
        taskData.price = parseInt(document.getElementById('price').value) || 0;
        taskData.comment = document.getElementById('taskComment').value; // Коммент только для платных
    } else {
        taskData.date = new Date().toISOString().split('T')[0];
        // Для бесплатных коммент не добавляем, так как в таблице free_tasks нет такой колонки
    }

    let result;
    if (editMode) {
        // 1. Получаем старые данные из базы
        const { data: oldTask } = await supabase.from(targetTable).select('*').eq('id', editTaskId).single();

        // 2. Обновляем задачу
        result = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);

        if (!result.error && oldTask) {
            // 3. Собираем ВСЕ изменившиеся поля
            const diff = {};
            if (oldTask.inn !== taskData.inn) diff.inn = { old: oldTask.inn, new: taskData.inn };
            if (oldTask.bitrix_url !== taskData.bitrix_url) diff.bitrix = { old: oldTask.bitrix_url, new: taskData.bitrix_url };
            if (oldTask.price !== taskData.price) diff.price = { old: oldTask.price, new: taskData.price };
            if (oldTask.specialist !== taskData.specialist) diff.specialist = { old: oldTask.specialist, new: taskData.specialist };
            
            // --- ДОБАВЛЕНО ДЛЯ ДАТЫ, ВРЕМЕНИ И ДЛИТЕЛЬНОСТИ ---
            if (oldTask.date !== taskData.date) diff.date = { old: oldTask.date, new: taskData.date };
            taskData.status = 'Перенесен';
            // Сравнение времени (обрезаем секунды из базы 10:00:00 -> 10:00)
            const oldT = oldTask.time?.substring(0, 5);
            if (oldT !== taskData.time) { 
            diff.time = { old: oldT, new: taskData.time };
            // Если время изменилось, принудительно меняем статус в данных для базы
            taskData.status = 'Перенесен'; 
            // И записываем это в историю изменений
            if (oldTask.status !== 'Перенесен') {
            diff.status = { old: oldTask.status, new: 'Перенесен' };
            }
            }

            if (taskData.status === 'Перенесен' && oldTask.status !== 'Перенесен') {
            diff.status = { old: oldTask.status, new: 'Перенесен' };
            }
            
            // Сравнение длительности
            if (Number(oldTask.duration) !== Number(taskData.duration)) {
                diff.duration = { old: oldTask.duration, new: taskData.duration };
            }
            // -------------------------------------------------

            // 4. Если изменения есть — записываем в историю
            if (Object.keys(diff).length > 0) {
            // Передаем именно historyCommentValue, который мы достали выше
            await logTaskAction(editTaskId, 'update', diff, historyCommentValue); 
    
            // Очищаем поле после сохранения, чтобы при следующем открытии оно было пустым
            const hLog = document.getElementById('historyComment');
            if (hLog) hLog.value = '';
            }
            result = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);
        }
    }
    
    else {
        taskData.status = 'Новая';
        // Добавляем .select(), чтобы база вернула ID новой задачи для истории
        result = await supabase.from(targetTable).insert([taskData]).select();

        if (!result.error && result.data) {
            const newId = result.data[0].id;
            let cmt = taskData.comment;
            if (taskNameValue.includes('(Копия)')) cmt = "Создано через копирование";
            
            // Записываем в историю факт создания
            await logTaskAction(newId, 'create', null, cmt);
        }
    }

    // Финал (оставляем твою логику закрытия модалки)
    if (!result.error) {
        document.getElementById('task-form').reset();
        bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
        if (typeof currentTable !== 'undefined') currentTable = targetTable;
        loadTasks();
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
        const logBlock = document.getElementById('changeLogBlock');
        if (logBlock) logBlock.classList.remove('d-none');
        const isFree = targetTable === 'free_tasks';
        const typeRadio = document.getElementById(isFree ? 'modalTypeFree' : 'modalTypePaid');
        if (typeRadio) {
            typeRadio.checked = true;
            typeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setTimeout(async () => {
            document.getElementById('category').value = task.category || '';
            document.getElementById('category').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('taskName').value = task.task_name;
            document.getElementById('specialist').value = task.specialist;
            document.getElementById('inn').value = task.inn;
            document.getElementById('bitrix').value = task.bitrix_url;
            document.getElementById('taskComment').value = task.comment || ''; 
const dbDuration = task.duration || 30; 

// Математика: 90 / 60 = 1 час (целое число)
const hours = Math.floor(dbDuration / 60); 
// Математика: 90 % 60 = 30 минут (остаток)
const minutes = dbDuration % 60; 

// Форматируем в строку 01:30 (добавляем нули слева)
const hh = String(hours).padStart(2, '0');
const mm = String(minutes).padStart(2, '0');

// Записываем в твой новый инпут
const durationField = document.getElementById('taskDuration');
if (durationField) {
    durationField.value = `${hh}:${mm}`;
}

            if (!isFree) {
                document.getElementById('price').value = task.price;
                document.getElementById('price').required = true;
                
                // Установка даты через метод setDate (обязательно!)
                const dateField = document.getElementById('date');
                if (dateField._flatpickr) {
                    dateField._flatpickr.setDate(task.date);
                } else {
                    dateField.value = task.date;
                }
                
                await updateFreeSlots(task.time);
            }

            document.querySelector('#taskModal .modal-title').innerText = `Редактирование задачи #${id}`;
            document.getElementById('submit-btn').innerText = "Сохранить изменения";
            new bootstrap.Modal(document.getElementById('taskModal')).show();
        }, 100);

    } catch (e) { alert("Ошибка загрузки"); }
};

window.deleteTask = async (id) => {
    if (confirm("Удалить задачу #" + id + "?")) {
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        await supabase.from(targetTable).delete().eq('id', id);
        loadTasks();
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
document.getElementById('taskModal')?.addEventListener('shown.bs.modal', function () {
    flatpickr("#date", {
        ...flatpickrConfig,
        onChange: function() {
            updateFreeSlots(); // Запуск поиска времени
        }
    });
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

document.getElementById('category')?.addEventListener('change', () => updateFreeSlots());
document.getElementById('taskName')?.addEventListener('change', () => updateFreeSlots());

window.copyTask = async (id) => {
    try {
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        const { data: task, error } = await supabase.from(targetTable).select('*').eq('id', id).single();
        
        if (error) throw error;

        // ВАЖНО: Мы НЕ ставим editMode = true. 
        // Это заставит форму думать, что мы создаем НОВУЮ задачу.
        editMode = false;
        editTaskId = null;

        const isFree = targetTable === 'free_tasks';
        const typeRadio = document.getElementById(isFree ? 'modalTypeFree' : 'modalTypePaid');
        if (typeRadio) {
            typeRadio.checked = true;
            typeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setTimeout(async () => {
            // Заполняем поля из старой задачи
            document.getElementById('category').value = task.category || '';
            document.getElementById('category').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('taskName').value = task.task_name;
            document.getElementById('specialist').value = task.specialist;
            document.getElementById('inn').value = task.inn;
            document.getElementById('price').value = task.price || 0;
            document.getElementById('taskComment').value = task.comment || '';

            // ОЧИЩАЕМ поле Битрикс, 
            document.getElementById('bitrix').value = '';

            // Длительность
            const durationField = document.getElementById('taskDuration');
            if (durationField) {
                const dbDuration = task.duration || 30;
                const hours = Math.floor(dbDuration / 60);
                const minutes = dbDuration % 60;
                durationField.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }

            if (!isFree) {
                // Подставляем ту же дату и обновляем свободные слоты
                const dateField = document.getElementById('date');
                if (dateField._flatpickr) {
                    dateField._flatpickr.setDate(task.date);
                } else {
                    dateField.value = task.date;
                }
                await updateFreeSlots(); // Загружаем актуальные слоты на эту дату
            }

            // Меняем заголовки, чтобы менеджер понимал, что создается копия
            document.querySelector('#taskModal .modal-title').innerText = `Копирование задачи (Новая)`;
            document.getElementById('submit-btn').innerText = "Создать копию";
            
            new bootstrap.Modal(document.getElementById('taskModal')).show();
        }, 100);

    } catch (e) { 
        console.error(e);
        alert("Ошибка при копировании"); 
    }
};

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