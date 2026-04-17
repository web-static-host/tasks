let busyPicker = null; 

// 1. ЕДИНЫЙ ОБРАБОТЧИК ОТКРЫТИЯ
document.getElementById('busyModal')?.addEventListener('shown.bs.modal', () => {
    const typeSelect = document.getElementById('busy-type-select');
    const timeFields = document.getElementById('busy-time-fields');
    
    const setupBusyPicker = (isRange = false) => {
        if (busyPicker) busyPicker.destroy(); 
        busyPicker = flatpickr("#busy-date", {
            ...flatpickrConfig, 
            mode: isRange ? "range" : "single",
            onChange: async function(selectedDates, dateStr) {
                // Вызываем нашу функцию поиска времени
                if (!isRange && typeSelect.value === 'slot') {
                    await updateBusySlots(dateStr);
                }
            }
        });
    };

    setupBusyPicker(); 

    typeSelect.onchange = (e) => {
        const val = e.target.value;
        if (val === 'range') {
            setupBusyPicker(true); 
            timeFields.classList.add('d-none'); 
        } else if (val === 'full-day') {
            setupBusyPicker(false); 
            timeFields.classList.add('d-none'); 
        } else {
            setupBusyPicker(false); 
            timeFields.classList.remove('d-none'); 
        }
    };
});

