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
        const isFridaySubmit = dateValue.getDay() === 5;
        const endStrSubmit = (isFridaySubmit && specConfig.friday_end) ? specConfig.friday_end : specConfig.end;
        const [weH, weM] = endStrSubmit.split(':').map(Number);
        const workDayEndMinutes = weH * 60 + weM;

        if (newEnd > workDayEndMinutes) {
            alert(`❌ Ошибка! Задача выходит за пределы рабочего времени. В ${isFridaySubmit ? 'пятницу' : 'этот день'} техник работает до ${endStrSubmit}`);
            btn.disabled = false;
            return;
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

    // Собираем основные данные
    const taskData = {
        specialist: document.getElementById('specialist').value,
        category: categoryValue,
        task_name: taskNameValue,
        inn: document.getElementById('inn').value,
        bitrix_url: document.getElementById('bitrix').value,
        duration: totalMinutes 
    };

    // --- ЛОГИКА ДЛЯ ОТДЕЛА И МЕНЕДЖЕРА ---
    if (!editMode) {
        // Если это НОВАЯ задача — записываем отдел и имя из профиля
        taskData.manager = currentUser.name;
        taskData.dept = currentUser.dept; // Берем отдел текущего пользователя
        taskData.status = 'Новая';
    }
    // Если editMode = true, мы НЕ добавляем dept в taskData, 
    // поэтому при update старый отдел в базе не затрется.
    // -------------------------------------

    if (taskBillingType === 'paid') {
        // ... твой существующий код для даты, цены и т.д. ...
        taskData.date = document.querySelector("#date")._flatpickr.formatDate(
            document.querySelector("#date")._flatpickr.selectedDates[0], 
            "Y-m-d"
        );
        taskData.time = document.getElementById('time').value;
        taskData.price = parseInt(document.getElementById('price').value) || 0;
        taskData.comment = document.getElementById('taskComment').value;
    } else {
        taskData.date = new Date().toISOString().split('T')[0];
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
// Инициализация модалки: Календарь + Загрузка данных из БД
document.getElementById('taskModal')?.addEventListener('shown.bs.modal', async () => {
    // 1. ВОЗВРАЩАЕМ КАЛЕНДАРЬ (без этого дата не работает)
    flatpickr("#date", {
        ...flatpickrConfig, // Твой глобальный конфиг из начала файла
        onChange: function() {
            if (typeof updateFreeSlots === 'function') updateFreeSlots();
        }
    });

    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = '<option value="">Загрузка...</option>';

    // 2. ЗАГРУЖАЕМ ДАННЫЕ ИЗ БД
    const { data, error } = await supabase
        .from('task_catalog')
        .select('*')
        .eq('is_active', true);

    if (error) {
        console.error("Ошибка загрузки каталога:", error);
        categorySelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        return;
    }

    window.taskCatalog = data;
    
    // 3. ОТРИСОВЫВАЕМ КАТЕГОРИИ СРАЗУ
    renderCategories();
});

function renderCategories() {
    const categorySelect = document.getElementById('category');
    const typeRadio = document.querySelector('input[name="modalTaskType"]:checked');
    
    if (!window.taskCatalog || !typeRadio) return;

    const isFree = typeRadio.value === 'free';

    // Фильтруем категории из загруженного каталога
    const availableCategories = [...new Set(window.taskCatalog
        .filter(item => item.is_paid === !isFree)
        .map(item => item.category))];

    categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
    availableCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
    });
}

document.addEventListener('change', (e) => {
    // Если переключили Платная/Бесплатная — перерисовываем категории
    if (e.target.name === 'modalTaskType') {
        renderCategories();
        
        // Скрываем/показываем блоки (твоя логика)
        const isFree = e.target.value === 'free';
        document.getElementById('dateTimeBlock')?.classList.toggle('d-none', isFree);
        document.getElementById('priceBlock')?.classList.toggle('d-none', isFree);
        document.getElementById('commentBlock')?.classList.toggle('d-none', isFree);
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
    // 1. ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ТИПА ЗАДАЧИ (БЕСПЛАТНО / ПЛАТНО)
    if (e.target.name === 'modalTaskType') {
        const isFree = e.target.value === 'free';
        const dateTimeBlock = document.getElementById('dateTimeBlock');
        const priceBlock = document.getElementById('priceBlock');
        const commentBlock = document.getElementById('commentBlock');
        const categorySelect = document.getElementById('category');
        const taskNameSelect = document.getElementById('taskName');
        
        // Сброс выбора задач
        taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';
        
        // Управление видимостью блоков (твоя логика)
        if (isFree) {
            dateTimeBlock?.classList.add('d-none');
            priceBlock?.classList.add('d-none');
            commentBlock?.classList.add('d-none'); 
            document.getElementById('price').required = false;
        } else {
            dateTimeBlock?.classList.remove('d-none');
            priceBlock?.classList.remove('d-none');
            commentBlock?.classList.remove('d-none');
            document.getElementById('price').required = true;
        }

        // ДИНАМИЧЕСКАЯ ЗАГРУЗКА КАТЕГОРИЙ ИЗ БД
        if (!window.taskCatalog) {
            categorySelect.innerHTML = '<option value="">Загрузка...</option>';
            const { data, error } = await supabase.from('task_catalog').select('*').eq('is_active', true);
            if (!error) window.taskCatalog = data;
        }

        if (window.taskCatalog) {
            // Фильтруем уникальные категории по признаку платности (is_paid)
            // Платные задачи (paid) -> is_paid: true
            // Бесплатные задачи (free) -> is_paid: false
            const availableCategories = [...new Set(window.taskCatalog
                .filter(item => item.is_paid === !isFree)
                .map(item => item.category))];

            categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
            availableCategories.forEach(cat => {
                categorySelect.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
        }
    }
    
    // 2. ЛОГИКА ВЫБОРА КОНКРЕТНОЙ КАТЕГОРИИ
    if (e.target.id === 'category') {
        const cat = e.target.value;
        const taskNameSelect = document.getElementById('taskName');
        const isFree = document.querySelector('input[name="modalTaskType"]:checked').value === 'free';
        const durationInput = document.getElementById('taskDuration');

        if (durationInput) durationInput.value = '00:30'; // Сброс на дефолт
        taskNameSelect.innerHTML = '<option value="">Выберите задачу...</option>';
        
        if (window.taskCatalog && cat) {
            // Фильтруем задачи из БД, которые принадлежат этой категории и типу оплаты
            const tasks = window.taskCatalog.filter(item => 
                item.category === cat && item.is_paid === !isFree
            );

            tasks.forEach(task => {
                // Записываем длительность и цену в data-атрибуты для автоподстановки
                taskNameSelect.innerHTML += `
                    <option value="${task.task_name}" 
                            data-duration="${task.default_duration}" 
                            data-price="${task.default_price}">
                        ${task.task_name}
                    </option>`;
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




