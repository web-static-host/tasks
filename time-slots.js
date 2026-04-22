// 2. СЛОТЫ И ВРЕМЯ
// 2. СЛОТЫ И ВРЕМЯ
function generateSlots(specName, dateStr) { // Добавили dateStr
    const settings = CONFIG.SPECIALISTS[specName];
    if (!settings) return [];
    
    // --- ОПРЕДЕЛЯЕМ КОНЕЦ РАБОЧЕГО ДНЯ ---
    const isFriday = dateStr && new Date(dateStr).getDay() === 5;
    const endStr = (isFriday && settings.friday_end) ? settings.friday_end : settings.end;
    // -------------------------------------

    let slots = [];
    let current = new Date(`2026-01-01T${settings.start}:00`);
    const end = new Date(`2026-01-01T${endStr}:00`); // Используем endStr
    
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

async function updateFreeSlots(targetTime = null) {
    const specSelect = document.getElementById('specialist');
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');
    const taskType = document.getElementById('hiddenTaskType')?.value;

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

        const personalSlots = generateSlots(spec, date);
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

document.getElementById('specialist')?.addEventListener('change', () => updateFreeSlots());

window.openAvailabilityModal = async function(isViewOnly = false) {
    const taskName = document.getElementById('taskName')?.value;
    
    // 1. Фильтруем спецов
    let allowedSpecs = CONFIG.USERS.filter(u => u.role === 'specialist' || u.role === 'specialist_1c');
    
    // Если мы внутри создания задачи - фильтруем по скиллам, иначе показываем всех
    if (!isViewOnly && taskName && window.taskCatalog && window.specialistSkills) {
        const t = window.taskCatalog.find(x => x.task_name === taskName);
        if (t) {
            const specIds = window.specialistSkills.filter(s => s.task_id === t.id).map(s => s.user_id);
            allowedSpecs = allowedSpecs.filter(u => specIds.includes(u.id));
        }
    }

    const container = document.getElementById('availability-grid-container');
    container.innerHTML = '<div class="p-5 text-center text-muted">Загрузка расписания...</div>';
    
    // Меняем заголовок модалки в зависимости от того, откуда она вызвана
    const modalTitle = document.querySelector('#availabilityModal .modal-title');
    if (modalTitle) modalTitle.innerText = isViewOnly ? 'Общая занятость команды' : 'Выбор времени специалиста';

    new bootstrap.Modal(document.getElementById('availabilityModal')).show();

    // 2. Генерируем даты ЖЕСТКО по локальному времени компьютера пользователя
    const dates = [];
    const now = new Date();
    for(let i=0; i<7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }

    const currentMins = now.getHours() * 60 + now.getMinutes();
    const todayStr = dates[0]; 

    // 3. Качаем занятые задачи
    const specNames = allowedSpecs.map(s => s.name);
    const { data: busyTasks } = await supabase.from('tasks')
        .select('specialist, date, time, duration, status')
        .in('specialist', specNames)
        .in('date', dates)
        .not('status', 'in', '("Выполнено","Возврат","Не отвечает")');

    // 4. Отрисовка
    let html = '<div class="avail-container">';
    
    dates.forEach(date => {
        const dObj = new Date(date);
        const dayLabel = dObj.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
        const isToday = (date === todayStr);
        
        html += `
            <div class="avail-day-group">
                <div class="avail-day-header">${dayLabel}</div>
                <div class="avail-specs-row">`;

        allowedSpecs.forEach(spec => {
            const settings = CONFIG.SPECIALISTS[spec.name];
            if (!settings) return;

            const isFriday = dObj.getDay() === 5;
            const endStr = (isFriday && settings.friday_end) ? settings.friday_end : settings.end;
            
            const current = new Date(`1970-01-01T${settings.start}:00`);
            const end = new Date(`1970-01-01T${endStr}:00`);
            const lunchStart = new Date(`1970-01-01T${settings.lunch.start}:00`);
            const lunchEnd = new Date(`1970-01-01T${settings.lunch.end}:00`);
            const interval = settings.slot_interval || 30;

            const specBusy = (busyTasks || []).filter(bt => bt.specialist === spec.name && bt.date === date);
            
            html += `<div class="avail-spec-col">
                        <div class="avail-spec-name text-truncate">${spec.name.split(' ')[0]}</div>`;

            while (current < end) {
                const h = current.getHours();
                const m = current.getMinutes();
                const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const slotStart = h * 60 + m;

                const isLunch = current >= lunchStart && current < lunchEnd;
                const isPast = isToday && (currentMins > slotStart + 10);
                
                const isBusy = specBusy.some(bt => {
                    if (!bt.time) return false;
                    const [bH, bM] = bt.time.substring(0,5).split(':').map(Number);
                    const bStart = bH * 60 + bM;
                    const bEnd = bStart + (bt.duration || 30);
                    return slotStart >= bStart && slotStart < bEnd;
                });

                if (isPast) {
                    html += `<div class="avail-slot past" title="Время вышло">${slot}</div>`;
                } else if (isLunch) {
                    html += `<div class="avail-slot busy" title="Обед">${slot}</div>`;
                } else if (isBusy) {
                    html += `<div class="avail-slot busy" title="Занят">${slot}</div>`;
                } else {
                    if (isViewOnly) {
                        // В режиме просмотра слоты просто серые/зеленые, но без наведения и курсора
                        html += `<div class="avail-slot free" style="cursor: default; opacity: 0.9;">${slot}</div>`;
                    } else {
                        html += `<div class="avail-slot free" onclick="selectSlotFromGrid('${date}', '${slot}', '${spec.name}')">${slot}</div>`;
                    }
                }

                current.setMinutes(current.getMinutes() + interval);
            }
            
            html += `</div>`;
        });

        html += `</div></div>`;
    });

    html += '</div>';
    container.innerHTML = html;
};

window.selectSlotFromGrid = function(date, time, specName) {
    const dateInput = document.getElementById('date');
    const specSelect = document.getElementById('specialist');
    const timeSelect = document.getElementById('time');

    if (dateInput && dateInput._flatpickr) dateInput._flatpickr.setDate(date);
    if (specSelect) specSelect.value = specName;
    
    // Триггер обновления слотов времени для синхронизации
    if (typeof updateFreeSlots === 'function') {
        updateFreeSlots(time).then(() => {
            if (timeSelect) timeSelect.value = time;
        });
    }

    bootstrap.Modal.getInstance(document.getElementById('availabilityModal')).hide();
};