// 2. ИСПРАВЛЕННАЯ ФУНКЦИЯ ЗАГРУЗКИ СВОБОДНОГО ВРЕМЕНИ
async function updateBusySlots(dateStr) {
    const timeSelect = document.getElementById('busy-time');
    if (!timeSelect) return;

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';
    
    // Генерируем слоты с помощью функции из time-slots.js (она уже учитывает обед)
    const allSlots = generateSlots(currentUser.name, dateStr);
    
    // Получаем уже занятые слоты из базы
    const { data: occupied } = await supabase.from('tasks')
        .select('time, duration, status')
        .eq('specialist', currentUser.name)
        .eq('date', dateStr);

    const freeStatuses = ['Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];
    const busyTimes = [];

    // Высчитываем занятые интервалы
    if (occupied) {
        occupied.forEach(item => {
            if (window.editBusyTaskId && String(item.id) === String(window.editBusyTaskId)) return;
            if (freeStatuses.includes(item.status)) return; 
            
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
    }
    
    const now = new Date();
    const isToday = (dateStr === now.toISOString().split('T')[0]);

    // Фильтруем слоты: убираем занятые и те, что уже прошли (с запасом 15 мин)
    const availableSlots = allSlots.filter(slot => {
        if (busyTimes.includes(slot)) return false; // Занято

        if (isToday) {
            const [h, m] = slot.split(':').map(Number);
            const slotTime = new Date();
            slotTime.setHours(h, m, 0, 0);
            if (slotTime < new Date(now.getTime() - 15 * 60000)) {
                return false; // Прошло
            }
        }
        return true;
    });
    
    if (availableSlots.length > 0) {
        timeSelect.innerHTML = availableSlots.map(s => `<option value="${s}">${s}</option>`).join('');
        timeSelect.disabled = false;
    } else {
        timeSelect.innerHTML = isToday 
            ? '<option value="">На сегодня время вышло</option>' 
            : '<option value="">Нет свободного времени</option>';
        timeSelect.disabled = true;
    }
}

// 3. СОХРАНЕНИЕ ЗАДАЧИ И ЗАПИСЬ В ИСТОРИЮ
document.getElementById('busy-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('busy-submit-btn');
    const type = document.getElementById('busy-type-select').value;
    const specCfg = CONFIG.SPECIALISTS[currentUser.name];
    
    btn.disabled = true;
    const freeStatuses = ['Отменено', 'Удалено', 'Свободно', 'Выполнено', 'Возврат', 'Ожидание от клиента', 'Ожидание от менеджера', 'Ожидание от тех.спеца', 'Не отвечает'];

    try {
        // --- ЛОГИКА РЕДАКТИРОВАНИЯ ---
        if (window.editBusyTaskId) {
            const date = document.getElementById('busy-date').value;
            let startTime, duration, category, taskName;

            if (type === 'slot') {
                startTime = document.getElementById('busy-time').value;
                const [durH, durM] = document.getElementById('busy-duration').value.split(':').map(Number);
                duration = (durH * 60) + durM;
                category = 'Внутренняя'; 
                taskName = 'ЗАНЯТО';
            } else {
                startTime = specCfg.start;
                const [sh, sm] = specCfg.start.split(':').map(Number);
                const [eh, em] = specCfg.end.split(':').map(Number);
                duration = (eh * 60 + em) - (sh * 60 + sm);
                category = 'Отсутствует';
                taskName = '📅 ВЕСЬ ДЕНЬ';
            }

            const [nh, nm] = startTime.split(':').map(Number);
            const newStart = nh * 60 + nm;
            const newEnd = newStart + duration;

            const { data: others } = await supabase.from('tasks').select('id, time, duration, status').eq('specialist', currentUser.name).eq('date', date);
            const conflict = others?.find(t => {
                if (String(t.id) === String(window.editBusyTaskId)) return false;
                if (freeStatuses.includes(t.status)) return false; 
                const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
                const tStart = th * 60 + tm;
                const tEnd = tStart + (Number(t.duration) || 30);
                return newStart < tEnd && newEnd > tStart;
            });

            if (conflict) {
                alert(`❌ Ошибка! Это время занято.`);
                btn.disabled = false; return;
            }

            const updateData = {
                category, task_name: taskName, date, time: startTime, duration,
                comment: document.getElementById('busy-comment').value,
                status: 'Занято', manager: null
            };

            const { error } = await supabase.from('tasks').update(updateData).eq('id', window.editBusyTaskId);
            if (error) throw error;

            if (typeof logTaskAction === 'function') await logTaskAction(window.editBusyTaskId, 'update', null, "Изменение времени");

            bootstrap.Modal.getInstance(document.getElementById('busyModal')).hide();
            btn.disabled = false;
            return; 
        }

        // --- ЛОГИКА СОЗДАНИЯ (INSERT) ---
        let dates = [];
        if (type === 'range') {
            const range = busyPicker.selectedDates;
            if (range.length < 2) { alert("Выберите период!"); btn.disabled = false; return; }
            let curr = new Date(range[0]);
            while (curr <= range[1]) { dates.push(new Date(curr).toISOString().split('T')[0]); curr.setDate(curr.getDate() + 1); }
        } else {
            const dVal = document.getElementById('busy-date').value;
            if (!dVal) { alert("Выберите дату!"); btn.disabled = false; return; }
            dates.push(dVal);
        }

        const { data: existingTasks } = await supabase.from('tasks').select('id, date, time, duration, status').eq('specialist', currentUser.name).in('date', dates);
        const tasksToInsert = [];
        
        for (const date of dates) {
            let startTime, duration, category, taskName;

            if (type === 'slot') {
                startTime = document.getElementById('busy-time').value;
                const [durH, durM] = document.getElementById('busy-duration').value.split(':').map(Number);
                duration = (durH * 60) + durM;
                category = 'Внутренняя'; taskName = 'ЗАНЯТО';
            } else {
                startTime = specCfg.start;
                const [sh, sm] = specCfg.start.split(':').map(Number);
                const [eh, em] = specCfg.end.split(':').map(Number);
                duration = (eh * 60 + em) - (sh * 60 + sm);
                category = 'Отсутствует';
                taskName = type === 'range' ? '🌴 ОТПУСК / БОЛЬНИЧНЫЙ' : '📅 ВЕСЬ ДЕНЬ';
            }

            const [nh, nm] = startTime.split(':').map(Number);
            const newStart = nh * 60 + nm;
            const newEnd = newStart + duration;

            const conflict = existingTasks?.find(t => {
                if (t.date !== date) return false;
                if (freeStatuses.includes(t.status)) return false; 
                const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
                const tStart = th * 60 + tm;
                const tEnd = tStart + (Number(t.duration) || 30);
                return newStart < tEnd && newEnd > tStart;
            });

            if (conflict) { alert(`❌ Ошибка на ${date}! Время занято.`); btn.disabled = false; return; }

            tasksToInsert.push({
                specialist: currentUser.name, manager: null, dept: currentUser.dept || 'Тех.отдел',
                category, task_name: taskName, date, time: startTime, duration,
                comment: document.getElementById('busy-comment').value,
                status: 'Занято', price: 0, inn: '-', bitrix_url: '-'
            });
        }

        const { data: insertedTasks, error: insertError } = await supabase.from('tasks').insert(tasksToInsert).select();
        if (insertError) throw insertError;

        if (insertedTasks?.length > 0) {
            for (const task of insertedTasks) {
                let historyComment = type === 'slot' ? "Бронь времени" : "Отсутствие";
                const userComment = document.getElementById('busy-comment').value;
                if (userComment) historyComment += ` (${userComment})`;
                if (typeof logTaskAction === 'function') await logTaskAction(task.id, 'create', null, historyComment);
            }
        }
        bootstrap.Modal.getInstance(document.getElementById('busyModal')).hide();

    } catch (err) {
        console.error(err);
        alert("Ошибка сохранения");
    } finally {
        btn.disabled = false;
    }
});

// Полный сброс модалки при закрытии
// 1. ЕДИНЫЙ ОБРАБОТЧИК ОТКРЫТИЯ
document.getElementById('busyModal')?.addEventListener('shown.bs.modal', () => {
    const typeSelect = document.getElementById('busy-type-select');
    const timeFields = document.getElementById('busy-time-fields');
    
    const setupBusyPicker = (isRange = false) => {
        // Если пикер уже есть и режим совпадает — ничего не делаем
        const currentMode = isRange ? "range" : "single";
        if (busyPicker && busyPicker.config.mode === currentMode) return;

        if (busyPicker) busyPicker.destroy(); 
        
        busyPicker = flatpickr("#busy-date", {
            ...flatpickrConfig, 
            mode: currentMode,
            onChange: async function(selectedDates, dateStr) {
                if (!isRange && typeSelect.value === 'slot') {
                    await updateBusySlots(dateStr);
                }
            }
        });
    };

    // ИСПРАВЛЕНИЕ: Инициализируем всегда, если пикера еще нет (после обновления страницы)
    const isRangeMode = (typeSelect && typeSelect.value === 'range');
    setupBusyPicker(isRangeMode); 

    typeSelect.onchange = (e) => {
        const val = e.target.value;
        if (val === 'range') {
            setupBusyPicker(true); 
            timeFields.classList.add('d-none'); 
        } else {
            setupBusyPicker(false); 
            if (val === 'full-day') timeFields.classList.add('d-none');
            else timeFields.classList.remove('d-none');
        }
    };
});