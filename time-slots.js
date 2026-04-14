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