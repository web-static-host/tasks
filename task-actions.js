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

        // Если статус "завершающий", обнуляем длительность
        const freeTimeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
        if (freeTimeStatuses.includes(newStatus)) {
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

        }
    } catch (e) { 
        console.error('Ошибка в confirmReschedule:', e); 
    }
};

window.deleteTask = async (id) => {
    if (confirm("Удалить задачу #" + id + "?")) {
        const targetTable = (typeof currentTable !== 'undefined') ? currentTable : 'tasks';
        await supabase.from(targetTable).delete().eq('id', id);
    }
};

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

window.handleBitrixClick = async (id, currentStatus) => {
    if (currentUser.role === 'specialist' && (currentStatus === 'Новая' || currentStatus === 'Перенесен')) {
        await window.updateTaskStatus(id, 'Взят в работу');
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