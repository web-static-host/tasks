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
                // Вызываем только нашу умную функцию с фильтром
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

// 2. ЕДИНСТВЕННАЯ УМНАЯ ФУНКЦИЯ ЗАГРУЗКИ ВРЕМЕНИ
async function updateBusySlots(dateStr) {
    const timeSelect = document.getElementById('busy-time');
    if (!timeSelect) return;

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Загрузка...</option>';
    
    const slots = await getFreeSlots(dateStr, currentUser.name);
    
    const now = new Date();
    const isToday = (dateStr === now.toISOString().split('T')[0]);

    // Фильтруем слоты: убираем те, что уже прошли (-15 мин)
    const availableSlots = slots.filter(slot => {
        if (!isToday) return true; 

        const [h, m] = slot.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        
        return slotTime >= new Date(now.getTime() - 15 * 60000);
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

// Сохранение задачи из новой модалки
document.getElementById('busy-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('busy-submit-btn');
    const type = document.getElementById('busy-type-select').value;
    const specCfg = CONFIG.SPECIALISTS[currentUser.name];
    
    btn.disabled = true;

    // Списки статусов, которые НЕ считаются занятым временем (как в твоих основных задачах)
    const freeStatuses = ['Отменено', 'Удалено', 'Свободно'];

    // 1. Формируем массив дат
    let dates = [];
    if (type === 'range') {
        const range = busyPicker.selectedDates;
        if (range.length < 2) { 
            alert("Выберите начало и конец периода!"); 
            btn.disabled = false; 
            return; 
        }
        let curr = new Date(range[0]);
        while (curr <= range[1]) {
            dates.push(new Date(curr).toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
        }
    } else {
        const dVal = document.getElementById('busy-date').value;
        if (!dVal) { alert("Выберите дату!"); btn.disabled = false; return; }
        dates.push(dVal);
    }

    try {
        // 1.5. ПРОВЕРКА НА ПЕРЕСЕЧЕНИЯ
        const { data: existingTasks, error: fetchError } = await supabase
            .from('tasks')
            .select('id, date, time, duration, task_name, status')
            .eq('specialist', currentUser.name)
            .in('date', dates);

        if (fetchError) throw fetchError;

        const tasksToInsert = [];
        
        for (const date of dates) {
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
                taskName = type === 'range' ? '🌴 ОТПУСК' : '📅 ВЕСЬ ДЕНЬ';
            }

            const [nh, nm] = startTime.split(':').map(Number);
            const newStart = nh * 60 + nm;
            const newEnd = newStart + duration;

            // --- ТВОЯ ЛОГИКА ПРОВЕРКИ КОНФЛИКТА ---
            const conflict = existingTasks?.find(t => {
                if (t.date !== date) return false;
                if (freeStatuses.includes(t.status)) return false; 

                const [th, tm] = t.time.substring(0, 5).split(':').map(Number);
                const tStart = th * 60 + tm;
                const tEnd = tStart + (Number(t.duration) || 30);
                
                return newStart < tEnd && newEnd > tStart;
            });

            if (conflict) {
                // Вменяемое уведомление как в твоем примере
                alert(`❌ Ошибка! Это время занято другой задачей (с ${conflict.time.substring(0, 5)}). Уменьшите длительность или выберите другое время.`);
                btn.disabled = false;
                return; 
            }

            tasksToInsert.push({
                specialist: currentUser.name,
                manager: currentUser.name,
                dept: currentUser.dept || 'Тех.отдел',
                category: category,
                task_name: taskName,
                date: date,
                time: startTime,
                duration: duration,
                comment: document.getElementById('busy-comment').value,
                status: 'Занято',
                price: 0,
                inn: '-',
                bitrix_url: '-'
            });
        }

        const { error: insertError } = await supabase.from('tasks').insert(tasksToInsert);
        if (insertError) throw insertError;

        bootstrap.Modal.getInstance(document.getElementById('busyModal')).hide();
        loadTasks();

    } catch (err) {
        console.error(err);
        alert("Произошла ошибка при сохранении");
    } finally {
        btn.disabled = false;
    }
});

// Полный сброс модалки busyModal при закрытии
document.getElementById('busyModal')?.addEventListener('hidden.bs.modal', () => {
    const busyForm = document.getElementById('busy-form');
    const typeSelect = document.getElementById('busy-type-select');
    const timeFields = document.getElementById('busy-time-fields');
    const timeSelect = document.getElementById('busy-time');
    const dateInput = document.getElementById('busy-date');
    const btn = document.getElementById('busy-submit-btn');

    // 1. Сбрасываем все текстовые поля и комментарии
    if (busyForm) busyForm.reset();

    // 2. Возвращаем тип записи на "Конкретное время (слот)"
    if (typeSelect) {
        typeSelect.value = 'slot';
    }

    // 3. Обязательно показываем поля времени (если они были скрыты отпуском)
    if (timeFields) {
        timeFields.classList.remove('d-none');
    }

    // 4. Очищаем календарь Flatpickr
    if (dateInput && dateInput._flatpickr) {
        dateInput._flatpickr.clear();
    }

    // 5. Возвращаем селектор времени в дефолтное состояние
    if (timeSelect) {
        timeSelect.innerHTML = '<option value="">Сначала выберите дату...</option>';
        timeSelect.disabled = true;
    }

    // 6. На всякий случай разблокируем кнопку
    if (btn) {
        btn.disabled = false;
    }
});