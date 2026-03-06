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
    const lunchStart = new Date(`2026-01-01T${settings.lunch.start}:00`);
    const lunchEnd = new Date(`2026-01-01T${settings.lunch.end}:00`);

    while (current < end) {
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

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';

    try {
        const { data: occupied } = await supabase.from('tasks').select('time, id, duration').eq('specialist', spec).eq('date', date);

const busyTimes = [];
const items = occupied ? occupied.filter(item => !editMode || item.id !== editTaskId) : [];

items.forEach(item => {
    const time = item.time.substring(0, 5);
    busyTimes.push(time);
    
    // Занимаем столько слотов по 30 мин, сколько указано в duration
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
        personalSlots.forEach(slot => {
            let isPast = false;
            if (isToday) {
                const [h, m] = slot.split(':').map(Number);
                const slotTime = new Date();
                slotTime.setHours(h, m, 0, 0);
                
                // Проверка: текущее время минус 15 минут
                if (slotTime < new Date(now.getTime() - 15 * 60000)) {
                    isPast = true;
                }
            }

            // Добавляем слот, если он не занят И не в прошлом
            const durationRaw = document.getElementById('taskDuration')?.value || "00:30";
const [neededH, neededM] = durationRaw.split(':').map(Number);
const currentNeeded = (neededH * 60) + neededM;

if (!busyTimes.includes(slot) && !isPast) {
    if (currentNeeded > 30) {
        // Проверяем, свободен ли второй слот для Сервера
        const [h, m] = slot.split(':').map(Number);
        const n = new Date(); n.setHours(h, m + 30, 0, 0);
        const ns = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
        
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
        if (targetTime) timeSelect.value = targetTime.substring(0, 5);
        if (!hasFree && !targetTime) timeSelect.innerHTML = '<option>Мест нет</option>';
    } catch (e) {
        timeSelect.innerHTML = '<option>Ошибка</option>';
    }
}

document.getElementById('specialist')?.addEventListener('change', () => updateFreeSlots());


// 3. УПРАВЛЕНИЕ СТАТУСОМ (Сделал глобальными)
window.updateTaskStatus = async (id, newStatus) => {
    try {
        // Создаем объект для обновления
        const updateData = { status: newStatus };
        
        // Если статус "Выполнено", сбрасываем длительность в 0, чтобы освободить слоты
        if (newStatus === 'Выполнено') {
            updateData.duration = 0;
        }

        const { error } = await supabase.from(currentTable).update(updateData).eq('id', id);
        if (error) throw error;
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
    const { data: occupied } = await supabase.from('tasks').select('id, time, duration').eq('specialist', spec).eq('date', date);
        const busyTimes = [];
occupied?.forEach(item => {
    // Не считаем занятой саму себя (чтобы можно было перенести на то же время)
    if (String(item.id) !== String(taskId)) {
        const time = item.time.substring(0, 5);
        busyTimes.push(time);
        
        // Если в базе у какой-то задачи duration 60, занимаем и следующий слот
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
    const date = document.getElementById('new-date').value;
    const time = document.getElementById('new-time').value;
    const { error } = await supabase.from('tasks').update({
        date: date,
        time: time,

    }).eq('id', id);
    if (!error) {
        bootstrap.Modal.getInstance(document.getElementById('rescheduleModal')).hide();
        loadTasks();
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

    // Получаем значение из нового поля ЧЧ:ММ
    const durationInput = document.getElementById('taskDuration')?.value || "00:30";
    const [h, m] = durationInput.split(':').map(Number);
    let totalMinutes = (h * 60) + m;
    
    // Защита от 0
    if (totalMinutes < 30) totalMinutes = 30;

    const taskData = {
        dept: currentUser.dept,
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
        result = await supabase.from(targetTable).update(taskData).eq('id', editTaskId);
    } else {
        taskData.status = 'Новая';
        result = await supabase.from(targetTable).insert([taskData]);
    }

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